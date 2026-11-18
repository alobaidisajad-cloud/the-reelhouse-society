/**
 * socialSlice.ts — who a member follows: follow, unfollow, and reading the list.
 *
 *   • the screen changes at once, and changes back if the server refuses
 *   • no signal: the act is queued and sent later, and the screen keeps it
 *   • one act per member every 2 seconds; a handle's id is remembered 10 minutes
 *   • the list is saved on the phone, so a cold start shows it before the server answers
 */
import { z } from 'zod';
import { captureError } from '../../lib/sentry';
import { supabase } from '../../lib/supabase';
import { agedSince, monotonicNow } from '../../lib/waits';
import { useAuthStore } from '../auth';
import { useSocialStore } from '../followStore';
import { stillSignedIn } from './helpers/sessionGuard';
import { registerStoreReset } from '../resetAllStores';

import TactileEngine from '../../utils/TactileEngine';
import reelToast from '../../utils/reelToast';
import { logger } from '../../utils/logger';
import { isNetworkError } from '../../utils/networkError';
import { isRefusedOnPurpose, saidOfARefusal } from '../../utils/saidOfARefusal';
import { enqueueMutation, flushOfflineQueue, getOfflineQueue } from '../../utils/offlineQueue';
import { keyOf, writeOnline } from '../../utils/oneWritePerThing';
import { atTheHousesPace, isRateLimited } from '../../utils/housePace';
import { isLookupSafeHandle } from '../../utils/handleGuard';
import { queryClient } from '../../lib/queryClient';

// One act at a time per member: a second tap while the first is in flight is dropped.
const _inflightOps = new Set<string>();

/**
 * Follows, requests and withdrawals made on this phone, by when the house took them (Infinity
 * while on their way). A list read asked before one landed answered without it, and set the lists
 * whole: a request withdrawn read REQUESTED again, a follow read FOLLOW, and a second FOLLOW
 * found the row there and counted the member's file one follower more (review round 8). A read
 * asked before an act landed has it laid over its answer; one asked after holds it already.
 */
const _actedHere = new Map<string, { as: 'following' | 'requested' | 'none'; at: number }>();

// ── Per-action throttle ──
const _socialThrottles = new Map<string, number>();
const _THROTTLE_COOLDOWN = 2000;
const _THROTTLE_MAX = 200;

function isSocialThrottled(key: string): boolean {
  const last = _socialThrottles.get(key) ?? -Infinity;
  if (monotonicNow() - last < _THROTTLE_COOLDOWN) {
    TactileEngine.warn();
    return true;
  }
  pruneSocialThrottles();
  _socialThrottles.set(key, monotonicNow());
  return false;
}

function pruneSocialThrottles() {
  if (_socialThrottles.size < _THROTTLE_MAX) return;
  const now = monotonicNow();
  for (const [key, ts] of _socialThrottles) {
    if (now - ts > 30000) _socialThrottles.delete(key);
  }
  if (_socialThrottles.size >= _THROTTLE_MAX) {
    const keys = [..._socialThrottles.keys()].slice(0, 50);
    keys.forEach(k => _socialThrottles.delete(k));
  }
}

// ── Username → Profile cache ──
const _usernameProfileCache = new Map<string, { id: string; isPrivate: boolean; ts: number }>();
const _USERNAME_CACHE_TTL = 10 * 60 * 1000;

/** What a member is told who follows a handle the house no longer knows (renamed, or closed). */
export const noMemberGoesBy = (handle: string) => `No member goes by @${handle} now.`;

async function resolveUsernameToProfile(username: string): Promise<{ id: string; isPrivate: boolean } | null> {
  // A handle no profile could hold is never looked up (utils/handleGuard.ts).
  if (!isLookupSafeHandle(username)) return null;

  const cached = _usernameProfileCache.get(username);
  if (cached && agedSince(cached.ts) < _USERNAME_CACHE_TTL) {
    // Moved to the end: the oldest are pruned first.
    _usernameProfileCache.delete(username);
    _usernameProfileCache.set(username, { ...cached, ts: Date.now() });
    return { id: cached.id, isPrivate: cached.isPrivate };
  }
  if (cached) _usernameProfileCache.delete(username);

  // `maybeSingle`: no such member is an answer (null). A failed read is not, and
  // is thrown — it was read as "not found", so a follow made offline never reached
  // followUser's offline branch: "Could not follow", and a false report.
  const { data, error } = await supabase.from('profiles').select('id, is_social_private').eq('username', username).maybeSingle();
  if (error) throw error;
  if (data?.id) {
    if (_usernameProfileCache.size >= 200) {
      const keys = [..._usernameProfileCache.keys()].slice(0, 20);
      keys.forEach(k => _usernameProfileCache.delete(k));
    }
    const isPrivate = Boolean(data.is_social_private);
    _usernameProfileCache.set(username, { id: data.id, isPrivate, ts: Date.now() });
    return { id: data.id, isPrivate };
  }
  return null;
}

// ── Cache persistence ──
function persistFollowingToCache(userId: string) {
  useSocialStore.getState().persistFollowing(userId);
}

/**
 * The follow list changed: refetch the feeds made from it, here in the store so
 * every follow button gets it. Only these two: the community feed never reads
 * the list, and the stacks feed reads it only under its 'following' filter
 * (key ['feed', 'stacks', filter, …]).
 */
function refreshFollowGraphFeeds() {
  try {
    queryClient.invalidateQueries({ queryKey: ['feed', 'following'] });
    queryClient.invalidateQueries({ queryKey: ['feed', 'stacks', 'following'] });
  } catch (e) {
    // A stale feed is a far smaller failure than a follow that throws.
    logger.warn('[socialSlice] feed invalidation failed:', e);
  }
}

/**
 * The server's follow list, corrected by the acts still queued: a follow made
 * offline is not on the server yet, and would vanish from the screen at the next
 * launch; an unfollow likewise. Applied in queue order (follow, unfollow, follow
 * ends followed). Pure, so it is tested without a store or a network.
 */
export function reconcileGraphWithPendingMutations(
  ownerId: string,
  serverFollowing: string[],
  serverRequested: string[],
  queue: { type: string; payload?: Record<string, unknown> }[],
): { following: string[]; requested: string[] } {
  // Case-insensitive identity, first spelling wins — mirrors the store's own index.
  const following = new Map<string, string>();
  const requested = new Map<string, string>();
  for (const u of serverFollowing) if (u) following.set(u.toLowerCase(), u);
  for (const u of serverRequested) if (u) requested.set(u.toLowerCase(), u);

  for (const m of queue) {
    // Only this member's: after a crash the queue can hold the last member's acts.
    if (!ownerId || m?.payload?.user_id !== ownerId) continue;

    const raw = m?.payload?.target_username;
    if (typeof raw !== 'string' || raw.length === 0) continue;
    const key = raw.toLowerCase();
    switch (m.type) {
      // Added only when new: the server's spelling (`Morpho`) is the real one, and a
      // queued act carries the caller's (the profile screen lowercases).
      case 'follow_user':
        requested.delete(key);
        if (!following.has(key)) following.set(key, raw);
        break;
      case 'follow_request_user':
        following.delete(key);
        if (!requested.has(key)) requested.set(key, raw);
        break;
      case 'unfollow_user':
        following.delete(key);
        requested.delete(key);
        break;
      default:
        break;  // not a social mutation
    }
  }

  return { following: [...following.values()], requested: [...requested.values()] };
}

/**
 * The one place a list read from the server reaches the store, corrected by the
 * queue. followGraph.wiring.guard.test.ts fails if anything else sets the lists.
 */
function commitHydratedGraph(userId: string, serverFollowing: string[], serverRequested: string[], askedAt: number): void {
  const reconciled = reconcileGraphWithPendingMutations(
    userId, serverFollowing, serverRequested, getOfflineQueue(),
  );
  const actedSince = [..._actedHere].filter(([, act]) => act.at >= askedAt);
  for (const [name, act] of _actedHere) if (act.at < askedAt) _actedHere.delete(name);
  // Case-insensitive, as the store's own index and the queue's reconciling are.
  const following = new Map(reconciled.following.map((name) => [name.toLowerCase(), name]));
  const requested = new Map(reconciled.requested.map((name) => [name.toLowerCase(), name]));
  for (const [name, { as }] of actedSince) {
    const key = name.toLowerCase();
    following.delete(key);
    requested.delete(key);
    if (as === 'following') following.set(key, name);
    if (as === 'requested') requested.set(key, name);
  }
  useSocialStore.getState().setFollowing([...following.values()]);
  useSocialStore.getState().setRequested([...requested.values()]);
  // Read whole: the list is the member's, however short.
  useSocialStore.setState({ followingKnown: 'held' });
  persistFollowingToCache(userId);
}

// ── Public API ──

/**
 * Follows a member, or asks to (a private one). `known`: the member's row as the screen read it
 * (their file knows their id and whether they are private), laid in the handle cache so the first
 * frame shows what will be filed. With nothing known, nothing is shown until the house answers: a
 * guess of FOLLOWING on a private member unsealed their file and read it as an empty archive.
 */
export async function followUser(targetUsername: string, known?: { id: string; isPrivate: boolean }): Promise<boolean> {
  const store = useSocialStore.getState();
  if (store.isFollowing(targetUsername) || store.isRequested(targetUsername)) return true;
  if (isSocialThrottled(`follow:${targetUsername}`)) return false;

  const opKey = `follow:${targetUsername}`;
  if (_inflightOps.has(opKey)) return false;
  _inflightOps.add(opKey);

  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    logger.warn('[socialSlice.followUser] No userId — user not authenticated');
    _inflightOps.delete(opKey);
    return false;
  }

  if (known) _usernameProfileCache.set(targetUsername, { id: known.id, isPrivate: known.isPrivate, ts: Date.now() });
  // Shown at once, before any network, only when it is known which it is: a request to a private
  // member, a follow of an open one.
  const cachedProfile = _usernameProfileCache.get(targetUsername);
  const shownPrivate: boolean | null = cachedProfile ? cachedProfile.isPrivate : null;
  
  if (shownPrivate !== null) {
    if (shownPrivate) store.addRequested(targetUsername);
    else store.addFollowing(targetUsername);
    persistFollowingToCache(userId);
    _actedHere.set(targetUsername, { as: shownPrivate ? 'requested' : 'following', at: Infinity });
  }

  try {
    const targetProfile = await resolveUsernameToProfile(targetUsername);
    // Answered after they left: the store and the saved list are the next member's now.
    if (!stillSignedIn(userId)) return false;
    // No member goes by the handle now (renamed, or the account closed): an answer, not a defect. It
    // was thrown, with the handle in its words, and the report carried another member's name away.
    if (!targetProfile) {
      _actedHere.delete(targetUsername);
      store.removeFollowing(targetUsername);
      store.removeRequested(targetUsername);
      persistFollowingToCache(userId);
      reelToast.error(noMemberGoesBy(targetUsername));
      return false;
    }

    const { id: targetId, isPrivate } = targetProfile;
    const interactionType = isPrivate ? 'follow_request' : 'follow';
    _actedHere.set(targetUsername, { as: isPrivate ? 'requested' : 'following', at: Infinity });

    // Shown now if it was not known before, or the profile says otherwise: the screen follows the profile.
    if (isPrivate !== shownPrivate) {
      if (isPrivate) {
        store.removeFollowing(targetUsername);
        store.addRequested(targetUsername);
      } else {
        store.removeRequested(targetUsername);
        store.addFollowing(targetUsername);
      }
      persistFollowingToCache(userId);
    }

    // Through the one door of a follow of this member (writeOnline): an unfollow or follow of them
    // still queued, older than this, is let go once this lands (or is found already held), never
    // sent after it (round 13). The insert goes at the house's pace (housePace.ts).
    const { existing, filed } = await writeOnline(keyOf({ type: 'follow_user', payload: { target_username: targetUsername } }), async () => {
      const { data: held } = await supabase
        .from('interactions')
        .select('id, type')
        .eq('user_id', userId)
        .eq('target_user_id', targetId)
        .in('type', ['follow', 'follow_request'])
        .maybeSingle();
      if (held) return { existing: held, filed: null };
      // The row is asked back: the house files a follow of a member who is private now as a request
      // (enforce_privacy_on_follow), though the screen read them open (review round 11).
      const made = await atTheHousesPace(async () => {
        const { data, error } = await supabase.from('interactions').insert([{
          user_id: userId, target_user_id: targetId, type: interactionType,
        }]).select('type').maybeSingle();
        if (error && !error.message?.includes('duplicate')) throw error;
        return data;
      });
      return { existing: null, filed: made };
    });

    // Each landing written only for the member still here: two members may follow one handle.
    if (existing) {
      if (stillSignedIn(userId)) {
        const held: 'following' | 'requested' = existing.type === 'follow_request' ? 'requested' : 'following';
        _actedHere.set(targetUsername, { as: held, at: monotonicNow() });
        // What the house holds is what is shown: a request already standing reads REQUESTED.
        if ((held === 'requested') !== isPrivate) {
          if (held === 'requested') { store.removeFollowing(targetUsername); store.addRequested(targetUsername); }
          else { store.removeRequested(targetUsername); store.addFollowing(targetUsername); }
          persistFollowingToCache(userId);
        }
      }
      logger.warn('[socialSlice.followUser] Already interacted in the database: syncing state');
      refreshFollowGraphFeeds();
      return true;
    }

    if (stillSignedIn(userId)) {
      const filedAs: 'following' | 'requested' = filed?.type === 'follow_request' ? 'requested'
        : filed?.type === 'follow' ? 'following'
          : isPrivate ? 'requested' : 'following';
      _actedHere.set(targetUsername, { as: filedAs, at: monotonicNow() });
      // Filed otherwise than shown: the screen follows the house, and the handle is known private.
      if ((filedAs === 'requested') !== isPrivate) {
        // Kept with the age it had: the house's answer corrects the privacy, not when it was looked up.
        const held = _usernameProfileCache.get(targetUsername);
        if (held) _usernameProfileCache.set(targetUsername, { ...held, isPrivate: filedAs === 'requested' });
        if (filedAs === 'requested') { store.removeFollowing(targetUsername); store.addRequested(targetUsername); }
        else { store.removeRequested(targetUsername); store.addFollowing(targetUsername); }
        persistFollowingToCache(userId);
      }
    }

    refreshFollowGraphFeeds();
    return true;
  } catch (err: unknown) {
    // Queued, the queue's own entry is laid over every read (reconcile); refused, nothing was done.
    if (stillSignedIn(userId)) _actedHere.delete(targetUsername);
    const msg = err instanceof Error ? err.message : typeof err === 'object' && err !== null && 'message' in err ? String((err as any).message) : String(err);
    // Mirrors the network check below exactly (both msg and err) so an offline
    // failure — which is queued, not lost — is never reported as a defect; nor is the house's
    // refusal for the member's standing.
    if (!isNetworkError(msg) && !isNetworkError(err) && !isRateLimited(err) && !isRefusedOnPurpose(err)) {
      captureError(err, { scope: 'socialSlice' });
    }
    // Neither queued nor undone for a member who has left: both would land on the next.
    if (!stillSignedIn(userId)) return false;
    // The house asked to wait longer than the phone waits (housePace.ts): kept, and sent once the
    // wait is over. Nothing failed, so nothing is said and the screen keeps what it shows.
    if (isRateLimited(err)) {
      const cached = _usernameProfileCache.get(targetUsername);
      if (enqueueMutation({
        type: cached?.isPrivate ? 'follow_request_user' : 'follow_user',
        payload: { user_id: userId, target_username: targetUsername, target_user_id: cached?.id ?? null },
      })) {
        if (shownPrivate === null) {
          if (cached?.isPrivate) useSocialStore.getState().addRequested(targetUsername);
          else useSocialStore.getState().addFollowing(targetUsername);
          persistFollowingToCache(userId);
        }
        void flushOfflineQueue();
        return true;
      }
    }
    if (isNetworkError(msg) || isNetworkError(err)) {
      const cached = _usernameProfileCache.get(targetUsername);
      const interactionType = cached?.isPrivate ? 'follow_request' : 'follow';
      
      // Privacy unknown, it is queued as a follow; the database turns a follow of a
      // private member into a request (enforce_privacy_on_follow).
      if (enqueueMutation({
        type: interactionType === 'follow_request' ? 'follow_request_user' : 'follow_user',
        payload: { user_id: userId, target_username: targetUsername, target_user_id: cached?.id ?? null },
      })) {
        // Nothing was shown before the house was asked: the queued one is shown now.
        if (shownPrivate === null) {
          if (interactionType === 'follow_request') useSocialStore.getState().addRequested(targetUsername);
          else useSocialStore.getState().addFollowing(targetUsername);
          persistFollowingToCache(userId);
        }
        reelToast('Follow saved offline. Will sync when connected.');
        return true;
      }
    }
    logger.warn('[socialSlice.followUser] failed', err);
    
    useSocialStore.getState().removeFollowing(targetUsername);
    useSocialStore.getState().removeRequested(targetUsername);
    persistFollowingToCache(userId);
    // A silenced or suspended member is told so in the house's words, never "try again" over a
    // refusal no try can change (review round 10).
    reelToast.error(saidOfARefusal(err, `Could not follow @${targetUsername}. Please try again.`, `Could not follow @${targetUsername}. Please try again.`));
    return false;
  } finally {
    _inflightOps.delete(opKey);
  }
}

export async function unfollowUser(targetUsername: string): Promise<boolean> {
  if (isSocialThrottled(`unfollow:${targetUsername}`)) return false;

  const opKey = `unfollow:${targetUsername}`;
  if (_inflightOps.has(opKey)) return false;
  _inflightOps.add(opKey);

  // This is also how a request is withdrawn, so BOTH lists are kept to roll back to.
  const prevFollowing = useSocialStore.getState().following;
  const prevRequested = useSocialStore.getState().requested;
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    logger.warn('[socialSlice.unfollowUser] No userId — user not authenticated');
    _inflightOps.delete(opKey);
    return false;
  }

  // Both, for the same reason: a withdrawn request must stop reading REQUESTED.
  useSocialStore.getState().removeFollowing(targetUsername);
  useSocialStore.getState().removeRequested(targetUsername);
  persistFollowingToCache(userId);
  _actedHere.set(targetUsername, { as: 'none', at: Infinity });

  try {
    const targetProfile = await resolveUsernameToProfile(targetUsername);
    // Answered after they left: the queue is the next member's now.
    if (!stillSignedIn(userId)) return false;
    if (!targetProfile) {
      // The handle did not resolve: queued, so the unfollow the member saw still happens.
      logger.warn('[socialSlice.unfollowUser] Could not resolve the member: queued for retry');
      _actedHere.delete(targetUsername);
      enqueueMutation({
        type: 'unfollow_user',
        payload: { user_id: userId, target_username: targetUsername },
      });
    } else {
      // Through the one door of a follow of this member (writeOnline): a follow of them still
      // queued, older than this unfollow, is let go once it lands, never sent after it (round 13).
      await writeOnline(keyOf({ type: 'unfollow_user', payload: { target_username: targetUsername } }), async () => {
        const { error } = await supabase.from('interactions').delete()
          .eq('user_id', userId).eq('target_user_id', targetProfile.id).in('type', ['follow', 'follow_request']);
        if (error) throw error;
      });
      if (stillSignedIn(userId)) _actedHere.set(targetUsername, { as: 'none', at: monotonicNow() });
    }
    refreshFollowGraphFeeds();
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : typeof err === 'object' && err !== null && 'message' in err ? String((err as any).message) : String(err);
    // Mirrors the network check below exactly (both msg and err) so an offline
    // failure — which is queued, not lost — is never reported as a defect.
    if (!isNetworkError(msg) && !isNetworkError(err)) {
      captureError(err, { scope: 'socialSlice' });
    }
    // Queued, the queue's own entry is laid over every read (reconcile); refused, nothing was done.
    if (stillSignedIn(userId)) _actedHere.delete(targetUsername);
    // Neither their lists put back nor their unfollow queued, once they have left.
    if (!stillSignedIn(userId)) return false;
    // No signal: the screen keeps the unfollow and the queue sends it, with the id if known.
    if (isNetworkError(msg) || isNetworkError(err)) {
      const cachedId = _usernameProfileCache.get(targetUsername)?.id ?? null;
      if (enqueueMutation({
        type: 'unfollow_user',
        payload: { user_id: userId, target_username: targetUsername, target_user_id: cachedId },
      })) {
        reelToast('Unfollow saved offline. Will sync when connected.');
        return true;
      }
    }
    logger.warn('[socialSlice.unfollowUser] failed', err);
    useSocialStore.getState().setFollowing(prevFollowing);
    useSocialStore.getState().setRequested(prevRequested);
    persistFollowingToCache(userId);
    reelToast.error(`Could not unfollow @${targetUsername}. Please try again.`);
    return false;
  } finally {
    _inflightOps.delete(opKey);
  }
}

// Pages follow the last row seen: an index range each, never an offset's rescan.
const HYDRATE_PAGE_SIZE = 1000;
// A stop for a loop that never ends: past 10,000 follows the list is kept as it was.
const MAX_HYDRATE_PAGES = 10;

const HydrateRowSchema = z.object({
  id: z.string(),
  target_user_id: z.string(),
  created_at: z.string(),
  type: z.string(),
  profiles: z.union([
    z.object({ username: z.string() }),
    z.array(z.object({ username: z.string() })),
  ]).nullable(),
});

/**
 * The read of each member's follow list in flight, if one is: who it is for,
 * and which read it is.
 *
 * A cold start asks twice — the bootstrapper as the remembered member is
 * restored, and sign-in as the session is confirmed — and each read is every
 * page of the list. The second joins the first. Keyed by member, so a read for
 * one member is never handed to another; and a read commits only while it is
 * still that member's current read and that member is still signed in, so a
 * read that outlived a sign-out, or a switch to another account, lands nowhere.
 */
const _hydrating = new Map<string, { token: object; read: Promise<void> }>();

export function hydrateFollowing(opts?: { again?: boolean }): Promise<void> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    logger.warn('[socialSlice.hydrateFollowing] No userId — skipping');
    return Promise.resolve();
  }
  const running = _hydrating.get(userId);
  // `again`: the list changed in the house after the running read began (a block ended the
  // follows), so a fresh read takes its place and the running one commits nothing.
  if (running && !opts?.again) return running.read;
  const token = {};
  const current = () => _hydrating.get(userId)?.token === token && stillSignedIn(userId);
  const read = readFollowing(userId, current).finally(() => {
    if (_hydrating.get(userId)?.token === token) _hydrating.delete(userId);
  });
  _hydrating.set(userId, { token, read });
  return read;
}

async function readFollowing(userId: string, current: () => boolean): Promise<void> {
  // The list could not be read whole: a list held stays the member's; one never held is now
  // known to be unread, not "follows nobody".
  const unread = () => {
    if (current()) useSocialStore.setState((s) => (s.followingKnown === 'held' ? s : { followingKnown: 'failed' }));
  };
  const askedAt = monotonicNow();
  try {
    const allUsernames: string[] = [];
    const allRequested: string[] = [];
    let cursor: { at: string; id: string } | null = null;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore) {
      // Past the cap the list is only part-read, and a part is not the list.
      if (pageCount >= MAX_HYDRATE_PAGES) {
        logger.warn('[socialSlice.hydrateFollowing] more follows than one read holds: kept the list as it was', MAX_HYDRATE_PAGES * HYDRATE_PAGE_SIZE);
        captureError(new Error('follow list past the hydrate cap'), { scope: 'socialSlice.hydrateFollowing', pages: pageCount });
        unread();
        return;
      }
      // The cursor is (created_at, id), never the time alone: rows sharing the
      // boundary's time (a batch write, where Postgres freezes now()) would be
      // skipped for good.
      let query = supabase
        .from('interactions')
        .select('id, target_user_id, created_at, type, profiles!interactions_target_user_id_fkey(username)')
        .eq('user_id', userId)
        .in('type', ['follow', 'follow_request'])
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(HYDRATE_PAGE_SIZE);

      if (cursor) {
        query = query.or(
          `created_at.gt.${cursor.at},and(created_at.eq.${cursor.at},id.gt.${cursor.id})`,
        );
      }

      const { data, error } = await query;

      if (error) {
        // Unread is not empty: supabase-js hands back any failure, offline too, as
        // `error`, and saving what was read so far would unfollow the rest.
        logger.warn('[socialSlice.hydrateFollowing] could not read the follow list:', error.message);
        if (!isNetworkError(error)) captureError(error, { scope: 'socialSlice.hydrateFollowing' });
        unread();
        return;
      }

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      data.forEach(row => {
          const parsed = HydrateRowSchema.safeParse(row);
          if (!parsed.success) {
            logger.warn('[socialSlice.hydrateFollowing] Invalid row skipped:', parsed.error.message);
            return;
          }
          const profile = Array.isArray(parsed.data.profiles) ? parsed.data.profiles[0] : parsed.data.profiles;
          if (profile?.username) {
            if (parsed.data.type === 'follow_request') {
              allRequested.push(profile.username);
            } else {
              allUsernames.push(profile.username);
            }
          }
      });

      // Both halves from the page's last row, as the order above sorts them.
      const last = data[data.length - 1] as { created_at: string; id: string };
      cursor = { at: last.created_at, id: last.id };
      hasMore = data.length === HYDRATE_PAGE_SIZE;
      pageCount++;
    }

    // Read for a member who has since gone, or by a read since replaced: not theirs to write.
    if (!current()) return;
    commitHydratedGraph(userId, allUsernames, allRequested, askedAt);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('[socialSlice.hydrateFollowing] Unexpected error:', msg);
    if (!isNetworkError(err)) captureError(err, { scope: 'socialSlice.hydrateFollowing' });
    unread();
  }
}

/**
 * Every cache this module keeps, cleared on every sign-out. (It was once only
 * exported, and nothing called it.)
 */
function clearSocialCaches(): void {
  _socialThrottles.clear();
  _usernameProfileCache.clear();
  _inflightOps.clear();
  _actedHere.clear();
  // A read in flight now lands nowhere; the next member's sign-in starts its own.
  _hydrating.clear();
}
registerStoreReset(() => { clearSocialCaches(); });
export { clearSocialCaches };

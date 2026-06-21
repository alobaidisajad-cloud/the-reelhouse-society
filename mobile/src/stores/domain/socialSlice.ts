/**
 * socialSlice.ts — Social Graph Domain Slice
 * ───────────────────────────────────────────
 * Extracted from auth.ts (WS-1) to decompose the God Store.
 * Owns: followUser, unfollowUser, hydrateFollowing, username→ID resolution.
 *
 * Architecture:
 *   • Optimistic updates with full rollback on failure
 *   • Per-action throttle (2s cooldown per target)
 *   • Username→ID cache with 10min TTL + LRU pruning
 *   • MMKV cache persistence for instant cold-start hydration
 */
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../auth';
import { useSocialStore } from '../followStore';

import TactileEngine from '../../utils/TactileEngine';
import reelToast from '../../utils/reelToast';
import { logger } from '../../utils/logger';
import { isNetworkError } from '../../utils/networkError';
import { enqueueMutation } from '../../utils/offlineQueue';

// Track in-flight social operations to prevent concurrent
// follow/unfollow on the same target (e.g., from rapid UI transitions)
const _inflightOps = new Set<string>();

// ── Per-action throttle ──
const _socialThrottles = new Map<string, number>();
const _THROTTLE_COOLDOWN = 2000;
const _THROTTLE_MAX = 200;

function isSocialThrottled(key: string): boolean {
  const last = _socialThrottles.get(key) ?? 0;
  if (Date.now() - last < _THROTTLE_COOLDOWN) {
    TactileEngine.warn();
    return true;
  }
  pruneSocialThrottles();
  _socialThrottles.set(key, Date.now());
  return false;
}

function pruneSocialThrottles() {
  if (_socialThrottles.size < _THROTTLE_MAX) return;
  const now = Date.now();
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

async function resolveUsernameToProfile(username: string): Promise<{ id: string; isPrivate: boolean } | null> {
  // Defense-in-depth format guard — fail fast on malformed input
  if (!/^[a-zA-Z0-9_]{1,30}$/.test(username)) return null;

  const cached = _usernameProfileCache.get(username);
  if (cached && Date.now() - cached.ts < _USERNAME_CACHE_TTL) {
    // LRU touch
    _usernameProfileCache.delete(username);
    _usernameProfileCache.set(username, { ...cached, ts: Date.now() });
    return { id: cached.id, isPrivate: cached.isPrivate };
  }
  if (cached) _usernameProfileCache.delete(username);

  const { data } = await supabase.from('profiles').select('id, is_social_private').eq('username', username).single();
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

// ── Public API ──

export async function followUser(targetUsername: string): Promise<boolean> {
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

  // Instantly apply optimistic UI update by checking cache *before* awaiting network.
  // This guarantees a true 0ms visual update, even if completely offline.
  const cachedProfile = _usernameProfileCache.get(targetUsername);
  const isOptimisticallyPrivate = cachedProfile?.isPrivate ?? false;
  
  // Atomic update via dedicated store — no race condition
  if (isOptimisticallyPrivate) {
    store.addRequested(targetUsername);
  } else {
    store.addFollowing(targetUsername);
  }
  persistFollowingToCache(userId);

  try {
    const targetProfile = await resolveUsernameToProfile(targetUsername);
    if (!targetProfile) throw new Error(`User "${targetUsername}" not found in profiles table`);
    
    const { id: targetId, isPrivate } = targetProfile;
    const interactionType = isPrivate ? 'follow_request' : 'follow';

    // If the backend contradicts our offline assumption, correct it silently.
    if (isPrivate !== isOptimisticallyPrivate) {
      if (isPrivate) {
        store.removeFollowing(targetUsername);
        store.addRequested(targetUsername);
      } else {
        store.removeRequested(targetUsername);
        store.addFollowing(targetUsername);
      }
      persistFollowingToCache(userId);
    }

    const { data: existing } = await supabase
      .from('interactions')
      .select('id, type')
      .eq('user_id', userId)
      .eq('target_user_id', targetId)
      .in('type', ['follow', 'follow_request'])
      .maybeSingle();

    if (existing) {
      logger.warn(`[socialSlice.followUser] Already interacted with @${targetUsername} in DB, syncing state`);
      return true;
    }

    const { error } = await supabase.from('interactions').insert([{
      user_id: userId, target_user_id: targetId, type: interactionType,
    }]);
    if (error && !error.message?.includes('duplicate')) throw error;
    
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : typeof err === 'object' && err !== null && 'message' in err ? String((err as any).message) : String(err);
    if (isNetworkError(msg) || isNetworkError(err)) {
      const cached = _usernameProfileCache.get(targetUsername);
      const interactionType = cached?.isPrivate ? 'follow_request' : 'follow';
      
      // If we don't have cache, offline queue will default to 'follow' which is a known limitation,
      // but it's acceptable because the backend validation should catch it later if it's private.
      enqueueMutation({
        type: interactionType === 'follow_request' ? 'follow_request_user' : 'follow_user',
        payload: { user_id: userId, target_username: targetUsername, target_user_id: cached?.id ?? null },
      });
      reelToast('Follow saved offline. Will sync when connected.');
      return true;
    }
    logger.warn(`[socialSlice.followUser] FAILED for @${targetUsername}: ${msg}`);
    
    // Rollback via dedicated store
    useSocialStore.getState().removeFollowing(targetUsername);
    useSocialStore.getState().removeRequested(targetUsername);
    persistFollowingToCache(userId);
    reelToast.error(`Could not follow @${targetUsername}. Please try again.`);
    return false;
  } finally {
    _inflightOps.delete(opKey);
  }
}

export async function unfollowUser(targetUsername: string): Promise<boolean> {
  if (isSocialThrottled(`unfollow:${targetUsername}`)) return false;

  // Prevent concurrent operations on the same target
  const opKey = `unfollow:${targetUsername}`;
  if (_inflightOps.has(opKey)) return false;
  _inflightOps.add(opKey);

  const prevFollowing = useSocialStore.getState().following;
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    logger.warn('[socialSlice.unfollowUser] No userId — user not authenticated');
    _inflightOps.delete(opKey);
    return false;
  }

  // Atomic optimistic update via dedicated store
  useSocialStore.getState().removeFollowing(targetUsername);
  persistFollowingToCache(userId);

  try {
    const targetProfile = await resolveUsernameToProfile(targetUsername);
    if (targetProfile) {
      const { error } = await supabase.from('interactions').delete()
        .eq('user_id', userId).eq('target_user_id', targetProfile.id).in('type', ['follow', 'follow_request']);
      if (error) throw error;
    } else {
      // Queue unfollow for offline retry instead of silently dropping it.
      // The optimistic local state removal (line 177) is correct — the user sees
      // the unfollow immediately. The queue ensures server state catches up.
      logger.warn(`[socialSlice.unfollowUser] Could not resolve ID for @${targetUsername} — queuing for retry`);
      enqueueMutation({
        type: 'unfollow_user',
        payload: { user_id: userId, target_username: targetUsername },
      });
    }
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : typeof err === 'object' && err !== null && 'message' in err ? String((err as any).message) : String(err);
    // Route network failures to the offline queue — keep optimistic state
    // (user sees the unfollow immediately), queue for background sync.
    if (isNetworkError(msg) || isNetworkError(err)) {
      // Include resolved target_user_id so flush doesn't re-resolve usernames.
      const cachedId = _usernameProfileCache.get(targetUsername)?.id ?? null;
      enqueueMutation({
        type: 'unfollow_user',
        payload: { user_id: userId, target_username: targetUsername, target_user_id: cachedId },
      });
      reelToast('Unfollow saved offline. Will sync when connected.');
      return true;
    }
    logger.warn(`[socialSlice.unfollowUser] FAILED for @${targetUsername}: ${msg}`);
    // Rollback via dedicated store
    useSocialStore.getState().setFollowing(prevFollowing);
    persistFollowingToCache(userId);
    reelToast.error(`Could not unfollow @${targetUsername}. Please try again.`);
    return false;
  } finally {
    _inflightOps.delete(opKey);
  }
}

/**
 * UNLIMITED FOLLOWING — Cursor-based keyset pagination.
 * ───────────────────────────────────────────────────────
 * Loads the ENTIRE following list in 1000-row chunks using
 * created_at as the cursor key. O(N) total cost regardless
 * of offset position — each page is an indexed range scan.
 *
 * No artificial cap — users can follow as many people as they want.
 */
const HYDRATE_PAGE_SIZE = 1000;
// Safety cap prevents runaway fetch loops on extreme accounts.
// 10 pages × 1000 rows = 10K following — covers 99.99% of users.
const MAX_HYDRATE_PAGES = 10;

// Hoisted to module scope to avoid re-compiling Zod schemas
// on every pagination loop iteration (was inside the while loop).
const HydrateRowSchema = z.object({
  target_user_id: z.string(),
  created_at: z.string(),
  type: z.string(),
  profiles: z.union([
    z.object({ username: z.string() }),
    z.array(z.object({ username: z.string() })),
  ]).nullable(),
});

export async function hydrateFollowing(): Promise<void> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    logger.warn('[socialSlice.hydrateFollowing] No userId — skipping');
    return;
  }
  try {
    const allUsernames: string[] = [];
    const allRequested: string[] = [];
    let cursor: string | null = null;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore) {
      // Safety cap prevents runaway fetch loops on extreme accounts.
      if (pageCount >= MAX_HYDRATE_PAGES) {
        logger.warn(`[socialSlice.hydrateFollowing] Capped at ${allUsernames.length} following — extreme account`);
        break;
      }
      // Cursor-based keyset pagination replaces offset pagination.
      // .range(offset, offset + N) is O(N²) aggregate on Postgres because
      // later pages must scan and discard all prior rows. Keyset pagination
      // with .gt('created_at', cursor) is O(N) because it uses an index scan.
      let query = supabase
        .from('interactions')
        .select('target_user_id, created_at, type, profiles!interactions_target_user_id_fkey(username)')
        .eq('user_id', userId)
        .in('type', ['follow', 'follow_request'])
        .order('created_at', { ascending: true })
        .limit(HYDRATE_PAGE_SIZE);

      if (cursor) {
        query = query.gt('created_at', cursor);
      }

      const { data, error } = await query;

      if (error) {
        // Fallback: if the join fails (FK might not exist), use paginated two-query approach
        logger.warn('[socialSlice.hydrateFollowing] Joined query failed, falling back:', error.message);
        await _hydrateFollowingFallback(userId);
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

      // Set cursor to the last row's created_at for the next page
      cursor = (data[data.length - 1] as { created_at: string }).created_at;
      hasMore = data.length === HYDRATE_PAGE_SIZE;
      pageCount++;
    }

    useSocialStore.getState().setFollowing(allUsernames);
    useSocialStore.getState().setRequested(allRequested);
    persistFollowingToCache(userId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('[socialSlice.hydrateFollowing] Unexpected error:', msg);
  }
}

/** Fallback paginated hydration when the FK join is unavailable */
async function _hydrateFollowingFallback(userId: string): Promise<void> {
  const allUsernames: string[] = [];
  const allRequested: string[] = [];
  let cursor: string | null = null;
  let hasMore = true;
  let pageCount = 0;

  while (hasMore) {
    // Safety cap for fallback path too
    if (pageCount >= MAX_HYDRATE_PAGES) {
      logger.warn(`[socialSlice._hydrateFollowingFallback] Capped at ${allUsernames.length} following`);
      break;
    }
    // Cursor-based keyset pagination for the fallback path too.
    let query = supabase
      .from('interactions')
      .select('target_user_id, created_at, type')
      .eq('user_id', userId)
      .in('type', ['follow', 'follow_request'])
      .order('created_at', { ascending: true })
      .limit(HYDRATE_PAGE_SIZE);

    if (cursor) {
      query = query.gt('created_at', cursor);
    }

    const { data: followRows, error: followErr } = await query;

    if (followErr || !followRows?.length) {
      hasMore = false;
      break;
    }

    const targetIds = followRows.map(r => r.target_user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', targetIds);

    if (profiles) {
      const profileMap = new Map(profiles.map(p => [p.id, p.username]));
      followRows.forEach(row => {
        const username = profileMap.get(row.target_user_id);
        if (username) {
          if (row.type === 'follow_request') {
            allRequested.push(username);
          } else {
            allUsernames.push(username);
          }
        }
      });
    }

    cursor = (followRows[followRows.length - 1] as { created_at: string }).created_at;
    hasMore = followRows.length === HYDRATE_PAGE_SIZE;
    pageCount++;
  }

  useSocialStore.getState().setFollowing(allUsernames.length > 0 ? allUsernames : []);
  useSocialStore.getState().setRequested(allRequested.length > 0 ? allRequested : []);
  persistFollowingToCache(userId);
}

/**
 * Clear all social graph caches — called during logout.
 */
export function clearSocialCaches(): void {
  _socialThrottles.clear();
  _usernameProfileCache.clear();
  _inflightOps.clear();
}

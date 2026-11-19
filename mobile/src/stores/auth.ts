import { create } from 'zustand';
import { clearDeliveredNotices, removePushToken } from '../lib/pushNotifications';
import { forgetCache, queryClient } from '../lib/queryClient';
import { identifyUser, logoutRevenueCat } from '../lib/revenueCat';
import { rememberRequestedHandle, clearRequestedHandle } from '../utils/handleNotice';
import { clearHandleHistory } from '../utils/handleHistory';
import { clearAllDrafts, countDrafts } from '../utils/memberDrafts';
import { keptAfterSignOutElsewhere, keptFromBefore } from '../utils/keptOnThisPhone';
import { captureAuthRefusal, captureError, setSentryUser } from '../lib/sentry';
import { isNetworkError } from '../utils/networkError';
import type { User as AuthUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { endSessionHere, owePushToken } from '../lib/endSession';
import { PROFILE_SELECT_COLUMNS, ProfileService } from '../services/ProfileWriteService';
import { User } from '../types';
import { logger } from '../utils/logger';
import {
  clearOfflineQueue, flushOfflineQueue, holdQueue, releaseHeldWrites, type QueuedMutation,
} from '../utils/offlineQueue';
import reelToast from '../utils/reelToast';
import { isRetryable, withRetry } from '../utils/withRetry';
import { hydrateFollowing } from './domain/socialSlice';
import { storage, setSensitive } from './mmkv-storage';
import { BAD_CREDENTIALS, isAddress, authLink, handleResting, doorFor, keepDoor } from '../utils/authSignals';
import { e2eTrace } from '../utils/e2eTrace';
import { raceDeadline } from '../utils/raceDeadline';
import { profileRead } from '../utils/profileRead';
import { useBlockStore } from './blockStore';

/**
 * The member's marks, whole (marksLedger.ts). Asked for lazily: the ledger is the film
 * store's, and the session is read before any store, at launch and in every test of it.
 */
const readMarks = (): Promise<void> =>
  (require('./domain/marksLedger') as typeof import('./domain/marksLedger')).readMarks();
export { storage };

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, username: string, persona?: string) => Promise<{ needsConfirmation: boolean }>;
  /** `endedElsewhere`: not by their hand; their unsent writes and drafts are kept for them. */
  logout: (opts?: { endedElsewhere?: boolean }) => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  setLocalTierHint: (updates: { tier?: string; is_founding?: boolean }) => void;
  setPreference: (key: string, value: unknown) => Promise<void>;
  /**
   * Preferences filed now, these keys alone, and waited for: 'saved' once the house has them, 'kept'
   * while it cannot be reached (sent at the next launch or return); refused, they are taken back and
   * it throws.
   */
  savePreferences: (changes: Record<string, unknown>) => Promise<'saved' | 'kept'>;
  getPreference: (key: string, fallback?: unknown) => unknown;
  restoreSession: () => Promise<void>;
  hydrateFromCache: () => void;
  /** The one way in, from every door: signed in, remembered, the profile fetched behind. */
  adoptSession: (authedUser: AuthUser, profile?: Record<string, unknown> | null) => void;
  /** The member's profile read again, onto them: true once it is held (profileRead). */
  rereadProfile: () => Promise<boolean>;
}



const _prefTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Preferences as a debounce window opened: a refusal rolls back all of it.
const _prefBaselines = new Map<string, Record<string, unknown>>();


/** A failed username sign-in, in the words mapAuthError reads: the cause, never a guess. */
async function usernameRefusal(error: unknown): Promise<Error> {
  const e = error as { name?: string; context?: { status?: number; json?: () => Promise<unknown> } } | null;
  if (e?.name === 'FunctionsFetchError') return new Error('network request failed');
  if (e?.name === 'FunctionsHttpError' && e.context?.status === 401) return new Error(BAD_CREDENTIALS);
  if (e?.name === 'FunctionsHttpError' && e.context?.status === 429) {
    // The house holding this handle back says so, with the seconds left and from where: this
    // connection's own wrong passwords (here), or the handle tried from many places (elsewhere).
    // Any other 429 is this caller's own pace.
    const said = typeof e.context.json === 'function' ? await e.context.json().catch(() => null) : null;
    const rest = said as { paused?: unknown; from?: unknown; retry_after?: unknown } | null;
    if (rest?.paused === 'handle' && typeof rest.retry_after === 'number' && rest.retry_after > 0) {
      return new Error(handleResting(rest.retry_after, rest.from === 'here' ? 'here' : 'elsewhere'));
    }
    return new Error('Too many requests');
  }
  return new Error('Sign-in service unavailable');
}

// Single-flight guard for logout (see logout() re-entrancy note).
let _logoutInFlight: Promise<void> | null = null;

/**
 * The member's unsynced preferences, or null. `dirty_prefs_<id>` HOLDS them
 * (the profile cache is written only when storage is encrypted, so it cannot
 * carry them). An older install may hold the bare 'true' of an earlier
 * version, its values in the cache: read as it was, never discarded.
 */
export function readPendingPrefs(userId: string): Record<string, unknown> | null {
  const raw = storage.getString(`dirty_prefs_${userId}`);
  if (!raw) return null;

  if (raw === 'true') {
    // Legacy shape — the values are in the profile cache.
    const cached = storage.getString(`ironvault_user_cache_${userId}`);
    if (!cached) return null;
    try {
      const prefs = JSON.parse(cached)?.preferences;
      return prefs && typeof prefs === 'object' ? prefs as Record<string, unknown> : null;
    } catch { return null; }
  }

  try {
    const prefs = JSON.parse(raw);
    return prefs && typeof prefs === 'object' ? prefs as Record<string, unknown> : null;
  } catch { return null; }
}

/**
 * Keys a member changed, added to those the house has not yet taken. Only the keys changed are
 * pending and sent: the house merges by key (update_my_preferences), so the phone's whole copy,
 * sent, put back every key another device had changed since this phone last read them.
 */
function addPendingPrefs(userId: string, changes: Record<string, unknown>): void {
  storage.set(`dirty_prefs_${userId}`, JSON.stringify({ ...(readPendingPrefs(userId) ?? {}), ...changes }));
}

/** Keys the house has taken, or that were let go: off the pending list, any changed since kept on it. */
function settlePendingPrefs(userId: string, settled: Record<string, unknown>): void {
  const pending = readPendingPrefs(userId);
  if (!pending) return;
  const left = Object.fromEntries(Object.entries(pending)
    .filter(([k, v]) => !(k in settled) || JSON.stringify(settled[k]) !== JSON.stringify(v)));
  if (Object.keys(left).length > 0) storage.set(`dirty_prefs_${userId}`, JSON.stringify(left));
  else storage.delete(`dirty_prefs_${userId}`);
}

/**
 * A refused window taken back: each key it changed returns to what it was before, unless it was
 * changed again since (that newer change is its own window's). Other keys are left as they stand.
 */
function takenBack(
  now: Record<string, unknown>, before: Record<string, unknown>, sent: Record<string, unknown>,
): Record<string, unknown> {
  const back = { ...now };
  for (const k of Object.keys(sent)) {
    if (JSON.stringify(back[k]) !== JSON.stringify(sent[k])) continue;
    if (k in before) back[k] = before[k];
    else delete back[k];
  }
  return back;
}

/** The keys a window changed: those whose value differs from the window's opening snapshot. */
function changedFrom(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(after).filter(([k, v]) => JSON.stringify(before[k]) !== JSON.stringify(v)));
}

/** A profile as the house sent it, the member's pending preferences laid over its own. */
function withPendingPrefs<T extends object>(userId: string, profile: T): T {
  const pending = readPendingPrefs(userId);
  if (!pending) return profile;
  const own = (profile as { preferences?: unknown }).preferences;
  return { ...profile, preferences: { ...(own && typeof own === 'object' ? own : {}), ...pending } };
}

/**
 * The pending preferences sent, merged by the house key by key. 'kept' while it cannot be reached:
 * they stay pending, and the screen keeps them (a toggle made offline snapped back a second later,
 * unsaid). 'refused' only for a refusal the house made.
 */
async function sendPendingPrefs(userId: string): Promise<'sent' | 'none' | 'kept' | 'refused'> {
  const pending = readPendingPrefs(userId);
  if (!pending) return 'none';
  try {
    // A failure is ANSWERED (supabase-js resolves it), not thrown.
    const { error } = await supabase.rpc('update_my_preferences', { p_preferences: pending });
    if (error) return isNetworkError(error) ? 'kept' : 'refused';
  } catch (err) {
    return isNetworkError(err) ? 'kept' : 'refused';
  }
  settlePendingPrefs(userId, pending);
  return 'sent';
}

/**
 * The member's profile edits the server has not yet confirmed (`dirty_profile_<id>`),
 * or none: a restore lays them over the server's copy, so it never reverts one in flight.
 */
export function readPendingProfile(userId: string): Partial<User> {
  const raw = storage.getString(`dirty_profile_${userId}`);
  if (!raw) return {};
  try {
    const edits: unknown = JSON.parse(raw);
    return edits && typeof edits === 'object' ? edits as Partial<User> : {};
  } catch { return {}; }
}

/**
 * "Is this still the member who asked for this work?" sessionGuard's, restated:
 * it imports this file, and importing it back would be a cycle (undefined at
 * init on Hermes). Same name, so staleWriteGuard.test.ts polices this store too.
 */
function memberUnchanged(capturedUserId: string | null): boolean {
  return (useAuthStore.getState().user?.id ?? null) === capturedUserId;
}

/** What a member is told when the account signed in here was closed (on another phone). */
export const ACCOUNT_CLOSED_SAID = 'This account has been closed. You are signed out on this phone.';

/** The profile read answered that there is no row (PostgREST's PGRST116 for .single()), not that it failed. */
function noProfileRow(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'PGRST116';
}

/**
 * A valid session that finds no profile row: the account may have been closed on another phone. The
 * deletion takes the row, and this phone's session stands until its token is next refreshed (up to
 * an hour), drawing the member as signed in to a file that does not exist (review round 11). Asked
 * of the house once (getUser checks the session with the auth server): only its answer that the
 * account is gone counts. A read that failed, the house unreached, or any other answer keeps the
 * member as before.
 */
async function accountIsClosed(): Promise<boolean> {
  try {
    const { error } = await supabase.auth.getUser();
    const e = error as { code?: unknown; name?: unknown } | null;
    return e?.code === 'user_not_found' || e?.name === 'AuthSessionMissingError';
  } catch { return false; }
}

/** The closed account's session ended here, everything of theirs with it, and the member told why. */
async function signOutClosedAccount(): Promise<void> {
  // By the member's own sign-out, not "ended elsewhere": nothing is kept for a return that cannot come.
  await useAuthStore.getState().logout();
  reelToast.error(ACCOUNT_CLOSED_SAID);
}

/**
 * Whether this member once held a rank: the source that last granted one. Not
 * a column anyone may read (it would tell every member how every other pays),
 * so the house answers it for the member alone. useClearance greets a member
 * whose rank lapsed as one coming back, not a stranger. A failed read leaves
 * what was known.
 */
async function readRankHistory(userId: string): Promise<void> {
  let data: unknown;
  let error: { message: string } | null;
  try {
    ({ data, error } = await supabase.rpc('my_entitlement_source'));
  } catch (e) {
    logger.warn('[auth] could not ask for the member\'s rank history', e);
    return;
  }
  if (error) {
    logger.warn('[auth] could not read the member\'s rank history', error.message);
    return;
  }
  if (!memberUnchanged(userId)) return;
  useAuthStore.setState((s) => {
    if (!s.user) return {};
    const user = { ...s.user, entitlement_source: typeof data === 'string' ? data : null };
    setSensitive(`ironvault_user_cache_${user.id}`, JSON.stringify(user));
    return { user };
  });
}

/**
 * The member's session ended elsewhere: their unsent writes go aside under a
 * key of their own (a toggle is not kept), their drafts stay, and they are told.
 */
/**
 * A member left behind by another signing in on this phone without a sign-out (a confirmation link
 * for another account, the sign-in form, a reset finished for another account): what was theirs on
 * the screen goes first, as their sign-out takes it, or the next member opened on their notices,
 * their logs and their lists, the notice channel still theirs. Their unsent writes and drafts wait
 * for them. The session is already the next member's, so nothing is asked of the house as theirs:
 * the phone's push token is claimed by the next member as it registers (register_push_token).
 */
async function leaveBehind(previousUserId: string): Promise<void> {
  keepForTheirReturn(previousUserId);
  try {
    const { teardownNotificationRealtime } = require('./notificationStore') as typeof import('./notificationStore');
    teardownNotificationRealtime();
  } catch { /* nothing live to end */ }
  try {
    const { resetAllStores } = require('./resetAllStores') as typeof import('./resetAllStores');
    await resetAllStores(previousUserId);
  } catch (err) {
    captureError(err instanceof Error ? err : new Error(String(err)), { context: 'leave_behind' });
  }
  try { queryClient.clear(); } catch { /* the next reads fill it */ }
  // The cache on disk, with any write of it still waiting its turn (one door: forgetCache).
  forgetCache();
  _prefTimers.forEach((t) => clearTimeout(t));
  _prefTimers.clear();
  _prefBaselines.clear();
  storage.delete(`ironvault_user_cache_${previousUserId}`);
  forgetCache();
  storage.delete('nitrate_memory_feed');
}

/**
 * A session found gone at launch: this phone's push token forgotten (owed when the house cannot be
 * reached) and the notices it was shown taken off it, as every sign-out does (logout, step 7).
 */
async function forgetThisPhoneFor(memberId: string | null): Promise<void> {
  try {
    if (memberId) {
      let gone = false;
      try { gone = await raceDeadline(removePushToken(memberId), 4000); } catch { gone = false; }
      if (!gone) owePushToken(memberId);
    }
  } catch (e) {
    logger.warn('[auth] the push token of a session found gone was not forgotten', e);
  }
  try { await clearDeliveredNotices(); } catch { /* the sign-out stands without it */ }
}

function keepForTheirReturn(memberId: string | null): void {
  let held = { kept: 0, lapsed: 0 };
  try {
    held = holdQueue();
  } catch (e) {
    logger.warn('[auth] could not set the queue aside for its member', e);
  }
  reelToast(keptAfterSignOutElsewhere({ ...held, drafts: countDrafts(memberId) }));
}

/** At a member's sign-in here: what was kept for them returns to the queue, and they are told. */
function welcomeBack(memberId: string): void {
  let released: QueuedMutation[] = [];
  try {
    released = releaseHeldWrites(memberId);
  } catch (e) {
    logger.warn('[auth] could not return the writes kept for the member', e);
    return;
  }
  const words = keptFromBefore(released);
  if (!words) return;
  reelToast(words);
  void flushOfflineQueue();
}

/** When a member's own row, their rank in it, was last read from the house, and whose it was. */
let rankRead: { at: number; of: string } | null = null;
const rankWasRead = (memberId: string) => { rankRead = { at: Date.now(), of: memberId }; };
/** How long ago the signed-in member's rank was read from the house; Infinity when it has not been, this launch. */
export function rankAge(): number {
  const id = useAuthStore.getState().user?.id;
  return rankRead && id && rankRead.of === id ? Date.now() - rankRead.at : Infinity;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  loading: true,

  // COLD-START LAW: this is the ONLY thing the splash screen waits for — pure
  // local MMKV reads (~1ms). The full restoreSession() (network reconcile:
  // getSession, dirty prefs, profile fetch) runs in the background right after
  // and corrects anything stale. It is idempotent over this hydration.
  hydrateFromCache: () => {
    // SECURITY: an armed recovery flag means a password reset was abandoned —
    // never hydrate that session's cached user. Leave the flag for the
    // background restoreSession, which destroys the session and clears it.
    if (storage.getString('recovery_pending') === 'true') {
      set({ user: null, isAuthenticated: false, loading: false });
      return;
    }
    const lastUserId = storage.getString('last_user_id');
    if (lastUserId) {
      const vaultData = storage.getString(`ironvault_user_cache_${lastUserId}`);
      if (vaultData) {
        try {
          const parsedUser = JSON.parse(vaultData);
          set({ user: parsedUser, isAuthenticated: true, loading: false });
          return;
        } catch {}
      }
    }
    set({ loading: false });
  },

  restoreSession: async () => {
    try {
      // SECURITY: a recovery link mints a full session before the user sets a
      // new password. If the app is (re)launched with the reset still pending,
      // the user abandoned the flow — destroy the session instead of silently
      // signing them in with an unchanged password.
      if (storage.getString('recovery_pending') === 'true') {
        storage.delete('recovery_pending');
        await endSessionHere();
        set({ user: null, isAuthenticated: false, loading: false });
        return;
      }

      // The cached member first, for an instant start; the network checks after.
      let cachedFollowing: string[] = [];
      const lastUserId = storage.getString('last_user_id');
      if (lastUserId) {
        const vaultData = storage.getString(`ironvault_user_cache_${lastUserId}`);
        if (vaultData) {
          try {
            const parsedUser = JSON.parse(vaultData);
            cachedFollowing = parsedUser.following ?? [];
            set({ user: parsedUser, isAuthenticated: true, loading: false });
          } catch {}
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      e2eTrace('auth.restore', { session: !!session?.user, cached: lastUserId !== undefined });
      if (session?.user) {
        // Another member's session than the one on screen: the one on screen goes first, as their
        // sign-out takes them, and their follow list is not this member's.
        const onScreen = get().user?.id ?? null;
        if (onScreen && onScreen !== session.user.id) {
          set({ user: null, isAuthenticated: false });
          await leaveBehind(onScreen);
          cachedFollowing = [];
        }
        welcomeBack(session.user.id);
        // Who is on the phone as the restore begins (this member, from the cache, or no one): a
        // sign-out, or another member's sign-in, made while it waits below is the phone's answer,
        // and the restore lands nowhere. It set the member who had signed out back on screen,
        // wrote them back to disk and booted them again, on a session that had ended (review
        // round 6).
        const restoringFor = get().user?.id ?? null;
        // Unsynced preferences first, MERGED server-side (another device may
        // have set other keys meanwhile).
        // Kept on disk when unreached, and laid below over the server's older copy.
        await sendPendingPrefs(session.user.id);

        const { data: profile, error: profileError } = await supabase
          .from('profiles').select(PROFILE_SELECT_COLUMNS).eq('id', session.user.id).single();
        if (!memberUnchanged(restoringFor)) { set({ loading: false }); return; }
        if (profile) {
          rankWasRead(session.user.id);
          // Unsynced preferences win over the server's copy, key by key (see setPreference).
          const finalPrefs = withPendingPrefs(session.user.id, profile as { preferences?: unknown }).preferences;
          // Profile edits updateUser has not yet had confirmed, so this restore
          // (post-purchase polling runs it) never reverts one in flight.
          const pendingProfileEdits = readPendingProfile(session.user.id);
          // The cached following list is kept, never replaced by an empty one.
          // The rank history is not in the profile; the one already known stands until readRankHistory answers.
          const knownHistory = get().user?.id === session.user.id ? get().user?.entitlement_source : undefined;
          const completeUser = { ...session.user, ...profile, ...pendingProfileEdits, preferences: finalPrefs, following: cachedFollowing, entitlement_source: knownHistory } as unknown as User;
          storage.set('last_user_id', session.user.id);
          setSensitive(`ironvault_user_cache_${session.user.id}`, JSON.stringify(completeUser));
          set({ user: completeUser, isAuthenticated: true, loading: false });
          // The member's blocks, as a sign-in reads them (adoptSession): signed in here by a reset,
          // after a sign-out had cleared them, every member they had blocked or muted was shown.
          if (!useBlockStore.getState().blocksKnown) {
            useBlockStore.getState().hydrateFromCache(session.user.id);
            void useBlockStore.getState().syncFromServer(session.user.id);
          }
          // Hydrate following from DB in background (authoritative source)
          hydrateFollowing();
          // Every film they have logged and saved, whole (marksLedger).
          void readMarks();
          void readRankHistory(session.user.id);
          return;
        }
        // No row for a valid session: the account closed on another phone is signed out here, and
        // the member told (accountIsClosed asks the house). Not if someone else came in meanwhile.
        if (noProfileRow(profileError) && await accountIsClosed() && memberUnchanged(restoringFor)) {
          await signOutClosedAccount();
          set({ loading: false });
          return;
        }
        // session valid but profile fetch returned nothing — keep the cached
        // optimistic user (a transient profile read shouldn't force a logout).
      } else {
        // NO session: the member restored from cache is stale. This is the
        // SECOND way a session ends, so it erases their data here as logout does
        // (the SIGNED_OUT listener, which would, only runs while authenticated).
        const staleUserId = get().user?.id ?? null;
        const hadStaleSession = staleUserId !== null || get().isAuthenticated;
        set({ user: null, isAuthenticated: false, loading: false });
        // Only if someone was here: a signed-out visitor keeps their warm feed.
        if (hadStaleSession) {
          // Not by their own hand: what they had not yet sent waits for them.
          keepForTheirReturn(staleUserId);
          // Their phone's token and the notices it was shown go with the session, as at any sign-out:
          // forgotten by the token (no session needed), or owed until the network returns.
          void forgetThisPhoneFor(staleUserId);
          try {
            const { resetAllStores } = require('./resetAllStores') as typeof import('./resetAllStores');
            await resetAllStores(staleUserId);
            if (staleUserId) storage.delete(`ironvault_user_cache_${staleUserId}`);
            storage.delete('last_user_id');
            storage.delete('nitrate_memory_feed');
            queryClient.clear();
            // After the clear: its own changes would otherwise hold a write of the cache.
            forgetCache();
          } catch { /* best effort — the auth flag is already cleared */ }
        }
        return;
      }
    } catch (err: unknown) {
      // A network failure keeps the cached member: never a logout on an error.
      if (__DEV__) console.warn('[restoreSession] Failed:', err instanceof Error ? err.message : String(err));
    }
    set({ loading: false });
  },

  login: async (email, password) => {
    const identifier = email.trim();
    let authedUser: AuthUser;

    if (!isAddress(identifier)) {
      // By username, entirely server-side: the function never reveals the email or
      // whether the account exists (one refusal for every wrong handle or password).
      // The key the house handed this phone at an earlier sign-in by this handle, if it holds one: a
      // phone the member signed in on before is never slowed by attempts on the handle elsewhere.
      const door = doorFor(identifier, (k) => storage.getString(k));
      const { data: fnData, error: fnError } = await supabase.functions.invoke('sign-in-with-username', {
        body: { username: identifier.replace(/^@/, ''), password, ...(door ? { device: door } : {}) },
      });
      if (fnError) {
        if (!isNetworkError(fnError)) captureAuthRefusal('sign_in');
        throw await usernameRefusal(fnError);
      }
      if (!fnData?.access_token || !fnData?.refresh_token) throw await usernameRefusal(null);
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: fnData.access_token,
        refresh_token: fnData.refresh_token,
      });
      if (sessionError) throw sessionError;
      if (!sessionData.user) throw await usernameRefusal(null);
      authedUser = sessionData.user;
      // Kept for the next sign-in by this handle on this phone (encrypted storage only).
      keepDoor(identifier, fnData.device, (k) => storage.getString(k), setSensitive);
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email: identifier, password });
      if (error) {
        if (!isNetworkError(error)) captureAuthRefusal('sign_in');
        throw error;
      }
      authedUser = data.user;
    }

    get().adoptSession(authedUser);
  },

  adoptSession: (authedUser, profile) => {
    // Signed in over another member, never signed out: they are left behind first, then this member
    // comes in by the same door, the screen holding no one between (the boot runs again for them).
    const before = get().user?.id ?? null;
    if (before && before !== authedUser.id) {
      set({ user: null, isAuthenticated: false, loading: true });
      void leaveBehind(before).then(() => {
        // Not if someone else came in, or the sign-in was undone, meanwhile.
        if (get().user === null) get().adoptSession(authedUser, profile);
      });
      return;
    }
    // Signed in on screen at once, and remembered for the next launch — with the
    // profile when the caller already holds it (signup reads it for the handle).
    const completeUser = { ...authedUser, ...(profile ? withPendingPrefs(authedUser.id, profile) : {}), following: [] } as unknown as User;
    // A session signed in to replaces a recovery left unfinished (the recovery link's own session
    // never comes here: auth-callback sends it to the reset). Its flag, left, ended this session at
    // the next launch, as if the reset had just been abandoned.
    storage.delete('recovery_pending');
    if (profile) rankWasRead(authedUser.id);
    storage.set('last_user_id', authedUser.id);
    setSensitive(`ironvault_user_cache_${authedUser.id}`, JSON.stringify(completeUser));
    set({ user: completeUser, isAuthenticated: true, loading: false });
    welcomeBack(authedUser.id);

    // The store's identity, by the documented `logIn()`; never awaited by sign-in.
    void identifyUser(authedUser.id);
    void readRankHistory(authedUser.id);
    // The member's blocks, as a cold start reads them: a login on a new phone read none, and
    // its member's blocks were unknown for the whole session. The sync guards its own landing
    // (stillSignedIn) and reports its own failure.
    useBlockStore.getState().hydrateFromCache(authedUser.id);
    void useBlockStore.getState().syncFromServer(authedUser.id);

    // Otherwise the full profile, in the background with retries; if it never
    // comes, the session runs on the auth user alone, and the failure is reported.
    if (!profile) withRetry(
      async () => {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles').select(PROFILE_SELECT_COLUMNS).eq('id', authedUser.id).single();
        if (profileError) throw profileError;
        return profileData;
      },
      { maxRetries: 2, baseDelay: 1500, label: 'login_enrich', shouldRetry: isRetryable }
    ).then((profileData) => {
        // Only onto the member it was read for: not after they left, nor onto the next.
        if (profileData && memberUnchanged(authedUser.id)) {
           rankWasRead(authedUser.id);
           set((s) => {
             const updatedUser = s.user ? { ...s.user, ...withPendingPrefs(authedUser.id, profileData) } : null;
             if (updatedUser) {
               storage.set('last_user_id', updatedUser.id);
               setSensitive(`ironvault_user_cache_${updatedUser.id}`, JSON.stringify(updatedUser));
             }
             return { user: updatedUser };
           });
        }
      }).catch((err) => {
        logger.warn('[auth.login] Profile enrichment failed after retries:', err);
        captureError(err instanceof Error ? err : new Error(String(err)), { context: 'login_enrichment' });
      });

    hydrateFollowing();
    void readMarks();
  },

  rereadProfile: async () => {
    const id = get().user?.id ?? null;
    if (!id) return false;
    // What waited for the house goes first, then the read; still unreached, it is laid over the read.
    await sendPendingPrefs(id);
    const { data, error } = await supabase.from('profiles').select(PROFILE_SELECT_COLUMNS).eq('id', id).single();
    // No row for this member: the account closed on another phone is signed out here (restoreSession's).
    if (noProfileRow(error) && memberUnchanged(id) && await accountIsClosed() && memberUnchanged(id)) {
      await signOutClosedAccount();
      return false;
    }
    // Only onto the member it was read for, as the login's read lands.
    if (error || !data || !memberUnchanged(id)) return profileRead(get().user);
    rankWasRead(id);
    set((s) => {
      const updatedUser = s.user ? ({ ...s.user, ...withPendingPrefs(id, data) } as User) : null;
      if (updatedUser) setSensitive(`ironvault_user_cache_${updatedUser.id}`, JSON.stringify(updatedUser));
      return { user: updatedUser };
    });
    return true;
  },

  signup: async (email, password, username, persona = 'The Cinephile') => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { username },
        emailRedirectTo: authLink('signup'),
      },
    });
    if (error) throw error;

    if (data?.session) {
      // No confirmation needed: signed in at once. On a taken handle the trigger
      // has added a suffix (an account is always made), so this claim may be
      // refused: noted, never thrown, as signup must not fail over a handle.
      const { error: renameError } = await supabase
        .from('profiles').update({ username, persona }).eq('id', data.user!.id);
      if (renameError) {
        logger.warn('[signup] could not claim the requested handle', renameError);
      }

      // Read for the handle it was given. Unread, the one door below reads it again
      // with retries; it stored a member with no handle, and said nothing.
      const { data: profile, error: profileError } = await supabase
        .from('profiles').select(PROFILE_SELECT_COLUMNS).eq('id', data.user!.id).single();

      // Recorded: AppBootstrapper says so if the handle held is not the one typed.
      rememberRequestedHandle(data.user!.id, username);

      // In by the same door as sign-in and the email link.
      get().adoptSession(data.user!, profileError ? null : (profile as Record<string, unknown> | null));
      return { needsConfirmation: false };
    }
    // Confirmation needed: no session, so the handle is checked once they sign in.
    rememberRequestedHandle(data?.user?.id, username);
    return { needsConfirmation: true };
  },

  logout: async (opts) => {
    // Re-entrancy guard: signOut() emits SIGNED_OUT, whose (deferred) handler
    // calls logout() again if state still looks authenticated. One pass only.
    if (_logoutInFlight) return _logoutInFlight;
    const endedElsewhere = opts?.endedElsewhere === true;
    _logoutInFlight = (async () => {
    // 0. Capture user ID before we clear state (needed for push token removal)
    const previousUserId = get().user?.id ?? null;
    const cleanupErrors: string[] = [];

    // 1. Signed out on screen FIRST: never held up by the network or an SDK.
    set({ user: null, isAuthenticated: false });
    // Not by their own hand: what they had not yet sent waits for them.
    if (endedElsewhere) keepForTheirReturn(previousUserId);

    // 2. Clean up Realtime WebSocket immediately to stop background heartbeat
    try {
      const { teardownNotificationRealtime } = require('./notificationStore') as typeof import('./notificationStore');
      teardownNotificationRealtime();
    } catch { cleanupErrors.push('realtime'); }

    // 3. Every store's own reset, so nothing crosses to the next member.
    try {
      const { resetAllStores } = require('./resetAllStores') as typeof import('./resetAllStores');
      // Their id, for per-member caches: step 1 already cleared it from the store.
      await resetAllStores(previousUserId);
    } catch { cleanupErrors.push('stores'); }

    // 4. Clear RevenueCat identity — prevents next user inheriting paid entitlements
    try {
      await logoutRevenueCat();
    } catch { /* RevenueCat may not be configured */ }

    // 5. Clear Sentry user context — prevents crash misattribution
    try {
      setSentryUser(null);
    } catch { /* Sentry may not be initialized */ }

    // 6. Clear React Query cache — prevents next user seeing stale data
    try {
      queryClient.clear();
      // The cache on disk with it, and any write of it still waiting its turn (one door: forgetCache).
      forgetCache();
    } catch { cleanupErrors.push('query-cache'); }

    // 7. The push token, forgotten by the token itself (no session needed: a session ended
    //    elsewhere has its phone's token forgotten too), and the notices this phone was shown.
    try {
      if (previousUserId) {
        // A surviving token keeps sending their notifications here: a failure is reported, and owed.
        const removed = await raceDeadline(removePushToken(previousUserId), 4000);
        if (!removed) cleanupErrors.push('push-token');
      }
    } catch { cleanupErrors.push('push-token'); }
    try { await clearDeliveredNotices(); } catch { /* best effort: it says its own failure */ }

    // 8. The session LAST among network ops, this device's only (web and other devices stay
    //    signed in). Ended on the phone even when the server cannot be reached; what the server
    //    still holds, the push token's row with it when step 7 failed, is owed (endSession).
    if (!(await endSessionHere({ pushStillHeld: cleanupErrors.includes('push-token'), memberId: previousUserId }))) cleanupErrors.push('auth');

    // 9. The member's caches on disk, on every platform.
    if (previousUserId) storage.delete(`ironvault_user_cache_${previousUserId}`);
    storage.delete('last_user_id');
    storage.delete('ironvault_user_cache'); // clean up legacy
    storage.delete('recovery_pending');
    // Their unfinished writing and unsent writes, at their own sign-out only
    // (its confirm named them first); keyed to them, never shown to another.
    if (!endedElsewhere) {
      clearAllDrafts(previousUserId);
      clearOfflineQueue(previousUserId);
    }
    // Their old handles and the one they asked for: never left on another's phone.
    clearHandleHistory();
    clearRequestedHandle();
    // Again after the network's steps: a read that answered meanwhile held a write of the cache.
    forgetCache();
    storage.delete('nitrate_memory_feed');

    // 10. Clear module-level caches
    _prefTimers.forEach(t => clearTimeout(t));
    _prefTimers.clear();
    _prefBaselines.clear();

    // 11. Report partial cleanup failures
    if (cleanupErrors.length > 0) {
      if (__DEV__) {
        console.warn('[logout] Partial cleanup failure:', cleanupErrors.join(', '));
      } else {
        captureError(new Error(`[logout] Partial cleanup failure: ${cleanupErrors.join(', ')}`));
      }
    }
    })().finally(() => { _logoutInFlight = null; });
    return _logoutInFlight;
  },

  updateUser: async (updates) => {
    const user = get().user;
    if (!user) return;

    // Every call applies: no change made at once is dropped.
    const prevUser = user;

    // Prevent client-side role elevation
    const { role: _stripped, ...safeUpdates } = updates as Partial<User> & { role?: unknown };
    
    // Optimistic update
    set((state) => {
      const updatedUser = state.user ? { ...state.user, ...safeUpdates } : null;
      if (updatedUser) setSensitive(`ironvault_user_cache_${updatedUser.id}`, JSON.stringify(updatedUser));
      return { user: updatedUser };
    });

    if (Object.keys(safeUpdates).length > 0) {
      // Ahead of the server until confirmed, so a restoreSession meanwhile (the
      // post-purchase polling) merges these rather than reverting them.
      storage.set(`dirty_profile_${user.id}`, JSON.stringify(safeUpdates));
      try {
        // The old handle from `prevUser`: memory already holds the new one.
        await ProfileService.updateProfile(user.id, safeUpdates as Partial<User>, prevUser?.username);
        storage.delete(`dirty_profile_${user.id}`);
      } catch (e: unknown) {
        // Rollback optimistic update
        if (__DEV__) console.warn('[updateUser] DB sync failed, rolling back:', e);
        storage.delete(`dirty_profile_${user.id}`);
        // Never onto a member who has left (it would rewrite their cache).
        if (!memberUnchanged(prevUser.id)) return;
        // This change alone is undone: a field changed again since keeps its
        // newer value, and another field's change is not touched.
        set((state) => {
          if (!state.user) return state;
          const now = state.user as unknown as Record<string, unknown>;
          const was = prevUser as unknown as Record<string, unknown>;
          const undone: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(safeUpdates)) {
            if (now[k] === v) undone[k] = was[k];
          }
          const reverted = { ...state.user, ...undone } as User;
          setSensitive(`ironvault_user_cache_${reverted.id}`, JSON.stringify(reverted));
          return { user: reverted };
        });
        reelToast.error('Profile update failed \u2014 changes reverted.');
      }
    }
  },

  // The rank shown just after a purchase, on this phone only: the server sets
  // the real one, and the purchase's polling restores it once it lands.
  setLocalTierHint: (updates) => {
    set((state) => {
      if (!state.user) return state;
      const updatedUser = { ...state.user, ...updates };
      setSensitive(`ironvault_user_cache_${updatedUser.id}`, JSON.stringify(updatedUser));
      return { user: updatedUser };
    });
  },

  setPreference: async (key, value) => {
    const user = get().user;
    if (!user) return;

    const timerKey = `pref:${user.id}`;

    // The window's opening snapshot, taken ONCE, so a refusal reverts every key in it.
    if (!_prefTimers.has(timerKey)) {
      _prefBaselines.set(user.id, { ...(user.preferences ?? {}) });
    }

    const prefs = { ...(user.preferences ?? {}), [key]: value };

    // 1. Optimistic update (Memory)
    set((state) => ({ user: state.user ? { ...state.user, preferences: prefs } : null }));

    // 2. Optimistic update (Cache)
    setSensitive(`ironvault_user_cache_${user.id}`, JSON.stringify({ ...get().user, preferences: prefs }));

    // 3. The PENDING change, this key alone, never gated on encryption: it must survive a kill.
    addPendingPrefs(user.id, { [key]: value });

    if (_prefTimers.has(timerKey)) {
      clearTimeout(_prefTimers.get(timerKey)!);
    }

    // 4. The send, debounced: one call for a burst of changes, always after the last.
    _prefTimers.set(timerKey, setTimeout(async () => {
      _prefTimers.delete(timerKey);
      // The window's snapshot and its changes, taken before the send: a change made while it is
      // away opens a window of its own, with its own snapshot.
      const baseline = _prefBaselines.get(user.id) ?? {};
      _prefBaselines.delete(user.id);
      const windowChanges = changedFrom(baseline, get().user?.preferences ?? {});
      // The keys changed, merged by the house key by key (COMP-7 cross-device).
      const outcome = await sendPendingPrefs(user.id);
      // Sent, or kept for when the house is reached: the screen keeps the change.
      if (outcome !== 'refused') return;
      // Refused: the window's keys revert together. Not after a logout (likely, inside a one-second
      // window): it would rewrite the departed member's cache, which the logout deleted.
      if (!memberUnchanged(user.id)) return;
      set((state) => ({ user: state.user ? { ...state.user, preferences: takenBack(state.user.preferences ?? {}, baseline, windowChanges) } : null }));
      setSensitive(`ironvault_user_cache_${user.id}`, JSON.stringify(get().user));
      // The disk follows the screen, or the next launch re-applies the undone change; a key changed
      // again since stays pending, as its own window's.
      settlePendingPrefs(user.id, windowChanges);
      if (__DEV__) console.warn('[setPreference] DB sync failed, rolled back window locally');
    }, 1000));
  },

  savePreferences: async (changes) => {
    const user = get().user;
    if (!user) throw new Error('No member signed in.');
    const before = { ...(user.preferences ?? {}) };
    const prefs = { ...before, ...changes };
    set((state) => ({ user: state.user ? { ...state.user, preferences: prefs } : null }));
    setSensitive(`ironvault_user_cache_${user.id}`, JSON.stringify({ ...get().user, preferences: prefs }));
    addPendingPrefs(user.id, changes);
    // A toggle's window still waiting goes with these, now.
    const timerKey = `pref:${user.id}`;
    if (_prefTimers.has(timerKey)) {
      clearTimeout(_prefTimers.get(timerKey)!);
      _prefTimers.delete(timerKey);
      _prefBaselines.delete(user.id);
    }
    const outcome = await sendPendingPrefs(user.id);
    if (outcome === 'refused') {
      if (memberUnchanged(user.id)) {
        set((state) => ({ user: state.user ? { ...state.user, preferences: takenBack(state.user.preferences ?? {}, before, changes) } : null }));
        setSensitive(`ironvault_user_cache_${user.id}`, JSON.stringify(get().user));
        settlePendingPrefs(user.id, changes);
      }
      throw new Error('The house refused the settings.');
    }
    return outcome === 'kept' ? 'kept' : 'saved';
  },

  getPreference: (key, fallback = null) => {
    const user = get().user;
    return user?.preferences?.[key] ?? fallback;
  },
}));



import * as Linking from 'expo-linking';
import { create } from 'zustand';
import { removePushToken } from '../lib/pushNotifications';
import { queryClient } from '../lib/queryClient';
import { identifyUser, logoutRevenueCat } from '../lib/revenueCat';
import { rememberRequestedHandle, clearRequestedHandle } from '../utils/handleNotice';
import { clearHandleHistory } from '../utils/handleHistory';
import { clearAllDrafts } from '../utils/memberDrafts';
import { captureError, setSentryUser } from '../lib/sentry';
import type { User as AuthUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { PROFILE_SELECT_COLUMNS, ProfileService } from '../services/ProfileWriteService';
import { User } from '../types';
import { logger } from '../utils/logger';
import { clearOfflineQueue } from '../utils/offlineQueue';
import reelToast from '../utils/reelToast';
import { isRetryable, withRetry } from '../utils/withRetry';
import { hydrateFollowing } from './domain/socialSlice';
import { storage, setSensitive } from './mmkv-storage';
export { storage };

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, username: string, persona?: string) => Promise<{ needsConfirmation: boolean }>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  setLocalTierHint: (updates: { tier?: string; is_founding?: boolean }) => void;
  setPreference: (key: string, value: unknown) => Promise<void>;
  getPreference: (key: string, fallback?: unknown) => unknown;
  restoreSession: () => Promise<void>;
  hydrateFromCache: () => void;
}



// ── Action throttle: prevents spam-clicking social buttons ──
const _actionThrottles = new Map<string, number>();
const _prefTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Each member's preferences at the START of a debounce window: a refusal rolls
// back every key changed in it (the keys share one timer).
const _prefBaselines = new Map<string, Record<string, unknown>>();
const _THROTTLE_MAX = 200;
const _THROTTLE_TTL = 30000;

// Single-flight guard for logout (see logout() re-entrancy note).
let _logoutInFlight: Promise<void> | null = null;

// Race a promise against a deadline so a hung network call or SDK lock can
// never strand the caller. The underlying operation continues in background.
function _withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}
/**
 * The member's unsynced preferences, or null. `dirty_prefs_<id>` HOLDS them
 * (the profile cache is written only when storage is encrypted, so it cannot
 * carry them). An older install may hold the bare 'true' of an earlier
 * version, its values in the cache: read as it was, never discarded.
 */
function readPendingPrefs(userId: string): Record<string, unknown> | null {
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

function pruneThrottles() {
  if (_actionThrottles.size < _THROTTLE_MAX) return;
  const now = Date.now();
  for (const [key, ts] of _actionThrottles) {
    if (now - ts > _THROTTLE_TTL) _actionThrottles.delete(key);
  }
  // Batch-prune the oldest 50 entries if still over the limit.
  if (_actionThrottles.size >= _THROTTLE_MAX) {
    const keys = [..._actionThrottles.keys()].slice(0, 50);
    keys.forEach(k => _actionThrottles.delete(k));
  }
}

/**
 * "Is this still the member who asked for this work?" sessionGuard's, restated:
 * it imports this file, and importing it back would be a cycle (undefined at
 * init on Hermes). Same name, so staleWriteGuard.test.ts polices this store too.
 */
function memberUnchanged(capturedUserId: string | null): boolean {
  return (useAuthStore.getState().user?.id ?? null) === capturedUserId;
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
        try { await _withTimeout(supabase.auth.signOut({ scope: 'local' }), 5000); } catch {}
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
      if (session?.user) {
        // Unsynced preferences first, MERGED server-side (another device may
        // have set other keys meanwhile).
        const pendingPrefs = readPendingPrefs(session.user.id);
        if (pendingPrefs) {
          try {
            await supabase.rpc('update_my_preferences', { p_preferences: pendingPrefs });
            storage.delete(`dirty_prefs_${session.user.id}`);
          } catch {
            // Kept on disk for the next launch, and preferred below over the
            // server's older copy.
          }
        }

        const { data: profile } = await supabase
          .from('profiles').select(PROFILE_SELECT_COLUMNS).eq('id', session.user.id).single();
        if (profile) {
          // Unsynced preferences win over the server's copy (see setPreference).
          const stillPending = readPendingPrefs(session.user.id);
          const finalPrefs = stillPending ?? profile.preferences;
          // Profile edits updateUser has not yet had confirmed, so this restore
          // (post-purchase polling runs it) never reverts one in flight.
          let pendingProfileEdits: Partial<User> = {};
          const dirtyProfile = storage.getString(`dirty_profile_${session.user.id}`);
          if (dirtyProfile) {
            try { pendingProfileEdits = JSON.parse(dirtyProfile); } catch {}
          }
          // The cached following list is kept, never replaced by an empty one.
          const completeUser = { ...session.user, ...profile, ...pendingProfileEdits, preferences: finalPrefs, following: cachedFollowing } as unknown as User;
          storage.set('last_user_id', session.user.id);
          setSensitive(`ironvault_user_cache_${session.user.id}`, JSON.stringify(completeUser));
          set({ user: completeUser, isAuthenticated: true, loading: false });
          // Hydrate following from DB in background (authoritative source)
          hydrateFollowing();
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
          try {
            const { resetAllStores } = await import('./resetAllStores');
            await resetAllStores(staleUserId);
            if (staleUserId) storage.delete(`ironvault_user_cache_${staleUserId}`);
            storage.delete('last_user_id');
            storage.delete('REELHOUSE_QUERY_CACHE');
            storage.delete('nitrate_memory_feed');
            queryClient.clear();
          } catch { /* best effort — the auth flag is already cleared */ }
        }
        // The offline queue stays: each write carries its user_id (unlike logout).
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

    if (!identifier.includes('@')) {
      // By username, entirely server-side: the function never reveals the email or
      // whether the account exists (one generic error for every failure).
      const { data: fnData, error: fnError } = await supabase.functions.invoke('sign-in-with-username', {
        body: { username: identifier, password },
      });
      if (fnError || !fnData?.access_token || !fnData?.refresh_token) {
        throw new Error('Invalid username or password.');
      }
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: fnData.access_token,
        refresh_token: fnData.refresh_token,
      });
      if (sessionError || !sessionData.user) throw new Error('Invalid username or password.');
      authedUser = sessionData.user;
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email: identifier, password });
      if (error) throw error;
      authedUser = data.user;
    }

    // Set auth immediately
    const completeUser = { ...authedUser, following: [] } as unknown as User;
    storage.set('last_user_id', authedUser.id);
    setSensitive(`ironvault_user_cache_${authedUser.id}`, JSON.stringify(completeUser));
    set({ user: completeUser, isAuthenticated: true });

    // The store's identity, by the documented `logIn()`; never awaited by sign-in.
    void identifyUser(authedUser.id);

    // The full profile, in the background with retries; if it never comes, the
    // session runs on the auth user alone.
    withRetry(
      async () => {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles').select(PROFILE_SELECT_COLUMNS).eq('id', authedUser.id).single();
        if (profileError) throw profileError;
        return profileData;
      },
      { maxRetries: 2, baseDelay: 1500, label: 'login_enrich', shouldRetry: isRetryable }
    ).then((profileData) => {
        if (profileData) {
           set((s) => {
             const updatedUser = s.user ? { ...s.user, ...profileData } : null;
             if (updatedUser) {
               storage.set('last_user_id', updatedUser.id);
               setSensitive(`ironvault_user_cache_${updatedUser.id}`, JSON.stringify(updatedUser));
             }
             return { user: updatedUser };
           });
        }
      }).catch((err) => {
        logger.warn('[auth.login] Profile enrichment failed after retries:', err);
        captureError(err instanceof Error ? err : new Error(String(err)), { context: 'login_enrichment', userId: authedUser.id });
      });

    hydrateFollowing();
  },

  signup: async (email, password, username, persona = 'The Cinephile') => {
    // The confirmation email's link back into the app.
    const redirectTo = Linking.createURL('auth-callback');
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { username },
        emailRedirectTo: redirectTo,
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
        logger.warn('[signup] could not claim the requested handle', { requested: username, code: renameError.code });
      }

      const { data: profile } = await supabase.from('profiles').select(PROFILE_SELECT_COLUMNS).eq('id', data.user!.id).single();

      // Recorded: AppBootstrapper says so if the handle held is not the one typed.
      rememberRequestedHandle(data.user!.id, username);

      const completeUser = { ...data.user, ...profile, following: [] } as User;
      storage.set('last_user_id', data.user!.id);
      setSensitive(`ironvault_user_cache_${data.user!.id}`, JSON.stringify(completeUser));
      set({ user: completeUser, isAuthenticated: true });
      // The store's identity moves to this account, as in login().
      void identifyUser(data.user!.id);
      return { needsConfirmation: false };
    }
    // Confirmation needed: no session, so the handle is checked once they sign in.
    rememberRequestedHandle(data?.user?.id, username);
    return { needsConfirmation: true };
  },

  logout: async () => {
    // Re-entrancy guard: signOut() emits SIGNED_OUT, whose (deferred) handler
    // calls logout() again if state still looks authenticated. One pass only.
    if (_logoutInFlight) return _logoutInFlight;
    _logoutInFlight = (async () => {
    // 0. Capture user ID before we clear state (needed for push token removal)
    const previousUserId = get().user?.id ?? null;
    const cleanupErrors: string[] = [];

    // 1. Signed out on screen FIRST: never held up by the network or an SDK.
    set({ user: null, isAuthenticated: false });

    // 2. Clean up Realtime WebSocket immediately to stop background heartbeat
    try {
      const { teardownNotificationRealtime } = await import('./notificationStore');
      teardownNotificationRealtime();
    } catch { cleanupErrors.push('realtime'); }

    // 3. Every store's own reset, so nothing crosses to the next member.
    try {
      const { resetAllStores } = await import('./resetAllStores');
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
    } catch { cleanupErrors.push('query-cache'); }

    // 7. The push token, BEFORE the session goes (RLS needs it to delete).
    try {
      if (previousUserId) {
        // A surviving token keeps sending their notifications here: a failure is reported.
        const removed = await _withTimeout(removePushToken(previousUserId), 4000);
        if (!removed) cleanupErrors.push('push-token');
      }
    } catch { cleanupErrors.push('push-token'); }

    // 8. Revoke the Supabase session LAST among network ops. scope 'local'
    //    ends only this device's session (web/other devices stay signed in).
    //    Timeout-raced so no SDK or network behavior can ever strand logout.
    try {
      await _withTimeout(supabase.auth.signOut({ scope: 'local' }), 5000);
    } catch { cleanupErrors.push('auth'); }

    // 9. The member's caches on disk, on every platform.
    if (previousUserId) storage.delete(`ironvault_user_cache_${previousUserId}`);
    storage.delete('last_user_id');
    storage.delete('ironvault_user_cache'); // clean up legacy
    storage.delete('recovery_pending');
    clearAllDrafts(previousUserId); // their unfinished writing
    // Their old handles and the one they asked for: never left on another's phone.
    clearHandleHistory();
    clearRequestedHandle();
    clearOfflineQueue();
    storage.delete('REELHOUSE_QUERY_CACHE');
    storage.delete('nitrate_memory_feed');

    // 10. Clear module-level caches
    _actionThrottles.clear();
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

    const throttleKey = `update:${user.id}`;
    const lastCall = _actionThrottles.get(throttleKey) ?? 0;
    if (Date.now() - lastCall < 1500) {
      // Slow down
      return;
    }
    pruneThrottles();
    _actionThrottles.set(throttleKey, Date.now());

    // Snapshot for rollback
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
        // Only if they are still here: after a logout it would restore the
        // departed member, and rewrite their cache (email included).
        if (!memberUnchanged(prevUser.id)) return;
        set({ user: prevUser });
        setSensitive(`ironvault_user_cache_${prevUser.id}`, JSON.stringify(prevUser));
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

    // 3. The PENDING change, never gated on encryption: it must survive a kill.
    storage.set(`dirty_prefs_${user.id}`, JSON.stringify(prefs));

    if (_prefTimers.has(timerKey)) {
      clearTimeout(_prefTimers.get(timerKey)!);
    }

    // 4. The send, debounced: one call for a burst of changes, always after the last.
    _prefTimers.set(timerKey, setTimeout(async () => {
      _prefTimers.delete(timerKey);
      try {
        const currentPrefs = get().user?.preferences;
        if (!currentPrefs) { _prefBaselines.delete(user.id); return; }
        // Server-side JSONB merge (COMP-7 cross-device): keys set on other
        // devices are preserved instead of being overwritten by this blob.
        const { error } = await supabase.rpc('update_my_preferences', { p_preferences: currentPrefs });
        if (error) throw error;
        storage.delete(`dirty_prefs_${user.id}`);
        _prefBaselines.delete(user.id);
      } catch {
        // Refused: the WHOLE window reverts together, to its opening snapshot.
        const baseline = _prefBaselines.get(user.id) ?? {};
        _prefBaselines.delete(user.id);
        // Not after a logout (likely, inside a one-second window): it would
        // rewrite the departed member's cache, which the logout deleted.
        if (!memberUnchanged(user.id)) return;
        set((state) => ({ user: state.user ? { ...state.user, preferences: { ...baseline } } : null }));
        setSensitive(`ironvault_user_cache_${user.id}`, JSON.stringify(get().user));
        // The disk follows the screen, or the next launch re-applies the undone
        // change; unless a newer window has begun, whose change is still pending.
        if (!_prefTimers.has(timerKey)) storage.delete(`dirty_prefs_${user.id}`);
        if (__DEV__) console.warn('[setPreference] DB sync failed, rolled back window locally');
      }
    }, 1000));
  },

  getPreference: (key, fallback = null) => {
    const user = get().user;
    return user?.preferences?.[key] ?? fallback;
  },
}));



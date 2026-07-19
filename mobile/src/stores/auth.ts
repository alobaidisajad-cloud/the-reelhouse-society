import * as Linking from 'expo-linking';
import { create } from 'zustand';
import { removePushToken } from '../lib/pushNotifications';
import { queryClient } from '../lib/queryClient';
import { logoutRevenueCat } from '../lib/revenueCat';
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
import { storage } from './mmkv-storage';
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
// F-3: per-user snapshot of preferences taken at the START of a debounce window, so a
// failed sync rolls back EVERY key changed during the window (multiple keys share one timer).
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

      // Restore the locally cached user first for instant startup, before the network session check.
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
        // Dirty-prefs reconciliation: push local prefs to server if not yet synced
        const isDirtyPrefs = storage.getString(`dirty_prefs_${session.user.id}`) === 'true';
        if (isDirtyPrefs) {
          const cachedData = storage.getString(`ironvault_user_cache_${session.user.id}`);
          if (cachedData) {
            try {
              const cached = JSON.parse(cachedData);
              if (cached.preferences) {
                // Merge, don't overwrite: another device may have set keys while
                // this one was offline with dirty prefs (COMP-7 cross-device).
                await supabase.rpc('update_my_preferences', { p_preferences: cached.preferences });
                storage.delete(`dirty_prefs_${session.user.id}`);
              }
            } catch {
              // Push failed — local prefs will be preserved below
            }
          }
        }

        const { data: profile } = await supabase
          .from('profiles').select(PROFILE_SELECT_COLUMNS).eq('id', session.user.id).single();
        if (profile) {
          // CRITICAL: Preserve the cached following list — don't overwrite with []
          const stillDirty = storage.getString(`dirty_prefs_${session.user.id}`) === 'true';
          let finalPrefs = profile.preferences;
          if (stillDirty) {
            const cd = storage.getString(`ironvault_user_cache_${session.user.id}`);
            if (cd) { try { finalPrefs = JSON.parse(cd).preferences ?? finalPrefs; } catch {} }
          }
          // Merge any profile fields (bio, display_name, persona, avatar_url, ...) that updateUser()
          // has optimistically written but not yet confirmed server-side — otherwise a concurrent
          // restoreSession (e.g. post-purchase polling) would silently revert the in-flight edit.
          let pendingProfileEdits: Partial<User> = {};
          const dirtyProfile = storage.getString(`dirty_profile_${session.user.id}`);
          if (dirtyProfile) {
            try { pendingProfileEdits = JSON.parse(dirtyProfile); } catch {}
          }
          const completeUser = { ...session.user, ...profile, ...pendingProfileEdits, preferences: finalPrefs, following: cachedFollowing } as unknown as User;
          storage.set('last_user_id', session.user.id);
          storage.set(`ironvault_user_cache_${session.user.id}`, JSON.stringify(completeUser));
          set({ user: completeUser, isAuthenticated: true, loading: false });
          // Hydrate following from DB in background (authoritative source)
          hydrateFollowing();
          return;
        }
        // session valid but profile fetch returned nothing — keep the cached
        // optimistic user (a transient profile read shouldn't force a logout).
      } else {
        // STORE-2: getSession succeeded with NO session → the optimistic auth
        // restored from cache at startup is stale; clear it here instead of
        // relying solely on the global onAuthStateChange listener to correct it.
        set({ user: null, isAuthenticated: false, loading: false });
        return;
      }
    } catch (err: unknown) {
      // Network/transient failure — keep the cached optimistic session; the
      // listener / next restore will reconcile. (Do NOT log out on error.)
      if (__DEV__) console.warn('[restoreSession] Failed:', err instanceof Error ? err.message : String(err));
    }
    set({ loading: false });
  },

  login: async (email, password) => {
    const identifier = email.trim();
    let authedUser: AuthUser;

    if (!identifier.includes('@')) {
      // EMAIL-ENUM-1: authenticate by username entirely server-side. The edge
      // function resolves the email + verifies the password without exposing the
      // email or confirming account existence (generic error on any failure).
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
    storage.set(`ironvault_user_cache_${authedUser.id}`, JSON.stringify(completeUser));
    set({ user: completeUser, isAuthenticated: true });

    // Enrich with the full profile in the background. Transient failures are retried;
    // if enrichment ultimately fails, the user operates with an incomplete profile for the session.
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
               storage.set(`ironvault_user_cache_${updatedUser.id}`, JSON.stringify(updatedUser));
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
    // Build the redirect URL so confirmation emails deep-link back to the app
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
      // Email confirmation disabled — immediate login
      await supabase.from('profiles').update({ username, persona }).eq('id', data.user!.id);
      const { data: profile } = await supabase.from('profiles').select(PROFILE_SELECT_COLUMNS).eq('id', data.user!.id).single();
      const completeUser = { ...data.user, ...profile, following: [] } as User;
      storage.set('last_user_id', data.user!.id);
      storage.set(`ironvault_user_cache_${data.user!.id}`, JSON.stringify(completeUser));
      set({ user: completeUser, isAuthenticated: true });
      return { needsConfirmation: false };
    }
    // Email confirmation required
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

    // 1. Clear zustand auth state FIRST — sign-out must be visually instant and
    //    can never be blocked by network or SDK behavior.
    set({ user: null, isAuthenticated: false });

    // 2. Clean up Realtime WebSocket immediately to stop background heartbeat
    try {
      const { teardownNotificationRealtime } = await import('./notificationStore');
      teardownNotificationRealtime();
    } catch { cleanupErrors.push('realtime'); }

    // 3. Clear all dependent stores to prevent cross-user data leakage.
    //    Uses the centralized resetAllStores(); each store self-registers its reset handler.
    try {
      const { resetAllStores } = await import('./resetAllStores');
      await resetAllStores();
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

    // 7. Remove push token BEFORE revoking the session — the delete on
    //    push_tokens is RLS-protected, so it must run while still authenticated
    //    (running it after signOut silently left stale tokens and kept
    //    delivering the old user's notifications to this device).
    try {
      if (previousUserId) {
        await _withTimeout(removePushToken(previousUserId), 4000);
      }
    } catch { /* push module may not be installed / slow network */ }

    // 8. Revoke the Supabase session LAST among network ops. scope 'local'
    //    ends only this device's session (web/other devices stay signed in).
    //    Timeout-raced so no SDK or network behavior can ever strand logout.
    try {
      await _withTimeout(supabase.auth.signOut({ scope: 'local' }), 5000);
    } catch { cleanupErrors.push('auth'); }

    // 9. Clear user cache + persisted query cache + feed cache from storage.
    // STORE-1: run on ALL platforms. The previous `Platform.OS !== 'web'` guard
    // left stale auth / cross-user data in a shared browser after logout. Mobile
    // behavior is unchanged (the block already ran there); this also clears on web.
    if (previousUserId) storage.delete(`ironvault_user_cache_${previousUserId}`);
    storage.delete('last_user_id');
    storage.delete('ironvault_user_cache'); // clean up legacy
    storage.delete('recovery_pending');
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
      if (updatedUser) storage.set(`ironvault_user_cache_${updatedUser.id}`, JSON.stringify(updatedUser));
      return { user: updatedUser };
    });

    if (Object.keys(safeUpdates).length > 0) {
      // Mirrors the dirty_prefs_ pattern below: marks these fields as locally-ahead-of-server
      // so a concurrent restoreSession() (e.g. the post-purchase polling loop in
      // useEntitlement.ts) merges them instead of overwriting with the stale fetched profile.
      storage.set(`dirty_profile_${user.id}`, JSON.stringify(safeUpdates));
      try {
        await ProfileService.updateProfile(user.id, safeUpdates as Partial<User>);
        storage.delete(`dirty_profile_${user.id}`);
      } catch (e: unknown) {
        // Rollback optimistic update
        if (__DEV__) console.warn('[updateUser] DB sync failed, rolling back:', e);
        storage.delete(`dirty_profile_${user.id}`);
        set({ user: prevUser });
        storage.set(`ironvault_user_cache_${prevUser.id}`, JSON.stringify(prevUser));
        reelToast.error('Profile update failed \u2014 changes reverted.');
      }
    }
  },

  // Local-only tier/is_founding update for the post-purchase optimistic UI.
  // `tier` and `is_founding` are server-derived (set by the RevenueCat
  // webhook, not the client) and aren't in ProfileService's update
  // whitelist, so routing this through updateUser()/ProfileService would
  // silently no-op the DB write while still paying for the network round
  // trip. The canonical value is reconciled by the polling loop in
  // useEntitlement.purchase()/membership.tsx, which calls restoreSession()
  // once the webhook lands.
  setLocalTierHint: (updates) => {
    set((state) => {
      if (!state.user) return state;
      const updatedUser = { ...state.user, ...updates };
      storage.set(`ironvault_user_cache_${updatedUser.id}`, JSON.stringify(updatedUser));
      return { user: updatedUser };
    });
  },

  setPreference: async (key, value) => {
    const user = get().user;
    if (!user) return;

    const timerKey = `pref:${user.id}`;

    // F-3: snapshot the pre-window preferences ONCE, at the start of a debounce window.
    // Because rapid changes to different keys share this single timer, a failed sync must
    // revert EVERY key changed during the window — not just the last one. Capturing per-call
    // (the old `prevValue`) rolled back only the final key and left earlier keys diverged.
    if (!_prefTimers.has(timerKey)) {
      _prefBaselines.set(user.id, { ...(user.preferences ?? {}) });
    }

    const prefs = { ...(user.preferences ?? {}), [key]: value };

    // 1. Optimistic update (Memory)
    set((state) => ({ user: state.user ? { ...state.user, preferences: prefs } : null }));

    // 2. Optimistic update (Cache) - guarantees state persists even if app closes during debounce
    storage.set(`ironvault_user_cache_${user.id}`, JSON.stringify({ ...get().user, preferences: prefs }));
    storage.set(`dirty_prefs_${user.id}`, 'true');

    if (_prefTimers.has(timerKey)) {
      clearTimeout(_prefTimers.get(timerKey)!);
    }

    // 3. Debounced network sync - batches rapid changes and guarantees trailing edge execution
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
        // DB write failed — restore the FULL pre-window snapshot so every key changed during
        // this debounce window reverts together, preventing cache/server divergence. dirty_prefs
        // stays set so restoreSession re-pushes the (now-consistent) baseline on next launch.
        const baseline = _prefBaselines.get(user.id) ?? {};
        _prefBaselines.delete(user.id);
        set((state) => ({ user: state.user ? { ...state.user, preferences: { ...baseline } } : null }));
        storage.set(`ironvault_user_cache_${user.id}`, JSON.stringify(get().user));
        if (__DEV__) console.warn('[setPreference] DB sync failed, rolled back window locally');
      }
    }, 1000));
  },

  getPreference: (key, fallback = null) => {
    const user = get().user;
    return user?.preferences?.[key] ?? fallback;
  },
}));



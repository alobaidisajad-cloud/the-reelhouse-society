import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { User } from '../types';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { storage } from './mmkv-storage';
import { logoutRevenueCat } from '../lib/revenueCat';
import { setSentryUser } from '../lib/sentry';
import { queryClient } from '../lib/queryClient';
import { removePushToken } from '../lib/pushNotifications';
import reelToast from '../utils/reelToast';
export { storage };

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, username: string, persona?: string) => Promise<{ needsConfirmation: boolean }>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  setPreference: (key: string, value: unknown) => Promise<void>;
  getPreference: (key: string, fallback?: unknown) => unknown;
  restoreSession: () => Promise<void>;
  followUser: (targetUsername: string) => Promise<void>;
  unfollowUser: (targetUsername: string) => Promise<void>;
}

interface DBProfileUpdate {
  bio?: string;
  username?: string;
  avatar_url?: string;
  display_name?: string;
  is_social_private?: boolean;
}

// ── Action throttle: prevents spam-clicking social buttons ──
const _actionThrottles = new Map<string, number>();
const _THROTTLE_MAX = 200;
const _THROTTLE_TTL = 30000;
function pruneThrottles() {
  if (_actionThrottles.size < _THROTTLE_MAX) return;
  const now = Date.now();
  for (const [key, ts] of _actionThrottles) {
    if (now - ts > _THROTTLE_TTL) _actionThrottles.delete(key);
  }
  // Batch-prune oldest 50 entries if still over limit (matches interactionSlice L-09 fix)
  if (_actionThrottles.size >= _THROTTLE_MAX) {
    const keys = [..._actionThrottles.keys()].slice(0, 50);
    keys.forEach(k => _actionThrottles.delete(k));
  }
}

// ── Username → ID cache (with 10min TTL to prevent stale mappings) ──
const _usernameIdCache = new Map<string, { id: string; ts: number }>();
const _USERNAME_CACHE_TTL = 10 * 60 * 1000;
async function resolveUsernameToId(username: string): Promise<string | null> {
  const cached = _usernameIdCache.get(username);
  if (cached && Date.now() - cached.ts < _USERNAME_CACHE_TTL) return cached.id;
  if (cached) _usernameIdCache.delete(username);  // Expired — remove stale entry
  const { data } = await supabase.from('profiles').select('id').eq('username', username).single();
  if (data?.id) {
    // Batch-prune oldest 20 entries if cache is full (L-13 fix)
    if (_usernameIdCache.size >= 200) {
      const keys = [..._usernameIdCache.keys()].slice(0, 20);
      keys.forEach(k => _usernameIdCache.delete(k));
    }
    _usernameIdCache.set(username, { id: data.id, ts: Date.now() });
    return data.id;
  }
  return null;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  loading: true,

  restoreSession: async () => {
    try {
      // ── IRON VAULT CACHE: Instant RAM memory restoration before network ping ──
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
        const { data: profile } = await supabase
          .from('profiles').select('id, username, role, bio, avatar_url, display_name, is_social_private, preferences, persona, created_at').eq('id', session.user.id).single();
        if (profile) {
          // CRITICAL: Preserve the cached following list — don't overwrite with []
          const completeUser = { ...session.user, ...profile, following: cachedFollowing } as unknown as User;
          storage.set('last_user_id', session.user.id);
          storage.set(`ironvault_user_cache_${session.user.id}`, JSON.stringify(completeUser));
          set({ user: completeUser, isAuthenticated: true, loading: false });
          // Hydrate following from DB in background (authoritative source)
          hydrateFollowing();
          return;
        }
      }
    } catch (err: unknown) {
      if (__DEV__) console.warn('[restoreSession] Failed:', err instanceof Error ? err.message : String(err));
    }
    set({ loading: false });
  },

  login: async (email, password) => {
    // Support username login — resolve to email via RPC
    let loginEmail = email.trim();
    if (!loginEmail.includes('@')) {
      const lookupUsername = loginEmail.toLowerCase().replace(/\s+/g, '_');
      const { data: resolvedEmail, error: rpcError } = await supabase
        .rpc('get_email_by_username', { lookup_username: lookupUsername });
      if (rpcError || !resolvedEmail) throw new Error('No account found with that username.');
      loginEmail = resolvedEmail;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    if (error) throw error;

    // Set auth immediately
    const completeUser = { ...data.user, following: [] } as unknown as User;
    storage.set('last_user_id', data.user.id);
    storage.set(`ironvault_user_cache_${data.user.id}`, JSON.stringify(completeUser));
    set({ user: completeUser, isAuthenticated: true });

    // Enrich with profile in background
    Promise.resolve(supabase.from('profiles').select('id, username, role, bio, avatar_url, display_name, is_social_private, preferences, persona, created_at').eq('id', data.user.id).single())
      .then((res) => {
        if (res.data) {
           set((s) => {
             const updatedUser = s.user ? { ...s.user, ...res.data } : null;
             if (updatedUser) {
               storage.set('last_user_id', updatedUser.id);
               storage.set(`ironvault_user_cache_${updatedUser.id}`, JSON.stringify(updatedUser));
             }
             return { user: updatedUser };
           });
        }
      }).catch(() => {});

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
      const { data: profile } = await supabase.from('profiles').select('id, username, role, bio, avatar_url, display_name, is_social_private, preferences, persona, created_at').eq('id', data.user!.id).single();
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
    // 0. Capture user ID before we clear state (needed for push token removal)
    const previousUserId = get().user?.id ?? null;
    const cleanupErrors: string[] = [];

    // 0.5. Clean up Realtime WebSocket immediately to stop background heartbeat
    try {
      const { useNotificationStore } = await import('./social');
      useNotificationStore.getState()._realtimeCleanup?.();
    } catch { cleanupErrors.push('realtime'); }

    // 1. Sign out from Supabase
    try { await supabase.auth.signOut(); } catch { cleanupErrors.push('auth'); }

    // 2. Clear zustand auth state
    set({ user: null, isAuthenticated: false });

    // 3. Nuclear cleanup — Clear ALL dependent stores to prevent cross-user data leakage
    //    F-10 FIX: Uses centralized resetAllStores() — each store self-registers its handler
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

    // 7. Remove push token — stops notifications being sent to this device for the old user
    try {
      if (previousUserId) {
        await removePushToken(previousUserId);
      }
    } catch { /* push module may not be installed */ }

    // 8. Clear user cache + persisted query cache + feed cache from MMKV
    if (Platform.OS !== 'web') {
      if (previousUserId) storage.delete(`ironvault_user_cache_${previousUserId}`);
      storage.delete('last_user_id');
      storage.delete('ironvault_user_cache'); // clean up legacy
      storage.delete('reelhouse-offline-mutations');
      storage.delete('REELHOUSE_QUERY_CACHE');
      storage.delete('nitrate_memory_feed');
    }

    // 9. Clear module-level caches
    _actionThrottles.clear();
    _usernameIdCache.clear();

    // 10. Report partial cleanup failures
    if (cleanupErrors.length > 0 && __DEV__) {
      console.warn('[logout] Partial cleanup failure:', cleanupErrors.join(', '));
    }
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

    const dbUpdates: DBProfileUpdate = {};
    if (updates.bio !== undefined) dbUpdates.bio = updates.bio;
    if (updates.username !== undefined) dbUpdates.username = updates.username;
    if (updates.avatar_url !== undefined) dbUpdates.avatar_url = updates.avatar_url;
    if (updates.display_name !== undefined) dbUpdates.display_name = updates.display_name;
    if (updates.isSocialPrivate !== undefined) dbUpdates.is_social_private = updates.isSocialPrivate;
    if (Object.keys(dbUpdates).length > 0) {
      try {
        const { error } = await supabase.from('profiles').update(dbUpdates).eq('id', user.id);
        if (error) throw error;
      } catch (e: unknown) {
        // Rollback optimistic update
        if (__DEV__) console.warn('[updateUser] DB sync failed, rolling back:', e);
        set({ user: prevUser });
        storage.set(`ironvault_user_cache_${prevUser.id}`, JSON.stringify(prevUser));
        reelToast.error('Profile update failed \u2014 changes reverted.');
      }
    }
  },

  setPreference: async (key, value) => {
    const user = get().user;
    if (!user) return;
    // D5-02 FIX: Capture previous value for clean rollback
    const prevValue = user.preferences?.[key];
    const prefs = { ...(user.preferences ?? {}), [key]: value };
    set((state) => ({ user: state.user ? { ...state.user, preferences: prefs } : null }));

    const throttleKey = `pref:${user.id}`;
    const lastCall = _actionThrottles.get(throttleKey) ?? 0;
    if (Date.now() - lastCall < 1500) return;
    pruneThrottles();
    _actionThrottles.set(throttleKey, Date.now());

    try {
      await supabase.from('profiles').update({ preferences: prefs }).eq('id', user.id);
      // D1-02 FIX: Persist to per-user cache key (was legacy 'ironvault_user_cache')
      storage.set(`ironvault_user_cache_${user.id}`, JSON.stringify({ ...get().user, preferences: prefs }));
    } catch {
      // M-16: DB write failed — rollback local state to prevent cache/server divergence
      // D5-02 FIX: Restore captured previous value instead of setting undefined
      const prevPrefs = { ...(get().user?.preferences ?? {}), [key]: prevValue };
      set((state) => ({ user: state.user ? { ...state.user, preferences: prevPrefs } : null }));
      storage.set(`ironvault_user_cache_${user.id}`, JSON.stringify(get().user));
      if (__DEV__) console.warn('[setPreference] DB sync failed, rolled back locally');
    }
  },

  getPreference: (key, fallback = null) => {
    const user = get().user;
    return user?.preferences?.[key] ?? fallback;
  },

  followUser: async (targetUsername) => {
    const state = get();
    const following = state.user?.following ?? [];
    if (following.includes(targetUsername)) return;

    const throttleKey = `follow:${targetUsername}`;
    const lastCall = _actionThrottles.get(throttleKey) ?? 0;
    if (Date.now() - lastCall < 2000) return;
    pruneThrottles();
    _actionThrottles.set(throttleKey, Date.now());

    const userId = state.user?.id;
    if (!userId) {
      if (__DEV__) console.warn('[followUser] No userId — user not authenticated');
      return;
    }

    // Optimistic update + persist to cache immediately
    const newFollowing = [...(state.user?.following ?? []), targetUsername];
    set((s) => ({ user: s.user ? { ...s.user, following: newFollowing } : null }));
    _persistFollowingToCache(newFollowing, state.user!);

    try {
      const targetId = await resolveUsernameToId(targetUsername);
      if (!targetId) throw new Error(`User "${targetUsername}" not found in profiles table`);

      // CHECK if follow already exists in DB before inserting
      const { data: existing } = await supabase
        .from('interactions')
        .select('id')
        .eq('user_id', userId)
        .eq('target_user_id', targetId)
        .eq('type', 'follow')
        .maybeSingle();

      if (existing) {
        // Follow already exists in DB — just keep the optimistic update, no insert needed
        if (__DEV__) console.warn(`[followUser] Already following @${targetUsername} in DB, syncing state`);
        return;
      }

      const { error } = await supabase.from('interactions').insert([{
        user_id: userId, target_user_id: targetId, type: 'follow',
      }]);
      if (error && !error.message?.includes('duplicate')) throw error;
      // Success — DB trigger handles notification generation
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (__DEV__) console.warn(`[followUser] FAILED for @${targetUsername}: ${msg}`);
      // Rollback optimistic update + cache
      const rolledBack = (get().user?.following ?? []).filter(u => u !== targetUsername);
      set((s) => ({ user: s.user ? { ...s.user, following: rolledBack } : null }));
      _persistFollowingToCache(rolledBack, get().user!);
      reelToast.error(`Could not follow @${targetUsername}. Please try again.`);
    }
  },

  unfollowUser: async (targetUsername) => {
    const throttleKey = `unfollow:${targetUsername}`;
    const lastCall = _actionThrottles.get(throttleKey) ?? 0;
    if (Date.now() - lastCall < 2000) return;
    pruneThrottles();
    _actionThrottles.set(throttleKey, Date.now());

    const prevFollowing = get().user?.following ?? [];
    const userId = get().user?.id;
    if (!userId) {
      if (__DEV__) console.warn('[unfollowUser] No userId — user not authenticated');
      return;
    }

    // Optimistic update + persist to cache immediately
    const newFollowing = prevFollowing.filter(u => u !== targetUsername);
    set((s) => ({ user: s.user ? { ...s.user, following: newFollowing } : null }));
    _persistFollowingToCache(newFollowing, get().user!);

    try {
      const targetId = await resolveUsernameToId(targetUsername);
      if (targetId) {
        const { error } = await supabase.from('interactions').delete()
          .eq('user_id', userId).eq('target_user_id', targetId).eq('type', 'follow');
        if (error) throw error;
      } else {
        if (__DEV__) console.warn(`[unfollowUser] Could not resolve ID for @${targetUsername}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (__DEV__) console.warn(`[unfollowUser] FAILED for @${targetUsername}: ${msg}`);
      // Rollback
      set((s) => ({ user: s.user ? { ...s.user, following: prevFollowing } : null }));
      _persistFollowingToCache(prevFollowing, get().user!);
      reelToast.error(`Could not unfollow @${targetUsername}. Please try again.`);
    }
  },
}));

// ── Persist following array to ironvault cache (fire-and-forget) ──
function _persistFollowingToCache(following: string[], user: User) {
  try {
    const cached = { ...user, following };
    // D1-01 FIX: Write to per-user cache key (was legacy 'ironvault_user_cache')
    storage.set(`ironvault_user_cache_${user.id}`, JSON.stringify(cached));
  } catch { /* non-critical */ }
}

// ── Hydrate following list from interactions table ──
export async function hydrateFollowing() {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    if (__DEV__) console.warn('[hydrateFollowing] No userId — skipping');
    return;
  }
  try {
    const { data: followRows, error: followErr } = await supabase
      .from('interactions').select('target_user_id')
      .eq('user_id', userId).eq('type', 'follow').limit(5000);
    if (followErr) {
      if (__DEV__) console.warn('[hydrateFollowing] Query error:', followErr.message);
      return;
    }
    if (!followRows || followRows.length === 0) {
      useAuthStore.setState(s => ({ user: s.user ? { ...s.user, following: [] } : null }));
      // Persist empty following to cache to prevent phantom follows on cold-start
      const currentUser = useAuthStore.getState().user;
      if (currentUser) _persistFollowingToCache([], currentUser);
      return;
    }
    const targetIds = followRows.map(r => r.target_user_id);
    const { data: profiles, error: profileErr } = await supabase
      .from('profiles').select('username').in('id', targetIds).limit(5000);
    if (profileErr) {
      if (__DEV__) console.warn('[hydrateFollowing] Profile resolve error:', profileErr.message);
      return;
    }
    const usernames = (profiles ?? []).map(p => p.username).filter(Boolean);
    useAuthStore.setState(s => ({ user: s.user ? { ...s.user, following: usernames } : null }));
    // Persist to cache so next session loads instantly
    const currentUser = useAuthStore.getState().user;
    if (currentUser) _persistFollowingToCache(usernames, currentUser);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (__DEV__) console.warn('[hydrateFollowing] Unexpected error:', msg);
  }
}

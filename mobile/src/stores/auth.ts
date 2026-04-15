import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { User } from '../types';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

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
  if (_actionThrottles.size >= _THROTTLE_MAX) {
    const oldest = _actionThrottles.keys().next().value;
    if (oldest !== undefined) _actionThrottles.delete(oldest);
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
    if (_usernameIdCache.size >= 200) {
      const oldest = _usernameIdCache.keys().next().value;
      if (oldest !== undefined) _usernameIdCache.delete(oldest);
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
      const vaultData = await AsyncStorage.getItem('ironvault_user_cache');
      if (vaultData) {
        try {
          const parsedUser = JSON.parse(vaultData);
          set({ user: parsedUser, isAuthenticated: true, loading: false });
        } catch {}
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles').select('id, username, role, bio, avatar_url, display_name, is_social_private, preferences, persona, created_at').eq('id', session.user.id).single();
        if (profile) {
          const completeUser = { ...session.user, ...profile, following: [] } as unknown as User;
          AsyncStorage.setItem('ironvault_user_cache', JSON.stringify(completeUser));
          set({ user: completeUser, isAuthenticated: true, loading: false });
          // Hydrate following in background
          hydrateFollowing();
          return;
        }
      }
    } catch { /* session restore failed silently */ }
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
    AsyncStorage.setItem('ironvault_user_cache', JSON.stringify(completeUser));
    set({ user: completeUser, isAuthenticated: true });

    // Enrich with profile in background
    Promise.resolve(supabase.from('profiles').select('id, username, role, bio, avatar_url, display_name, is_social_private, preferences, persona, created_at').eq('id', data.user.id).single())
      .then((res) => {
        if (res.data) {
           set((s) => {
             const updatedUser = s.user ? { ...s.user, ...res.data } : null;
             if (updatedUser) AsyncStorage.setItem('ironvault_user_cache', JSON.stringify(updatedUser));
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
      AsyncStorage.setItem('ironvault_user_cache', JSON.stringify(completeUser));
      set({ user: completeUser, isAuthenticated: true });
      return { needsConfirmation: false };
    }
    // Email confirmation required
    return { needsConfirmation: true };
  },

  logout: async () => {
    // 1. Sign out from Supabase
    try { await supabase.auth.signOut(); } catch { /* continue */ }

    // 2. Clear zustand auth state
    set({ user: null, isAuthenticated: false });

    // 3. Clear all Supabase auth tokens from AsyncStorage (native)
    if (Platform.OS !== 'web') {
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const authKeys = allKeys.filter(key =>
          key.startsWith('sb-') || key.includes('supabase') || key.includes('auth') || key === 'ironvault_user_cache'
        );
        if (authKeys.length > 0) {
          await AsyncStorage.multiRemove(authKeys);
        }
      } catch { /* cleanup is non-critical */ }
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

    const dbUpdates: Record<string, unknown> = {};
    if (updates.bio !== undefined) dbUpdates.bio = updates.bio;
    if (updates.username !== undefined) dbUpdates.username = updates.username;
    if (updates.avatar_url !== undefined) dbUpdates.avatar_url = updates.avatar_url;
    if (updates.display_name !== undefined) dbUpdates.display_name = updates.display_name;
    if (updates.isSocialPrivate !== undefined) dbUpdates.is_social_private = updates.isSocialPrivate;
    if (Object.keys(dbUpdates).length > 0) {
      await supabase.from('profiles').update(dbUpdates).eq('id', user.id);
    }
    // Prevent client-side role elevation
    const { role: _stripped, ...safeUpdates } = updates as Partial<User> & { role?: unknown };
    set((state) => {
      const updatedUser = state.user ? { ...state.user, ...safeUpdates } : null;
      if (updatedUser) AsyncStorage.setItem('ironvault_user_cache', JSON.stringify(updatedUser));
      return { user: updatedUser };
    });
  },

  setPreference: async (key, value) => {
    const user = get().user;
    if (!user) return;
    const prefs = { ...(user.preferences ?? {}), [key]: value };
    set((state) => ({ user: state.user ? { ...state.user, preferences: prefs } : null }));

    const throttleKey = `pref:${user.id}`;
    const lastCall = _actionThrottles.get(throttleKey) ?? 0;
    if (Date.now() - lastCall < 1500) return;
    pruneThrottles();
    _actionThrottles.set(throttleKey, Date.now());

    try { await supabase.from('profiles').update({ preferences: prefs }).eq('id', user.id); } catch { /* ignore */ }
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
    const fromUsername = state.user?.username ?? 'someone';

    // Optimistic update
    set((s) => ({ user: s.user ? { ...s.user, following: [...(s.user.following ?? []), targetUsername] } : null }));

    try {
      if (userId) {
        const targetId = await resolveUsernameToId(targetUsername);
        if (!targetId) throw new Error('User not found');
        const { error } = await supabase.from('interactions').insert([{
          user_id: userId, target_user_id: targetId, type: 'follow',
        }]);
        if (error && !error.message?.includes('duplicate')) throw error;
        if (!error) {
          // DB trigger handles notification generation
        }
      }
    } catch {
      // Rollback
      set((s) => ({ user: s.user ? { ...s.user, following: (s.user.following ?? []).filter(u => u !== targetUsername) } : null }));
      Alert.alert('Error', 'Follow failed — please try again.');
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

    set((s) => ({ user: s.user ? { ...s.user, following: (s.user.following ?? []).filter(u => u !== targetUsername) } : null }));

    try {
      if (userId) {
        const targetId = await resolveUsernameToId(targetUsername);
        if (targetId) {
          const { error } = await supabase.from('interactions').delete()
            .eq('user_id', userId).eq('target_user_id', targetId).eq('type', 'follow');
          if (error) throw error;
        }
      }
    } catch {
      set((s) => ({ user: s.user ? { ...s.user, following: prevFollowing } : null }));
      Alert.alert('Error', 'Unfollow failed — please try again.');
    }
  },
}));

// ── Hydrate following list from interactions table ──
async function hydrateFollowing() {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return;
  try {
    const { data: followRows } = await supabase
      .from('interactions').select('target_user_id')
      .eq('user_id', userId).eq('type', 'follow').limit(5000);
    if (!followRows || followRows.length === 0) {
      useAuthStore.setState(s => ({ user: s.user ? { ...s.user, following: [] } : null }));
      return;
    }
    const targetIds = followRows.map(r => r.target_user_id);
    const { data: profiles } = await supabase
      .from('profiles').select('username').in('id', targetIds).limit(5000);
    const usernames = (profiles ?? []).map(p => p.username).filter(Boolean);
    useAuthStore.setState(s => ({ user: s.user ? { ...s.user, following: usernames } : null }));
  } catch { /* silently fail */ }
}

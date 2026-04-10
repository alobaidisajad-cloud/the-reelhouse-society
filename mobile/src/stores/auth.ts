import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { User } from '../types';
import { Alert } from 'react-native';

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

// ── Username → ID cache ──
const _usernameIdCache = new Map<string, string>();
async function resolveUsernameToId(username: string): Promise<string | null> {
  const cached = _usernameIdCache.get(username);
  if (cached) return cached;
  const { data } = await supabase.from('profiles').select('id').eq('username', username).single();
  if (data?.id) {
    if (_usernameIdCache.size >= 200) {
      const oldest = _usernameIdCache.keys().next().value;
      if (oldest !== undefined) _usernameIdCache.delete(oldest);
    }
    _usernameIdCache.set(username, data.id);
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
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles').select('*').eq('id', session.user.id).single();
        if (profile) {
          set({ user: { ...session.user, ...profile, following: [] } as unknown as User, isAuthenticated: true, loading: false });
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
    set({ user: { ...data.user, following: [] } as unknown as User, isAuthenticated: true });

    // Enrich with profile in background
    Promise.resolve(supabase.from('profiles').select('*').eq('id', data.user.id).single())
      .then((res) => {
        if (res.data) set((s) => ({ user: s.user ? { ...s.user, ...res.data } : null }));
      }).catch(() => {});

    hydrateFollowing();
  },

  signup: async (email, password, username, persona = 'The Cinephile') => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { username },
      },
    });
    if (error) throw error;

    if (data?.session) {
      // Email confirmation disabled — immediate login
      await supabase.from('profiles').update({ username, persona }).eq('id', data.user!.id);
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user!.id).single();
      set({ user: { ...data.user, ...profile, following: [] } as User, isAuthenticated: true });
      return { needsConfirmation: false };
    }
    // Email confirmation required
    return { needsConfirmation: true };
  },

  logout: async () => {
    try { await supabase.auth.signOut(); } catch { /* continue */ }
    set({ user: null, isAuthenticated: false });
  },

  updateUser: async (updates) => {
    const user = get().user;
    if (!user) return;

    const throttleKey = `update:${user.id}`;
    const lastCall = _actionThrottles.get(throttleKey) || 0;
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
    const { role: _stripped, ...safeUpdates } = updates as any;
    set((state) => ({ user: state.user ? { ...state.user, ...safeUpdates } : null }));
  },

  setPreference: async (key, value) => {
    const user = get().user;
    if (!user) return;
    const prefs = { ...(user.preferences || {}), [key]: value };
    set((state) => ({ user: state.user ? { ...state.user, preferences: prefs } : null }));

    const throttleKey = `pref:${user.id}`;
    const lastCall = _actionThrottles.get(throttleKey) || 0;
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
    const following = state.user?.following || [];
    if (following.includes(targetUsername)) return;

    const throttleKey = `follow:${targetUsername}`;
    const lastCall = _actionThrottles.get(throttleKey) || 0;
    if (Date.now() - lastCall < 2000) return;
    pruneThrottles();
    _actionThrottles.set(throttleKey, Date.now());

    const userId = state.user?.id;
    const fromUsername = state.user?.username || 'someone';

    // Optimistic update
    set((s) => ({ user: s.user ? { ...s.user, following: [...(s.user.following || []), targetUsername] } : null }));

    try {
      if (userId) {
        const targetId = await resolveUsernameToId(targetUsername);
        if (!targetId) throw new Error('User not found');
        const { error } = await supabase.from('interactions').insert([{
          user_id: userId, target_user_id: targetId, type: 'follow',
        }]);
        if (error && !error.message?.includes('duplicate')) throw error;
        if (!error) {
          await supabase.from('notifications').insert({
            user_id: targetId, type: 'follow', from_username: fromUsername,
            message: `@${fromUsername} pulled you into their orbit`, read: false,
          });
        }
      }
    } catch {
      // Rollback
      set((s) => ({ user: s.user ? { ...s.user, following: (s.user.following || []).filter(u => u !== targetUsername) } : null }));
      Alert.alert('Error', 'Follow failed — please try again.');
    }
  },

  unfollowUser: async (targetUsername) => {
    const throttleKey = `unfollow:${targetUsername}`;
    const lastCall = _actionThrottles.get(throttleKey) || 0;
    if (Date.now() - lastCall < 2000) return;
    pruneThrottles();
    _actionThrottles.set(throttleKey, Date.now());

    const prevFollowing = get().user?.following || [];
    const userId = get().user?.id;

    set((s) => ({ user: s.user ? { ...s.user, following: (s.user.following || []).filter(u => u !== targetUsername) } : null }));

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
    const usernames = (profiles || []).map(p => p.username).filter(Boolean);
    useAuthStore.setState(s => ({ user: s.user ? { ...s.user, following: usernames } : null }));
  } catch { /* silently fail */ }
}

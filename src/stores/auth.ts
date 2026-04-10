import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { get, set, del } from 'idb-keyval'
import { supabase } from '../supabaseClient'
import { logError } from '../errorLogger'
import { User } from '../types'
import reelToast from '../utils/reelToast'

// ── Username → ID cache: prevents redundant profile lookups on follow/unfollow ──
const _usernameIdCache = new Map<string, string>()
const _USERNAME_CACHE_MAX = 200
async function resolveUsernameToId(username: string): Promise<string | null> {
    const cached = _usernameIdCache.get(username)
    if (cached) return cached
    const { data } = await supabase.from('profiles').select('id').eq('username', username).single()
    if (data?.id) {
        // Evict oldest if at capacity
        if (_usernameIdCache.size >= _USERNAME_CACHE_MAX) {
            const oldest = _usernameIdCache.keys().next().value
            if (oldest !== undefined) _usernameIdCache.delete(oldest)
        }
        _usernameIdCache.set(username, data.id)
        return data.id
    }
    return null
}

// ── Action throttle: prevents spam-clicking social buttons ──
const _actionThrottles = new Map<string, number>()
const _THROTTLE_MAX = 200
const _THROTTLE_TTL = 30_000 // 30s — entries older than this are stale
function pruneThrottles() {
    if (_actionThrottles.size < _THROTTLE_MAX) return
    const now = Date.now()
    for (const [key, ts] of _actionThrottles) {
        if (now - ts > _THROTTLE_TTL) _actionThrottles.delete(key)
    }
    // If still over limit after TTL prune, drop oldest
    if (_actionThrottles.size >= _THROTTLE_MAX) {
        const oldest = _actionThrottles.keys().next().value
        if (oldest !== undefined) _actionThrottles.delete(oldest)
    }
}

export interface AuthState {
    user: User | null
    isAuthenticated: boolean
    login: (email: string, password: string) => Promise<{ user: unknown; session: unknown }>
    signup: (email: string, password: string, username: string, role?: string, persona?: string) => Promise<{ user: unknown; session: unknown | null }>
    logout: () => Promise<void>
    updateUser: (updates: Partial<User>) => Promise<void>
    setPreference: (key: string, value: unknown) => Promise<void>
    getPreference: (key: string, fallback?: unknown) => unknown
    followUser: (targetUsername: string) => Promise<void>
    unfollowUser: (targetUsername: string) => Promise<void>
}
// Load the user's following list from the interactions table
export async function hydrateFollowing() {
    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    try {
        // Get all follow interactions by this user
        const { data: followRows } = await supabase
            .from('interactions')
            .select('target_user_id')
            .eq('user_id', userId)
            .eq('type', 'follow')
            .limit(5000)
        if (!followRows || followRows.length === 0) {
            useAuthStore.setState(s => ({ user: s.user ? { ...s.user, following: [] } : null }))
            return
        }
        // Resolve target IDs to usernames
        const targetIds = followRows.map(r => r.target_user_id)
        const { data: profiles } = await supabase
            .from('profiles')
            .select('username')
            .in('id', targetIds)
            .limit(5000)
        const usernames = (profiles || []).map(p => p.username).filter(Boolean)
        useAuthStore.setState(s => ({ user: s.user ? { ...s.user, following: usernames } : null }))
    } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e))
        logError({ type: 'store', message: `Failed to hydrate following list: ${err.message}`, stack: err.stack, component: 'auth.hydrateFollowing' })
    }
}

// Parallel hydration helper — fires all user-data fetches simultaneously
async function hydrateUserData() {
    const [films, programmes] = await Promise.all([
        import('./films'),
        import('./content'),
    ])
    await Promise.all([
        films.useFilmStore.getState().fetchLogs(),
        films.useFilmStore.getState().fetchWatchlist(),
        films.useFilmStore.getState().fetchVault(),
        films.useFilmStore.getState().fetchLists(),
        programmes.useProgrammeStore.getState().fetchProgrammes(),
        hydrateFollowing(),
    ])
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            isAuthenticated: false,

            login: async (email, password) => {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password })
                if (error) throw error

                // Set authenticated IMMEDIATELY with minimal auth data so the UI responds instantly
                set({ user: { ...data.user, following: [] } as unknown as User, isAuthenticated: true })

                // Fetch full profile in the background — UI is already updated
                Promise.resolve(supabase.from('profiles').select('id, username, role, bio, avatar_url, display_name, is_social_private, preferences, persona, created_at').eq('id', data.user.id).single())
                    .then(({ data: profile }) => {
                        if (profile) {
                            set((s) => ({ user: s.user ? { ...s.user, ...profile } : null }))
                        }
                    })
                    .catch(() => { /* profile enrichment is non-critical */ })

                return data
            },

            signup: async (email, password, username, role = 'cinephile', persona = '') => {
                const redirectTo = `${window.location.origin}/auth/callback`
                const { data, error } = await supabase.auth.signUp({
                    email, password,
                    options: {
                        // SECURITY: Only send username in metadata.
                        // Role is determined server-side by the DB trigger (handle_new_user).
                        // Sending role here was a vector for free premium access - removed.
                        data: {
                            username,
                        },
                        emailRedirectTo: redirectTo,
                    }
                })
                if (error) throw error

                // If email confirmation is enabled, data.session will be null
                // The user must click the link in their email first.
                // If confirmation is disabled (dev mode), session is returned immediately.
                if (data?.session) {
                    // Save persona to profiles. Role and tier are securely handled by Postgres triggers.
                    await supabase.from('profiles').update({
                        username,
                        persona: persona || 'The Cinephile',
                    }).eq('id', data.user!.id)
                    const { data: profile } = await supabase.from('profiles').select('id, username, role, bio, avatar_url, display_name, is_social_private, preferences, persona, created_at').eq('id', data.user!.id).single()
                    set({ user: { ...data.user, ...profile, following: [] } as User, isAuthenticated: true })
                    hydrateUserData()
                }
                // Return data — SignupModal checks data.session to decide
                // whether to show the 'Check Inbox' screen or close immediately
                return data
            },

            logout: async () => {
                // 1. Sign out from Supabase
                try { await supabase.auth.signOut() } catch { /* continue even if this fails */ }

                // 2. Clear zustand persisted auth state
                set({ user: null, isAuthenticated: false })

                // 3. Nuke all Supabase auth tokens from localStorage
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith('sb-') && key.includes('-auth-token')) {
                        localStorage.removeItem(key)
                    }
                })
                // Clear all our own persist keys to strictly prevent ghost data bleeding
                localStorage.removeItem('reelhouse-auth')
                localStorage.removeItem('reelhouse-films')
                localStorage.removeItem('reelhouse-ui')
                localStorage.removeItem('reelhouse-social')
                localStorage.removeItem('reelhouse-content')
                
                // Clear all session storage tokens holding recovery flags
                sessionStorage.clear()

                // 4. Force full page reload to clear any in-memory state
                window.location.href = '/'
            },

            updateUser: async (updates) => {
                const user = get().user
                if (!user) return

                // ── Throttle: prevent update spam (1.5s cooldown) ──
                const throttleKey = `update:${user.id}`
                const lastCall = _actionThrottles.get(throttleKey) || 0
                if (Date.now() - lastCall < 1500) {
                    reelToast.error('Saving too frequently. Slow down.')
                    return
                }
                pruneThrottles()
                _actionThrottles.set(throttleKey, Date.now())

                const dbUpdates: Record<string, unknown> = {}
                if (updates.bio !== undefined) dbUpdates.bio = updates.bio
                if (updates.username !== undefined) dbUpdates.username = updates.username
                if (updates.avatar !== undefined) dbUpdates.avatar_url = updates.avatar
                if (updates.avatar_url !== undefined) dbUpdates.avatar_url = updates.avatar_url
                if (updates.display_name !== undefined) dbUpdates.display_name = updates.display_name
                if (updates.isSocialPrivate !== undefined) dbUpdates.is_social_private = updates.isSocialPrivate
                // NOTE: role is intentionally excluded — role changes only happen via payment flow
                if (Object.keys(dbUpdates).length > 0) {
                    const { error } = await supabase.from('profiles').update(dbUpdates).eq('id', user.id)
                    if (error) logError({ type: 'store', message: `[updateUser] profile update failed: ${error.message}`, component: 'auth.updateUser' })
                }
                // Strip role from local update too — never allow client-side role elevation
                const { role: _stripped, ...safeUpdates } = updates
                set((state) => ({ user: state.user ? { ...state.user, ...safeUpdates } : null }))
            },

            // ── Preferences — synced to profiles.preferences JSONB column ──
            setPreference: async (key, value) => {
                const user = get().user
                if (!user) return
                const prefs = { ...(user.preferences || {}), [key]: value }
                set((state) => ({ user: state.user ? { ...state.user, preferences: prefs } : null }))

                // ── Throttle network sync to prevent DB spam during UI sliders ──
                const throttleKey = `pref:${user.id}`
                const lastCall = _actionThrottles.get(throttleKey) || 0
                if (Date.now() - lastCall < 1500) return // Skip network hit if too fast, UI is already updated
                pruneThrottles()
                _actionThrottles.set(throttleKey, Date.now())

                try { await supabase.from('profiles').update({ preferences: prefs }).eq('id', user.id) } catch { /* ignore */ }
            },

            getPreference: (key, fallback = null) => {
                const user = get().user
                return user?.preferences?.[key] ?? fallback
            },


            followUser: async (targetUsername) => {
                const state = get()
                const following = state.user?.following || []
                if (following.includes(targetUsername)) return

                // ── Throttle: prevent spam-clicking (2s cooldown) ──
                const throttleKey = `follow:${targetUsername}`
                const lastCall = _actionThrottles.get(throttleKey) || 0
                if (Date.now() - lastCall < 2000) return
                pruneThrottles()
                _actionThrottles.set(throttleKey, Date.now())

                const fromUsername = state.user?.username || 'someone'
                const userId = state.user?.id

                // Optimistic update — UI responds instantly
                set((s) => ({
                    user: s.user ? { ...s.user, following: [...(s.user.following || []), targetUsername] } : null,
                }))

                // Background sync — rollback on failure
                try {
                    if (userId) {
                        const targetId = await resolveUsernameToId(targetUsername)
                        if (!targetId) throw new Error('User not found')
                        const [{ error: followErr }] = await Promise.all([
                            supabase.from('interactions').insert([{
                                user_id: userId, target_user_id: targetId, type: 'follow'
                            }])
                        ])
                        if (followErr && !followErr.message?.includes('duplicate')) throw followErr
                        
                        if (!followErr) {
                            await supabase.from('notifications').insert({
                                user_id: targetId,
                                type: 'follow',
                                from_username: fromUsername,
                                message: `@${fromUsername} pulled you into their orbit`,
                                read: false
                            })
                        }
                    }
                } catch {
                    // Rollback
                    set((s) => ({
                        user: s.user ? { ...s.user, following: (s.user.following || []).filter(u => u !== targetUsername) } : null,
                    }))
                    reelToast.error('Follow failed — please try again.')
                }
            },

            unfollowUser: async (targetUsername) => {
                // ── Throttle: prevent spam-clicking (2s cooldown) ──
                const throttleKey = `unfollow:${targetUsername}`
                const lastCall = _actionThrottles.get(throttleKey) || 0
                if (Date.now() - lastCall < 2000) return
                pruneThrottles()
                _actionThrottles.set(throttleKey, Date.now())

                const prevFollowing = get().user?.following || []
                const userId = get().user?.id

                // Optimistic update
                set((s) => ({
                    user: s.user ? { ...s.user, following: (s.user.following || []).filter(u => u !== targetUsername) } : null,
                }))

                // Background sync — rollback on failure
                try {
                    if (userId) {
                        const targetId = await resolveUsernameToId(targetUsername)
                        if (targetId) {
                            const { error } = await supabase.from('interactions').delete()
                                .eq('user_id', userId)
                                .eq('target_user_id', targetId)
                                .eq('type', 'follow')
                            if (error) throw error
                        }
                    }
                } catch {
                    // Rollback
                    set((s) => ({
                        user: s.user ? { ...s.user, following: prevFollowing } : null,
                    }))
                    reelToast.error('Unfollow failed — please try again.')
                }
            },
        }),
        {
            name: 'reelhouse-auth',
            storage: createJSONStorage(() => ({
                getItem: async (name: string): Promise<string | null> => {
                    return (await get(name)) || null
                },
                setItem: async (name: string, value: string): Promise<void> => {
                    await set(name, value)
                },
                removeItem: async (name: string): Promise<void> => {
                    await del(name)
                },
            })),
            // Only persist the minimum needed to restore session UI — no action functions
            partialize: (state) => ({
                user: state.user ? {
                    id: state.user.id,
                    email: state.user.email,
                    username: state.user.username,
                    role: state.user.role,
                    avatar_url: state.user.avatar_url,
                    display_name: state.user.display_name,
                    bio: state.user.bio,
                    is_social_private: state.user.is_social_private,
                    created_at: state.user.created_at,
                    following: state.user.following,
                    preferences: state.user.preferences || {},
                } : null,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
)

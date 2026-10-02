import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { get, set, del } from 'idb-keyval'
import { supabase } from '../supabaseClient'
import { logError } from '../errorLogger'
import { User } from '../types'
import reelToast from '../utils/reelToast'
import { clearOfflineQueue } from '../utils/offlineQueue'
import { LOG_DRAFT_PREFIX } from '../utils/logDrafts'

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

// ── Signing in: by address, or by handle on the server ──
// A handle is turned into a session by the sign-in-with-username function, as
// the app does it: the address never reaches the browser, and every wrong handle
// or password gets the same answer. The page used to look the address up itself
// with get_email_by_username, which the database stopped answering browsers when
// that lookup was closed, so every sign-in by handle said "No account found".
// Supabase's own words for a refused address, so both doors say the same thing.
const BAD_CREDENTIALS = 'Invalid login credentials'
/** Something before the @ and a dotted domain after it, as the app reads it: "@name" is a handle. */
const ADDRESS_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function usernameRefusal(error: unknown): Error {
    const e = error as { name?: string; context?: { status?: number } } | null
    if (e?.name === 'FunctionsFetchError') return new Error('Could not reach the House. Check your connection and try again.')
    if (e?.name === 'FunctionsHttpError' && e.context?.status === 401) return new Error(BAD_CREDENTIALS)
    if (e?.name === 'FunctionsHttpError' && e.context?.status === 429) return new Error('Too many attempts. Please wait a moment and try again.')
    return new Error('Sign-in is unavailable right now. Please try again.')
}

async function signIn(identifier: string, password: string) {
    if (ADDRESS_SHAPE.test(identifier)) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: identifier, password })
        if (error) throw error
        return data
    }
    const { data: tokens, error: fnError } = await supabase.functions.invoke('sign-in-with-username', {
        body: { username: identifier.replace(/^@/, ''), password },
    })
    if (fnError) throw usernameRefusal(fnError)
    if (!tokens?.access_token || !tokens?.refresh_token) throw usernameRefusal(null)
    const { data, error } = await supabase.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token })
    if (error) throw error
    if (!data.user || !data.session) throw usernameRefusal(null)
    return { user: data.user, session: data.session }
}

// ── Action throttle: prevents spam-clicking social buttons ──
const _actionThrottles = new Map<string, number>()
const _THROTTLE_MAX = 200

// ── Signup throttle: prevents bot registration spam (5s per email) ──
const _signupThrottle = new Map<string, number>()
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

// ── Preferences: sent through update_my_preferences, as the app sends them ──
// Members may not write the preferences column itself; the direct update this
// store made was refused, unread, so no preference ever left the browser. The
// function merges what it is sent into what is stored, so only the keys that
// changed are sent: one call for a burst, after the last change.
const PREF_SEND_DELAY_MS = 800
const _pendingPrefs = new Map<string, { keys: Record<string, unknown>; before: Record<string, unknown> }>()
const _prefTimers = new Map<string, ReturnType<typeof setTimeout>>()

type StoreGet = () => AuthState
type StoreSet = (fn: (state: AuthState) => Partial<AuthState>) => void

async function sendPreferences(userId: string, get: StoreGet, set: StoreSet) {
    _prefTimers.delete(userId)
    const sending = _pendingPrefs.get(userId)
    _pendingPrefs.delete(userId)
    if (!sending) return
    const { error } = await supabase.rpc('update_my_preferences', { p_preferences: sending.keys })
    if (!error) return
    logError({ type: 'store', message: `[setPreference] refused: ${error.message}`, component: 'auth.setPreference' })
    // Put back what was refused, unless a newer change to the same key is on its way.
    if (get().user?.id !== userId) return
    const waiting = _pendingPrefs.get(userId)?.keys ?? {}
    const restore = Object.fromEntries(Object.entries(sending.before).filter(([k]) => !(k in waiting)))
    set((state) => ({ user: state.user ? { ...state.user, preferences: { ...(state.user.preferences || {}), ...restore } } : null }))
    reelToast.error('Your setting could not be saved. Please try again.')
}

export interface AuthState {
    user: User | null
    isAuthenticated: boolean
    /** An email address, or a handle (with or without its @). */
    login: (identifier: string, password: string) => Promise<{ user: unknown; session: unknown }>
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
            .select('target_user_id, type')
            .eq('user_id', userId)
            .in('type', ['follow', 'follow_request'])
            .limit(5000)
        if (!followRows || followRows.length === 0) {
            useAuthStore.setState(s => ({ user: s.user ? { ...s.user, following: [], requested: [] } : null }))
            return
        }
        // Resolve target IDs to usernames
        const targetIds = followRows.map(r => r.target_user_id)
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username')
            .in('id', targetIds)
            .limit(5000)
            
        const following: string[] = []
        const requested: string[] = []
        if (profiles) {
            const profileMap = new Map(profiles.map(p => [p.id, p.username]))
            followRows.forEach(row => {
                const username = profileMap.get(row.target_user_id)
                if (username) {
                    if (row.type === 'follow_request') requested.push(username)
                    else following.push(username)
                }
            })
        }
        
        useAuthStore.setState(s => ({ user: s.user ? { ...s.user, following, requested } : null }))
    } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e))
        logError({ type: 'store', message: `Failed to hydrate following list: ${err.message}`, stack: err.stack, component: 'auth.hydrateFollowing' })
    }
}

// Parallel hydration helper — fires all user-data fetches simultaneously
async function hydrateUserData() {
    const films = await import('./films')
    // fetchVault and fetchProgrammes were removed with batch 31 — they read
    // `vaults` and `programmes`, two tables from an abandoned feature that has
    // now been dropped. This is the second of two hydration paths that called
    // them; the other is hydrateAllStores in ./realtime.
    await Promise.all([
        films.useFilmStore.getState().fetchLogs(),
        films.useFilmStore.getState().fetchWatchlist(),
        films.useFilmStore.getState().fetchLists(),
        hydrateFollowing(),
    ])
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            isAuthenticated: false,

            login: async (identifier, password) => {
                const data = await signIn(identifier.trim(), password)

                // Set authenticated IMMEDIATELY with minimal auth data so the UI responds instantly
                set({ user: { ...data.user, following: [], requested: [] } as unknown as User, isAuthenticated: true })

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
                // Client-side throttle — prevent bot spam (5s cooldown per email)
                const throttleKey = `signup:${email}`
                const now = Date.now()
                const lastAttempt = _signupThrottle.get(throttleKey) || 0
                if (now - lastAttempt < 5000) {
                    throw new Error('Please wait a moment before trying again.')
                }
                _signupThrottle.set(throttleKey, now)
                // Cap throttle map to prevent memory leak
                if (_signupThrottle.size > 50) _signupThrottle.clear()

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
                    set({ user: { ...data.user, ...profile, following: [], requested: [] } as User, isAuthenticated: true })
                    hydrateUserData()
                }
                // Return data — SignupModal checks data.session to decide
                // whether to show the 'Check Inbox' screen or close immediately
                return data
            },

            logout: async () => {
                // 0. A setting changed a moment ago is sent while the session can still send it.
                const leaving = get().user?.id
                if (leaving && _prefTimers.has(leaving)) {
                    clearTimeout(_prefTimers.get(leaving))
                    await sendPreferences(leaving, get, set)
                }

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

                // Log drafts hold a member's own writing — their review AND their
                // private note. Swept by PREFIX, never by a list: a list is how
                // four draft keys on mobile came to outlive the member who wrote
                // them. The prefix covers today's per-member keys and the older
                // keys that carried no member at all.
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith(LOG_DRAFT_PREFIX)) localStorage.removeItem(key)
                })

                // The offline queue can hold private notes waiting for a signal.
                await clearOfflineQueue()

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

            // ── Preferences — merged into profiles.preferences on the server ──
            setPreference: async (key, value) => {
                const user = get().user
                if (!user) return
                const before = user.preferences || {}
                set((state) => ({ user: state.user ? { ...state.user, preferences: { ...before, [key]: value } } : null }))
                // The value each key had when this burst began, to put back if it is refused.
                const sending = _pendingPrefs.get(user.id) ?? { keys: {}, before: {} }
                if (!(key in sending.keys)) sending.before[key] = before[key]
                sending.keys[key] = value
                _pendingPrefs.set(user.id, sending)
                clearTimeout(_prefTimers.get(user.id))
                _prefTimers.set(user.id, setTimeout(() => { void sendPreferences(user.id, get, set) }, PREF_SEND_DELAY_MS))
            },

            getPreference: (key, fallback = null) => {
                const user = get().user
                return user?.preferences?.[key] ?? fallback
            },


            followUser: async (targetUsername) => {
                const state = get()
                const following = state.user?.following || []
                const requested = state.user?.requested || []
                if (following.includes(targetUsername) || requested.includes(targetUsername)) return

                // ── Throttle: prevent spam-clicking (2s cooldown) ──
                const throttleKey = `follow:${targetUsername}`
                const lastCall = _actionThrottles.get(throttleKey) || 0
                if (Date.now() - lastCall < 2000) return
                pruneThrottles()
                _actionThrottles.set(throttleKey, Date.now())

                const fromUsername = state.user?.username || 'someone'
                const userId = state.user?.id

                // We need to resolve ID and privacy setting BEFORE optimistic update
                if (!userId) return
                
                // Keep the target username in a loading state array if needed, but since we await DB
                // we'll fetch ID and is_social_private
                const { data: profile } = await supabase.from('profiles').select('id, is_social_private').eq('username', targetUsername).single()
                if (!profile) {
                    reelToast.error('User not found.')
                    return
                }
                const targetId = profile.id
                const isPrivate = Boolean(profile.is_social_private)
                const interactionType = isPrivate ? 'follow_request' : 'follow'

                // Optimistic update — UI responds instantly
                if (isPrivate) {
                    set((s) => ({ user: s.user ? { ...s.user, requested: [...(s.user.requested || []), targetUsername] } : null }))
                } else {
                    set((s) => ({ user: s.user ? { ...s.user, following: [...(s.user.following || []), targetUsername] } : null }))
                }

                // Background sync — rollback on failure
                try {
                    const [{ error: followErr }] = await Promise.all([
                        supabase.from('interactions').insert([{
                            user_id: userId, target_user_id: targetId, type: interactionType
                        }])
                    ])
                    if (followErr && !followErr.message?.includes('duplicate')) throw followErr
                        
                    // DB trigger handles notification generation
                } catch {
                    // Rollback
                    if (isPrivate) {
                        set((s) => ({ user: s.user ? { ...s.user, requested: (s.user.requested || []).filter(u => u !== targetUsername) } : null }))
                    } else {
                        set((s) => ({ user: s.user ? { ...s.user, following: (s.user.following || []).filter(u => u !== targetUsername) } : null }))
                    }
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
                const prevRequested = get().user?.requested || []
                const userId = get().user?.id

                // Optimistic update
                set((s) => ({
                    user: s.user ? { 
                        ...s.user, 
                        following: (s.user.following || []).filter(u => u !== targetUsername),
                        requested: (s.user.requested || []).filter(u => u !== targetUsername)
                    } : null,
                }))

                // Background sync — rollback on failure
                try {
                    if (userId) {
                        const targetId = await resolveUsernameToId(targetUsername)
                        if (targetId) {
                            const { error } = await supabase.from('interactions').delete()
                                .eq('user_id', userId)
                                .eq('target_user_id', targetId)
                                .in('type', ['follow', 'follow_request'])
                            if (error) throw error
                        }
                    }
                } catch {
                    // Rollback
                    set((s) => ({
                        user: s.user ? { ...s.user, following: prevFollowing, requested: prevRequested } : null,
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
                    requested: state.user.requested,
                    preferences: state.user.preferences || {},
                } : null,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
)

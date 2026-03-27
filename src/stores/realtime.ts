import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { queryClient } from '../main'
import { useAuthStore, hydrateFollowing } from './auth'
import { useFilmStore } from './films'
import { useNotificationStore } from './social'
import { useProgrammeStore } from './content'

// ── REALTIME + AUTH SYNC ──
// These are module-level side effects, not stores.
// Both guard against being called without Supabase configured.

let _authSub: any = null
export const initAuthSync = () => {
    if (!isSupabaseConfigured) return

    if (_authSub) _authSub.unsubscribe()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        // ── PASSWORD RECOVERY: don't auto-login, just redirect to reset page ──
        if (event === 'PASSWORD_RECOVERY') {
            sessionStorage.setItem('reelhouse_recovery', 'true')
            useAuthStore.setState({ user: null, isAuthenticated: false })
            supabase.removeAllChannels()
            if (!window.location.pathname.includes('auth/reset-password')) {
                // Must use href to force re-render, but sessionStorage persists
                window.location.href = '/auth/reset-password'
            }
            return
        }

        // If we're in recovery mode, suppress SIGNED_IN / INITIAL_SESSION
        if (sessionStorage.getItem('reelhouse_recovery') === 'true' && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
            useAuthStore.setState({ user: null, isAuthenticated: false })
            return
        }

        if (event === 'INITIAL_SESSION') {
            // Page load/refresh — always re-fetch from Supabase so localStorage
            // stale cache never beats live data
            if (session) {
                const { data: profile } = await supabase
                    .from('profiles').select('*').eq('id', session.user.id).single()
                useAuthStore.setState({
                    user: { ...session.user, ...profile },
                    isAuthenticated: true,
                })
                // Fire-and-forget: hydrate stores in background, don't block the UI
                Promise.all([
                    useFilmStore.getState().fetchLogs(),
                    useFilmStore.getState().fetchWatchlist(),
                    useFilmStore.getState().fetchVault(),
                    useFilmStore.getState().fetchLists(),
                    useFilmStore.getState().fetchStubs(),
                    useFilmStore.getState().fetchEndorsements(),
                    useFilmStore.getState().fetchPhysicalArchive(),
                    useProgrammeStore.getState().fetchProgrammes(),
                    hydrateFollowing(),
                ]).catch(() => { /* background hydration failure is non-critical */ })
            } else {
                // No session on load — clear any stale localStorage auth
                useAuthStore.setState({ user: null, isAuthenticated: false })
            }
            return
        }

        if (event === 'SIGNED_IN' && session) {
            const currentUser = useAuthStore.getState().user
            // Skip if login() already set the user with matching ID
            if (currentUser && currentUser.id === session.user.id) return

            // New sign-in (e.g. from email confirmation callback)
            const { data: profile } = await supabase
                .from('profiles').select('*').eq('id', session.user.id).single()
            useAuthStore.setState({
                user: { ...session.user, ...profile },
                isAuthenticated: true,
            })
            // Fire-and-forget: hydrate stores in background
            Promise.all([
                useFilmStore.getState().fetchLogs(),
                useFilmStore.getState().fetchWatchlist(),
                useFilmStore.getState().fetchVault(),
                useFilmStore.getState().fetchLists(),
                useFilmStore.getState().fetchStubs(),
                useFilmStore.getState().fetchEndorsements(),
                useFilmStore.getState().fetchPhysicalArchive(),
                useProgrammeStore.getState().fetchProgrammes(),
                hydrateFollowing(),
            ]).catch(() => { /* background hydration failure is non-critical */ })
        }

        if (event === 'SIGNED_OUT') {
            useAuthStore.setState({ user: null, isAuthenticated: false })
            // Sever all Realtime sockets securely to prevent zombie memory
            supabase.removeAllChannels()
        }
    })
    _authSub = subscription
}


export const initRealtime = () => {
    if (!isSupabaseConfigured) return

    // 1. Live global feed — singleton guard
    if (supabase.getChannels().some(c => c.topic === 'realtime:global_logs_feed')) {
        // Already listening, skip to prevent multi-instance socket floods
    } else {
        supabase
            .channel('global_logs_feed')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs' }, (payload) => {
            const currentUserId = useAuthStore.getState().user?.id

            // Own logs are already handled via addLog() — skip entirely
            if (payload.new.user_id === currentUserId) return

            // 🛡️ MAPPED REALTIME: Invalidate the TanStack feed cache organically
            // The UI will silently background-fetch the delta without layout shift
            queryClient.invalidateQueries({ queryKey: ['feed'] })
        })
        .subscribe()
    }

    // 2. Personal notifications — real-time delivery to logged-in user
    const userId = useAuthStore.getState().user?.id
    if (userId) {
        const userTopic = `realtime:user_notifications_${userId}`
        if (!supabase.getChannels().some(c => c.topic === userTopic)) {
            supabase
                .channel(`user_notifications_${userId}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public',
                table: 'notifications', filter: `user_id=eq.${userId}`,
            }, (payload) => {
                useNotificationStore.getState().push({
                    id: payload.new.id,
                    type: payload.new.type,
                    from_user: payload.new.from_username,
                    message: payload.new.message,
                    timestamp: payload.new.created_at,
                })
            })
            .subscribe()
        }
    }
}

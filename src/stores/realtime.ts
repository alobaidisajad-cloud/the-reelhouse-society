import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { queryClient } from '../queryClient'
import { useAuthStore, hydrateFollowing } from './auth'
import { useFilmStore } from './films'
import { useNotificationStore } from './social'
import { useProgrammeStore } from './content'

// ── REALTIME + AUTH SYNC ──
// These are module-level side effects, not stores.
// Both guard against being called without Supabase configured.

// ── Extracted hydration helper — eliminates code duplication ──
async function hydrateAllStores() {
    return Promise.all([
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
            if (session) {
                const { data: profile } = await supabase
                    .from('profiles').select('*').eq('id', session.user.id).single()
                useAuthStore.setState({
                    user: { ...session.user, ...profile },
                    isAuthenticated: true,
                })
                hydrateAllStores()
            } else {
                useAuthStore.setState({ user: null, isAuthenticated: false })
            }
            return
        }

        if (event === 'SIGNED_IN' && session) {
            const currentUser = useAuthStore.getState().user
            if (currentUser && currentUser.id === session.user.id) return

            const { data: profile } = await supabase
                .from('profiles').select('*').eq('id', session.user.id).single()
            useAuthStore.setState({
                user: { ...session.user, ...profile },
                isAuthenticated: true,
            })
            hydrateAllStores()
        }

        if (event === 'SIGNED_OUT') {
            useAuthStore.setState({ user: null, isAuthenticated: false })
            supabase.removeAllChannels()
        }
    })
    _authSub = subscription
}


let _realtimeConnecting = false
export const initRealtime = () => {
    if (!isSupabaseConfigured) return
    // Semaphore: prevent concurrent initRealtime calls during rapid auth events
    if (_realtimeConnecting) return
    _realtimeConnecting = true

    try {
        // 1. Live global feed sync has been intentionally disabled for scalability
        // At 10M scale, global WebSocket invalidations generate an infrastructure-killing DDoS.
        // Feed synchronization is now strictly isolated to localized pull-to-refresh and tab-focus mechanics.

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
    } finally {
        _realtimeConnecting = false
    }
}

import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { useAuthStore, hydrateFollowing } from './auth'
import { useFilmStore } from './films'
import { useNotificationStore } from './social'
import { useProgrammeStore } from './content'

// ── REALTIME + AUTH SYNC ──
// These are module-level side effects, not stores.
// Both guard against being called without Supabase configured.

export const initAuthSync = () => {
    if (!isSupabaseConfigured) return

    supabase.auth.onAuthStateChange(async (event, session) => {
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
                await Promise.all([
                    useFilmStore.getState().fetchLogs(),
                    useFilmStore.getState().fetchWatchlist(),
                    useFilmStore.getState().fetchVault(),
                    useFilmStore.getState().fetchLists(),
                    useFilmStore.getState().fetchStubs(),
                    useFilmStore.getState().fetchEndorsements(),
                    useProgrammeStore.getState().fetchProgrammes(),
                    hydrateFollowing(),
                ])
            } else {
                // No session on load — clear any stale localStorage auth
                useAuthStore.setState({ user: null, isAuthenticated: false })
            }
            return
        }

        if (event === 'SIGNED_IN' && session) {
            const currentUser = useAuthStore.getState().user
            // Only re-hydrate on SIGNED_IN if the user actually changed
            // (prevents double-fetch when INITIAL_SESSION already handled it)
            if (!currentUser || currentUser.id !== session.user.id) {
                const { data: profile } = await supabase
                    .from('profiles').select('*').eq('id', session.user.id).single()
                useAuthStore.setState({
                    user: { ...session.user, ...profile },
                    isAuthenticated: true,
                })
                await Promise.all([
                    useFilmStore.getState().fetchLogs(),
                    useFilmStore.getState().fetchWatchlist(),
                    useFilmStore.getState().fetchVault(),
                    useFilmStore.getState().fetchLists(),
                    useFilmStore.getState().fetchStubs(),
                    useFilmStore.getState().fetchEndorsements(),
                    useProgrammeStore.getState().fetchProgrammes(),
                    hydrateFollowing(),
                ])
            }
        }

        if (event === 'SIGNED_OUT') {
            useAuthStore.setState({ user: null, isAuthenticated: false })
        }
    })
}


export const initRealtime = () => {
    if (!isSupabaseConfigured) return

    // 1. Live global feed — new log inserts from other users go into a
    //    SEPARATE feed array so the current user's personal `logs` store
    //    is never polluted. The user's own inserts are handled by addLog().
    supabase
        .channel('global_logs_feed')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs' }, (payload) => {
            const currentUserId = useAuthStore.getState().user?.id

            // Own logs are already handled via addLog() — skip entirely
            if (payload.new.user_id === currentUserId) return

            const feedLogs = useFilmStore.getState().globalFeedLogs || []
            // Deduplicate by ID
            if (feedLogs.some(l => l.id === payload.new.id)) return

            useFilmStore.setState({
                globalFeedLogs: [{
                    id: payload.new.id,
                    userId: payload.new.user_id,
                    filmId: payload.new.film_id,
                    title: payload.new.film_title,
                    poster: payload.new.poster_path,
                    year: payload.new.year,
                    rating: payload.new.rating,
                    review: payload.new.review,
                    status: payload.new.status || 'watched',
                    watchedDate: payload.new.watched_date,
                    createdAt: payload.new.created_at,
                }, ...feedLogs].slice(0, 100), // Cap at 100 to prevent memory bloat
            })
        })
        .subscribe()

    // 2. Personal notifications — real-time delivery to logged-in user
    const userId = useAuthStore.getState().user?.id
    if (userId) {
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

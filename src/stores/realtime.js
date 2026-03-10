import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { useAuthStore } from './auth'
import { useFilmStore } from './films'
import { useNotificationStore } from './social'
import { useProgrammeStore } from './content'

// ── REALTIME + AUTH SYNC ──
// These are module-level side effects, not stores.
// Both guard against being called without Supabase configured.

export const initAuthSync = () => {
    if (!isSupabaseConfigured) return

    supabase.auth.onAuthStateChange(async (event, session) => {
        if (session) {
            const currentUser = useAuthStore.getState().user
            if (!currentUser || currentUser.id !== session.user.id) {
                const { data: profile } = await supabase
                    .from('profiles').select('*').eq('id', session.user.id).single()
                useAuthStore.setState({
                    user: { ...session.user, ...profile },
                    isAuthenticated: true,
                })
                // Parallel hydration — all data fetches fire simultaneously
                await Promise.all([
                    useFilmStore.getState().fetchLogs(),
                    useFilmStore.getState().fetchWatchlist(),
                    useFilmStore.getState().fetchVault(),
                    useFilmStore.getState().fetchLists(),
                    useProgrammeStore.getState().fetchProgrammes(),
                ])
            }
        } else {
            useAuthStore.setState({ user: null, isAuthenticated: false })
        }
    })
}

export const initRealtime = () => {
    if (!isSupabaseConfigured) return

    // 1. Live global feed — new log inserts from any user appear immediately
    supabase
        .channel('global_logs_feed')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs' }, (payload) => {
            const currentLogs = useFilmStore.getState().logs
            const currentUserId = useAuthStore.getState().user?.id
            if (!currentLogs.find((l) => l.id === payload.new.id) && payload.new.user_id !== currentUserId) {
                useFilmStore.setState({
                    logs: [{
                        id: payload.new.id,
                        filmId: payload.new.film_id,
                        title: payload.new.film_title,
                        poster: payload.new.poster_path,
                        year: payload.new.year,
                        rating: payload.new.rating,
                        review: payload.new.review,
                        watchedDate: payload.new.watched_date,
                        createdAt: payload.new.created_at,
                    }, ...currentLogs],
                })
            }
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
                    from: payload.new.from_username,
                    message: payload.new.message,
                    timestamp: payload.new.created_at,
                })
            })
            .subscribe()
    }
}

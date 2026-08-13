import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { queryClient } from '../queryClient'
import { useAuthStore, hydrateFollowing } from './auth'
import { useFilmStore } from './films'
import { useProgrammeStore } from './content'

// ── REALTIME + AUTH SYNC ──
// These are module-level side effects, not stores.
// Both guard against being called without Supabase configured.

// ── Profile columns — explicit list to avoid select('*') schema leaks ──
const PROFILE_COLUMNS = 'id, username, role, bio, avatar_url, display_name, is_social_private, preferences, persona, social_links, created_at'

// ── Hydration mutex — prevents concurrent hydration during HMR/re-mounts ──
let _hydrating = false

// ── Extracted hydration helper — eliminates code duplication ──
async function hydrateAllStores() {
    if (_hydrating) return // Prevent concurrent hydration
    _hydrating = true
    try {
        // fetchVault, fetchStubs and fetchProgrammes were removed with batch 31.
        // They read `vaults`, `tickets` and `programmes` — three tables from a
        // feature that was abandoned and has now been dropped. Every page load
        // was firing three requests that could only ever return nothing.
        // The physical media feature lives in `physical_archive`, which stays.
        await Promise.all([
            useFilmStore.getState().fetchLogs(),
            useFilmStore.getState().fetchWatchlist(),
            useFilmStore.getState().fetchLists(),
            useFilmStore.getState().fetchEndorsements(),
            useFilmStore.getState().fetchPhysicalArchive(),
            hydrateFollowing(),
        ])
    } catch { /* background hydration failure is non-critical */ }
    finally { _hydrating = false }
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
                    .from('profiles').select(PROFILE_COLUMNS).eq('id', session.user.id).single()
                useAuthStore.setState({
                    user: { ...session.user, ...profile } as any,
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
                .from('profiles').select(PROFILE_COLUMNS).eq('id', session.user.id).single()
            useAuthStore.setState({
                user: { ...session.user, ...profile } as any,
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


/**
 * initRealtime — INTENTIONAL NOOP
 * ─────────────────────────────────────────────────────────────────────────────
 * Previously managed global WebSocket subscriptions for feed and notifications.
 * Both were disabled for the following production-validated reasons:
 *
 * 1. Live global feed sync: At 10M scale, global WebSocket invalidations
 *    generate infrastructure-killing DDoS. Feed sync is now localized to
 *    pull-to-refresh and tab-focus mechanics.
 *
 * 2. Notification realtime: Now exclusively managed by NotificationBell's
 *    singleton channel to prevent duplicate subscription bugs.
 *
 * This function is called from App.tsx and retained as a stable API surface
 * for future re-enablement of realtime features.
 */
export const initRealtime = () => {
    // noop — see JSDoc above for rationale
}


import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { queryClient } from '../queryClient'
import { useAuthStore, hydrateFollowing } from './auth'
import { useFilmStore, forgetSavedRecord, unsealSavedRecord } from './films'
import { logError } from '../errorLogger'
import reelToast from '../utils/reelToast'

// ── REALTIME + AUTH SYNC ──
// These are module-level side effects, not stores.
// Both guard against being called without Supabase configured.

// ── Profile columns — explicit list to avoid select('*') schema leaks ──
const PROFILE_COLUMNS = 'id, username, role, bio, avatar_url, display_name, is_social_private, preferences, persona, social_links, created_at'

/**
 * The signed-in member: their auth user with their profile. A profile that fails
 * to load keeps the member already held, untouched; with none held, they are
 * told, rather than shown as a member with no name and no rank.
 */
async function memberFor<T extends { id: string }>(authUser: T) {
    const { data: profile, error } = await supabase
        .from('profiles').select(PROFILE_COLUMNS).eq('id', authUser.id).single()
    if (!error && profile) return { ...authUser, ...profile }
    logError({ type: 'store', message: `[authSync] profile read failed: ${error?.message ?? 'no profile row'}`, component: 'realtime.memberFor', userId: authUser.id })
    const held = useAuthStore.getState().user
    if (held?.id === authUser.id) return held
    reelToast.error('Your profile could not be loaded. Please refresh the page.', { id: 'profile-unloaded' })
    return { ...authUser }
}

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

// The member a deferred seating is for; null once no one should be seated.
let _seating: string | null = null

/**
 * Seats the member once their profile is read. The read runs after the auth
 * listener has returned: supabase-js runs the listener inside its auth lock, and
 * a supabase call awaited there waits on that same lock. A seating overtaken by
 * a sign-out, or by another member, writes nothing.
 */
function seatMember<T extends { id: string }>(authUser: T) {
    _seating = authUser.id
    setTimeout(async () => {
        const user = await memberFor(authUser)
        if (_seating !== authUser.id) return
        // A persona claimed at sign-in, while this read was on its way, is not undone by it.
        const held = useAuthStore.getState().user as { id?: string; persona?: string | null } | null
        const persona = held?.id === authUser.id && held.persona && !(user as { persona?: string | null }).persona ? held.persona : undefined
        useAuthStore.setState({ user: (persona ? { ...user, persona } : user) as any, isAuthenticated: true })
        hydrateAllStores()
    }, 0)
}

let _authSub: any = null
export const initAuthSync = () => {
    if (!isSupabaseConfigured) return

    if (_authSub) _authSub.unsubscribe()

    // Never async, and never awaits a supabase call: see seatMember.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        // ── PASSWORD RECOVERY: don't auto-login, just redirect to reset page ──
        if (event === 'PASSWORD_RECOVERY') {
            _seating = null
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
            _seating = null
            useAuthStore.setState({ user: null, isAuthenticated: false })
            return
        }

        if (event === 'INITIAL_SESSION') {
            if (session) {
                unsealSavedRecord()
                seatMember(session.user)
            } else {
                // no one is signed in: a record left by a session that ended while away is not kept
                _seating = null
                useAuthStore.setState({ user: null, isAuthenticated: false })
                void forgetSavedRecord()
            }
            return
        }

        if (event === 'SIGNED_IN' && session) {
            const currentUser = useAuthStore.getState().user
            if (currentUser && currentUser.id === session.user.id) return
            if (_seating === session.user.id) return

            unsealSavedRecord()
            seatMember(session.user)
        }

        if (event === 'SIGNED_OUT') {
            _seating = null
            useAuthStore.setState({ user: null, isAuthenticated: false })
            supabase.removeAllChannels()
            // however the session ended — the button, another tab, or its expiry
            void forgetSavedRecord()
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


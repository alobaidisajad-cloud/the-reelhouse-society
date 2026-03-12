import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
    console.warn("Supabase env vars missing. Running in offline mode.")
}

export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder_key',
    isSupabaseConfigured ? {} : {
        realtime: { params: { eventsPerSecond: 0 } },
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    }
)

// Kill any internal realtime connection when not configured
if (!isSupabaseConfigured) {
    try {
        supabase.realtime.disconnect()
        supabase.removeAllChannels()
    } catch { /* ignore */ }
}

// Silently handle stale/expired refresh tokens.
// When a user's session token expires server-side (e.g. after long inactivity),
// Supabase fires TOKEN_REFRESH_FAILED which causes an AuthApiError in the console.
// We catch it here and clear the dead session from localStorage gracefully.
if (isSupabaseConfigured) {
    supabase.auth.onAuthStateChange((event) => {
        if (event === 'TOKEN_REFRESH_FAILED') {
            // Sign out locally only (no server round-trip needed)
            supabase.auth.signOut({ scope: 'local' }).catch(() => { })
            // Belt-and-suspenders: clear any leftover sb-* auth tokens
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('sb-') && key.includes('-auth-token')) {
                    localStorage.removeItem(key)
                }
            })
        }
    })
}

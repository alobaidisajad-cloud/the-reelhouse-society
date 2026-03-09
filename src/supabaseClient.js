import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
    console.warn("⚠️ Supabase env vars missing. Running in offline mode.")
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
    } catch (_) { /* ignore */ }
}

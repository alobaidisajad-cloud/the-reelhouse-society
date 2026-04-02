import { supabase, isSupabaseConfigured } from './supabaseClient'

/**
 * Log errors to Supabase error_logs table for production monitoring.
 * Silently fails if Supabase isn't configured or table doesn't exist.
 * 
 * ── HARDENED: Debounced error batching prevents identical errors from
 *    flooding the database. Groups duplicate errors within a 5s window.
 */

// ── Error dedup: suppress identical errors within 5 seconds ──
const _recentErrors = new Map<string, number>()
const ERROR_DEDUP_WINDOW = 5000

export async function logError({ type = 'runtime', message, stack, component, userId }: { type?: string, message: any, stack?: any, component?: string, userId?: string }) {
    if (!isSupabaseConfigured) return

    // Deduplicate: skip if this exact error was logged in the last 5s
    const errorKey = `${type}:${String(message).slice(0, 200)}`
    const lastLogged = _recentErrors.get(errorKey) || 0
    if (Date.now() - lastLogged < ERROR_DEDUP_WINDOW) return
    _recentErrors.set(errorKey, Date.now())

    // O(1) Absolute eviction boundary (prevent unbounded RAM ballooning under DDoS context)
    if (_recentErrors.size > 100) {
        _recentErrors.clear()
    }

    try {
        await supabase.from('error_logs').insert([{
            user_id: userId || null,
            error_type: type,
            error_message: message?.slice?.(0, 2000) || String(message).slice(0, 2000) || 'Unknown error',
            error_stack: stack?.slice?.(0, 5000) || null,
            component: component || null,
            url: typeof window !== 'undefined' ? window.location.href : null,
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        }])
    } catch { /* Never let error logging crash the app */ }
}

/**
 * Global window error handler — catches unhandled errors and promise rejections.
 * Call once on app init.
 */
export function initGlobalErrorLogging() {
    if (typeof window === 'undefined') return

    window.addEventListener('error', (event) => {
        logError({
            type: 'uncaught',
            message: event.message,
            stack: event.error?.stack,
            component: event.filename,
        })
    })

    window.addEventListener('unhandledrejection', (event) => {
        logError({
            type: 'unhandled_promise',
            message: event.reason?.message || String(event.reason),
            stack: event.reason?.stack,
        })
    })
}

/**
 * Rate limiter — prevents spam-clicking social actions.
 * Returns a throttled version of the action function.
 * 
 * Usage: const throttledFollow = createThrottle(followUser, 2000)
 */
const _throttleMap = new Map<string, number>()
const THROTTLE_MAP_MAX = 500

export function throttleAction(key: string, fn: () => void, cooldownMs = 2000) {
    const now = Date.now()
    const lastCall = _throttleMap.get(key) || 0

    if (now - lastCall < cooldownMs) {
        return false // Too fast, skip
    }

    _throttleMap.set(key, now)

    // O(1) absolute structural limit to prevent JS heap exhaustion during extreme spam 
    if (_throttleMap.size > THROTTLE_MAP_MAX) {
        _throttleMap.clear()
    }

    fn()
    return true
}

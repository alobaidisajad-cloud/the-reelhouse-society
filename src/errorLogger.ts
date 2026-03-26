import { supabase, isSupabaseConfigured } from './supabaseClient'

/**
 * Log errors to Supabase error_logs table for production monitoring.
 * Silently fails if Supabase isn't configured or table doesn't exist.
 */
export async function logError({ type = 'runtime', message, stack, component, userId }: { type?: string, message: any, stack?: any, component?: string, userId?: string }) {
    if (!isSupabaseConfigured) return

    try {
        await supabase.from('error_logs').insert([{
            user_id: userId || null,
            error_type: type,
            error_message: message?.slice(0, 2000) || 'Unknown error',
            error_stack: stack?.slice(0, 5000) || null,
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
const _throttleMap = new Map()

export function throttleAction(key: string, fn: () => void, cooldownMs = 2000) {
    const lastCall = _throttleMap.get(key) || 0
    const now = Date.now()

    if (now - lastCall < cooldownMs) {
        return false // Too fast, skip
    }

    _throttleMap.set(key, now)
    fn()
    return true
}

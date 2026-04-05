/**
 * Standardized error handling utilities for Supabase operations.
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides consistent patterns for handling, logging, and displaying errors
 * across the entire application. Replaces ad-hoc try/catch blocks.
 */

import reelToast from './reelToast'

// ── Error Types ────────────────────────────────────────────────────────────

export interface SupabaseResult<T> {
    data: T | null
    error: SupabaseError | null
}

export interface SupabaseError {
    message: string
    code?: string
    details?: string
    hint?: string
    status?: number
}

// ── User-friendly error messages ───────────────────────────────────────────

const ERROR_MAP: Record<string, string> = {
    '23505': 'This already exists.',
    '23503': 'Referenced item not found.',
    '42501': 'You don\'t have permission for this action.',
    'PGRST116': 'Item not found.',
    'PGRST301': 'Too many requests. Please wait a moment.',
    'invalid_grant': 'Session expired. Please sign in again.',
    'user_not_found': 'Account not found.',
    'email_not_confirmed': 'Please check your email to confirm your account.',
}

/**
 * Converts a Supabase error into a user-friendly message.
 */
export function friendlyError(error: unknown): string {
    if (!error) return 'Something went wrong.'
    if (typeof error === 'string') return error

    const e = error as Record<string, unknown>
    // Check for known error codes
    if (typeof e.code === 'string' && ERROR_MAP[e.code]) {
        return ERROR_MAP[e.code]
    }
    // Check for known message patterns
    if (typeof e.message === 'string') {
        if (e.message.includes('duplicate key')) return 'This already exists.'
        if (e.message.includes('violates row-level security')) return 'You don\'t have permission.'
        if (e.message.includes('JWT expired')) return 'Session expired. Please sign in again.'
        if (e.message.includes('network')) return 'Network error. Check your connection.'
        return e.message
    }

    return 'An unexpected error occurred.'
}

/**
 * Standard error handler — logs and optionally toasts.
 */
export function handleError(
    error: unknown,
    options: {
        /** Whether to show a toast notification (default true) */
        toast?: boolean
        /** Custom message to override automatic message */
        message?: string
        /** Label for console logging */
        label?: string
        /** Whether this is a silent/background error (suppresses toast) */
        silent?: boolean
    } = {}
): void {
    const { toast = true, message, label = 'error', silent = false } = options
    const msg = message || friendlyError(error)

    // Always log for debugging
    if (import.meta.env.DEV) {
        console.error(`[${label}]`, error)
    }

    // Show toast unless silenced
    if (toast && !silent) {
        reelToast.error(msg)
    }
}

/**
 * Safe wrapper for async operations — returns [data, error] tuple.
 * 
 * Usage:
 *   const [data, error] = await safe(() => supabase.from('logs').select('*'))
 *   if (error) { handleError(error); return }
 *   // data is guaranteed non-null here
 */
export async function safe<T>(
    fn: () => Promise<T>
): Promise<[T, null] | [null, unknown]> {
    try {
        const result = await fn()
        return [result, null]
    } catch (error) {
        return [null, error]
    }
}

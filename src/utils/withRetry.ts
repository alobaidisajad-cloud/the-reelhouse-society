/**
 * withRetry — Exponential backoff retry wrapper for critical async operations.
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps any async function with retry logic using exponential backoff.
 * Used for critical Supabase operations (auth, profile updates, log writes)
 * that MUST succeed for correct app behavior.
 *
 * Non-critical operations (reactions, notifications) should NOT use this —
 * they should fail silently or with optimistic rollback.
 *
 * Usage:
 *   const result = await withRetry(
 *       () => supabase.from('logs').insert(logData),
 *       { maxRetries: 3, label: 'insert_log' }
 *   )
 */

interface RetryOptions {
    /** Maximum number of retry attempts (default 3) */
    maxRetries?: number
    /** Initial delay between retries in ms (default 1000) */
    baseDelay?: number
    /** Maximum delay between retries in ms (default 8000) */
    maxDelay?: number
    /** Whether to add randomized jitter to delays (default true) */
    jitter?: boolean
    /** Label for logging/debugging purposes */
    label?: string
    /** Predicate to decide if we should retry on this specific error (default: always retry) */
    shouldRetry?: (error: unknown) => boolean
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxRetries = 3,
        baseDelay = 1000,
        maxDelay = 8000,
        jitter = true,
        label = 'unknown',
        shouldRetry = () => true,
    } = options

    let lastError: unknown

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await fn()

            // Check if result is a Supabase response with an error
            if (result && typeof result === 'object' && 'error' in result) {
                const supaResult = result as unknown as { error: unknown; data: unknown }
                if (supaResult.error) {
                    throw supaResult.error
                }
            }

            return result
        } catch (error) {
            lastError = error

            // Don't retry if this error type shouldn't be retried
            if (!shouldRetry(error)) {
                throw error
            }

            // Don't retry if we've exhausted attempts
            if (attempt >= maxRetries) {
                break
            }

            // Calculate delay with exponential backoff + optional jitter
            const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
            const delay = jitter
                ? exponentialDelay * (0.5 + Math.random() * 0.5)
                : exponentialDelay

            // Log for debugging (only in dev)
            if (import.meta.env.DEV) {
                console.warn(
                    `[withRetry] ${label} attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(delay)}ms`,
                    error
                )
            }

            await new Promise(resolve => setTimeout(resolve, delay))
        }
    }

    throw lastError
}

/**
 * Predicate: Don't retry on auth errors (401/403) — they won't succeed on retry.
 */
export function isRetryable(error: unknown): boolean {
    if (!error || typeof error !== 'object') return true

    const e = error as Record<string, unknown>

    // HTTP status codes that should NOT be retried
    const nonRetryableStatuses = [400, 401, 403, 404, 409, 422]
    if (typeof e.status === 'number' && nonRetryableStatuses.includes(e.status)) {
        return false
    }
    if (typeof e.code === 'string' && e.code.startsWith('PGRST')) {
        // PostgREST errors are usually client-side issues (bad query, missing column)
        return false
    }

    return true
}

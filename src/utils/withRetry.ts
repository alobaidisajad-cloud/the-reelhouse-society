/**
 * withRetry — Adapter shim for backward-compatible retry interface.
 * ─────────────────────────────────────────────────────────────────────────────
 * The canonical retry implementation lives in retry.ts.
 * This file provides the legacy `baseDelay`/`maxDelay` interface and
 * Supabase-response-error detection that tests depend on.
 * New code should import from './retry' directly.
 */

import { withRetry as coreRetry, isRetryable } from './retry'

export { isRetryable }

interface LegacyRetryOptions {
    maxRetries?: number
    baseDelay?: number
    maxDelay?: number
    jitter?: boolean
    label?: string
    shouldRetry?: (error: unknown) => boolean
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    options: LegacyRetryOptions = {}
): Promise<T> {
    const {
        maxRetries = 3,
        baseDelay = 1000,
        maxDelay = 8000,
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

            if (!shouldRetry(error)) {
                throw error
            }

            if (attempt >= maxRetries) {
                break
            }

            const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
            const delay = exponentialDelay * (0.5 + Math.random() * 0.5)
            await new Promise(resolve => setTimeout(resolve, delay))
        }
    }

    throw lastError
}

/**
 * Centralized retry utility with exponential backoff.
 * Handles transient network failures (429 rate limit, 503, timeouts)
 * without crashing the UI.
 *
 * Usage:
 *   const data = await withRetry(() => fetchTMDB('/movie/123'), { maxRetries: 3 })
 */

export interface RetryOptions {
    maxRetries?: number
    baseDelayMs?: number
    maxDelayMs?: number
    /** Only retry if this returns true for the error */
    shouldRetry?: (error: unknown) => boolean
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 8000,
    shouldRetry: () => true,
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options }
    let lastError: unknown

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error

            // Don't retry if we've exhausted attempts or the error isn't retryable
            if (attempt >= opts.maxRetries || !opts.shouldRetry(error)) {
                throw error
            }

            // Exponential backoff with jitter
            const delay = Math.min(
                opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * 200,
                opts.maxDelayMs
            )
            await new Promise(resolve => setTimeout(resolve, delay))
        }
    }

    throw lastError
}

/**
 * In-memory request deduplication.
 * If the same key is already inflight, returns the existing promise
 * instead of firing a duplicate request.
 */
const _inflightRequests = new Map<string, Promise<unknown>>()

export async function dedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = _inflightRequests.get(key)
    if (existing) return existing as Promise<T>

    const promise = fn().finally(() => {
        _inflightRequests.delete(key)
    })

    _inflightRequests.set(key, promise)
    return promise
}

/**
 * Simple LRU cache with TTL expiration.
 * Used for TMDB responses to prevent redundant API calls.
 */
export class LRUCache<T> {
    private cache = new Map<string, { value: T; expiry: number }>()
    private maxSize: number
    private ttlMs: number

    constructor(maxSize = 200, ttlMs = 5 * 60 * 1000) {
        this.maxSize = maxSize
        this.ttlMs = ttlMs
    }

    get(key: string): T | undefined {
        const entry = this.cache.get(key)
        if (!entry) return undefined
        if (Date.now() > entry.expiry) {
            this.cache.delete(key)
            return undefined
        }
        // Move to end (most recently used)
        this.cache.delete(key)
        this.cache.set(key, entry)
        return entry.value
    }

    set(key: string, value: T): void {
        // Evict oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const oldest = this.cache.keys().next().value
            if (oldest !== undefined) this.cache.delete(oldest)
        }
        this.cache.set(key, { value, expiry: Date.now() + this.ttlMs })
    }

    clear(): void {
        this.cache.clear()
    }
}

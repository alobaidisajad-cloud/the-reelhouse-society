/**
 * useDebouncedSearch — Unified debounced TMDB search hook.
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces 5 separate setTimeout+clearTimeout+AbortController implementations
 * scattered across LogModal, OnboardingModal, CreateListModal, CommandPalette,
 * and Navbar search.
 *
 * Features:
 *  • Configurable debounce delay (default 400ms)
 *  • AbortController management (cancels in-flight requests on new query)
 *  • Loading state tracking
 *  • Automatic cleanup on unmount
 *  • Returns results, loading state, and a clear function
 *
 * Usage:
 *   const { results, loading, clear } = useDebouncedSearch(query, {
 *       searchFn: (q, signal) => searchTMDB(q, { signal }),
 *       delay: 400,
 *       minLength: 2,
 *   })
 */

import { useState, useEffect, useRef, useCallback } from 'react'

interface UseDebouncedSearchOptions<T> {
    /** The async search function. Receives the query and an AbortSignal. */
    searchFn: (query: string, signal: AbortSignal) => Promise<T[]>
    /** Debounce delay in ms (default 400) */
    delay?: number
    /** Minimum query length to trigger search (default 2) */
    minLength?: number
    /** Whether the search is enabled (default true) */
    enabled?: boolean
}

interface UseDebouncedSearchResult<T> {
    results: T[]
    loading: boolean
    clear: () => void
}

export function useDebouncedSearch<T>(
    query: string,
    options: UseDebouncedSearchOptions<T>
): UseDebouncedSearchResult<T> {
    const { searchFn, delay = 400, minLength = 2, enabled = true } = options
    const [results, setResults] = useState<T[]>([])
    const [loading, setLoading] = useState(false)
    const abortRef = useRef<AbortController | null>(null)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Track the latest searchFn to avoid stale closures
    const searchFnRef = useRef(searchFn)
    searchFnRef.current = searchFn

    const clear = useCallback(() => {
        setResults([])
        setLoading(false)
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
        if (abortRef.current) {
            abortRef.current.abort()
            abortRef.current = null
        }
    }, [])

    useEffect(() => {
        // Clear previous timer
        if (timerRef.current) clearTimeout(timerRef.current)

        // If query is too short or disabled, clear results
        if (!enabled || query.trim().length < minLength) {
            clear()
            return
        }

        setLoading(true)

        timerRef.current = setTimeout(async () => {
            // Abort previous in-flight request
            if (abortRef.current) abortRef.current.abort()

            const controller = new AbortController()
            abortRef.current = controller

            try {
                const data = await searchFnRef.current(query.trim(), controller.signal)
                // Only update if this request wasn't aborted
                if (!controller.signal.aborted) {
                    setResults(data)
                    setLoading(false)
                }
            } catch (err: any) {
                // Silently ignore abort errors (expected during rapid typing)
                if (err?.name !== 'AbortError') {
                    setResults([])
                    setLoading(false)
                }
            }
        }, delay)

        // Cleanup on unmount or query change
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    }, [query, delay, minLength, enabled, clear])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortRef.current) abortRef.current.abort()
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    }, [])

    return { results, loading, clear }
}

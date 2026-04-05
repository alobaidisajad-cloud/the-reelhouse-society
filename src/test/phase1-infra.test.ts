/**
 * Phase 1 Infrastructure Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for ModalShell and useDebouncedSearch — the new shared infrastructure
 * created during Phase 1.3 and 1.4 of the optimization plan.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedSearch } from '../hooks/useDebouncedSearch'

// ── useDebouncedSearch ──────────────────────────────────────────────────────

describe('useDebouncedSearch', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('returns empty results initially', () => {
        const searchFn = vi.fn().mockResolvedValue([])
        const { result } = renderHook(() =>
            useDebouncedSearch('', { searchFn })
        )
        expect(result.current.results).toEqual([])
        expect(result.current.loading).toBe(false)
    })

    it('does not search for queries shorter than minLength', () => {
        const searchFn = vi.fn().mockResolvedValue([])
        renderHook(() =>
            useDebouncedSearch('a', { searchFn, minLength: 2 })
        )
        vi.advanceTimersByTime(500)
        expect(searchFn).not.toHaveBeenCalled()
    })

    it('sets loading to true while debouncing', () => {
        const searchFn = vi.fn().mockResolvedValue([])
        const { result } = renderHook(() =>
            useDebouncedSearch('inception', { searchFn, delay: 400 })
        )
        // Loading should be true immediately (debouncing)
        expect(result.current.loading).toBe(true)
    })

    it('calls searchFn after delay', async () => {
        const searchFn = vi.fn().mockResolvedValue([{ id: 1, title: 'Inception' }])
        const { result } = renderHook(() =>
            useDebouncedSearch('inception', { searchFn, delay: 400 })
        )

        // Advance past debounce
        await act(async () => {
            vi.advanceTimersByTime(401)
        })

        expect(searchFn).toHaveBeenCalledTimes(1)
        expect(searchFn).toHaveBeenCalledWith('inception', expect.any(AbortSignal))
    })

    it('clears results when clear() is called', async () => {
        const searchFn = vi.fn().mockResolvedValue([{ id: 1, title: 'Inception' }])
        const { result } = renderHook(() =>
            useDebouncedSearch('inception', { searchFn, delay: 100 })
        )

        await act(async () => {
            vi.advanceTimersByTime(101)
        })

        act(() => {
            result.current.clear()
        })

        expect(result.current.results).toEqual([])
        expect(result.current.loading).toBe(false)
    })

    it('does not search when enabled is false', () => {
        const searchFn = vi.fn().mockResolvedValue([])
        renderHook(() =>
            useDebouncedSearch('inception', { searchFn, enabled: false })
        )
        vi.advanceTimersByTime(500)
        expect(searchFn).not.toHaveBeenCalled()
    })
})

// ── withRetry ──────────────────────────────────────────────────────────────

import { withRetry, isRetryable } from '../utils/withRetry'

describe('withRetry', () => {
    it('returns result on first successful call', async () => {
        const fn = vi.fn().mockResolvedValue({ data: 'ok', error: null })
        const result = await withRetry(fn, { maxRetries: 3 })
        expect(result).toEqual({ data: 'ok', error: null })
        expect(fn).toHaveBeenCalledTimes(1)
    })

    it('retries on failure and eventually succeeds', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce({ data: 'recovered' })
        const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10 })
        expect(result).toEqual({ data: 'recovered' })
        expect(fn).toHaveBeenCalledTimes(2)
    })

    it('throws after exhausting retries', async () => {
        const error = new Error('persistent failure')
        const fn = vi.fn().mockRejectedValue(error)
        await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 })).rejects.toThrow('persistent failure')
        expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
    })

    it('does not retry when shouldRetry returns false', async () => {
        const fn = vi.fn().mockRejectedValue({ status: 401 })
        await expect(withRetry(fn, {
            maxRetries: 3,
            baseDelay: 10,
            shouldRetry: () => false
        })).rejects.toEqual({ status: 401 })
        expect(fn).toHaveBeenCalledTimes(1)
    })

    it('detects Supabase response errors', async () => {
        const fn = vi.fn().mockResolvedValue({ data: null, error: { message: 'RLS denied' } })
        await expect(withRetry(fn, { maxRetries: 1, baseDelay: 10 })).rejects.toEqual({ message: 'RLS denied' })
    })
})

describe('isRetryable', () => {
    it('returns false for 401 errors', () => {
        expect(isRetryable({ status: 401 })).toBe(false)
    })

    it('returns false for 403 errors', () => {
        expect(isRetryable({ status: 403 })).toBe(false)
    })

    it('returns false for PostgREST errors', () => {
        expect(isRetryable({ code: 'PGRST116' })).toBe(false)
    })

    it('returns true for network errors', () => {
        expect(isRetryable(new Error('fetch failed'))).toBe(true)
    })

    it('returns true for 500 errors', () => {
        expect(isRetryable({ status: 500 })).toBe(true)
    })
})

// ── validateUsername ────────────────────────────────────────────────────────

import { validateUsername } from '../utils/validateUsername'

describe('validateUsername', () => {
    it('accepts valid usernames', () => {
        expect(validateUsername('cinephile_42').valid).toBe(true)
        expect(validateUsername('the_archivist').valid).toBe(true)
    })

    it('rejects usernames shorter than 3 characters', () => {
        const result = validateUsername('ab')
        expect(result.valid).toBe(false)
        expect(result.error).toContain('at least 3')
    })

    it('rejects usernames longer than 30 characters', () => {
        const result = validateUsername('a'.repeat(31))
        expect(result.valid).toBe(false)
        expect(result.error).toContain('30 characters')
    })

    it('rejects reserved words', () => {
        expect(validateUsername('admin').valid).toBe(false)
        expect(validateUsername('system').valid).toBe(false)
        expect(validateUsername('reelhouse').valid).toBe(false)
    })

    it('strips invalid characters and lowercases', () => {
        const result = validateUsername('User@Name!')
        expect(result.sanitized).toBe('username')
    })

    it('rejects underscores at start/end', () => {
        expect(validateUsername('_hello').valid).toBe(false)
        expect(validateUsername('hello_').valid).toBe(false)
    })

    it('rejects consecutive underscores', () => {
        expect(validateUsername('hello__world').valid).toBe(false)
    })
})


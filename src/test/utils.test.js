/**
 * ReelHouse Utility Function Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests pure utility functions from tmdb.js: URL builders, obscurity scoring,
 * runtime formatting, and year extraction.
 */

import { describe, it, expect } from 'vitest'
import { tmdb, obscurityScore, formatRuntime, getYear } from '../tmdb'

// ── TMDB URL Builders ─────────────────────────────────────────────────────────
describe('tmdb.poster()', () => {
    it('returns full poster URL for valid path', () => {
        const url = tmdb.poster('/abc123.jpg')
        expect(url).toContain('image.tmdb.org')
        expect(url).toContain('/abc123.jpg')
    })

    it('returns falsy for null path', () => {
        expect(tmdb.poster(null)).toBeFalsy()
    })

    it('returns falsy for undefined path', () => {
        expect(tmdb.poster(undefined)).toBeFalsy()
    })

    it('accepts optional size parameter', () => {
        const url = tmdb.poster('/abc.jpg', 'original')
        expect(url).toContain('original')
        expect(url).toContain('/abc.jpg')
    })
})

describe('tmdb.profile()', () => {
    it('returns profile URL for valid path', () => {
        const url = tmdb.profile('/profile123.jpg')
        expect(url).toContain('image.tmdb.org')
        expect(url).toContain('/profile123.jpg')
    })

    it('returns falsy for null path', () => {
        expect(tmdb.profile(null)).toBeFalsy()
    })
})

describe('tmdb.backdrop()', () => {
    it('returns backdrop URL for valid path', () => {
        const url = tmdb.backdrop('/bg123.jpg')
        expect(url).toContain('image.tmdb.org')
        expect(url).toContain('w1280')
    })

    it('returns falsy for null path', () => {
        expect(tmdb.backdrop(null)).toBeFalsy()
    })
})

// ── Obscurity Score ───────────────────────────────────────────────────────────
describe('obscurityScore()', () => {
    it('returns a number for a standard movie', () => {
        const score = obscurityScore({ popularity: 50, vote_count: 1000 })
        expect(typeof score).toBe('number')
    })

    it('higher obscurity for less popular movies', () => {
        const popular = obscurityScore({ popularity: 100 })
        const obscure = obscurityScore({ popularity: 2 })
        expect(obscure).toBeGreaterThan(popular)
    })

    it('returns a score between 2 and 99', () => {
        const score = obscurityScore({ popularity: 30 })
        expect(score).toBeGreaterThanOrEqual(2)
        expect(score).toBeLessThanOrEqual(99)
    })

    it('returns 99 for zero popularity (GHOST REEL)', () => {
        const score = obscurityScore({ popularity: 0 })
        expect(score).toBe(99)
    })

    it('returns low score (~2) for extremely popular movies', () => {
        const score = obscurityScore({ popularity: 5000 })
        expect(score).toBeLessThanOrEqual(10)
    })
})

// ── Format Runtime ────────────────────────────────────────────────────────────
describe('formatRuntime()', () => {
    it('formats 120 minutes as "2h 0m"', () => {
        expect(formatRuntime(120)).toBe('2h 0m')
    })

    it('formats 90 minutes as "1h 30m"', () => {
        expect(formatRuntime(90)).toBe('1h 30m')
    })

    it('formats sub-hour runtime without hours', () => {
        expect(formatRuntime(45)).toBe('45m')
    })

    it('returns em-dash for 0 minutes', () => {
        expect(formatRuntime(0)).toBe('—')
    })

    it('returns em-dash for null', () => {
        expect(formatRuntime(null)).toBe('—')
    })

    it('returns em-dash for undefined', () => {
        expect(formatRuntime(undefined)).toBe('—')
    })
})

// ── Get Year ──────────────────────────────────────────────────────────────────
describe('getYear()', () => {
    it('extracts year from ISO date string', () => {
        expect(getYear('2024-03-15')).toBe('2024')
    })

    it('handles year-only string', () => {
        expect(getYear('2020')).toBe('2020')
    })

    it('returns em-dash for empty string', () => {
        expect(getYear('')).toBe('—')
    })

    it('returns em-dash for null input', () => {
        expect(getYear(null)).toBe('—')
    })

    it('returns em-dash for undefined', () => {
        expect(getYear(undefined)).toBe('—')
    })
})

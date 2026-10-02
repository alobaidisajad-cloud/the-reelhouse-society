/**
 * A member's words are shown as they wrote them.
 * ─────────────────────────────────────────────────────────────────────────────
 * The web ran every stack's title and description through a filter the app
 * never had: it deleted "IMDb", "Letterboxd" and five other names from a
 * member's own words, and it printed a stack titled "2026" as "Untitled Stack"
 * (a title of digits was taken for a broken one). The same stack read one way
 * in the app and another here. The only filter left is the one that keeps HTML
 * safe to render.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as sanitize from '../utils/sanitize'

const SRC = join(__dirname, '..')
const read = (p: string) => readFileSync(join(SRC, p), 'utf8')

describe("a member's words are shown as written", () => {
    it('the one filter keeps HTML safe and touches no words', () => {
        expect(Object.keys(sanitize)).toEqual(['sanitizeHTML'])
        expect(sanitize.sanitizeHTML('My IMDb top 250, and 2026')).toBe('My IMDb top 250, and 2026')
    })

    it.each([
        ['pages/ListsPage.tsx', /\{list\.title\.toUpperCase\(\)\}/],
        ['components/profile/LedgerHelpers.tsx', /\{list\.title\.toUpperCase\(\)\}/],
        ['pages/ListDetailPage.tsx', /const title = rawTitle\b/],
    ])('%s prints the title the member gave', (file, shown) => {
        expect(read(file)).toMatch(shown)
    })
})

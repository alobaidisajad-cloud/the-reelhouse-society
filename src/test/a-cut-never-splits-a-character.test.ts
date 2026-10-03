/**
 * a-cut-never-splits-a-character.test.ts — a shortened text keeps whole characters.
 *
 * The website cut a salon reply's quote, a shared review and an error message
 * with `.slice`, which counts UTF-16 units: an emoji at the cut became half a
 * pair, a string Postgres refuses, and the reply or share with it failed.
 */
import { describe, it, expect } from 'vitest'
import { cutChars } from '../utils/cutChars'

describe('cutChars', () => {
    const quote = `${'a'.repeat(199)}🎬 and then the credits`

    it('keeps an emoji whole at the cut, where .slice split it', () => {
        expect(quote.slice(0, 200).endsWith('\ud83c')).toBe(true)   // the half .slice left
        expect(cutChars(quote, 200)).toBe(`${'a'.repeat(199)}🎬`)
    })

    it('leaves a short text as it was', () => {
        expect(cutChars('Rosebud.', 200)).toBe('Rosebud.')
    })

    it('every cut it makes is well formed — no half pair at either end', () => {
        const halfPair = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
        expect(halfPair.test(quote.slice(0, 200))).toBe(true)   // the detector sees the split
        for (let n = 195; n <= 205; n++) expect(halfPair.test(cutChars(quote, n))).toBe(false)
    })
})

/**
 * rankAgreesWithMobile.test.ts — two clients, one rank.
 * ─────────────────────────────────────────────────────────────────────────────
 * `utils/tier.ts` here is a deliberate copy of `mobile/src/utils/tier.ts`. The
 * two packages share no build, so it has to be — and a copy nobody checks is
 * exactly how one badge ended up with six dresses and three golds.
 *
 * This reads BOTH files and fails if the ladder, the words or the rule drift
 * apart. It is the only thing standing between "the same rank on both clients"
 * and "the same rank until somebody touches one of them".
 *
 * The bug it exists downstream of: the web decided rank with
 * `role === 'auteur'` — one of the THREE columns that carry standing — so a
 * founding member, an admin who pays, and anyone whose entitlement rides the
 * `tier` column were shown as unranked here while mobile marked them correctly.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
    TIER_WEIGHTS, resolveTier, rankOf, rankWord,
    isArchivistPlusTier, isAuteurPlusTier,
} from '../tier'

const MOBILE_TIER = join(__dirname, '..', '..', '..', 'mobile', 'src', 'utils', 'tier.ts')

describe('the ladder is the same on both clients', () => {
    it('can see mobile’s copy at all', () => {
        // Vacuous-guard insurance. Every assertion below reads that file; if the
        // path breaks they would all pass by comparing nothing.
        expect(existsSync(MOBILE_TIER)).toBe(true)
        expect(readFileSync(MOBILE_TIER, 'utf8')).toContain('TIER_WEIGHTS')
    })

    it('carries the same weights, including the two zeroes', () => {
        const src = readFileSync(MOBILE_TIER, 'utf8')
        const block = /TIER_WEIGHTS[^=]*=\s*\{([\s\S]*?)\}/.exec(src)
        expect(block).not.toBeNull()

        const theirs: Record<string, number> = {}
        for (const m of block![1].matchAll(/(\w+)\s*:\s*(\d+)/g)) theirs[m[1]] = Number(m[2])

        // free and cinephile are BOTH zero on purpose — one is the legacy
        // spelling of the other — and a copy that dropped one would silently
        // promote every legacy row.
        expect(theirs).toEqual(TIER_WEIGHTS)
        expect(theirs.free).toBe(0)
        expect(theirs.cinephile).toBe(0)
        expect(theirs.founding).toBeGreaterThan(theirs.auteur)
    })

    it('and mobile still applies the Highest Watermark rule this copies', () => {
        const src = readFileSync(MOBILE_TIER, 'utf8')
        expect(src).toMatch(/is_founding\s*\?\s*'founding'/)
        expect(src).toMatch(/tWeight\s*>=\s*rWeight/)
    })

    it('and the mark says the same two words', () => {
        const badge = readFileSync(
            join(__dirname, '..', '..', '..', 'mobile', 'src', 'components', 'RankBadge.tsx'), 'utf8')
        expect(badge).toContain('★ AUTEUR')
        expect(badge).toContain('✦ ARCHIVIST')

        const here = readFileSync(join(__dirname, '..', '..', 'components', 'RankBadge.tsx'), 'utf8')
        expect(here).toContain('★ AUTEUR')
        expect(here).toContain('✦ ARCHIVIST')
    })
})

describe('the three ways the old check was wrong', () => {
    it('a founding member is an Auteur, whatever their role says', () => {
        expect(rankOf({ role: 'cinephile', is_founding: true })).toBe('auteur')
        expect(isAuteurPlusTier({ role: 'archivist', is_founding: true })).toBe(true)
    })

    it('a paid entitlement on `tier` outranks a stale role', () => {
        expect(rankOf({ tier: 'auteur', role: 'cinephile' })).toBe('auteur')
        expect(rankOf({ tier: 'archivist', role: 'free' })).toBe('archivist')
    })

    it('an admin who pays keeps the tier they paid for', () => {
        // `admin` is a permission flag scoring zero, not a rank. Reading `role`
        // alone left this member unmarked.
        expect(rankOf({ tier: 'auteur', role: 'admin' })).toBe('auteur')
    })
})

describe('and it never guesses upward', () => {
    it('gives no rank to a member who has none', () => {
        expect(rankOf(null)).toBeNull()
        expect(rankOf(undefined)).toBeNull()
        expect(rankOf({ role: 'cinephile' })).toBeNull()
        expect(rankOf({ role: 'free' })).toBeNull()
        expect(rankOf({})).toBeNull()
    })

    it('treats a tier it does not recognise as no rank at all', () => {
        // A renamed plan or a typo from a payment webhook must never be read as
        // a promotion.
        expect(resolveTier({ tier: 'projectionist' })).toBe('cinephile')
        expect(rankOf({ tier: 'projectionist' })).toBeNull()
    })

    it('and says the rank aloud as a word, not as punctuation', () => {
        expect(rankWord(rankOf({ tier: 'auteur' }))).toBe('Auteur')
        expect(rankWord(rankOf({ tier: 'archivist' }))).toBe('Archivist')
        expect(rankWord(null)).toBeNull()
    })

    it('and an Archivist is not an Auteur', () => {
        expect(isArchivistPlusTier({ tier: 'archivist' })).toBe(true)
        expect(isAuteurPlusTier({ tier: 'archivist' })).toBe(false)
    })
})

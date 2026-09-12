/**
 * theTwoClientsSellTheSameThing.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Mobile's `constants/membership.ts` says it "matches web MembershipPage.tsx
 * exactly". Nothing had ever checked that, and by the time anybody looked the
 * two had drifted into selling three different lies:
 *
 *   THE GILDED FRAME     "Exclusive Animated Gold Borders" — sold on BOTH, built
 *                        on NEITHER. It existed in the two sales lists and
 *                        nowhere else in either codebase.
 *   POSTER GLOW          named nothing a member could find; the real feature is
 *                        the profile Backdrop
 *   GOLD FOIL BADGE      mobile removed it deliberately — the card draws the
 *                        real mark and the mark is not gold — web kept selling it
 *
 * A price list is the one document a member is entitled to hold us to. Two
 * copies of it with no check between them is how you end up charging for
 * something that does not exist.
 *
 * ── AND WHO IS LET THROUGH THE DOOR ─────────────────────────────────────────
 * The second half guards the other drift. `role` is ONE of the three columns
 * that carry standing — `profile_tier_weight` takes the GREATEST of tier, role
 * and the founding flag — so an ACCESS gate written as `role === 'auteur'`
 * refuses a member who BOUGHT the rank and every founding seat. Seven of those
 * were live on web, including the Lounge itself: people could pay and still be
 * locked out on the platform where they paid.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

const WEB_ROOT = join(__dirname, '..', '..')
const WEB_MEMBERSHIP = join(WEB_ROOT, 'pages', 'MembershipPage.tsx')
const MOBILE_MEMBERSHIP = join(__dirname, '..', '..', '..', 'mobile', 'src', 'constants', 'membership.ts')

/** Comments blanked first — every note explaining a removal names the thing removed. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ')

const tidy = (v: string) => v.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * The feature lines, taken STRUCTURALLY rather than by guessing which quoted
 * strings look like prose.
 *
 * The first version of this matched any quoted string with both cases in it and
 * no slash, and duly reported `, fontSize:` and `}} onClick={() => navigate(`
 * as features the two platforms disagreed about. A heuristic that cannot tell
 * copy from code is not a comparison, it is noise with an assertion on the end.
 *
 * Web writes its lists inline as `{[ … ].map((feature, i) =>`; mobile writes
 * `features: [ … ]` plus a `featuredFeature` title. Both are read from those
 * shapes and nothing else.
 */
const webFeatures = (src: string): Set<string> => {
    const out = new Set<string>()
    for (const block of strip(src).matchAll(/\{\s*\[([\s\S]*?)\]\s*\.map\(\s*\(\s*feature/g)) {
        for (const m of block[1].matchAll(/'([^']+)'/g)) out.add(tidy(m[1]))
    }
    // The two featured features are drawn separately, not from an array — and
    // their titles carry a <br/>, so the capture has to allow tags inside and
    // strip them afterwards. `[^<]+` stopped at the break and matched nothing.
    for (const m of strip(src).matchAll(/featured-feature-title[^>]*>([\s\S]*?)<\/div>/g)) {
        out.add(tidy(m[1].replace(/<[^>]+>/g, ' ')))
    }
    return out
}

const mobileFeatures = (src: string): Set<string> => {
    const out = new Set<string>()
    const code = strip(src)
    for (const block of code.matchAll(/features:\s*\[([\s\S]*?)\]/g)) {
        for (const m of block[1].matchAll(/'([^']+)'/g)) out.add(tidy(m[1]))
    }
    for (const m of code.matchAll(/featuredFeature:\s*\{[\s\S]*?title:\s*'([^']+)'/g)) {
        out.add(tidy(m[1]))
    }
    return out
}

describe('the two clients sell the same thing', () => {
    it('can see both price lists at all', () => {
        // Vacuous-guard insurance: every assertion below reads these two files,
        // so a broken path would make all of them pass by comparing nothing.
        expect(existsSync(WEB_MEMBERSHIP)).toBe(true)
        expect(existsSync(MOBILE_MEMBERSHIP)).toBe(true)
        expect(mobileFeatures(readFileSync(MOBILE_MEMBERSHIP, 'utf8')).size).toBeGreaterThan(8)
        expect(webFeatures(readFileSync(WEB_MEMBERSHIP, 'utf8')).size).toBeGreaterThan(8)
    })

    it('neither client still sells the three that were never built', () => {
        const both = strip(readFileSync(WEB_MEMBERSHIP, 'utf8')) + strip(readFileSync(MOBILE_MEMBERSHIP, 'utf8'))
        expect(both).not.toMatch(/Gilded Frame/)
        expect(both).not.toMatch(/Poster Glow/)
        expect(both).not.toMatch(/Gold Foil/)
    })

    it('every feature mobile sells, web sells too', () => {
        const mobile = mobileFeatures(readFileSync(MOBILE_MEMBERSHIP, 'utf8'))
        const web = webFeatures(readFileSync(WEB_MEMBERSHIP, 'utf8'))
        // Named, not counted — "2 differences" tells nobody which promise the
        // two platforms disagree about, and that is the whole point.
        const onlyMobile = [...mobile].filter((f) => !web.has(f))
        expect(onlyMobile).toEqual([])
    })

    it('and every feature web sells, mobile sells too', () => {
        const mobile = mobileFeatures(readFileSync(MOBILE_MEMBERSHIP, 'utf8'))
        const web = webFeatures(readFileSync(WEB_MEMBERSHIP, 'utf8'))
        const onlyWeb = [...web].filter((f) => !mobile.has(f))
        expect(onlyWeb).toEqual([])
    })
})

describe('who web lets through the door', () => {
    const collect = (dir: string, out: string[] = []): string[] => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, e.name)
            if (e.isDirectory()) {
                if (!['node_modules', '__tests__'].includes(e.name)) collect(full, out)
            } else if (/\.tsx?$/.test(e.name)) out.push(full)
        }
        return out
    }

    /**
     * An ACCESS gate — something whose value decides what a member may DO.
     * Display code may still match on `role` to paint a badge; that is a
     * separate, cosmetic drift and not this test's business.
     */
    const ACCESS = /\b(canWrite|isPremium|isArchivist|isAuteur|isArchivistPlus|isAuteurPlus|isEligible|hasAccess|canAccess|isLoungeEligible)\s*=\s*([^\n]*)/g

    it('no access gate decides a rank from `role` alone', () => {
        const offenders: string[] = []
        for (const file of collect(WEB_ROOT)) {
            const src = strip(readFileSync(file, 'utf8'))
            for (const m of src.matchAll(ACCESS)) {
                const rhs = m[2]
                if (/role\s*===|\[\s*'archivist'\s*,\s*'auteur'\s*\]\s*\.includes/.test(rhs)) {
                    offenders.push(`${file.slice(WEB_ROOT.length + 1).replace(/\\/g, '/')}  ${m[1]} = ${rhs.trim().slice(0, 70)}`)
                }
            }
        }
        expect(offenders).toEqual([])
    })

    it('the scan can SEE access gates — it is not passing on an empty read', () => {
        let found = 0
        for (const file of collect(WEB_ROOT)) {
            found += [...strip(readFileSync(file, 'utf8')).matchAll(ACCESS)].length
        }
        expect(found).toBeGreaterThanOrEqual(5)
    })

    it('and it would CATCH the shape it is looking for', () => {
        // The detector proved against the exact line that was live in
        // LoungePage before this change.
        const was = "const isArchivist = user?.role === 'archivist' || user?.role === 'auteur'"
        const hits = [...was.matchAll(ACCESS)].filter((m) => /role\s*===/.test(m[2]))
        expect(hits.length).toBe(1)
    })
})

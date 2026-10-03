/**
 * the-two-apps-keep-one-limit.test.ts — a field has one length, in both apps.
 *
 * The website's display-name box stopped at 30 for a name the app, its own
 * save check and the column all take at 50; its handle box said "3-20" for a
 * rule that is 3-30 everywhere else; its review box stopped at 2,000 against
 * a column of 5,000. Its LIMITS are now the app's MAX_LENGTHS, number for
 * number, and its boxes name them. (The app holds its boxes to its columns:
 * mobile everyCapAnswersToItsColumn and oneCapNotThree.)
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join, relative, sep } from 'path'
import { LIMITS, EMAIL_CODE_DIGITS } from '../utils/limits'
import { readCode, WEB_SRC } from './readCode'

const MOBILE = join(WEB_SRC, '..', 'mobile')
/** The app's MAX_LENGTHS, as written: `key: n` inside the object. */
const appCaps = (() => {
    const src = readCode(join(MOBILE, 'src', 'utils', 'sanitizeInput.ts'))
    const body = src.slice(src.indexOf('export const MAX_LENGTHS = {'), src.indexOf('} as const;', src.indexOf('export const MAX_LENGTHS = {')))
    return new Map([...body.matchAll(/^\s*(\w+):\s*(\d+),/gm)].map((m) => [m[1], Number(m[2])]))
})()

describe('the website keeps the app\'s limits', () => {
    it('reads the app\'s caps at all', () => {
        expect(appCaps.size).toBeGreaterThan(30)
        expect(appCaps.get('review')).toBe(5000)
    })

    it('every website limit is the app\'s, number for number', () => {
        const differ = Object.entries(LIMITS)
            .filter(([k, v]) => appCaps.get(k) !== v)
            .map(([k, v]) => `${k}: website ${v}, app ${appCaps.get(k) ?? 'none'}`)
        expect(differ).toEqual([])
    })

    it('and the email code is the same length in both', () => {
        const inputs = readCode(join(MOBILE, 'src', 'constants', 'inputLimits.ts'))
        expect(inputs).toMatch(new RegExp(`EMAIL_CODE_DIGITS = ${EMAIL_CODE_DIGITS};`))
    })
})

describe('the website\'s boxes name their limit', () => {
    const files = (dir: string, out: string[] = []): string[] => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, e.name)
            if (e.isDirectory()) { if (e.name !== 'test' && e.name !== '__tests__' && e.name !== 'node_modules') files(full, out) }
            else if (/\.(tsx|jsx)$/.test(e.name)) out.push(full)
        }
        return out
    }

    it('no box types a number of its own', () => {
        const all = files(WEB_SRC)
        expect(all.length).toBeGreaterThan(100)
        const typed = all.flatMap((f) => [...readCode(f).matchAll(/maxLength=\{?\d+\}?/g)]
            .map((m) => `${relative(WEB_SRC, f).split(sep).join('/')}: ${m[0]}`))
        expect(typed).toEqual([])
    })
})

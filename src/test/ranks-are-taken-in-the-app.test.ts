/**
 * Ranks are taken in the app — the website offers no checkout it cannot keep.
 * ─────────────────────────────────────────────────────────────────────────────
 * The membership page sold the Archivist, the Auteur and a founding seat
 * through a PayTabs checkout that no merchant account stood behind: it could
 * never open, and said "Try again" each time. The Terms, the Privacy Policy and
 * the Support page all say ranks are bought through the App Store or Google
 * Play, so the page now says where ranks are taken, and links to the stores
 * once their addresses are written in constants/stores.ts.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const SRC = join(__dirname, '..')
const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'test' || name === '__tests__') continue
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p, out)
        else if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(p)
    }
    return out
}

describe('ranks are taken in the app', () => {
    it('no page asks the checkout to open', () => {
        const callers = walk(SRC).filter((f) => /paytabs-handler/.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f))
        expect(callers).toEqual([])
    })

    it('the membership page says where each rank is taken', () => {
        const page = readFileSync(join(SRC, 'pages', 'MembershipPage.tsx'), 'utf8')
        expect(page.match(/<TakenInTheApp\b/g)).toHaveLength(3)
        expect(page).toMatch(/through the App Store or Google Play/)
    })
})

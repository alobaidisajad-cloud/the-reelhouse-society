/**
 * the-front-desk-answers.test.tsx — the website's half of the front desk.
 *
 * /support is the page the App Store and Google Play list as the Support URL,
 * and the one the app opens from Settings. It must:
 *   - give the address, and a way to write that works (mailto) or copy it;
 *   - answer the common questions by naming the app's REAL buttons — so every
 *     label it names is looked up in the app's source here;
 *   - agree with the app about the address, and be the only place on the site
 *     that types it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import SupportPage, { APP_LABELS } from '../pages/SupportPage'
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../constants/support'

const WEB = join(__dirname, '..', '..')
const MOBILE = join(WEB, 'mobile')

function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '__tests__' || name === 'test' || name.startsWith('.')) continue
        const path = join(dir, name)
        if (statSync(path).isDirectory()) sources(path, out)
        else if (/\.(ts|tsx|js|jsx)$/.test(name) && !/\.test\./.test(name)) out.push(path)
    }
    return out
}

const mount = () => render(
    <HelmetProvider>
        <MemoryRouter initialEntries={['/support']}>
            <SupportPage />
        </MemoryRouter>
    </HelmetProvider>,
)

describe('the front desk', () => {
    const writeText = vi.fn()
    beforeEach(() => {
        writeText.mockReset()
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    })
    afterEach(() => { window.location.hash = '' })

    it('gives the address, as a letter already addressed', () => {
        mount()
        const address = screen.getByRole('link', { name: SUPPORT_EMAIL })
        expect(address.getAttribute('href')).toBe(SUPPORT_MAILTO)
        expect(screen.getByRole('link', { name: /write a letter/i }).getAttribute('href')).toBe(SUPPORT_MAILTO)
        expect(SUPPORT_MAILTO).toBe(`mailto:${SUPPORT_EMAIL}?subject=A%20letter%20to%20the%20front%20desk`)
    })

    it('copies the address, and says so where a screen reader will hear it', async () => {
        writeText.mockResolvedValue(undefined)
        mount()
        fireEvent.click(screen.getByRole('button', { name: /copy address/i }))
        await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/on your clipboard/))
        expect(writeText).toHaveBeenCalledWith(SUPPORT_EMAIL)
        expect(screen.getByRole('button', { name: /copied/i })).toBeTruthy()
    })

    it('and when the browser refuses, tells the reader what to do instead', async () => {
        writeText.mockRejectedValue(new Error('denied'))
        mount()
        fireEvent.click(screen.getByRole('button', { name: /copy address/i }))
        await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/select the address/))
        expect(screen.queryByRole('button', { name: /copied/i })).toBeNull()
    })

    it('and when there is no clipboard at all', async () => {
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
        mount()
        fireEvent.click(screen.getByRole('button', { name: /copy address/i }))
        await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/select the address/))
    })

    it('the "Copied" mark goes back to "Copy address" on its own', async () => {
        vi.useFakeTimers()
        try {
            writeText.mockResolvedValue(undefined)
            mount()
            await act(async () => { fireEvent.click(screen.getByRole('button', { name: /copy address/i })) })
            expect(screen.getByRole('button', { name: /copied/i })).toBeTruthy()
            await act(async () => { vi.advanceTimersByTime(2500) })
            expect(screen.getByRole('button', { name: /copy address/i })).toBeTruthy()
        } finally {
            vi.useRealTimers()
        }
    })

    it('answers the six questions a desk is asked most, each with its own link', () => {
        const { container } = mount()
        const ids = [...container.querySelectorAll('details')].map(d => d.id)
        expect(ids).toEqual(['restore', 'cancel', 'refund', 'delete', 'data', 'sign-in'])
        // All shut until asked.
        expect(container.querySelectorAll('details[open]')).toHaveLength(0)
    })

    it('a link straight to one answer opens that answer', () => {
        window.location.hash = '#refund'
        Element.prototype.scrollIntoView = vi.fn()
        const { container } = mount()
        expect([...container.querySelectorAll('details[open]')].map(d => d.id)).toEqual(['refund'])
    })

    it('refunds point at Apple’s and Google’s own pages, in a new tab', () => {
        mount()
        const apple = screen.getByRole('link', { name: 'reportaproblem.apple.com' })
        expect(apple.getAttribute('href')).toBe('https://reportaproblem.apple.com')
        const google = screen.getByRole('link', { name: /google play refund help/i })
        expect(google.getAttribute('href')).toMatch(/^https:\/\/support\.google\.com\/googleplay\//)
        for (const a of [apple, google]) expect(a.getAttribute('rel')).toMatch(/noopener/)
    })

    it('warns that deleting an account does not stop a subscription', () => {
        mount()
        expect(screen.getByText(/does not cancel a subscription/)).toBeTruthy()
    })

    it('ends at the Terms and the Privacy Policy — in an element phones still show', () => {
        // mobile.css hides every <footer> on phones; the links were invisible there.
        const { container } = mount()
        expect(container.querySelector('footer')).toBeNull()
        expect(readFileSync(join(WEB, 'src', 'styles', 'mobile.css'), 'utf8')).not.toMatch(/(^|[\s,])nav\s*\{[^}]*display:\s*none/)
        expect(screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe('/terms')
        expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe('/privacy')
    })
})

describe('every button it names is a real button in the app', () => {
    const app = [...sources(join(MOBILE, 'src')), ...sources(join(MOBILE, 'app'))]
        .map(f => readFileSync(f, 'utf8'))
        .join('\n')
        .toLowerCase()

    it('reads the whole app, not a file I remembered', () => {
        expect(app.length).toBeGreaterThan(1_000_000)
    })

    for (const [key, label] of Object.entries(APP_LABELS)) {
        it(`“${label}” (${key})`, () => {
            expect(app.includes(label.toLowerCase())).toBe(true)
        })
    }

    it('and the answers use the list, never a name typed out by hand', () => {
        const page = readFileSync(join(WEB, 'src', 'pages', 'SupportPage.tsx'), 'utf8')
        const body = page.slice(page.indexOf('export default function SupportPage'))
        for (const label of Object.values(APP_LABELS)) {
            if (label === 'Settings') continue // also the iPhone's own Settings app, named as such
            expect(body.includes(`'${label}'`)).toBe(false)
            expect(body.includes(`>${label}<`)).toBe(false)
        }
    })
})

describe('one address, said once, on both clients', () => {
    it('the website and the app give the same address', () => {
        const mobile = readFileSync(join(MOBILE, 'src', 'constants', 'support.ts'), 'utf8')
        expect(mobile).toContain(`export const SUPPORT_EMAIL = '${SUPPORT_EMAIL}';`)
    })

    it('the page the app opens is the page this site serves', () => {
        const mobile = readFileSync(join(MOBILE, 'src', 'constants', 'support.ts'), 'utf8')
        const url = mobile.match(/export const SUPPORT_URL = '([^']+)'/)![1]
        expect(new URL(url).pathname).toBe('/support')
        const appRoutes = readFileSync(join(WEB, 'src', 'App.tsx'), 'utf8')
        expect(appRoutes).toMatch(/<Route path="\/support" element=\{<ErrorBoundary key="support"><PageWrapper><SupportPage \/>/)
        expect(readFileSync(join(WEB, 'public', 'sitemap.xml'), 'utf8')).toContain('<loc>https://thereelhousesociety.com/support</loc>')
    })

    it('the site types the address in one file only', () => {
        const files = sources(join(WEB, 'src'))
        expect(files.length).toBeGreaterThan(100)
        const typed = files
            .filter(f => /support@/i.test(readFileSync(f, 'utf8')))
            .map(f => relative(WEB, f).replace(/\\/g, '/'))
        expect(typed).toEqual(['src/constants/support.ts'])
    })

    it('and wherever the legal pages give it, it can be pressed', () => {
        for (const f of ['TermsOfServicePage.tsx', 'PrivacyPolicyPage.tsx']) {
            const src = readFileSync(join(WEB, 'src', 'pages', f), 'utf8')
            expect(src).toContain('<a href={`mailto:${SUPPORT_EMAIL}`}')
        }
    })
})

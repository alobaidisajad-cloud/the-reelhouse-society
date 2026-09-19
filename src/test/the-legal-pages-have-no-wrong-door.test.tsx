/**
 * the-legal-pages-have-no-wrong-door.test.tsx
 *
 * The app opens the Terms and the Privacy Policy in its in-app browser, straight
 * to the page. Both pages said "BACK TO SETTINGS" and linked into the website's
 * Settings — behind a sign-in, from inside the app. The way back now appears
 * only when this visit has somewhere to go back to, and goes there.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { readFileSync } from 'fs'
import { join } from 'path'
import LegalBack from '../components/LegalBack'

const page = (entries: string[], index: number) =>
    render(
        <MemoryRouter initialEntries={entries} initialIndex={index}>
            <Routes>
                <Route path="/" element={<div>the lobby</div>} />
                <Route path="/terms" element={<LegalBack />} />
            </Routes>
        </MemoryRouter>,
    )

describe('the legal pages have no wrong door', () => {
    it('opened straight to the page (as the app does), there is no way back to offer', () => {
        page(['/terms'], 0)
        expect(screen.queryByRole('button', { name: /back/i })).toBeNull()
    })

    it('reached from inside the site, it goes back to where the reader was', () => {
        page(['/', '/terms'], 1)
        fireEvent.click(screen.getByRole('button', { name: /back/i }))
        expect(screen.getByText('the lobby')).toBeTruthy()
    })

    it('both pages use it, and neither links to Settings any more', () => {
        for (const f of ['TermsOfServicePage.tsx', 'PrivacyPolicyPage.tsx']) {
            const src = readFileSync(join(__dirname, '..', 'pages', f), 'utf8')
            expect(src).toMatch(/<LegalBack \/>/)
            expect(src).not.toMatch(/to="\/settings"|BACK TO SETTINGS/)
        }
    })
})

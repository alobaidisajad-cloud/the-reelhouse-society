/**
 * An account is deleted from the website, as from the app.
 * ─────────────────────────────────────────────────────────────────────────────
 * The website's DELETE ACCOUNT asked "are you absolutely certain?" and then
 * said only "Account deletion requires admin intervention". Now it does what
 * the app does: confirmed, proved by a code sent to the account's email, then
 * the one erasure (request_account_deletion), then signed out.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'

const mocks = vi.hoisted(() => ({
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    rpc: vi.fn(),
    logout: vi.fn(),
    navigate: vi.fn(),
}))

vi.mock('../supabaseClient', () => ({
    isSupabaseConfigured: true,
    supabase: {
        auth: { signInWithOtp: mocks.signInWithOtp, verifyOtp: mocks.verifyOtp, updateUser: vi.fn() },
        rpc: mocks.rpc,
        from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
    },
}))
vi.mock('../store', () => {
    const user = { id: 'u1', username: 'vesper', email: 'vesper@example.com', role: 'cinephile', tier: 'cinephile', preferences: {}, created_at: '2026-01-01T00:00:00Z' }
    const authState = { user, isAuthenticated: true, logout: mocks.logout, updateUser: vi.fn() }
    const useAuthStore = Object.assign((sel?: (s: typeof authState) => unknown) => (sel ? sel(authState) : authState), { getState: () => authState })
    const filmState = { logs: [], watchlist: [], lists: [] }
    const useFilmStore = Object.assign((sel?: (s: typeof filmState) => unknown) => (sel ? sel(filmState) : filmState), { getState: () => filmState })
    return { useAuthStore, useFilmStore }
})
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => mocks.navigate }))
vi.mock('../utils/reelToast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }))

import SettingsPage from '../pages/SettingsPage'

const mount = () => render(<HelmetProvider><MemoryRouter><SettingsPage /></MemoryRouter></HelmetProvider>)

beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mocks.signInWithOtp.mockResolvedValue({ error: null })
    mocks.verifyOtp.mockResolvedValue({ error: null })
    mocks.rpc.mockResolvedValue({ error: null })
    mocks.logout.mockResolvedValue(undefined)
})

describe('deleting an account on the website', () => {
    it('sends a code to the account, and erases only on the right one', async () => {
        mount()
        await act(async () => { fireEvent.click(screen.getByText(/DELETE ACCOUNT/)) })
        expect(mocks.signInWithOtp).toHaveBeenCalledWith({ email: 'vesper@example.com', options: { shouldCreateUser: false } })
        fireEvent.change(screen.getByLabelText(/THE CODE SENT TO/), { target: { value: '123456' } })
        await act(async () => { fireEvent.click(screen.getByText(/ERASE MY ACCOUNT/)) })
        expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: 'vesper@example.com', token: '123456', type: 'email' })
        expect(mocks.rpc).toHaveBeenCalledWith('request_account_deletion')
        await waitFor(() => expect(mocks.logout).toHaveBeenCalled())
        expect(mocks.navigate).toHaveBeenCalledWith('/')
    })

    it('a wrong code erases nothing, and says so', async () => {
        mocks.verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } })
        mount()
        await act(async () => { fireEvent.click(screen.getByText(/DELETE ACCOUNT/)) })
        fireEvent.change(screen.getByLabelText(/THE CODE SENT TO/), { target: { value: '000000' } })
        await act(async () => { fireEvent.click(screen.getByText(/ERASE MY ACCOUNT/)) })
        expect(mocks.rpc).not.toHaveBeenCalledWith('request_account_deletion')
        expect(mocks.logout).not.toHaveBeenCalled()
        expect(screen.getByRole('alert').textContent).toMatch(/not right, or it has expired/)
    })

    it('a change of mind erases nothing', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false)
        mount()
        await act(async () => { fireEvent.click(screen.getByText(/DELETE ACCOUNT/)) })
        expect(mocks.signInWithOtp).not.toHaveBeenCalled()
        expect(screen.queryByLabelText(/THE CODE SENT TO/)).toBeNull()
    })
})

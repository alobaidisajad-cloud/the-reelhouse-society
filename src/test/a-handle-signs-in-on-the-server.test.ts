/**
 * A member signs in on the website by handle, as in the app.
 * ─────────────────────────────────────────────────────────────────────────────
 * The sign-in page looked the address up itself with get_email_by_username,
 * which the database closed to browsers in June (it told anyone a member's
 * email). Every sign-in by handle has said "No account found" since. A handle
 * now goes to the sign-in-with-username function, which signs in on the server
 * and hands back only the session; the address never reaches the page.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    invoke: vi.fn(),
    setSession: vi.fn(),
    signInWithPassword: vi.fn(),
    rpc: vi.fn(),
}))

vi.mock('../supabaseClient', () => ({
    isSupabaseConfigured: true,
    supabase: {
        auth: { signInWithPassword: mocks.signInWithPassword, setSession: mocks.setSession },
        functions: { invoke: mocks.invoke },
        rpc: mocks.rpc,
        from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
    },
}))

import { useAuthStore } from '../stores/auth'

const USER = { id: 'u1', email: 'vesper@example.com' }
const SESSION = { access_token: 'a', refresh_token: 'r', user: USER }

beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ user: null, isAuthenticated: false })
    mocks.invoke.mockResolvedValue({ data: { access_token: 'a', refresh_token: 'r' }, error: null })
    mocks.setSession.mockResolvedValue({ data: { user: USER, session: SESSION }, error: null })
    mocks.signInWithPassword.mockResolvedValue({ data: { user: USER, session: SESSION }, error: null })
})

describe('signing in on the website', () => {
    it('a handle is signed in by the server, and the page never asks for the address', async () => {
        await useAuthStore.getState().login('@vesper', 'pw')
        expect(mocks.invoke).toHaveBeenCalledWith('sign-in-with-username', { body: { username: 'vesper', password: 'pw' } })
        expect(mocks.setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' })
        expect(mocks.rpc).not.toHaveBeenCalled()
        expect(mocks.signInWithPassword).not.toHaveBeenCalled()
        expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })

    it('an address signs in with its password directly', async () => {
        await useAuthStore.getState().login('vesper@example.com', 'pw')
        expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'vesper@example.com', password: 'pw' })
        expect(mocks.invoke).not.toHaveBeenCalled()
    })

    it('a wrong handle or password gets the same words as a wrong address, and nobody is signed in', async () => {
        mocks.invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsHttpError', context: { status: 401 } } })
        await expect(useAuthStore.getState().login('vesper', 'wrong')).rejects.toThrow('Invalid login credentials')
        expect(mocks.setSession).not.toHaveBeenCalled()
        expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })

    it('too many tries and no connection are each said as what they are', async () => {
        mocks.invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsHttpError', context: { status: 429 } } })
        await expect(useAuthStore.getState().login('vesper', 'pw')).rejects.toThrow(/Too many attempts/)
        mocks.invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsFetchError' } })
        await expect(useAuthStore.getState().login('vesper', 'pw')).rejects.toThrow(/Could not reach the House/)
    })
})

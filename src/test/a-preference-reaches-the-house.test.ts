/**
 * A preference set on the website reaches the house, as one set in the app does.
 * ─────────────────────────────────────────────────────────────────────────────
 * Members may not write profiles.preferences; the app sends preferences through
 * update_my_preferences, which merges them on the server. The website wrote the
 * column directly, was refused, and never read the refusal: no setting, no
 * notification choice, no profile triptych chosen on the website was ever kept.
 * Its 1.5 s throttle also dropped every change after the first in a burst, so
 * the settings page's six choices sent one. The onboarding wrote "taste seeds"
 * to another column members may not write, which nothing reads.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), update: vi.fn(), signOut: vi.fn(), toastError: vi.fn() }))
vi.mock('../supabaseClient', () => ({
    isSupabaseConfigured: true,
    supabase: {
        rpc: mocks.rpc,
        auth: { signOut: mocks.signOut },
        from: () => ({ update: (row: unknown) => { mocks.update(row); return { eq: () => Promise.resolve({ error: null }) } } }),
    },
}))
vi.mock('../utils/reelToast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: mocks.toastError, info: vi.fn() }) }))

import { useAuthStore } from '../stores/auth'

const ME = { id: 'u1', username: 'vesper', preferences: { theme: 'noir' } }

beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    mocks.signOut.mockResolvedValue({ error: null })
    useAuthStore.setState({ user: { ...ME } as never, isAuthenticated: true })
})
afterEach(() => { vi.useRealTimers() })

describe('preferences on the website', () => {
    it('a burst of changes is sent once, every key in it, through the server’s merge', async () => {
        const { setPreference } = useAuthStore.getState()
        await setPreference('notif_follows', false)
        await setPreference('notif_comments', true)
        await setPreference('notif_system', false)
        expect(mocks.rpc).not.toHaveBeenCalled()
        await vi.runAllTimersAsync()
        expect(mocks.rpc).toHaveBeenCalledTimes(1)
        expect(mocks.rpc).toHaveBeenCalledWith('update_my_preferences', { p_preferences: { notif_follows: false, notif_comments: true, notif_system: false } })
        expect(mocks.update).not.toHaveBeenCalled()
        expect(useAuthStore.getState().user?.preferences).toEqual({ theme: 'noir', notif_follows: false, notif_comments: true, notif_system: false })
    })

    it('a refused change is put back as it was, and the member is told', async () => {
        mocks.rpc.mockResolvedValue({ data: null, error: { message: 'denied' } })
        await useAuthStore.getState().setPreference('theme', 'daylight')
        expect(useAuthStore.getState().user?.preferences?.theme).toBe('daylight')
        await vi.runAllTimersAsync()
        expect(useAuthStore.getState().user?.preferences?.theme).toBe('noir')
        expect(mocks.toastError).toHaveBeenCalledWith('Your setting could not be saved. Please try again.')
    })

    it('signing out sends a change made a moment before, while the session can', async () => {
        const location = window.location
        Object.defineProperty(window, 'location', { configurable: true, value: { ...location, href: '' } })
        await useAuthStore.getState().setPreference('onboarded', true)
        await useAuthStore.getState().logout()
        expect(mocks.rpc).toHaveBeenCalledWith('update_my_preferences', { p_preferences: { onboarded: true } })
        expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.signOut.mock.invocationCallOrder[0])
        Object.defineProperty(window, 'location', { configurable: true, value: location })
    })
})

describe('no website write names a column members may not write', () => {
    // profiles columns members may NOT update (live: has_column_privilege(authenticated, …, 'UPDATE') = false).
    const CLOSED = ['preferences', 'taste_seeds', 'badges', 'role', 'tier', 'is_founding_member', 'suspended_until']
    it('every profiles update in the website sends only columns members may write', () => {
        const files: string[] = []
        const walk = (d: string) => readdirSync(d).forEach((e) => {
            const p = join(d, e)
            if (statSync(p).isDirectory()) { if (e !== 'test' && e !== '__tests__') walk(p) } else if (/\.(ts|tsx)$/.test(e)) files.push(p)
        })
        walk(join(__dirname, '..'))
        const strays: string[] = []
        for (const f of files) {
            const src = readFileSync(f, 'utf8')
            for (const m of src.matchAll(/from\(\s*'profiles'\s*\)/g)) {
                const chain = src.slice(m.index, m.index + 240)
                if (!/\.update\(/.test(chain)) continue
                for (const col of CLOSED) if (new RegExp(`\\b${col}\\s*:`).test(chain)) strays.push(`${f.split(/[\\/]src[\\/]/).pop()}: ${col}`)
            }
        }
        expect(strays).toEqual([])
    })
})

/**
 * a-profile-is-written-once.test.tsx — the website's profile save writes the row once.
 *
 * After writing the profile, the page called the auth store's updateUser,
 * which wrote it AGAIN — with the handle as typed rather than the sanitized one
 * the availability check had just cleared — and, inside its 1.5-second throttle,
 * answered a successful save with "Saving too frequently". The member's copy
 * now takes what was written, and the row is written once.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const db = vi.hoisted(() => ({ updates: [] as Record<string, unknown>[] }))

vi.mock('../supabaseClient', () => {
    const chain = (table: string) => ({
        update: (values: Record<string, unknown>) => ({
            eq: async () => { if (table === 'profiles') db.updates.push(values); return { error: null } },
        }),
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }), neq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), ilike: () => ({ neq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }), maybeSingle: async () => ({ data: null, error: null }) }) }),
    })
    return {
        isSupabaseConfigured: true,
        supabase: { from: chain, rpc: async () => ({ data: null, error: null }), auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
    }
})
vi.mock('../utils/reelToast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }))
vi.mock('../components/profile/ProfileTriptych', () => ({ ProfileTriptych: () => null }))
vi.mock('../components/Buster', () => ({ default: () => null }))
vi.mock('../components/PageSEO', () => ({ default: () => null }))

import EditProfilePage from '../pages/EditProfilePage'
import { useAuthStore } from '../store'

beforeEach(() => {
    db.updates = []
    useAuthStore.setState({
        user: { id: 'm1', username: 'kane', display_name: 'Kane', bio: 'Rosebud.', avatar_url: undefined, role: 'free', social_links: [] },
    } as never)
})

describe('saving a profile on the website', () => {
    it('writes the row once, and the member\'s copy takes what was written', async () => {
        render(<MemoryRouter><EditProfilePage /></MemoryRouter>)
        fireEvent.change(screen.getByDisplayValue('Rosebud.'), { target: { value: '  Rosebud, again.  ' } })
        fireEvent.click(screen.getByText(/SAVE PROFILE/))
        await waitFor(() => expect(db.updates.length).toBeGreaterThan(0))
        // A moment for any second write to land.
        await new Promise((r) => setTimeout(r, 20))
        expect(db.updates).toEqual([expect.objectContaining({ bio: 'Rosebud, again.', display_name: 'Kane' })])
        expect(useAuthStore.getState().user).toEqual(expect.objectContaining({ bio: 'Rosebud, again.', username: 'kane' }))
    })
})

/**
 * the-screen-says-only-what-the-house-holds.test.tsx — what the website shows a
 * member about their own account is what the database holds.
 *
 * Six ways it said otherwise:
 * - Signing in cut the member the sign-in listener had just loaded back to the
 *   bare auth record (no handle, no rank), and a failed profile read left it so.
 * - A persona chosen at sign-up was lost whenever the address had to be
 *   confirmed first: there was no session to write it with, and nothing kept it.
 * - After a password reset the member arrived signed out until a reload.
 * - A refused shelf removal was answered "removed from archive".
 * - Following a private member from the member search said FOLLOWING, though
 *   the database had made it a request.
 * - A profile page's follow button said "Now following" or "Unfollowed" after
 *   the store had rolled a failure back, and moved the follower count anyway.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

type Query = { table: string; op: string; one: boolean; filters: Record<string, unknown>; values?: unknown; columns?: string }
type Answer = { data: unknown; error: unknown }

const db = vi.hoisted(() => ({
    respond: (_q: Query): Answer => ({ data: [], error: null }),
    asked: [] as Query[],
    listeners: [] as ((event: string, session: unknown) => unknown)[],
    initialSession: null as unknown,
    updateUser: vi.fn(async (_a: unknown) => ({ data: { user: null }, error: null })),
    signInWithPassword: vi.fn(),
}))

vi.mock('../supabaseClient', () => {
    const from = (table: string) => {
        const q: Query = { table, op: 'select', one: false, filters: {} }
        const b: Record<string, unknown> = {}
        for (const m of ['neq', 'in', 'or', 'order', 'limit', 'range', 'ilike', 'abortSignal', 'gte', 'not', 'is', 'lt', 'lte', 'gt', 'filter', 'contains']) b[m] = () => b
        b.select = (columns?: string) => { if (q.op === 'select') q.columns = columns; return b }
        b.eq = (col: string, val: unknown) => { q.filters[col] = val; return b }
        for (const m of ['insert', 'update', 'delete', 'upsert']) b[m] = (values?: unknown) => { q.op = m; q.values = values; return b }
        b.single = b.maybeSingle = () => { q.one = true; return b }
        b.then = (res: (a: Answer) => unknown, rej: (e: unknown) => unknown) => {
            db.asked.push(q)
            return Promise.resolve(db.respond(q)).then(res, rej)
        }
        return b
    }
    return {
        isSupabaseConfigured: true,
        supabase: {
            from,
            rpc: async () => ({ data: null, error: null }),
            functions: { invoke: vi.fn() },
            channel: () => ({ on: () => ({ subscribe: vi.fn() }), subscribe: vi.fn() }),
            removeChannel: vi.fn(),
            removeAllChannels: vi.fn(),
            auth: {
                signInWithPassword: (...a: unknown[]) => db.signInWithPassword(...a),
                updateUser: (a: unknown) => db.updateUser(a),
                getSession: async () => ({ data: { session: db.initialSession }, error: null }),
                refreshSession: async () => ({ data: { session: db.initialSession }, error: null }),
                signOut: async () => ({ error: null }),
                // As supabase-js does: a new listener is handed the current session at once.
                onAuthStateChange: (cb: (event: string, session: unknown) => unknown) => {
                    db.listeners.push(cb)
                    void Promise.resolve().then(() => cb('INITIAL_SESSION', db.initialSession))
                    return { data: { subscription: { unsubscribe: () => { db.listeners = db.listeners.filter((l) => l !== cb) } } } }
                },
            },
        },
    }
})
vi.mock('../utils/reelToast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() }) }))
vi.mock('../components/Buster', () => ({ default: () => null }))
vi.mock('../components/PageSEO', () => ({ default: () => null }))
// The profile page, down to its follow button and the follower count it shows.
vi.mock('../features/profile/components/ProfileHeader', () => ({
    ProfileHeader: ({ handleFollow, profileUser }: { handleFollow: () => void; profileUser: { followersCount?: number } }) => (
        <div>
            <button onClick={handleFollow}>THE FOLLOW BUTTON</button>
            <span>{`FOLLOWERS ${profileUser?.followersCount}`}</span>
        </div>
    ),
}))
vi.mock('../features/profile/components/ProfileTabs', () => ({ ProfileTabs: () => null }))
vi.mock('../features/profile/components/ProfileContent', () => ({ ProfileContent: () => null }))
vi.mock('../components/profile/SocialModal', () => ({ default: () => null }))
vi.mock('../components/profile/ReviewModal', () => ({ default: () => null }))
vi.mock('../components/profile/CinemaDNACard', () => ({ CinemaDNACard: () => null }))
vi.mock('../components/profile/ShareCardOverlay', () => ({ ShareCardOverlay: () => null }))
vi.mock('../hooks/useProfileAnalytics', () => ({ useProfileAnalytics: () => ({ data: undefined }) }))

import reelToast from '../utils/reelToast'
import { useAuthStore } from '../stores/auth'
import { useFilmStore } from '../stores/films'
import MemberSearchDropdown from '../components/navbar/MemberSearchDropdown'
import ResetPasswordPage from '../pages/ResetPasswordPage'
import UserProfilePage from '../pages/UserProfilePage'
import { initAuthSync } from '../stores/realtime'

const settle = () => new Promise((r) => setTimeout(r, 0))
/** The suite runs many files at once; a wait gets room for a loaded machine. */
const PATIENCE = { timeout: 5000 }
vi.setConfig({ testTimeout: 20000 })
const AUTH_USER = { id: 'u1', email: 'vesper@example.com', user_metadata: {} as Record<string, unknown> }
const SESSION = { access_token: 'a', refresh_token: 'r', user: AUTH_USER }
const PROFILE = { id: 'u1', username: 'vesper', role: 'archivist', persona: 'The Archivist' }

beforeEach(() => {
    vi.clearAllMocks()
    db.asked = []
    db.listeners = []
    db.initialSession = null
    db.respond = () => ({ data: [], error: null })
    AUTH_USER.user_metadata = {}
    db.signInWithPassword.mockResolvedValue({ data: { user: AUTH_USER, session: SESSION }, error: null })
    useAuthStore.setState({ user: null, isAuthenticated: false })
    sessionStorage.clear()
})

describe('signing in', () => {
    it('keeps the member the sign-in listener already loaded, and a failed profile read never strips them', async () => {
        // The listener ran first, as supabase-js awaits it before sign-in returns.
        useAuthStore.setState({ user: { ...AUTH_USER, ...PROFILE, following: ['kane'], requested: [] } as never, isAuthenticated: true })
        db.respond = (q) => q.table === 'profiles' ? { data: null, error: { message: 'offline' } } : { data: [], error: null }

        await useAuthStore.getState().login('vesper@example.com', 'pw')
        await settle()

        expect(useAuthStore.getState().user).toEqual(expect.objectContaining({ username: 'vesper', role: 'archivist', following: ['kane'] }))
        expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })

    it('with nothing loaded, a failed profile read still signs the member in and says the profile did not load', async () => {
        db.respond = (q) => q.table === 'profiles' ? { data: null, error: { message: 'offline' } } : { data: [], error: null }

        await useAuthStore.getState().login('vesper@example.com', 'pw')
        await settle()

        expect(useAuthStore.getState().isAuthenticated).toBe(true)
        expect(useAuthStore.getState().user?.id).toBe('u1')
        expect(reelToast.error).toHaveBeenCalledWith(expect.stringMatching(/profile could not be loaded/), expect.anything())
    })

    it('writes the persona chosen at sign-up on the first sign-in that finds the profile without one, once', async () => {
        AUTH_USER.user_metadata = { username: 'vesper', persona: 'The Weeper' }
        db.respond = (q) => q.table === 'profiles' && q.op === 'select' ? { data: { ...PROFILE, persona: null }, error: null } : { data: null, error: null }

        await useAuthStore.getState().login('vesper@example.com', 'pw')
        await settle()

        const written = db.asked.filter((q) => q.table === 'profiles' && q.op === 'update')
        expect(written).toEqual([expect.objectContaining({ values: { persona: 'The Weeper' }, filters: { id: 'u1' } })])
        expect(db.updateUser).toHaveBeenCalledWith({ data: { persona: null } })
        expect(useAuthStore.getState().user).toEqual(expect.objectContaining({ persona: 'The Weeper' }))
    })

    it('a persona already on the profile is never written over', async () => {
        AUTH_USER.user_metadata = { persona: 'The Weeper' }
        db.respond = (q) => q.table === 'profiles' && q.op === 'select' ? { data: PROFILE, error: null } : { data: null, error: null }

        await useAuthStore.getState().login('vesper@example.com', 'pw')
        await settle()

        expect(db.asked.filter((q) => q.table === 'profiles' && q.op === 'update')).toEqual([])
        expect(useAuthStore.getState().user).toEqual(expect.objectContaining({ persona: 'The Archivist' }))
    })
})

describe('after a password reset', () => {
    it('the member arrives signed in, without a reload', async () => {
        // Recovery mode: the listener held no one while the reset page was open.
        sessionStorage.setItem('reelhouse_recovery', 'true')
        db.initialSession = SESSION
        db.respond = (q) => q.table === 'profiles' && q.one ? { data: PROFILE, error: null } : { data: [], error: null }

        render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>)
        fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'Nitrate#1924' } })
        fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: 'Nitrate#1924' } })
        fireEvent.submit(screen.getByPlaceholderText('New password').closest('form')!)

        await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true), PATIENCE)
        expect(useAuthStore.getState().user).toEqual(expect.objectContaining({ id: 'u1', username: 'vesper' }))
        expect(sessionStorage.getItem('reelhouse_recovery')).toBeNull()
    })
})

describe('seating the member on a page load', () => {
    // The seat reads the profile; the sign-in page may claim the sign-up persona
    // while that read is on its way. The read was taken before the claim.
    const seatWith = async (readPersona: string | null) => {
        useAuthStore.setState({ user: { ...AUTH_USER, username: 'vesper', persona: 'The Auteur', following: [], requested: [] } as never, isAuthenticated: true })
        db.initialSession = SESSION
        db.respond = (q) => q.table === 'profiles' && q.one
            ? { data: { ...PROFILE, role: 'auteur', persona: readPersona }, error: null }
            : { data: [], error: null }
        initAuthSync()
        // Seated when the read's own word (its role) is in the store.
        await waitFor(() => expect(useAuthStore.getState().user).toEqual(expect.objectContaining({ role: 'auteur' })), PATIENCE)
    }

    it('a read taken before the persona was claimed does not undo it', async () => {
        await seatWith(null)
        expect(useAuthStore.getState().user).toEqual(expect.objectContaining({ id: 'u1', persona: 'The Auteur' }))
    })

    it('a read that has a persona is the one kept', async () => {
        await seatWith('The Weeper')
        expect(useAuthStore.getState().user).toEqual(expect.objectContaining({ id: 'u1', persona: 'The Weeper' }))
    })
})

describe('the shelf', () => {
    it('a refused removal fails where the shelf can say so, and the entry stays', async () => {
        useAuthStore.setState({ user: { id: 'u1', username: 'vesper' } as never, isAuthenticated: true })
        useFilmStore.setState({ physicalArchive: [{ id: 'a1', filmId: 7, title: 'Vertigo', formats: ['4K'], notes: '', condition: 'good' } as never] })
        db.respond = (q) => q.table === 'physical_archive' && q.op === 'delete' ? { data: null, error: { message: 'refused' } } : { data: [], error: null }

        await expect(useFilmStore.getState().removeFromPhysicalArchive(7)).rejects.toBeTruthy()
        expect(useFilmStore.getState().physicalArchive.map((a) => a.filmId)).toEqual([7])
    })
})

describe('following from the member search', () => {
    it('a private member becomes a request: the member holds it as one and the button says REQUESTED', async () => {
        useAuthStore.setState({ user: { id: 'u1', username: 'vesper', following: [], requested: [] } as never, isAuthenticated: true })
        db.respond = (q) => {
            if (q.table === 'profiles' && q.one) return { data: { id: 'p2', is_social_private: true }, error: null }
            if (q.table === 'profiles') return { data: [{ id: 'p2', username: 'greta', role: 'cinephile', bio: '' }], error: null }
            return { data: null, error: null }
        }

        render(<MemoryRouter><MemberSearchDropdown isOpen onClose={() => {}} /></MemoryRouter>)
        fireEvent.change(screen.getByPlaceholderText(/Search members/), { target: { value: 'greta' } })
        fireEvent.click(await screen.findByText('FOLLOW', { exact: false }, PATIENCE))

        await waitFor(() => expect(useAuthStore.getState().user?.requested).toEqual(['greta']), PATIENCE)
        expect(useAuthStore.getState().user?.following).toEqual([])
        expect(await screen.findByText('REQUESTED', { exact: false }, PATIENCE)).toBeTruthy()
        expect(screen.queryByText('FOLLOWING', { exact: false })).toBeNull()
        expect(reelToast.success).toHaveBeenCalledWith('Requested to follow @greta')
    })

    it('a pending request is withdrawn from the same button', async () => {
        useAuthStore.setState({ user: { id: 'u1', username: 'vesper', following: [], requested: ['orson'] } as never, isAuthenticated: true })
        db.respond = (q) => {
            if (q.table === 'profiles' && q.one) return { data: { id: 'p3' }, error: null }
            if (q.table === 'profiles') return { data: [{ id: 'p3', username: 'orson', role: 'cinephile', bio: '' }], error: null }
            return { data: null, error: null }
        }

        render(<MemoryRouter><MemberSearchDropdown isOpen onClose={() => {}} /></MemoryRouter>)
        fireEvent.change(screen.getByPlaceholderText(/Search members/), { target: { value: 'orson' } })
        fireEvent.click(await screen.findByText('REQUESTED', { exact: false }, PATIENCE))

        await waitFor(() => expect(useAuthStore.getState().user?.requested).toEqual([]), PATIENCE)
        expect(db.asked.some((q) => q.table === 'interactions' && q.op === 'delete' && q.filters.target_user_id === 'p3')).toBe(true)
        expect(reelToast.success).toHaveBeenCalledWith('Cancelled request to @orson')
    })
})

describe('following from a profile page', () => {
    // jsdom has no ResizeObserver; the page's layout only needs one to exist.
    beforeEach(() => {
        if (!('ResizeObserver' in globalThis)) {
            (globalThis as Record<string, unknown>).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
        }
    })

    /** The page's own read says public with 10 followers; `lookup` is what the store's follow finds. */
    const openProfile = (username: string, lookup: { is_social_private: boolean }, refused: 'insert' | 'delete' | null) => {
        db.respond = (q) => {
            if (q.table === 'profiles' && q.one && q.columns?.startsWith('id, username')) {
                return { data: { id: 'p9', username, role: 'cinephile', bio: '', followers_count: 10, following_count: 0, is_social_private: false, public_prefs: {} }, error: null }
            }
            if (q.table === 'profiles' && q.one) return { data: { id: 'p9', ...lookup }, error: null }
            if (q.table === 'interactions' && q.op === refused) return { data: null, error: { message: 'refused' } }
            return { data: [], error: null }
        }
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        render(
            <QueryClientProvider client={client}>
                <MemoryRouter initialEntries={[`/user/${username}`]}>
                    <Routes><Route path="/user/:username" element={<UserProfilePage />} /></Routes>
                </MemoryRouter>
            </QueryClientProvider>,
        )
    }

    it('a refused follow is never answered "Now following", and the count does not move', async () => {
        useAuthStore.setState({ user: { id: 'u1', username: 'vesper', following: [], requested: [] } as never, isAuthenticated: true })
        openProfile('lumiere', { is_social_private: false }, 'insert')

        fireEvent.click(await screen.findByText('THE FOLLOW BUTTON', {}, PATIENCE))

        await waitFor(() => expect(reelToast.error).toHaveBeenCalledWith('Follow failed — please try again.'), PATIENCE)
        expect(useAuthStore.getState().user?.following).toEqual([])
        expect(reelToast.success).not.toHaveBeenCalled()
        expect(screen.getByText('FOLLOWERS 10')).toBeTruthy()
    })

    it('a member who has gone private since the page loaded is told it is a request, and the count does not move', async () => {
        useAuthStore.setState({ user: { id: 'u1', username: 'vesper', following: [], requested: [] } as never, isAuthenticated: true })
        openProfile('garbo', { is_social_private: true }, null)

        fireEvent.click(await screen.findByText('THE FOLLOW BUTTON', {}, PATIENCE))

        await waitFor(() => expect(useAuthStore.getState().user?.requested).toEqual(['garbo']), PATIENCE)
        await waitFor(() => expect(reelToast.success).toHaveBeenCalledWith('Requested to follow @garbo'), PATIENCE)
        expect(reelToast.success).not.toHaveBeenCalledWith(expect.stringMatching(/Now following/))
        expect(screen.getByText('FOLLOWERS 10')).toBeTruthy()
    })

    it('a refused unfollow is never answered "Unfollowed", and the count does not move', async () => {
        useAuthStore.setState({ user: { id: 'u1', username: 'vesper', following: ['welles'], requested: [] } as never, isAuthenticated: true })
        openProfile('welles', { is_social_private: false }, 'delete')

        fireEvent.click(await screen.findByText('THE FOLLOW BUTTON', {}, PATIENCE))

        await waitFor(() => expect(reelToast.error).toHaveBeenCalledWith('Unfollow failed — please try again.'), PATIENCE)
        expect(useAuthStore.getState().user?.following).toEqual(['welles'])
        expect(reelToast.success).not.toHaveBeenCalled()
        expect(screen.getByText('FOLLOWERS 10')).toBeTruthy()
    })
})

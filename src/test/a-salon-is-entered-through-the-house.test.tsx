/**
 * A salon is entered through the house, and a failed read is never shown as an empty one.
 * ─────────────────────────────────────────────────────────────────────────────
 * The website wrote a member's seat straight into lounge_members, which has no
 * INSERT policy: every join was refused, and a lounge it opened had no seat for
 * its own creator. It now asks the house, as the app does (create_lounge,
 * join_public_lounge, request_lounge_membership).
 *
 * Any row in a room counted as a seat, so a member whose request was still with
 * the host was given the message box, saw the room among their own and was
 * offered it to share into. Only an approved seat may post; a request is shown
 * awaiting the host, as the app shows it.
 *
 * A members list, a lounge list or a room that could not be read was shown as
 * "MEMBERS (0)", as "The Velvet Seats Await", or as "Lounge not found".
 *
 * The auth listener awaited a profile read inside supabase-js's auth lock, where
 * a supabase call can wait on that same lock for ever.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'

type Answer = { data: unknown; error: unknown }

const mocks = vi.hoisted(() => ({
    /** What a read of each table answers; `insert:t`, `update:t`, `delete:t` for writes. */
    answers: {} as Record<string, { data: unknown; error: unknown }>,
    writes: [] as { table: string; op: string }[],
    from: vi.fn(),
    rpc: vi.fn(),
    toastError: vi.fn(),
    authListener: null as null | ((event: string, session: unknown) => unknown),
}))

vi.mock('../supabaseClient', () => {
    const builder = (table: string) => {
        let op = 'select'
        let one = false
        const answer = (): Answer => {
            const a = op === 'select'
                ? (mocks.answers[table] ?? { data: [], error: null })
                : (mocks.answers[`${op}:${table}`] ?? { data: null, error: null })
            return { data: one && Array.isArray(a.data) ? (a.data[0] ?? null) : a.data, error: a.error }
        }
        const q: object = new Proxy({}, {
            get(_t, prop) {
                if (prop === 'then') return (res: (v: Answer) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(answer()).then(res, rej)
                if (prop === 'insert' || prop === 'update' || prop === 'delete') {
                    return () => { op = String(prop); mocks.writes.push({ table, op }); return q }
                }
                if (prop === 'single' || prop === 'maybeSingle') return () => { one = true; return q }
                return () => q
            },
        })
        return q
    }
    const channel: Record<string, () => unknown> = {}
    channel.on = () => channel
    channel.subscribe = () => channel
    return {
        isSupabaseConfigured: true,
        supabase: {
            from: (t: string) => { mocks.from(t); return builder(t) },
            rpc: mocks.rpc,
            channel: () => channel,
            removeChannel: vi.fn(),
            removeAllChannels: vi.fn(),
            auth: {
                onAuthStateChange: (cb: (event: string, session: unknown) => unknown) => {
                    mocks.authListener = cb
                    return { data: { subscription: { unsubscribe: vi.fn() } } }
                },
                signOut: vi.fn().mockResolvedValue({ error: null }),
            },
        },
    }
})
vi.mock('../utils/reelToast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: mocks.toastError, info: vi.fn(), dismiss: vi.fn() }) }))
vi.mock('../hooks/useViewport', () => ({ useViewport: () => ({ isTouch: false }) }))
vi.mock('../stores/films', () => ({
    useFilmStore: { getState: () => ({ fetchLogs: vi.fn(), fetchWatchlist: vi.fn(), fetchLists: vi.fn(), fetchEndorsements: vi.fn(), fetchPhysicalArchive: vi.fn() }) },
    forgetSavedRecord: vi.fn(),
    unsealSavedRecord: vi.fn(),
}))

import { useLoungeStore } from '../stores/lounge'
import { useAuthStore } from '../stores/auth'
import { initAuthSync } from '../stores/realtime'
import LoungePage from '../pages/LoungePage'
import LoungeRoomPage from '../pages/LoungeRoomPage'
import ShareToLoungeModal from '../components/ShareToLoungeModal'

const ME = { id: 'u1', username: 'vesper', role: 'archivist', tier: 'archivist' }
const ROOM = 'room-1'
const lounge = (over: Record<string, unknown> = {}) => ({
    id: ROOM, name: 'The Noir Corner', description: '', creator_id: 'host', is_private: false,
    invite_code: null, cover_image: null, member_count: 3, max_members: 50, created_at: '2026-01-01T00:00:00Z', ...over,
})
const refused = { message: 'permission denied', code: '42501' }

const fresh = useLoungeStore.getState()

beforeEach(() => {
    vi.clearAllMocks()
    mocks.answers = {}
    mocks.writes.length = 0
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    useLoungeStore.setState(fresh, true)
    useAuthStore.setState({ user: ME as never, isAuthenticated: true })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { vi.useRealTimers() })

const openRoom = async () => {
    await act(async () => {
        render(
            <HelmetProvider>
                <MemoryRouter initialEntries={[`/lounge/${ROOM}`]}>
                    <Routes><Route path="/lounge/:loungeId" element={<LoungeRoomPage />} /></Routes>
                </MemoryRouter>
            </HelmetProvider>,
        )
    })
}

describe('a salon is entered through the house', () => {
    it('a lounge is opened by create_lounge, which seats its creator; no seat is written by hand', async () => {
        mocks.rpc.mockResolvedValueOnce({ data: 'new-room', error: null })
        const id = await useLoungeStore.getState().createLounge({ name: 'The Noir Corner', description: 'Shadows.', isPrivate: true })
        expect(id).toBe('new-room')
        expect(mocks.rpc).toHaveBeenCalledWith('create_lounge', { p_name: 'The Noir Corner', p_description: 'Shadows.', p_is_private: true })
        expect(mocks.writes).toEqual([])
    })

    it('a refused opening is reported as failed, not as a lounge', async () => {
        mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'The Lounge is an Archivist feature' } })
        expect(await useLoungeStore.getState().createLounge({ name: 'x', description: '', isPrivate: false })).toBeNull()
    })

    it('a public room is joined by join_public_lounge', async () => {
        useLoungeStore.setState({ publicLounges: [lounge() as never] })
        await useLoungeStore.getState().joinLounge(ROOM)
        expect(mocks.rpc).toHaveBeenCalledWith('join_public_lounge', { p_lounge_id: ROOM })
        expect(mocks.writes).toEqual([])
    })

    it('a private room is asked for by request_lounge_membership', async () => {
        useLoungeStore.setState({ activeLounge: lounge({ is_private: true }) as never })
        await useLoungeStore.getState().joinLounge(ROOM)
        expect(mocks.rpc).toHaveBeenCalledWith('request_lounge_membership', { p_lounge_id: ROOM })
        expect(mocks.rpc).not.toHaveBeenCalledWith('join_public_lounge', expect.anything())
    })

    it('a refused join is said and thrown, never taken for a seat', async () => {
        useLoungeStore.setState({ publicLounges: [lounge() as never] })
        mocks.rpc.mockResolvedValueOnce({ data: null, error: refused })
        await expect(useLoungeStore.getState().joinLounge(ROOM)).rejects.toBe(refused)
        expect(mocks.toastError).toHaveBeenCalled()
    })
})

describe('only an approved seat may post', () => {
    it('a member whose request is with the host gets no message box', async () => {
        mocks.answers.lounges = { data: [lounge({ is_private: true })], error: null }
        mocks.answers.lounge_members = { data: [{ status: 'pending' }], error: null }
        await openRoom()
        expect(screen.getByText('Your request is with the host.')).toBeTruthy()
        expect(screen.queryByPlaceholderText('Say something about cinema...')).toBeNull()
        expect(screen.queryByText('REQUEST A SEAT')).toBeNull()
    })

    it('an approved member gets the message box', async () => {
        mocks.answers.lounges = { data: [lounge()], error: null }
        mocks.answers.lounge_members = { data: [{ status: 'approved' }], error: null }
        await openRoom()
        expect(screen.getByPlaceholderText('Say something about cinema...')).toBeTruthy()
    })

    it('a stranger at a private room may ask for a seat', async () => {
        mocks.answers.lounges = { data: [lounge({ is_private: true })], error: null }
        mocks.answers.lounge_members = { data: [], error: null }
        await openRoom()
        expect(screen.getByText('REQUEST A SEAT')).toBeTruthy()
        expect(screen.queryByPlaceholderText('Say something about cinema...')).toBeNull()
    })
})

describe('a request still with the host is not a room the member is in', () => {
    const rooms = () => {
        mocks.answers.lounge_members = { data: [{ lounge_id: ROOM, status: 'pending' }, { lounge_id: 'room-2', status: 'approved' }], error: null }
        mocks.answers.lounges = { data: [lounge({ is_private: true }), lounge({ id: 'room-2', name: 'The Bright Room' })], error: null }
        mocks.rpc.mockResolvedValue({ data: [{ lounge_id: ROOM, unread_count: 4 }], error: null })
    }

    it('the list carries each seat: only an approved one is a member', async () => {
        rooms()
        await useLoungeStore.getState().fetchMyLounges()
        const byId = Object.fromEntries(useLoungeStore.getState().myLounges.map(l => [l.id, l]))
        expect(byId[ROOM]).toMatchObject({ membership_status: 'pending', is_member: false })
        expect(byId['room-2']).toMatchObject({ membership_status: 'approved', is_member: true })
    })

    it('a pending room is shown awaiting the host, with no unread count', async () => {
        rooms()
        await act(async () => {
            render(<HelmetProvider><MemoryRouter><LoungePage /></MemoryRouter></HelmetProvider>)
        })
        expect(screen.getByLabelText('The Noir Corner, awaiting the host')).toBeTruthy()
        expect(screen.getAllByText('AWAITING THE HOST')).toHaveLength(1)
        expect(screen.queryByText('4')).toBeNull()
    })

    it('a pending room is never offered as a place to share', async () => {
        rooms()
        await act(async () => {
            render(<ShareToLoungeModal payload={{ type: 'film_share', title: 'Vertigo', metadata: {} }} onClose={() => {}} />)
        })
        expect(screen.getByText('The Bright Room')).toBeTruthy()
        expect(screen.queryByText('The Noir Corner')).toBeNull()
    })
})

describe('a failed read is never shown as an empty one', () => {
    it('a room that could not be opened is not "not found"', async () => {
        mocks.answers.lounges = { data: null, error: refused }
        await openRoom()
        expect(screen.queryByText('Lounge not found')).toBeNull()
        expect(screen.getByText('This lounge could not be opened')).toBeTruthy()
        expect(screen.getByText('TRY AGAIN')).toBeTruthy()
    })

    it('a room that does not exist is still "not found"', async () => {
        mocks.answers.lounges = { data: [], error: null }
        await openRoom()
        expect(screen.getByText('Lounge not found')).toBeTruthy()
    })

    it('a members list that could not be read never says MEMBERS (0)', async () => {
        mocks.answers.lounges = { data: [lounge()], error: null }
        mocks.answers.lounge_members = { data: [{ status: 'approved' }], error: null }
        await openRoom()
        mocks.answers.lounge_members = { data: null, error: refused }
        await act(async () => { fireEvent.click(screen.getByLabelText('Lounge settings')) })
        expect(screen.queryByText('MEMBERS (0)')).toBeNull()
        expect(screen.getByText('Members could not be loaded.')).toBeTruthy()
    })

    it('a members list that was read is counted', async () => {
        mocks.answers.lounges = { data: [lounge()], error: null }
        mocks.answers.lounge_members = { data: [{ status: 'approved', user_id: 'u2', joined_at: '2026-01-02T00:00:00Z', profiles: { username: 'otto' } }], error: null }
        await openRoom()
        await act(async () => { fireEvent.click(screen.getByLabelText('Lounge settings')) })
        expect(screen.getByText('MEMBERS (1)')).toBeTruthy()
    })

    it('a lounge list that could not be read does not show the empty lounge', async () => {
        mocks.answers.lounge_members = { data: null, error: refused }
        mocks.answers.lounges = { data: null, error: refused }
        mocks.rpc.mockResolvedValue({ data: [], error: null })
        await act(async () => {
            render(<HelmetProvider><MemoryRouter><LoungePage /></MemoryRouter></HelmetProvider>)
        })
        expect(screen.queryByText('The Velvet Seats Await')).toBeNull()
        expect(screen.queryByText('No public salons yet. Be the first to open one.')).toBeNull()
        expect(screen.getByText('Your lounges could not be loaded.')).toBeTruthy()
        expect(screen.getByText('Public salons could not be loaded.')).toBeTruthy()
    })

    it('a failed save never says "Lounge updated." and the button comes back', async () => {
        mocks.answers.lounges = { data: [lounge({ creator_id: ME.id })], error: null }
        mocks.answers.lounge_members = { data: [{ status: 'approved', user_id: ME.id, joined_at: '2026-01-02T00:00:00Z' }], error: null }
        await openRoom()
        await act(async () => { fireEvent.click(screen.getByLabelText('Lounge settings')) })
        mocks.answers['update:lounges'] = { data: null, error: refused }
        fireEvent.change(screen.getByDisplayValue('The Noir Corner'), { target: { value: 'The Noir Room' } })
        await act(async () => { fireEvent.click(screen.getByText('SAVE CHANGES')) })
        const success = (await import('../utils/reelToast')).default.success
        expect(success).not.toHaveBeenCalledWith('Lounge updated.')
        expect(screen.getByText('SAVE CHANGES')).toBeTruthy()
    })
})

describe('the auth listener never waits on the house', () => {
    it('returns at once, and reads the profile after it has returned', async () => {
        vi.useFakeTimers()
        useAuthStore.setState({ user: null, isAuthenticated: false })
        mocks.answers.profiles = { data: [{ ...ME }], error: null }
        initAuthSync()
        mocks.from.mockClear()
        const returned = mocks.authListener!('INITIAL_SESSION', { user: { id: ME.id, email: 'v@example.com' } })
        expect(returned).toBeUndefined()
        expect(mocks.from).not.toHaveBeenCalled()
        await act(async () => { await vi.runAllTimersAsync() })
        expect(useAuthStore.getState().user?.username).toBe('vesper')
        expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })

    it('a profile that fails to load keeps the member already held, untouched', async () => {
        vi.useFakeTimers()
        const held = { ...ME, avatar_url: 'a.png' }
        useAuthStore.setState({ user: held as never, isAuthenticated: true })
        mocks.answers.profiles = { data: null, error: refused }
        initAuthSync()
        mocks.authListener!('INITIAL_SESSION', { user: { id: ME.id, email: 'v@example.com' } })
        await act(async () => { await vi.runAllTimersAsync() })
        expect(useAuthStore.getState().user).toMatchObject(held)
        expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })

    it('a seating overtaken by a sign-out writes nothing', async () => {
        vi.useFakeTimers()
        mocks.answers.profiles = { data: [{ ...ME }], error: null }
        initAuthSync()
        mocks.authListener!('INITIAL_SESSION', { user: { id: ME.id } })
        mocks.authListener!('SIGNED_OUT', null)
        await act(async () => { await vi.runAllTimersAsync() })
        expect(useAuthStore.getState().user).toBeNull()
        expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })
})

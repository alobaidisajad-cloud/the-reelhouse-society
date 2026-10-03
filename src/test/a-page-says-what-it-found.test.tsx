/**
 * A page says what it found: the stacks of the members you follow, a list
 * deleted whole or not at all, and a log that could not be read told apart
 * from a log that is not there.
 *
 * The FOLLOWING filter matched usernames against ids and showed nothing. A
 * list was deleted in two steps, films first, so a failed second step left a
 * list with no films; the films go with the list on their own (ON DELETE
 * CASCADE). A log that could not be read was told "scrubbed from the archive".
 */
import type { ReactElement } from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

type Op = [string, unknown[]]
type Answer = (table: string, ops: Op[]) => { data?: unknown; error?: unknown; count?: number | null }

const mocks = vi.hoisted(() => ({
    answer: (() => ({ data: null, error: null })) as unknown as Answer,
    calls: [] as { table: string; ops: Op[] }[],
    navigate: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('../supabaseClient', () => {
    // Every chained call is kept; awaiting the chain asks the test for the answer.
    const from = (table: string) => {
        const call = { table, ops: [] as Op[] }
        mocks.calls.push(call)
        const chain: any = new Proxy({}, {
            get(_t, prop: string) {
                if (prop === 'then') return (ok: any, bad: any) => Promise.resolve(mocks.answer(table, call.ops)).then(ok, bad)
                return (...args: unknown[]) => { call.ops.push([prop, args]); return chain }
            },
        })
        return chain
    }
    return { isSupabaseConfigured: true, supabase: { from, rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } }
})
vi.mock('../store', () => {
    const user = { id: 'me', username: 'me', role: 'cinephile', tier: 'cinephile', following: ['vesper'] }
    const authState = { user, isAuthenticated: true }
    const filmState = { logs: [], removeLog: vi.fn() }
    const uiState = { openLogModal: vi.fn() }
    const hook = (state: object) => Object.assign((sel?: (s: any) => unknown) => (sel ? sel(state) : state), { getState: () => state })
    return { useAuthStore: hook(authState), useFilmStore: hook(filmState), useUIStore: hook(uiState) }
})
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => mocks.navigate }))
vi.mock('../utils/reelToast', () => ({ default: Object.assign(vi.fn(), mocks.toast) }))
vi.mock('../hooks/useViewport', () => ({ useViewport: () => ({ isTouch: false }) }))
vi.mock('../hooks/useBanCheck', () => ({ useBanCheck: () => ({ checkBan: () => false }) }))
vi.mock('../components/ListActions', () => ({ default: () => null }))
vi.mock('../components/ReportButton', () => ({ default: () => null }))
vi.mock('../components/CreateListModal', () => ({ default: () => null }))
vi.mock('../components/ShareToLoungeModal', () => ({ default: () => null }))
vi.mock('../components/feed/ActivityCard', () => ({ default: ({ log }: any) => <div>{`LOG BY ${log.user}`}</div> }))
vi.mock('../hooks/useScrollReveal', () => ({ useScrollRevealAll: () => undefined, useScrollReveal: () => undefined }))

import ListsPage from '../pages/ListsPage'
import ListDetailPage from '../pages/ListDetailPage'
import LogDetailPage from '../pages/LogDetailPage'
import FeedPage from '../pages/FeedPage'

const has = (ops: Op[], name: string) => ops.some(([m]) => m === name)

const mount = (path: string, route: string, page: ReactElement) => render(
    <HelmetProvider>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={page} /></Routes></MemoryRouter>
        </QueryClientProvider>
    </HelmetProvider>,
)

beforeEach(() => {
    vi.clearAllMocks()
    mocks.calls = []
})

describe('the stacks of the members you follow', () => {
    it('FOLLOWING shows the stacks of the members you follow, and only theirs', async () => {
        mocks.answer = (table) => {
            if (table === 'lists') return {
                data: [
                    { id: 'aaaa1', title: 'Vesper Shelf', description: '', created_at: '2026-09-02T00:00:00Z', user_id: 'id-vesper', is_private: false },
                    { id: 'bbbb2', title: 'Stranger Shelf', description: '', created_at: '2026-09-01T00:00:00Z', user_id: 'id-noir', is_private: false },
                ], error: null,
            }
            if (table === 'profiles') return { data: [{ id: 'id-vesper', username: 'vesper' }, { id: 'id-noir', username: 'noir' }], error: null }
            return { data: [], error: null }
        }
        mount('/stacks', '/stacks', <ListsPage />)
        await screen.findByText('VESPER SHELF')
        expect(screen.getByText('STRANGER SHELF')).toBeTruthy()
        await act(async () => { fireEvent.click(screen.getByText('FOLLOWING')) })
        expect(screen.getByText('VESPER SHELF')).toBeTruthy()
        expect(screen.queryByText('STRANGER SHELF')).toBeNull()
    })

    // Only a stranger's stack, filed long ago.
    const strangersOnly: Answer = (table) => {
        if (table === 'lists') return { data: [{ id: 'bbbb2', title: 'Stranger Shelf', description: '', created_at: '2020-01-01T00:00:00Z', user_id: 'id-noir', is_private: false }], error: null }
        if (table === 'profiles') return { data: [{ id: 'id-noir', username: 'noir' }], error: null }
        return { data: [], error: null }
    }

    it('FOLLOWING with nothing from those you follow says so, not "archive empty"', async () => {
        mocks.answer = strangersOnly
        mount('/stacks', '/stacks', <ListsPage />)
        await screen.findByText('STRANGER SHELF')
        await act(async () => { fireEvent.click(screen.getByText('FOLLOWING')) })
        expect(screen.getByText('None of the members you follow have filed a stack yet.')).toBeTruthy()
        expect(screen.queryByText('ARCHIVE EMPTY')).toBeNull()
        expect(screen.getByText('CLEAR FILTERS')).toBeTruthy()
    })

    it('a time filter with nothing in its window says so', async () => {
        mocks.answer = strangersOnly
        mount('/stacks', '/stacks', <ListsPage />)
        await screen.findByText('STRANGER SHELF')
        await act(async () => { fireEvent.click(screen.getByText('THIS WEEK')) })
        expect(screen.getByText('No stacks were filed this week.')).toBeTruthy()
        expect(screen.queryByText('The Archive Awaits Its First Curator.')).toBeNull()
    })

    it('a truly empty archive, with no filter on, is "archive empty"', async () => {
        mocks.answer = () => ({ data: [], error: null })
        mount('/stacks', '/stacks', <ListsPage />)
        await screen.findByText('ARCHIVE EMPTY')
        expect(screen.getByText('The Archive Awaits Its First Curator.')).toBeTruthy()
        expect(screen.queryByText('CLEAR FILTERS')).toBeNull()
    })
})

describe('a list is deleted whole, or not at all', () => {
    const listRow = { id: 'L1', title: 'Noir Nights', description: '', created_at: '2026-09-01T00:00:00Z', user_id: 'me', is_private: false }
    const answerWith = (deleted: { data?: unknown; error?: unknown }): Answer => (table, ops) => {
        if (table === 'lists' && has(ops, 'delete')) return deleted
        if (table === 'lists') return { data: listRow, error: null }
        if (table === 'profiles') return { data: { username: 'me' }, error: null }
        if (table === 'interactions') return { data: [], count: 0, error: null }
        return { data: [], error: null }
    }
    const destroy = async () => {
        mount('/lists/L1', '/lists/:id', <ListDetailPage />)
        await screen.findByText('Noir Nights')
        await act(async () => { fireEvent.click(screen.getByTitle('Delete List')) })
        await act(async () => { fireEvent.click(screen.getByText('CONFIRM')) })
    }

    it('deletes the list alone, and its films go with it', async () => {
        mocks.answer = answerWith({ data: [{ id: 'L1' }], error: null })
        await destroy()
        await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Archive destroyed.'))
        expect(mocks.calls.filter((c) => c.table === 'lists' && has(c.ops, 'delete'))).toHaveLength(1)
        expect(mocks.calls.some((c) => c.table === 'list_items' && has(c.ops, 'delete'))).toBe(false)
        expect(mocks.navigate).toHaveBeenCalledWith('/stacks')
    })

    it('a failed delete keeps the films, and says so', async () => {
        mocks.answer = answerWith({ data: null, error: { message: 'Failed to fetch' } })
        await destroy()
        await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('Failed to destroy archive.'))
        expect(mocks.calls.some((c) => c.table === 'list_items' && has(c.ops, 'delete'))).toBe(false)
        expect(mocks.toast.success).not.toHaveBeenCalled()
        expect(mocks.navigate).not.toHaveBeenCalledWith('/stacks')
    })

    it('a delete that removed no row is not called a success', async () => {
        mocks.answer = answerWith({ data: [], error: null })
        await destroy()
        await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('Failed to destroy archive.'))
        expect(mocks.toast.success).not.toHaveBeenCalled()
    })
})

describe('a log that could not be read is told apart from one that is not there', () => {
    it('a failed read says it could not be loaded, and offers to try again', async () => {
        mocks.answer = () => ({ data: null, error: { message: 'Failed to fetch' } })
        mount('/log/g1', '/log/:logId', <LogDetailPage />)
        await screen.findByText(/could not be loaded/)
        expect(screen.getByText('TRY AGAIN')).toBeTruthy()
        expect(screen.queryByText(/could not be found/)).toBeNull()
    })

    it('a missing log says it could not be found', async () => {
        mocks.answer = () => ({ data: null, error: null })
        mount('/log/g1', '/log/:logId', <LogDetailPage />)
        await screen.findByText(/could not be found/)
        expect(screen.queryByText(/could not be loaded/)).toBeNull()
        expect(screen.queryByText('TRY AGAIN')).toBeNull()
    })

    it('a log that is there is shown', async () => {
        mocks.answer = (table) => table === 'logs'
            ? { data: { id: 'g1', user_id: 'u2', film_id: 1, film_title: 'Laura', created_at: '2026-09-01T00:00:00Z', profiles: { username: 'vesper' } }, error: null }
            : { data: null, count: 2, error: null }
        mount('/log/g1', '/log/:logId', <LogDetailPage />)
        await screen.findByText('LOG BY vesper')
    })
})

describe('the society picks', () => {
    // The Reel itself is empty, so the picks are shown under it.
    const answerWith = (picks: { data?: unknown; error?: unknown }): Answer => (table, ops) =>
        table === 'logs' && has(ops, 'gte') ? picks : { data: [], error: null }

    it('picks that could not be read say so, never "awaiting transmissions"', async () => {
        mocks.answer = answerWith({ data: null, error: { message: 'Failed to fetch' } })
        mount('/reel', '/reel', <FeedPage />)
        await screen.findByText('THE PICKS COULD NOT BE LOADED.')
        expect(screen.queryByText('AWAITING TRANSMISSIONS...')).toBeNull()
    })

    it('no picks yet is still "awaiting transmissions"', async () => {
        mocks.answer = answerWith({ data: [], error: null })
        mount('/reel', '/reel', <FeedPage />)
        await screen.findByText('AWAITING TRANSMISSIONS...')
        expect(screen.queryByText('THE PICKS COULD NOT BE LOADED.')).toBeNull()
    })
})

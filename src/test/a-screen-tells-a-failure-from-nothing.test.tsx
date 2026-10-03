/**
 * A screen tells a failure from nothing.
 * ─────────────────────────────────────────────────────────────────────────────
 * Three places drew a failure as if it were the answer:
 *  - certifying a stack whose write failed left the button CERTIFIED, with
 *    "Certified!" said before the write was even sent;
 *  - every critique under a log was drawn as a deleted account, because the
 *    read never asked for the user_id the render checks;
 *  - a TMDB search that could not run came back as "no results";
 *  - a read that had not answered yet was drawn as an empty room.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mocks = vi.hoisted(() => ({
    endorsed: {} as Record<string, true>,
    toggleWorks: true,
    toggleListEndorse: vi.fn(),
    rows: {} as Record<string, Record<string, unknown>[]>,
    unanswered: false,
    /** Tables whose reads fail, as supabase-js answers a failure: resolved, with an error. */
    failing: new Set<string>(),
    /** How many times each table was read. */
    reads: {} as Record<string, number>,
}))

/** A supabase table read that answers only the columns it was asked for — as the server does. */
function tableRead(table: string) {
    let cols: string[] = []
    mocks.reads[table] = (mocks.reads[table] ?? 0) + 1
    const chain: any = {
        select: (c: string) => { cols = c.split(',').map(s => s.trim()); return chain },
        then: (resolve: (v: unknown) => void) => mocks.unanswered ? undefined : resolve(mocks.failing.has(table)
            ? { data: null, error: { message: 'the house could not be reached' } }
            : {
                data: (mocks.rows[table] ?? []).map(r => Object.fromEntries(cols.filter(k => k in r).map(k => [k, r[k]]))),
                error: null,
            }),
    }
    for (const m of ['eq', 'neq', 'not', 'order', 'limit', 'ilike', 'like', 'in', 'abortSignal']) chain[m] = () => chain
    return chain
}

vi.mock('../supabaseClient', () => ({
    isSupabaseConfigured: true,
    supabase: { from: (t: string) => tableRead(t) },
}))
vi.mock('../store', async () => {
    // The Discover page's own search state is the real store: the page drives it.
    const { useDiscoverStore } = await vi.importActual<typeof import('../stores/ui')>('../stores/ui')
    const user = { id: 'u1', username: 'vesper' }
    const authState = { user, isAuthenticated: true }
    const useAuthStore = Object.assign((sel?: (s: typeof authState) => unknown) => (sel ? sel(authState) : authState), { getState: () => authState })
    const filmState = {
        logs: [], lists: [], watchlist: [],
        hasListEndorsed: (id: string) => !!mocks.endorsed[id],
        toggleListEndorse: mocks.toggleListEndorse,
    }
    const useFilmStore = Object.assign((sel?: (s: typeof filmState) => unknown) => (sel ? sel(filmState) : filmState), { getState: () => filmState })
    const uiState = { openLogModal: vi.fn() }
    const useUIStore = Object.assign((sel?: (s: typeof uiState) => unknown) => (sel ? sel(uiState) : uiState), { getState: () => uiState })
    return { useAuthStore, useFilmStore, useUIStore, useDiscoverStore }
})
vi.mock('../utils/reelToast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }))

import reelToast from '../utils/reelToast'
import ListActions from '../components/ListActions'
import AnnotationPanel from '../components/feed/AnnotationPanel'
import CommandPalette from '../components/CommandPalette'
import SocialPulse from '../components/home/SocialPulse'
import CommunityReviews from '../components/film/CommunityReviews'
import ReactionBar from '../components/ReactionBar'
import DiscoverPage from '../pages/DiscoverPage'
import { useDiscoverStore } from '../store'
import { queryClient as theAppsQueryClient } from '../queryClient'
import { HelmetProvider } from 'react-helmet-async'
import { tmdb, TMDBUnreachable } from '../tmdb'

const mount = (ui: React.ReactNode) => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
)

beforeEach(() => {
    vi.clearAllMocks()
    mocks.endorsed = {}
    mocks.rows = {}
    mocks.unanswered = false
    mocks.failing = new Set()
    mocks.reads = {}
    // The store's toggle: on success the mark moves; on failure it puts it back.
    mocks.toggleListEndorse.mockImplementation(async (id: string) => {
        if (!mocks.toggleWorks) return
        if (mocks.endorsed[id]) delete mocks.endorsed[id]
        else mocks.endorsed[id] = true
    })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('certifying a stack', () => {
    it('a certify that was written shows CERTIFIED, and says so after the write', async () => {
        mocks.toggleWorks = true
        mount(<ListActions listId="L1" certifyCount={2} isCertified={false} commentCount={0} />)
        await act(async () => { fireEvent.click(screen.getByText(/CERTIFY/)) })
        expect(screen.getByText(/CERTIFIED/).textContent).toMatch(/3/)
        expect(reelToast.success).toHaveBeenCalledWith('Certified!')
    })

    it('a certify that failed goes back to CERTIFY, its count back, and never says "Certified!"', async () => {
        mocks.toggleWorks = false
        mount(<ListActions listId="L1" certifyCount={2} isCertified={false} commentCount={0} />)
        await act(async () => { fireEvent.click(screen.getByText(/CERTIFY/)) })
        expect(screen.queryByText(/CERTIFIED/)).toBeNull()
        expect(screen.getByText(/CERTIFY/).textContent).toMatch(/2/)
        expect(reelToast.success).not.toHaveBeenCalledWith('Certified!')
    })

    it('an un-certify that failed stays CERTIFIED, its count back', async () => {
        mocks.toggleWorks = false
        mocks.endorsed = { L1: true }
        mount(<ListActions listId="L1" certifyCount={2} isCertified={true} commentCount={0} />)
        await act(async () => { fireEvent.click(screen.getByText(/CERTIFIED/)) })
        expect(screen.getByText(/CERTIFIED/).textContent).toMatch(/2/)
    })
})

describe('the critiques under a log', () => {
    it('a living author is a link to their profile; a deleted one is not', async () => {
        mocks.rows.log_comments = [
            { id: 'c1', log_id: 'g1', user_id: 'u2', username: 'marlow', body: 'A clean cut.', created_at: '2026-10-01T00:00:00Z' },
            { id: 'c2', log_id: 'g1', user_id: null, username: 'gone', body: 'Words kept.', created_at: '2026-10-02T00:00:00Z' },
        ]
        mount(<AnnotationPanel logId="g1" open isExpandedView />)
        fireEvent.click(await screen.findByText(/VIEW PREVIOUS CRITIQUES/))
        expect((await screen.findByText('@marlow')).closest('a')?.getAttribute('href')).toBe('/user/marlow')
        expect(screen.getByText('@gone').closest('a')).toBeNull()
    })
})

describe('a read that has not answered yet', () => {
    it('the foyer says it is retrieving, not that the room is dark', async () => {
        mocks.unanswered = true
        vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
        mount(<SocialPulse />)
        expect(await screen.findByText(/Retrieving the latest dispatches/)).toBeTruthy()
        expect(screen.queryByText(/The screening room is dark/)).toBeNull()
    })

    it('a film\'s reviews say they are retrieving, not "No transmissions yet"', async () => {
        mocks.unanswered = true
        mount(<CommunityReviews filmId={1} />)
        expect(await screen.findByText(/RETRIEVING REVIEWS/)).toBeTruthy()
        expect(screen.queryByText(/No transmissions yet/)).toBeNull()
    })
})

describe('a TMDB search', () => {
    const answer = (res: Partial<Response> & { json?: () => Promise<unknown> }) =>
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res))

    it('that could not run throws, never "no results"', async () => {
        answer({ ok: false, status: 500, statusText: 'Server Error' })
        await expect(tmdb.search('nosferatu')).rejects.toBeInstanceOf(TMDBUnreachable)
        await expect(tmdb.searchMulti('nosferatu')).rejects.toBeInstanceOf(TMDBUnreachable)
    }, 15000)

    it('that ran and found nothing is still nothing', async () => {
        answer({ ok: true, status: 200, json: () => Promise.resolve({ results: [], total_pages: 0, total_results: 0, page: 1 }) })
        expect((await tmdb.search('qqqq')).results).toEqual([])
        expect(await tmdb.searchMulti('qqqq')).toEqual([])
    })

    it('in the palette, a failed one says it could not search — not "No records found"', async () => {
        answer({ ok: false, status: 500, statusText: 'Server Error' })
        mount(<CommandPalette />)
        await act(async () => { fireEvent.keyDown(window, { key: 'k', ctrlKey: true }) })
        fireEvent.change(screen.getByPlaceholderText(/Search films/), { target: { value: 'nosferatu' } })
        await waitFor(() => expect(screen.getByText(/could not be searched/)).toBeTruthy(), { timeout: 10000 })
        expect(screen.queryByText(/No records found/)).toBeNull()
    }, 15000)
})

describe('the Discover search, when TMDB is down', () => {
    afterEach(() => { theAppsQueryClient.clear(); useDiscoverStore.setState({ query: '', inputVal: '', page: 1, accumulatedFilms: [] }) })

    /** The proxy, counting each search it is asked, and answering as `up` says. */
    function theProxy() {
        const proxy = { up: false, searches: 0 }
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { body?: string }) => {
            const path: string = JSON.parse(init?.body ?? '{}').path ?? ''
            if (path.startsWith('/search/multi')) proxy.searches++
            if (!proxy.up) return { ok: false, status: 500, statusText: 'Server Error' }
            const results = path.startsWith('/search/multi')
                ? [{ id: 653, media_type: 'movie', title: 'Nosferatu', poster_path: '/nosferatu.jpg', popularity: 9 }]
                : []
            return { ok: true, status: 200, json: () => Promise.resolve({ results, total_pages: 1, total_results: results.length, page: 1 }) }
        }))
        return proxy
    }

    const mountDiscover = () => render(
        <HelmetProvider>
            <QueryClientProvider client={theAppsQueryClient}>
                <MemoryRouter><DiscoverPage /></MemoryRouter>
            </QueryClientProvider>
        </HelmetProvider>,
    )

    it('asks the proxy only as often as one search does — no second layer of retries', async () => {
        const proxy = theProxy()
        await expect(tmdb.search('nosferatu')).rejects.toBeInstanceOf(TMDBUnreachable)
        const oneSearch = proxy.searches
        expect(oneSearch).toBeGreaterThan(0)

        proxy.searches = 0
        vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
        useDiscoverStore.setState({ query: 'nosferatu', inputVal: '', page: 1, accumulatedFilms: [] })
        mountDiscover()
        expect(await screen.findByText('SIGNAL LOST', {}, { timeout: 20000 })).toBeTruthy()
        expect(proxy.searches).toBe(oneSearch)
    }, 40000)

    it('TRY AGAIN asks again, and shows the films once TMDB is back', async () => {
        const proxy = theProxy()
        vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
        useDiscoverStore.setState({ query: 'nosferatu', inputVal: '', page: 1, accumulatedFilms: [] })
        mountDiscover()
        await screen.findByText('SIGNAL LOST', {}, { timeout: 20000 })
        const before = proxy.searches
        proxy.up = true
        fireEvent.click(screen.getByText('TRY AGAIN'))
        expect((await screen.findAllByLabelText('Nosferatu', {}, { timeout: 10000 })).length).toBeGreaterThan(0)
        expect(proxy.searches).toBeGreaterThan(before)
        expect(screen.queryByText('SIGNAL LOST')).toBeNull()
    }, 40000)
})

describe('a reaction bar that could not be read', () => {
    const bar = () => screen.getByTitle('Masterpiece') as HTMLElement

    it('a tap reads it again, and the bar unlocks when the read answers', async () => {
        mocks.failing.add('interactions')
        mount(<ReactionBar logId="g1" />)
        await waitFor(() => expect(bar().style.opacity).toBe('0.5'))
        expect(mocks.reads.interactions).toBe(1)

        mocks.failing.delete('interactions')
        await act(async () => { fireEvent.click(bar()) })
        await waitFor(() => expect(mocks.reads.interactions).toBe(2))
        await waitFor(() => expect(bar().style.opacity).toBe('1'))
    })
})

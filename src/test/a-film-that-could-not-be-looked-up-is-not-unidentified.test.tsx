/**
 * A film that could not be looked up is not an unidentified film.
 * ─────────────────────────────────────────────────────────────────────────────
 * The CSV import asked TMDB for each title, and a request that failed came back
 * as "no such film". So when TMDB was down, the member was told their films
 * "could not be identified" and to add them by hand, when importing the same
 * file again would have done it. A write that failed was simply missing from
 * the count, and a film already in the archive was counted as imported. Now
 * each is said apart, in the ZIP importer's words.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
        matches: false, media: query, onchange: null,
        addListener: vi.fn(), removeListener: vi.fn(),
        addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
})

const mocks = vi.hoisted(() => ({
    upsertError: null as null | { message: string },
    /** Film ids already in the member's archive: ON CONFLICT DO NOTHING returns none of them. */
    held: new Set<number>(),
}))

vi.mock('../supabaseClient', () => ({
    supabase: {
        from: () => ({
            upsert: (rows: { film_id: number }[]) => ({
                select: () => Promise.resolve(mocks.upsertError
                    ? { data: null, error: mocks.upsertError }
                    : { data: rows.filter(r => !mocks.held.has(r.film_id)).map(r => ({ film_id: r.film_id })), error: null }),
            }),
        }),
    },
}))
vi.mock('../store', () => ({
    useAuthStore: (sel: any) => sel({ user: { id: 'member-uuid' } }),
    useFilmStore: { getState: () => ({ fetchLogs: vi.fn().mockResolvedValue(undefined) }) },
}))
vi.mock('../utils/reelToast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))
vi.mock('../tmdb', () => ({
    tmdb: {
        searchByTitleYear: async (title: string) => {
            if (title === 'The Matrix') return { id: 603, title: 'The Matrix', poster_path: '/matrix.jpg' }
            if (title === 'Parasite') return { id: 496243, title: 'Parasite', poster_path: '/parasite.jpg' }
            if (title === 'Nosferatu') throw new Error('TMDB could not be reached')
            return null // TMDB answered: no such film
        },
    },
}))

const CSV = [
    'Date,Name,Year,Letterboxd URI,Rating',
    '2024-01-05,The Matrix,1999,http://x,4.5',
    '2024-05-23,Parasite,2019,http://x,5',
    '2024-06-01,Nosferatu,1922,http://x,4',
    '2024-07-14,A Film That Does Not Exist Xyzzy,2020,http://x,2',
].join('\n')

async function importCSV() {
    const { default: CSVImport } = await import('../components/CSVImport')
    const { container } = render(<CSVImport onClose={() => {}} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File([CSV], 'diary.csv', { type: 'text/csv' })] } })
    fireEvent.click(await screen.findByText(/IMPORT \d+ FILMS/))
    await waitFor(() => expect(screen.getByText(/films successfully imported/)).toBeTruthy(), { timeout: 10000 })
    return screen.getByText(/films successfully imported/).textContent ?? ''
}

describe('the CSV import says what it could not do', { timeout: 20000 }, () => {
    beforeEach(() => { mocks.upsertError = null; mocks.held = new Set() })

    it('a film already in the archive is said so, never counted as imported', async () => {
        mocks.held = new Set([603])
        const said = await importCSV()
        expect(said).toMatch(/^1 films successfully imported/)
        expect(said).toMatch(/1 was already in your archive\./)
    })

    it('a lookup that could not run is "could not be looked up", not "could not be identified"', async () => {
        const said = await importCSV()
        expect(said).toMatch(/^2 films successfully imported/)
        expect(said).toMatch(/1 title could not be\s+identified/)
        expect(said).toMatch(/1 film could not be looked up just now\.\s+Import the same file again to add it\./)
    })

    it('a write that failed is said, never counted as imported', async () => {
        mocks.upsertError = { message: 'boom' }
        const said = await importCSV()
        expect(said).toMatch(/^0 films successfully imported/)
        expect(said).toMatch(/2 films could not be saved just now\.\s+Import the same file again to add them\./)
    })
})

describe('the CSV lookup itself', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('throws when TMDB could not be reached, and answers null only when TMDB knows no such film', async () => {
        const real = await vi.importActual<typeof import('../tmdb')>('../tmdb')
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' }))
        await expect(real.tmdb.searchByTitleYear('Nosferatu', 1922)).rejects.toBeInstanceOf(real.TMDBUnreachable)
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ results: [] }) }))
        expect(await real.tmdb.searchByTitleYear('Xyzzy', 2020)).toBeNull()
    }, 15000)
})

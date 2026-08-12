/**
 * csv-import-flow.test.tsx
 * ────────────────────────
 * Drives the REAL CSVImport component the way a member does: choose a file, press
 * IMPORT, read the result. This is the half that source-level assertions cannot
 * reach — that the screen is actually wired to the repaired logic.
 *
 * The import shipped broken from the day it was written, and every defect was
 * invisible from the code alone. So this asserts the payload that reaches the
 * database, not just that the component renders:
 *
 *   · rows carry real, distinct film ids — never the placeholder 0 that made the
 *     second row of any import collide with the first
 *   · the conflict target is the unique index that exists (user_id, film_id)
 *   · artwork lands in poster_path, the column that exists
 *   · two different films sharing a title stay two films
 *   · the same film listed twice is written once
 *   · titles that cannot be identified are reported, not silently dropped
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })),
})

/** Captures every upsert the component performs. */
const upsertCalls: { rows: any[]; options: any }[] = []

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: () => ({
      upsert: (rows: any[], options: any) => {
        upsertCalls.push({ rows, options })
        return Promise.resolve({ error: null })
      },
    }),
  },
}))

vi.mock('../../store', () => ({
  useAuthStore: (sel: any) => sel({ user: { id: 'member-uuid' } }),
  useFilmStore: { getState: () => ({ fetchLogs: vi.fn().mockResolvedValue(undefined) }) },
}))

vi.mock('../../utils/reelToast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))

/**
 * Stands in for TMDB with the shape the live proxy actually returns — verified
 * against it: /search/movie with a `year` parameter resolves both Dune films to
 * different ids, while appending the year to the query text returns nothing.
 */
vi.mock('../../tmdb', () => ({
  tmdb: {
    searchByTitleYear: async (title: string, year?: number | null) => {
      const db: Record<string, { id: number; title: string; poster_path: string }> = {
        'The Matrix|1999': { id: 603, title: 'The Matrix', poster_path: '/matrix.jpg' },
        'Dune|2021': { id: 438631, title: 'Dune', poster_path: '/dune2021.jpg' },
        'Dune|1984': { id: 841, title: 'Dune', poster_path: '/dune1984.jpg' },
        'Parasite|2019': { id: 496243, title: 'Parasite', poster_path: '/parasite.jpg' },
      }
      return db[`${title}|${year}`] ?? null
    },
  },
}))

const CSV = [
  'Date,Name,Year,Letterboxd URI,Rating',
  '2024-01-05,The Matrix,1999,http://x,4.5',
  '2024-02-11,Dune,2021,http://x,5',
  '2024-03-02,Dune,1984,http://x,3',
  '2024-05-23,Parasite,2019,http://x,5',
  '2024-06-30,The Matrix,1999,http://x,4.5',
  '2024-07-14,A Film That Does Not Exist Xyzzy,2020,http://x,2',
].join('\n')

async function importCSV() {
  const { default: CSVImport } = await import('../../components/CSVImport')
  const { container } = render(<CSVImport onClose={() => {}} />)
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File([CSV], 'diary.csv', { type: 'text/csv' })
  fireEvent.change(input, { target: { files: [file] } })
  const button = await screen.findByText(/IMPORT \d+ FILMS/)
  fireEvent.click(button)
  await waitFor(() => expect(upsertCalls.length).toBeGreaterThan(0), { timeout: 10000 })
  return screen
}

describe('CSV import — the real component, driven like a member', () => {
  beforeEach(() => { upsertCalls.length = 0 })

  it('writes real film ids, never the placeholder that broke every import', async () => {
    await importCSV()
    const rows = upsertCalls.flatMap((c) => c.rows)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.film_id).toBeGreaterThan(0)
      expect(r.user_id).toBe('member-uuid')
    }
  })

  it('targets the unique index that exists', async () => {
    await importCSV()
    for (const c of upsertCalls) {
      expect(c.options.onConflict).toBe('user_id,film_id')
      expect(c.options.ignoreDuplicates).toBe(true)
    }
  })

  it('keeps two different films that share a title', async () => {
    await importCSV()
    const ids = upsertCalls.flatMap((c) => c.rows).map((r) => r.film_id)
    expect(ids).toContain(438631)
    expect(ids).toContain(841)
  })

  it('writes the same film once, however many times the file lists it', async () => {
    await importCSV()
    const ids = upsertCalls.flatMap((c) => c.rows).map((r) => r.film_id)
    expect(ids.filter((i) => i === 603)).toHaveLength(1)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('stores artwork in poster_path', async () => {
    await importCSV()
    const rows = upsertCalls.flatMap((c) => c.rows)
    expect(rows.every((r) => typeof r.poster_path === 'string' && r.poster_path.length > 0)).toBe(true)
    expect(rows.every((r) => !('poster' in r))).toBe(true)
  })

  it('tells the member what it could not identify, and imports the rest', async () => {
    const s = await importCSV()
    await waitFor(() => expect(s.getByText(/films successfully imported/)).toBeTruthy())
    const panel = s.getByText(/films successfully imported/).parentElement!
    expect(panel.textContent).toMatch(/could not be identified/)
    // 6 rows in, one invented title, one exact duplicate -> 4 films written.
    expect(upsertCalls.flatMap((c) => c.rows)).toHaveLength(4)
  })
})

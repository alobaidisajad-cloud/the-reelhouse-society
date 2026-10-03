/**
 * a-transfer-says-only-what-went-wrong.test.ts — the website's archive import,
 * told in words, and losing nothing it could keep.
 *
 * The transfer listed "[INFO] Found: 412 diary…", "[DEBUG] Row[0]…" and raw
 * database messages in red as the member's errors. One review past 5,000
 * characters refused its batch of fifty logs; a failed watched or watchlist
 * batch vanished without a word; an archive that could not be read was taken as
 * empty, so every film already logged was sent again and refused; a busy TMDB
 * was asked again forever. What is asserted here is what the member reads and
 * what reaches the database.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import JSZip from 'jszip'

type Refusal = { code: string; message: string }

const db = vi.hoisted(() => ({
    saved: [] as { table: string; row: any }[],
    refuse: (_table: string, _row: any): Refusal | null => null,
    readFails: false,
}))

vi.mock('../supabaseClient', () => {
    const read = () => (db.readFails
        ? { data: null, error: { code: '08006', message: 'connection lost' } }
        : { data: [], error: null })
    return {
        supabase: {
            from: (table: string) => ({
                select: () => {
                    const q: any = {
                        eq: () => q,
                        range: async () => read(),
                        maybeSingle: async () => ({ data: null, error: null }),
                        then: (ok: any, fail: any) => Promise.resolve(read()).then(ok, fail),
                    }
                    return q
                },
                insert: (rows: any[]) => {
                    const refused = rows.map((r) => db.refuse(table, r)).find(Boolean) ?? null
                    if (!refused) for (const row of rows) db.saved.push({ table, row })
                    const answer = { data: refused ? null : rows, error: refused }
                    return {
                        then: (ok: any, fail: any) => Promise.resolve(answer).then(ok, fail),
                        select: () => ({ single: async () => (refused ? answer : { data: { id: 'stack-1' }, error: null }) }),
                    }
                },
            }),
        },
    }
})

vi.mock('../store', () => ({ useAuthStore: { getState: () => ({ user: { id: 'member-1' } }) } }))

import { importArchiveZip } from '../utils/archiveImport'

/** TMDB as the proxy answers it: a known title is found, "Busy …" is always rate-limited. */
const asked: string[] = []
const tmdb = vi.fn(async (_url: string, init: { body: string }) => {
    const path: string = JSON.parse(init.body).path
    const title = decodeURIComponent(/query=([^&]*)/.exec(path)![1])
    asked.push(title)
    if (title.startsWith('Busy')) return { status: 429, ok: false, json: async () => ({}) }
    const n = Number(/(\d+)$/.exec(title)?.[1] ?? 0)
    return { status: 200, ok: true, json: async () => ({ results: [{ id: 1000 + n, title, poster_path: `/p${n}.jpg`, release_date: '2001-01-01' }] }) }
})

const diaryCsv = (titles: string[]) => [
    'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date',
    ...titles.map((t) => `2024-01-05,${t},2001,http://x,4,,,2024-01-05`),
].join('\n')

async function archive(files: Record<string, string>) {
    const zip = new JSZip()
    for (const [name, text] of Object.entries(files)) zip.file(name, text)
    return (await zip.generateAsync({ type: 'uint8array' })) as unknown as File
}

/** The import, its pauses between TMDB batches run at once. */
async function run(files: Record<string, string>) {
    const zip = await archive(files)
    vi.useFakeTimers()
    const pending = importArchiveZip(zip, () => {})
    pending.catch(() => {})
    await vi.runAllTimersAsync()
    return pending
}

beforeEach(() => {
    db.saved = []
    db.refuse = () => null
    db.readFails = false
    asked.length = 0
    vi.stubGlobal('fetch', tmdb)
})
afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('the transfer says only what went wrong', () => {
    it('a clean import keeps every film and has nothing to report', async () => {
        const result = await run({ 'diary.csv': diaryCsv(['Clean 1', 'Clean 2', 'Clean 3']) })
        expect(result.errors).toEqual([])
        expect(result.logs).toBe(3)
        expect(db.saved.map((s) => s.row.film_id).sort()).toEqual([1001, 1002, 1003])
    })

    it('a review past the limit is cut between characters, kept, and the member told', async () => {
        const reel = String.fromCodePoint(0x1f3ac)
        const result = await run({
            'diary.csv': diaryCsv(['Long 4']),
            'reviews.csv': ['Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date',
                `2024-01-05,Long 4,2001,http://x,4,,"${reel.repeat(5001)}",,2024-01-05`].join('\n'),
        })
        const review: string = db.saved.find((s) => s.table === 'logs')!.row.review
        expect(Array.from(review).length).toBe(5000)
        expect(review.endsWith(reel)).toBe(true)
        expect(result.reviews).toBe(1)
        expect(result.errors).toEqual(['1 review was longer than 5,000 characters, so it was shortened to fit.'])
    })

    it('a row the database refuses costs itself, not the forty-nine beside it, and is told in words', async () => {
        const titles = Array.from({ length: 60 }, (_, i) => `Batch ${i + 1}`)
        db.refuse = (table, row) => (table === 'logs' && row.film_id === 1007 ? { code: '23514', message: 'new row violates check constraint "logs_review_len"' } : null)
        const result = await run({ 'diary.csv': diaryCsv(titles) })
        expect(result.logs).toBe(59)
        expect(db.saved.filter((s) => s.table === 'logs')).toHaveLength(59)
        expect(result.errors).toEqual(['1 diary entry could not be saved.'])
    })

    it('a film already in the archive is not a failure', async () => {
        db.refuse = (table, row) => (table === 'logs' && row.film_id === 1012 ? { code: '23505', message: 'duplicate key value violates unique constraint' } : null)
        const result = await run({ 'diary.csv': diaryCsv(['Dup 11', 'Dup 12', 'Dup 13']) })
        expect(result.logs).toBe(2)
        expect(result.errors).toEqual([])
    })

    it('an archive that cannot be read imports nothing, and says so', async () => {
        db.readFails = true
        await expect(run({ 'diary.csv': diaryCsv(['Unread 21']) }))
            .rejects.toThrow('Your archive could not be read just now, so nothing was imported. Please try again.')
        expect(db.saved).toEqual([])
    })

    it('a busy TMDB is asked three more times, then the film waits for the next import', async () => {
        const result = await run({ 'diary.csv': diaryCsv(['Busy 31', 'Calm 32']) })
        expect(asked.filter((t) => t === 'Busy 31')).toHaveLength(4)
        expect(result.logs).toBe(1)
        expect(result.skipped).toBe(0)
        expect(result.errors).toEqual(['1 film could not be looked up just now. Import the same file again to add it.'])
    })
})

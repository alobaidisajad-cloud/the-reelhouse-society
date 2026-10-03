/**
 * a-shelf-entry-is-only-added-to.test.ts — the website's shelf, filed into and never wiped.
 *
 * Logging a film on Blu-ray filed it on the shelf by upserting the whole row,
 * with the one format just logged, a blank note and 'good': a described
 * "DVD, 4K UHD — slipcase torn, worn" entry became a bare Blu-ray. The shelf
 * here is a table that holds its rows, so what is asserted is what the member
 * would find. (The app holds the same rule: mobile ShelfService.)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

type Row = { id: string; user_id: string; film_id: number; film_title: string; poster_path: string | null; year: number | null; formats: string[]; notes: string; condition: string; created_at: string }

const db = vi.hoisted(() => ({ rows: [] as Row[] }))

vi.mock('../supabaseClient', () => {
    const pick = (r: Row) => ({ id: r.id, formats: [...r.formats], notes: r.notes, condition: r.condition, created_at: r.created_at })
    const table = {
        upsert: (values: Partial<Row>[], opts: { ignoreDuplicates?: boolean }) => ({
            select: async () => {
                const v = values[0]
                const there = db.rows.find(r => r.user_id === v.user_id && r.film_id === v.film_id)
                if (there && opts.ignoreDuplicates) return { data: [], error: null }
                if (there) { Object.assign(there, v); return { data: [pick(there)], error: null } }
                const made = { id: `row-${db.rows.length + 1}`, created_at: '2026-10-03T00:00:00Z', ...v } as Row
                db.rows.push(made)
                return { data: [pick(made)], error: null }
            },
        }),
        select: () => {
            const f: Record<string, unknown> = {}
            const q = {
                eq: (k: string, v: unknown) => { f[k] = v; return q },
                maybeSingle: async () => {
                    const r = db.rows.find(x => x.user_id === f.user_id && x.film_id === f.film_id)
                    return { data: r ? pick(r) : null, error: null }
                },
            }
            return q
        },
        update: (patch: Partial<Row>) => ({
            eq: (_k: string, id: string) => ({
                select: () => ({
                    single: async () => {
                        const r = db.rows.find(x => x.id === id)!
                        Object.assign(r, patch)
                        return { data: pick(r), error: null }
                    },
                }),
            }),
        }),
    }
    return { supabase: { from: () => table, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } }
})

import { useFilmStore } from '../stores/films'
import { useAuthStore } from '../stores/auth'

const FILM = { id: 62, title: 'Seven Samurai', poster_path: '/7s.jpg', release_date: '1954-04-26' }
const described = (): Row => ({ id: 'row-1', user_id: 'm1', film_id: 62, film_title: 'Seven Samurai', poster_path: '/7s.jpg', year: 1954, formats: ['DVD', '4K UHD'], notes: 'Slipcase torn', condition: 'worn', created_at: '2026-01-01T00:00:00Z' })

beforeEach(() => {
    db.rows = []
    useAuthStore.setState({ user: { id: 'm1' } } as never)
    useFilmStore.setState({ physicalArchive: [] } as never)
})

describe('the shelf, filed from a log', () => {
    it('files a film not yet there, whole', async () => {
        await useFilmStore.getState().addToPhysicalArchive(FILM, ['Blu-ray'])
        expect(db.rows).toEqual([expect.objectContaining({ film_id: 62, formats: ['Blu-ray'], notes: '', condition: 'good' })])
    })

    it('leaves a described entry its note, condition and formats, and adds the one logged', async () => {
        db.rows.push(described())
        await useFilmStore.getState().addToPhysicalArchive(FILM, ['Blu-ray'])
        expect(db.rows).toEqual([{ ...described(), formats: ['DVD', '4K UHD', 'Blu-ray'] }])
        expect(useFilmStore.getState().physicalArchive[0]).toEqual(expect.objectContaining({ formats: ['DVD', '4K UHD', 'Blu-ray'], notes: 'Slipcase torn', condition: 'worn' }))
    })
})

describe('the shelf form', () => {
    it('writes the note and condition the member gave, on a film already there', async () => {
        db.rows.push(described())
        await useFilmStore.getState().addToPhysicalArchive(FILM, ['VHS'], 'Bought at the Tokyo Criterion sale', 'mint')
        expect(db.rows).toEqual([{ ...described(), formats: ['DVD', '4K UHD', 'VHS'], notes: 'Bought at the Tokyo Criterion sale', condition: 'mint' }])
    })
})

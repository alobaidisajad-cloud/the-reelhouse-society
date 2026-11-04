/**
 * An error report names its member.
 * ─────────────────────────────────────────────────────────────────────────────
 * The house keeps a report in error_logs only from a signed-in member, for
 * themselves (authed_insert_error_logs). The website's catch-all handlers and
 * its error boundaries sent theirs with no member, so every one was refused
 * (42501 in production's log, 2026-11-04) and lost, a signed-in member's too.
 * Now the member signed in is named, and a visitor's report is not sent.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ insert: vi.fn() }))
vi.mock('../supabaseClient', () => ({
    isSupabaseConfigured: true,
    supabase: {
        auth: { signOut: vi.fn() },
        from: (table: string) => ({ insert: (rows: unknown[]) => { mocks.insert(table, rows); return Promise.resolve({ error: null }) } }),
    },
}))

import { logError } from '../errorLogger'
import { useAuthStore } from '../stores/auth'

let n = 0
/** A message of its own each time: the logger keeps one of a kind for five seconds. */
const fresh = () => `boom ${++n}`

beforeEach(() => {
    mocks.insert.mockClear()
    useAuthStore.setState({ user: null, isAuthenticated: false })
})

describe('an error report', () => {
    it('names the member signed in when its caller names no one', async () => {
        useAuthStore.setState({ user: { id: 'u1', username: 'vesper' } as never, isAuthenticated: true })
        await logError({ type: 'uncaught', message: fresh() })
        expect(mocks.insert).toHaveBeenCalledTimes(1)
        expect(mocks.insert.mock.calls[0]?.[0]).toBe('error_logs')
        expect(mocks.insert.mock.calls[0]?.[1]).toEqual([expect.objectContaining({ user_id: 'u1', error_type: 'uncaught' })])
    })

    it('keeps the member its caller names', async () => {
        useAuthStore.setState({ user: { id: 'u1', username: 'vesper' } as never, isAuthenticated: true })
        await logError({ type: 'store', message: fresh(), userId: 'u2' })
        expect(mocks.insert.mock.calls[0]?.[1]).toEqual([expect.objectContaining({ user_id: 'u2' })])
    })

    it('is not sent for a visitor, whom the house would refuse', async () => {
        await logError({ type: 'uncaught', message: fresh() })
        expect(mocks.insert).not.toHaveBeenCalled()
    })
})

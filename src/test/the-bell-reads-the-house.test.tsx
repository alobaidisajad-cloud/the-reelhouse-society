/**
 * The website's bell reads the house's record, and a member's record leaves the
 * browser when the member does.
 * ─────────────────────────────────────────────────────────────────────────────
 * The bell asked for a `read` column; the column is `is_read`. Every read was
 * refused, so the bell was always empty and "mark all" changed nothing. Its rows
 * printed the message alone, so "is following you." named no one. A request to
 * follow could not be answered anywhere on the website.
 *
 * Signing out swept localStorage, but the member's record and notices are kept in
 * IndexedDB: on a shared computer the next person found them there.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as idb from 'idb-keyval'

const mocks = vi.hoisted(() => ({
    answers: {} as Record<string, { data: unknown; error: unknown }>,
    selects: [] as { table: string; columns: string }[],
    updates: [] as { table: string; row: unknown; filters: [string, unknown][] }[],
    rpc: vi.fn(),
    toastError: vi.fn(),
}))

vi.mock('../supabaseClient', () => {
    const builder = (table: string) => {
        const filters: [string, unknown][] = []
        let row: unknown = null
        const q: Record<string, unknown> = {}
        const chain = (name: string) => (...args: unknown[]) => {
            if (name === 'select') mocks.selects.push({ table, columns: String(args[0]) })
            if (name === 'update') row = args[0]
            if (['eq', 'neq'].includes(name)) filters.push([String(args[0]), args[1]])
            return q
        }
        for (const m of ['select', 'update', 'delete', 'eq', 'neq', 'order', 'limit']) q[m] = chain(m)
        q.then = (resolve: (v: unknown) => unknown) => {
            if (row) mocks.updates.push({ table, row, filters })
            return Promise.resolve(row ? { data: null, error: null } : (mocks.answers[table] ?? { data: [], error: null })).then(resolve)
        }
        return q
    }
    return {
        isSupabaseConfigured: true,
        supabase: {
            from: builder,
            rpc: mocks.rpc,
            channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
            removeChannel: vi.fn(),
            auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
        },
    }
})
vi.mock('../utils/reelToast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: mocks.toastError, info: vi.fn() }) }))
vi.mock('../hooks/useViewport', () => ({ useViewport: () => ({ isTouch: false }) }))

import NotificationBell from '../components/NotificationBell'
import { useAuthStore } from '../stores/auth'
import { useNotificationStore } from '../stores/social'
import { useFilmStore, forgetSavedRecord, unsealSavedRecord } from '../stores/films'

const NOTICE = { id: 'n1', type: 'follow', from_username: 'marguerite', message: 'is following you.', is_read: false, created_at: new Date().toISOString() }

beforeEach(() => {
    vi.clearAllMocks()
    mocks.selects.length = 0
    mocks.updates.length = 0
    mocks.answers = {
        notifications: { data: [NOTICE], error: null },
        interactions: { data: [{ user_id: 'r1', profiles: { username: 'otto' } }], error: null },
    }
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    useNotificationStore.setState({ notifications: [] })
    useAuthStore.setState({ user: { id: 'u1', username: 'vesper' } as never, isAuthenticated: true })
})

const openBell = async () => {
    render(<MemoryRouter><NotificationBell /></MemoryRouter>)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Notifications/ })) })
}

describe('the bell', () => {
    it('asks for the read mark the house keeps', async () => {
        await openBell()
        const notices = mocks.selects.find((s) => s.table === 'notifications')!
        expect(notices.columns.split(', ')).toContain('is_read')
        expect(notices.columns.split(', ')).not.toContain('read')
    })

    it('names the sender once, before what they did', async () => {
        await openBell()
        expect(screen.getByText('@marguerite')).toBeTruthy()
        expect(screen.getByText('@marguerite').parentElement!.textContent).toBe('@marguerite is following you.')
    })

    it('marks what it shows as read, by the column that exists', async () => {
        await openBell()
        const write = mocks.updates.find((u) => u.table === 'notifications')!
        expect(write.row).toEqual({ is_read: true })
        expect(write.filters).toContainEqual(['is_read', false])
    })

    it('shows a request at the door, read from the request, and lets it in', async () => {
        await openBell()
        expect(screen.getByText('@otto')).toBeTruthy()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Admit otto' })) })
        expect(mocks.rpc).toHaveBeenCalledWith('accept_follow_request', { requester_id: 'r1' })
        expect(screen.queryByText('@otto')).toBeNull()
    })

    it('a request that could not be answered says so, and the bell reads again', async () => {
        mocks.rpc.mockResolvedValue({ data: null, error: { message: 'denied' } })
        await openBell()
        const reads = mocks.selects.length
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Decline otto' })) })
        expect(mocks.rpc).toHaveBeenCalledWith('decline_follow_request', { requester_id: 'r1' })
        expect(mocks.toastError).toHaveBeenCalledWith('The request could not be declined. Try again.')
        expect(mocks.selects.length).toBeGreaterThan(reads)
        expect(screen.getByText('@otto')).toBeTruthy()
    })

    it('a read that failed is not an empty bell', async () => {
        mocks.answers.notifications = { data: null, error: { message: 'offline' } }
        await openBell()
        expect(screen.getByText(/THE BELL COULD NOT BE READ/)).toBeTruthy()
        expect(screen.queryByText('No transmissions yet.')).toBeNull()
    })
})

describe('a member’s record leaves the browser with them', () => {
    afterEach(() => { vi.useRealTimers(); unsealSavedRecord() })

    it('the notices are never kept in the browser, and an old copy is erased', async () => {
        const src = readFileSync(join(__dirname, '..', 'stores', 'social.ts'), 'utf8')
        expect(src).not.toMatch(/\bpersist\(/)
        vi.resetModules()
        vi.mocked(idb.del).mockClear()
        await import('../stores/social')
        expect(idb.del).toHaveBeenCalledWith('reelhouse-notifications')
    })

    it('forgetting erases the saved record and drops the write still waiting', async () => {
        vi.useFakeTimers()
        useFilmStore.setState({ logs: [{ id: 'l1' }] as never })
        await forgetSavedRecord()
        await vi.advanceTimersByTimeAsync(5000)
        expect(idb.set).not.toHaveBeenCalledWith('reelhouse-films', expect.anything())
        expect(idb.del).toHaveBeenCalledWith('reelhouse-films')
        expect(useFilmStore.getState().logs).toEqual([])
    })

    it('and nothing is saved again until a member signs in', async () => {
        vi.useFakeTimers()
        await forgetSavedRecord()
        useFilmStore.setState({ logs: [{ id: 'late' }] as never })
        await vi.advanceTimersByTimeAsync(5000)
        expect(idb.set).not.toHaveBeenCalledWith('reelhouse-films', expect.anything())
        unsealSavedRecord()
        useFilmStore.setState({ logs: [{ id: 'mine' }] as never })
        await vi.advanceTimersByTimeAsync(5000)
        expect(idb.set).toHaveBeenCalledWith('reelhouse-films', expect.stringContaining('"mine"'))
    })

    it('signing out forgets it', async () => {
        const location = window.location
        Object.defineProperty(window, 'location', { configurable: true, value: { ...location, href: '' } })
        await useAuthStore.getState().logout()
        expect(idb.del).toHaveBeenCalledWith('reelhouse-films')
        Object.defineProperty(window, 'location', { configurable: true, value: location })
    })
})

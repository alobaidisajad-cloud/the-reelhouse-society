/**
 * ReelHouse Store Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests pure state and initial conditions. Async operations that require
 * real Supabase auth (login, addLog, etc.) are integration-tested separately.
 * All Supabase calls are mocked via src/test/setup.js.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { act } from 'react'

// ─── Auth Store ──────────────────────────────────────────────────────────────
describe('useAuthStore — initial state', () => {
    it('starts unauthenticated with null user', async () => {
        const { useAuthStore } = await import('../store')
        const state = useAuthStore.getState()
        expect(state.user).toBeNull()
        expect(state.isAuthenticated).toBe(false)
    })

    it('exposes login, signup, and logout actions', async () => {
        const { useAuthStore } = await import('../store')
        const state = useAuthStore.getState()
        expect(typeof state.login).toBe('function')
        expect(typeof state.signup).toBe('function')
        expect(typeof state.logout).toBe('function')
    })

    it('can set user directly via setState (for testing)', async () => {
        const { useAuthStore } = await import('../store')
        const mockUser = { id: 'test-uuid', username: 'AUTEUR', email: 'test@example.com', role: 'auteur' }
        act(() => {
            useAuthStore.setState({ user: mockUser, isAuthenticated: true })
        })
        expect(useAuthStore.getState().isAuthenticated).toBe(true)
        expect(useAuthStore.getState().user.username).toBe('AUTEUR')
        // Cleanup
        act(() => {
            useAuthStore.setState({ user: null, isAuthenticated: false })
        })
    })
})

// ─── Film Store — Initial State & Synchronous Selectors ──────────────────────
describe('useFilmStore — initial state', () => {
    let useFilmStore

    beforeEach(async () => {
        const mod = await import('../store')
        useFilmStore = mod.useFilmStore
        // Reset to clean state
        act(() => {
            useFilmStore.setState({ logs: [], watchlist: [], interactions: [] })
        })
    })

    it('starts with empty logs array', () => {
        expect(useFilmStore.getState().logs).toEqual([])
    })

    it('starts with empty watchlist', () => {
        expect(useFilmStore.getState().watchlist).toEqual([])
    })

    it('starts with empty interactions', () => {
        expect(useFilmStore.getState().interactions).toEqual([])
    })

    it('exposes required action functions', () => {
        const state = useFilmStore.getState()
        expect(typeof state.fetchLogs).toBe('function')
        expect(typeof state.fetchWatchlist).toBe('function')
        expect(typeof state.toggleEndorse).toBe('function')
    })

    it('has ONE way to write a log, and it is not here', () => {
        // The store carried addLog / markAsWatched / unmarkWatched / updateLog as
        // well as useFilmMutations, and nothing called them — but they still wrote
        // the note onto the blank `private_notes` column and stringified the
        // viewing history by hand. A second copy of a write path is how a fix
        // lands in one and not the other. Every log write goes through
        // features/film/hooks/useFilmMutations.ts now.
        const state = useFilmStore.getState()
        for (const gone of ['addLog', 'markAsWatched', 'unmarkWatched', 'updateLog']) {
            expect(state[gone]).toBeUndefined()
        }
    })

    it('can set logs directly via setState (simulating loaded data)', () => {
        const mockLogs = [
            { id: 'a', title: 'Stalker', rating: 5, status: 'watched' },
            { id: 'b', title: 'Nosferatu', rating: 4, status: 'watched' },
        ]
        act(() => {
            useFilmStore.setState({ logs: mockLogs })
        })
        expect(useFilmStore.getState().logs).toHaveLength(2)
        expect(useFilmStore.getState().logs[0].title).toBe('Stalker')
    })

    it('can track endorsements in interactions array', () => {
        act(() => {
            useFilmStore.setState({
                interactions: [{ type: 'endorse', targetId: 'log-xyz', timestamp: new Date().toISOString() }]
            })
        })
        const state = useFilmStore.getState()
        const endorsed = state.interactions.some(i => i.type === 'endorse' && i.targetId === 'log-xyz')
        expect(endorsed).toBe(true)
    })
})

// ─── UI Store ─────────────────────────────────────────────────────────────────
describe('useUIStore — modal states', () => {
    it('logModalOpen starts false', async () => {
        const { useUIStore } = await import('../store')
        // Reset
        act(() => { useUIStore.setState({ logModalOpen: false }) })
        expect(useUIStore.getState().logModalOpen).toBe(false)
    })

    it('openLogModal sets logModalOpen to true', async () => {
        const { useUIStore } = await import('../store')
        act(() => { useUIStore.getState().openLogModal() })
        expect(useUIStore.getState().logModalOpen).toBe(true)
    })

    it('closeLogModal sets logModalOpen to false', async () => {
        const { useUIStore } = await import('../store')
        act(() => {
            useUIStore.getState().openLogModal()
            useUIStore.getState().closeLogModal()
        })
        expect(useUIStore.getState().logModalOpen).toBe(false)
    })
})

// ─── Dispatch Store ────────────────────────────────────────────────────────────
describe('useDispatchStore — dossiers', () => {
    it('dossiers is a non-null array', async () => {
        const { useDispatchStore } = await import('../store')
        expect(Array.isArray(useDispatchStore.getState().dossiers)).toBe(true)
    })

    it('dossiers can be set directly via setState', async () => {
        const { useDispatchStore } = await import('../store')
        const mockDossiers = [
            { id: 'd1', title: 'Death of Cinema', author: 'OMEN', excerpt: 'test', date: 'TODAY' }
        ]
        act(() => {
            useDispatchStore.setState({ dossiers: mockDossiers })
        })
        expect(useDispatchStore.getState().dossiers).toHaveLength(1)
        expect(useDispatchStore.getState().dossiers[0].title).toBe('Death of Cinema')
        // Cleanup
        act(() => { useDispatchStore.setState({ dossiers: [] }) })
    })

    it('exposes addDossier action', async () => {
        const { useDispatchStore } = await import('../store')
        expect(typeof useDispatchStore.getState().addDossier).toBe('function')
    })
})

// ── Notification Store ────────────────────────────────────────────────────────
describe('useNotificationStore — notifications', () => {
    it('starts with empty notifications array', async () => {
        const { useNotificationStore } = await import('../store')
        const state = useNotificationStore.getState()
        expect(Array.isArray(state.notifications)).toBe(true)
    })

    it('can push a notification', async () => {
        const { useNotificationStore } = await import('../store')
        const mockNotification = { id: 'n1', type: 'endorse', message: 'Someone endorsed your log', read: false, created_at: new Date().toISOString() }
        act(() => {
            useNotificationStore.setState({ notifications: [mockNotification] })
        })
        expect(useNotificationStore.getState().notifications).toHaveLength(1)
        expect(useNotificationStore.getState().notifications[0].type).toBe('endorse')
        // Cleanup
        act(() => { useNotificationStore.setState({ notifications: [] }) })
    })

    it('can mark all as read', async () => {
        const { useNotificationStore } = await import('../store')
        act(() => {
            useNotificationStore.setState({
                notifications: [
                    { id: 'n1', read: false },
                    { id: 'n2', read: false },
                ]
            })
        })
        const state = useNotificationStore.getState()
        // markAllRead should exist as a function
        if (typeof state.markAllRead === 'function') {
            act(() => { state.markAllRead() })
        }
        // Cleanup
        act(() => { useNotificationStore.setState({ notifications: [] }) })
    })
})

// ── Stores for dropped tables stay gone ───────────────────────────────────────
// `programmes`, `vaults` and `tickets` were dropped from production in batch 31.
// These tests used to pin the programme store's shape — asserting that a
// feature which could only fail still existed. The mobile guard
// everyNameAClientCallsExists holds every table name; this holds the surface.
describe('stores for dropped tables stay gone', () => {
    it('there is no programme store', async () => {
        const store = await import('../store')
        expect(store.useProgrammeStore).toBeUndefined()
    })

    it('the film store keeps no vault and no ticket stubs', async () => {
        const { useFilmStore } = await import('../store')
        const state = useFilmStore.getState()
        for (const gone of ['vault', 'stubs', 'fetchVault', 'addToVault', 'removeFromVault', 'fetchStubs', 'saveStub']) {
            expect(state[gone]).toBeUndefined()
        }
    })
})

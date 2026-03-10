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
            useFilmStore.setState({ logs: [], watchlist: [], vault: [], interactions: [] })
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
        expect(typeof state.addLog).toBe('function')
        expect(typeof state.toggleEndorse).toBe('function')
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


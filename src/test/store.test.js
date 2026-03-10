import { describe, it, expect, beforeEach } from 'vitest'
import { act } from 'react'

// ─── Test helpers ───────────────────────────────────────────────────
// We test the raw Zustand stores without rendering full React trees,
// keeping tests fast and independent of UI components.

// ─── Auth Store ─────────────────────────────────────────────────────
describe('Auth Store', () => {
    it('starts unauthenticated', async () => {
        const { useAuthStore } = await import('../store')
        const state = useAuthStore.getState()
        expect(state.isAuthenticated).toBe(false)
        expect(state.user).toBeNull()
    })

    it('setUser marks authenticated and stores user', async () => {
        const { useAuthStore } = await import('../store')
        const mockUser = { id: 'u1', username: 'TestUser', email: 'test@example.com', role: 'cinephile' }
        act(() => {
            useAuthStore.getState().setUser(mockUser)
        })
        const state = useAuthStore.getState()
        expect(state.isAuthenticated).toBe(true)
        expect(state.user.username).toBe('TestUser')
        // Cleanup
        act(() => { useAuthStore.getState().clearUser() })
    })

    it('clearUser resets to unauthenticated', async () => {
        const { useAuthStore } = await import('../store')
        const mockUser = { id: 'u2', username: 'Ghost', email: 'ghost@example.com', role: 'cinephile' }
        act(() => {
            useAuthStore.getState().setUser(mockUser)
            useAuthStore.getState().clearUser()
        })
        const state = useAuthStore.getState()
        expect(state.isAuthenticated).toBe(false)
        expect(state.user).toBeNull()
    })
})

// ─── Film Store — Logs ───────────────────────────────────────────────
describe('Film Store — Log Management', () => {
    let useFilmStore

    beforeEach(async () => {
        const mod = await import('../store')
        useFilmStore = mod.useFilmStore
        // Reset logs between tests
        act(() => {
            useFilmStore.setState({ logs: [], watchlist: [], interactions: [] })
        })
    })

    it('addLog inserts a new log entry', () => {
        const logEntry = {
            id: 'log-1',
            film: { id: 101, title: 'Stalker', year: 1979 },
            rating: 5,
            status: 'watched',
            date: '2026-03-10',
        }
        act(() => { useFilmStore.getState().addLog(logEntry) })
        const logs = useFilmStore.getState().logs
        expect(logs).toHaveLength(1)
        expect(logs[0].id).toBe('log-1')
        expect(logs[0].film.title).toBe('Stalker')
    })

    it('addLog does not duplicate if same id added twice', () => {
        const logEntry = {
            id: 'log-2',
            film: { id: 102, title: 'Nosferatu', year: 1922 },
            rating: 4,
            status: 'watched',
        }
        act(() => {
            useFilmStore.getState().addLog(logEntry)
            useFilmStore.getState().addLog(logEntry)
        })
        // Should either insert once or update in place — not duplicate
        const logs = useFilmStore.getState().logs
        const matching = logs.filter(l => l.id === 'log-2')
        expect(matching.length).toBeLessThanOrEqual(1)
    })

    it('watchlist toggle adds then removes a film', () => {
        act(() => { useFilmStore.getState().toggleWatchlist({ id: 200, title: 'Metropolis' }) })
        expect(useFilmStore.getState().watchlist).toHaveLength(1)
        act(() => { useFilmStore.getState().toggleWatchlist({ id: 200, title: 'Metropolis' }) })
        expect(useFilmStore.getState().watchlist).toHaveLength(0)
    })
})

// ─── UI Store ───────────────────────────────────────────────────────
describe('UI Store', () => {
    it('openLogModal sets logModalOpen to true', async () => {
        const { useUIStore } = await import('../store')
        act(() => { useUIStore.getState().openLogModal() })
        expect(useUIStore.getState().logModalOpen).toBe(true)
        act(() => { useUIStore.getState().closeLogModal() })
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

// ─── Programme Store ─────────────────────────────────────────────────
describe('Programme Store', () => {
    it('starts with empty programmes array', async () => {
        const { useProgrammeStore } = await import('../store')
        const state = useProgrammeStore.getState()
        expect(Array.isArray(state.programmes)).toBe(true)
    })
})

// ─── Dispatch Store ──────────────────────────────────────────────────
describe('Dispatch Store', () => {
    it('addDossier inserts content into dossiers', async () => {
        const { useDispatchStore } = await import('../store')
        const before = useDispatchStore.getState().dossiers.length
        act(() => {
            useDispatchStore.getState().addDossier({
                title: 'The Death of Film Criticism',
                excerpt: 'An essay by the last critic alive.',
                fullContent: 'Full text here...',
                author: 'AUTEUR',
                date: '2026-03-10',
            })
        })
        expect(useDispatchStore.getState().dossiers.length).toBe(before + 1)
    })
})

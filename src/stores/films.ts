import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../supabaseClient'
import { useAuthStore } from './auth'
import { FilmLog, WatchlistItem, VaultItem, FilmList, TicketStub, Interaction, PhysicalArchiveItem } from '../types'

declare global {
  interface Window {
    __rh_undo_log?: () => void;
    __rh_undo_watchlist?: () => void;
  }
}

/** Lightweight shape for TMDB film data passed into store methods */
interface TMDBFilmInput {
    id: number
    title?: string
    name?: string
    poster_path?: string | null
    release_date?: string
}

export interface FilmState {
    logs: FilmLog[]
    watchlist: WatchlistItem[]
    vault: VaultItem[]
    lists: FilmList[]
    stubs: TicketStub[]
    interactions: Interaction[]
    physicalArchive: PhysicalArchiveItem[]

    toggleEndorse: (targetId: string) => Promise<void>
    hasEndorsed: (targetId: string) => boolean
    fetchEndorsements: () => Promise<void>
    fetchLogs: () => Promise<void>
    fetchWatchlist: () => Promise<void>
    fetchVault: () => Promise<void>
    fetchLists: () => Promise<void>
    fetchStubs: () => Promise<void>
    saveStub: (stub: Partial<TicketStub> & { showtimeId?: string, slotId?: string }) => Promise<string | null>
    addStubLocal: (stub: Partial<TicketStub>) => void
    addLog: (log: Partial<FilmLog>) => Promise<void>
    getCinephileStats: () => { count: number, level: string, color: string, progress: number }
    updateLog: (id: string, updates: Partial<FilmLog>) => Promise<void>
    removeLog: (id: string) => Promise<void>
    addToWatchlist: (film: TMDBFilmInput) => Promise<void>
    removeFromWatchlist: (filmId: number) => Promise<void>
    addToVault: (film: TMDBFilmInput, format?: string) => Promise<void>
    removeFromVault: (filmId: number) => Promise<void>
    createList: (list: Partial<FilmList>) => Promise<void>
    addFilmToList: (listId: string, film: TMDBFilmInput) => Promise<void>
    removeFilmFromList: (listId: string, filmId: number) => Promise<void>
    fetchPhysicalArchive: (userId?: string) => Promise<PhysicalArchiveItem[]>
    addToPhysicalArchive: (film: TMDBFilmInput, formats: string[], notes?: string, condition?: string) => Promise<void>
    removeFromPhysicalArchive: (filmId: number) => Promise<void>
    updatePhysicalArchiveItem: (filmId: number, updates: Partial<PhysicalArchiveItem>) => Promise<void>
}

export const useFilmStore = create<FilmState>()(
    persist(
        (set, get) => ({
            logs: [],
            watchlist: [],
            vault: [],
            lists: [],
            stubs: [],           // Supabase-backed digital tickets — fetched on login
            interactions: [],    // { type: 'endorse', targetId, timestamp }
            physicalArchive: [], // Physical media collection — 4K, Blu-ray, DVD, VHS, etc.

            toggleEndorse: async (targetId) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const prevInteractions = get().interactions
                const exists = prevInteractions.find((i) => i.targetId === targetId && i.type === 'endorse')

                // Optimistic update — UI responds instantly
                if (exists) {
                    set((state) => ({ interactions: state.interactions.filter((i) => !(i.targetId === targetId && i.type === 'endorse')) }))
                } else {
                    set((state) => ({ interactions: [...state.interactions, { type: 'endorse', targetId, timestamp: new Date().toISOString() }] }))
                }

                // Background sync — rollback on failure
                try {
                    if (exists) {
                        const { error } = await supabase.from('interactions').delete()
                            .eq('user_id', user.id).eq('target_log_id', targetId).eq('type', 'endorse_log')
                        if (error) throw error
                    } else {
                        const { error } = await supabase.from('interactions').insert([
                            { user_id: user.id, target_log_id: targetId, type: 'endorse_log' }
                        ])
                        if (error && !error.message?.includes('duplicate')) throw error
                    }
                } catch {
                    // Functional Rollback to prevent race condition erasure
                    if (exists) {
                        set((state) => ({ interactions: [...state.interactions, exists] }))
                    } else {
                        set((state) => ({ interactions: state.interactions.filter((i) => !(i.targetId === targetId && i.type === 'endorse')) }))
                    }
                    const { default: toast } = await import('react-hot-toast')
                    toast.error('Endorsement failed — please try again.')
                }
            },

            hasEndorsed: (targetId) => get().interactions.some((i) => i.targetId === targetId && i.type === 'endorse'),

            fetchEndorsements: async () => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { data, error } = await supabase
                    .from('interactions')
                    .select('target_log_id, created_at')
                    .eq('user_id', user.id)
                    .eq('type', 'endorse_log')
                    .limit(2000)
                if (!error && data) {
                    set({
                        interactions: data.map(r => ({
                            type: 'endorse',
                            targetId: r.target_log_id,
                            timestamp: r.created_at,
                        }))
                    })
                }
            },

            fetchLogs: async () => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { data, error } = await supabase
                    .from('logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5000)
                if (!error && data) {
                    set({
                        logs: data.map((dbLog) => ({
                            id: dbLog.id,
                            filmId: dbLog.film_id,
                            title: dbLog.film_title,
                            poster: dbLog.poster_path || null,
                            year: dbLog.year || null,
                            rating: dbLog.rating,
                            review: dbLog.review,
                            status: dbLog.status || 'watched',
                            isSpoiler: dbLog.is_spoiler || false,
                            watchedDate: dbLog.watched_date,
                            watchedWith: dbLog.watched_with || null,
                            privateNotes: dbLog.private_notes || null,
                            abandonedReason: dbLog.abandoned_reason || null,
                            physicalMedia: dbLog.physical_media || null,
                            isAutopsied: dbLog.is_autopsied || false,
                            autopsy: dbLog.autopsy || null,
                            altPoster: dbLog.alt_poster || null,
                            editorialHeader: dbLog.editorial_header || null,
                            dropCap: dbLog.drop_cap || false,
                            pullQuote: dbLog.pull_quote || '',
                            createdAt: dbLog.created_at,
                        })),
                    })
                }
            },

            fetchWatchlist: async () => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { data, error } = await supabase
                    .from('watchlists').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(2000)
                if (!error && data) {
                    set({ watchlist: data.map((w) => ({ id: w.film_id, title: w.film_title, poster_path: w.poster_path || null, year: w.year || null })) })
                }
            },

            fetchVault: async () => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { data, error } = await supabase
                    .from('vaults').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(2000)
                if (!error && data) {
                    set({ vault: data.map((v) => ({ id: v.film_id, title: v.film_title, poster_path: v.poster_path || null, year: v.year || null, format: v.format || 'Digital' })) })
                }
            },

            fetchLists: async () => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { data: lists, error } = await supabase
                    .from('lists').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200)
                if (!error && lists) {
                    const fullLists = await Promise.all(lists.map(async (list) => {
                        const { data: items } = await supabase.from('list_items').select('*').eq('list_id', list.id).limit(500)
                        return {
                            id: list.id, title: list.title, description: list.description,
                            isRanked: list.is_ranked, isPrivate: list.is_private || false, createdAt: list.created_at,
                            films: (items || []).map((i) => ({ id: i.film_id, title: i.film_title, poster: i.poster_path || null })),
                        }
                    }))
                    set({ lists: fullLists })
                }
            },

            fetchStubs: async () => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { data, error } = await supabase
                    .from('tickets')
                    .select('*, showtimes(film_title, date)')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(500)
                if (!error && data) {
                    set({
                        stubs: data.map((t) => ({
                            id: t.id || '',
                            filmTitle: t.showtimes?.film_title || 'Unknown Film',
                            date: t.showtimes?.date || '',
                            seat: t.seat || '—',
                            ticketType: t.ticket_type || 'Standard',
                            amount: t.amount || 0,
                            qrCode: t.qr_code || null,
                            screenName: t.screen_name || null,
                            createdAt: t.created_at || new Date().toISOString(),
                        })),
                    })
                }
            },

            saveStub: async (stub) => {
                const user = useAuthStore.getState().user
                if (!user) return null
                // Only write to DB if we have a real showtime UUID (not demo data)
                const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
                const isRealShowtime = stub.showtimeId && UUID_RE.test(stub.showtimeId)
                if (!isRealShowtime) return null
                const { data, error } = await supabase.from('tickets').insert([{
                    user_id: user.id,
                    showtime_id: stub.showtimeId,
                    slot_id: stub.slotId || 'default',
                    seat: stub.seat || '—',
                    ticket_type: stub.ticketType || 'Standard',
                    amount: stub.amount || 0,
                    qr_code: stub.qrCode || null,
                    screen_name: stub.screenName || null,
                }]).select().single()
                if (!error && data) {
                    return data.id
                }
                return null
            },

            addStubLocal: (stub) => {
                // Used for demo/mock venues without a real Supabase showtime UUID
                set((state) => ({ stubs: [{ id: stub.id || crypto.randomUUID(), filmTitle: stub.filmTitle || 'Unknown Film', date: stub.date || '', seat: stub.seat || '\u2014', ticketType: stub.ticketType || 'Standard', amount: stub.amount || 0, qrCode: stub.qrCode || null, screenName: stub.screenName || null, createdAt: stub.createdAt || new Date().toISOString() }, ...state.stubs] }))
            },

            addLog: async (log) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { data, error } = await supabase.from('logs').insert([{
                    user_id: user.id,
                    film_id: log.filmId, film_title: log.title,
                    poster_path: log.poster || null, year: log.year || null,
                    rating: log.rating || 0, review: log.review || '',
                    status: log.status || 'watched', is_spoiler: log.isSpoiler || false,
                    watched_date: log.watchedDate || new Date().toISOString(),
                    watched_with: log.watchedWith || null,
                    private_notes: log.privateNotes || null,
                    abandoned_reason: log.abandonedReason || null,
                    physical_media: log.physicalMedia || null,
                    is_autopsied: log.isAutopsied || false, autopsy: log.autopsy || null,
                    alt_poster: log.altPoster || null, editorial_header: log.editorialHeader || null,
                    drop_cap: log.dropCap || false, pull_quote: log.pullQuote || '',
                    format: log.physicalMedia || 'Digital',
                }]).select().single()

                if (error) return // Fail gracefully — error handled upstream by LogModal toast

                set((state) => ({
                    logs: [{ ...log, id: data.id, createdAt: data.created_at } as FilmLog, ...state.logs],
                }))
            },

            getCinephileStats: () => {
                const logs = get().logs
                const count = logs.length
                let level = 'FIRST REEL'
                let color = 'var(--fog)'
                if (count > 50) { level = 'THE ORACLE'; color = 'var(--sepia)' }
                else if (count > 20) { level = 'MIDNIGHT DEVOTEE'; color = 'var(--blood-reel)' }
                else if (count > 5) { level = 'THE REGULAR'; color = 'var(--flicker)' }
                return { count, level, color, progress: (count % 20) * 5 }
            },

            updateLog: async (id, updates) => {
                const dbUpdates: any = {}
                if (updates.rating !== undefined) dbUpdates.rating = updates.rating
                if (updates.review !== undefined) dbUpdates.review = updates.review
                if (updates.status !== undefined) dbUpdates.status = updates.status
                if (updates.isSpoiler !== undefined) dbUpdates.is_spoiler = updates.isSpoiler
                if (updates.watchedDate !== undefined) dbUpdates.watched_date = updates.watchedDate
                if (updates.watchedWith !== undefined) dbUpdates.watched_with = updates.watchedWith
                if (updates.privateNotes !== undefined) dbUpdates.private_notes = updates.privateNotes
                if (updates.abandonedReason !== undefined) dbUpdates.abandoned_reason = updates.abandonedReason
                if (updates.physicalMedia !== undefined) dbUpdates.physical_media = updates.physicalMedia
                if (updates.isAutopsied !== undefined) dbUpdates.is_autopsied = updates.isAutopsied
                if (updates.autopsy !== undefined) dbUpdates.autopsy = updates.autopsy
                const { error } = await supabase.from('logs').update(dbUpdates).eq('id', id)
                if (!error) set((state) => ({ logs: state.logs.map((l) => l.id === id ? { ...l, ...updates } : l) }))
            },

            removeLog: async (id) => {
                const logToRemove = get().logs.find((l) => l.id === id)
                if (!logToRemove) return

                // Optimistic remove with 5s undo toast (all users)
                set((state) => ({ logs: state.logs.filter((l) => l.id !== id) }))
                let undone = false
                const toastModule = await import('react-hot-toast')
                const toast: any = toastModule.default || (toastModule as any)
                toast(`"${logToRemove.title}" removed. Tap to undo.`, {
                    duration: 5000, id: `undo-${id}`,
                    style: { background: 'var(--soot)', color: 'var(--parchment)', border: '1px solid var(--sepia)', fontFamily: 'var(--font-sub)', cursor: 'pointer' },
                })
                window.__rh_undo_log = () => {
                    undone = true
                    set((state) => ({ logs: [logToRemove, ...state.logs] }))
                    import('react-hot-toast').then((m) => {
                        m.default.dismiss(`undo-${id}`)
                        m.default.success(`"${logToRemove.title}" restored ✦`)
                    })
                }
                setTimeout(async () => { if (!undone) await supabase.from('logs').delete().eq('id', id) }, 5200)
            },

            addToWatchlist: async (film) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { error } = await supabase.from('watchlists').insert([{
                    user_id: user.id, film_id: film.id,
                    film_title: film.title || film.name || 'Unknown',
                    poster_path: film.poster_path || null,
                    year: film.release_date ? new Date(film.release_date).getFullYear() : null,
                }])
                if (!error) {
                    set((state) => ({
                        watchlist: state.watchlist.find((f) => f.id === film.id) ? state.watchlist
                            : [...state.watchlist, { id: film.id, title: film.title || film.name || 'Unknown', poster_path: film.poster_path, year: film.release_date ? new Date(film.release_date).getFullYear() : undefined }],
                    }))
                }
            },

            removeFromWatchlist: async (filmId) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const itemToRemove = get().watchlist.find((f) => f.id === filmId)

                // Optimistic remove with 5s undo toast
                set((state) => ({ watchlist: state.watchlist.filter((f) => f.id !== filmId) }))
                let undone = false
                const toastModule = await import('react-hot-toast')
                const toast: any = toastModule.default || (toastModule as any)
                toast(`"${itemToRemove?.title || 'Film'}" removed from watchlist. Tap to undo.`, {
                    duration: 5000, id: `undo-wl-${filmId}`,
                    style: { background: 'var(--soot)', color: 'var(--parchment)', border: '1px solid var(--sepia)', fontFamily: 'var(--font-sub)', cursor: 'pointer' },
                })
                window.__rh_undo_watchlist = () => {
                    undone = true
                    if (itemToRemove) set((state) => ({ watchlist: [...state.watchlist, itemToRemove] }))
                    import('react-hot-toast').then((m) => {
                        m.default.dismiss(`undo-wl-${filmId}`)
                        m.default.success(`Restored to watchlist ✦`)
                    })
                }
                setTimeout(async () => { if (!undone) await supabase.from('watchlists').delete().eq('user_id', user.id).eq('film_id', filmId) }, 5200)
            },

            addToVault: async (film, format = 'Digital') => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { error } = await supabase.from('vaults').insert([{
                    user_id: user.id, film_id: film.id,
                    film_title: film.title || film.name || 'Unknown',
                    poster_path: film.poster_path || null,
                    year: film.release_date ? new Date(film.release_date).getFullYear() : null,
                    format,
                }])
                if (!error) {
                    set((state) => ({
                        vault: state.vault.find((f) => f.id === film.id) ? state.vault
                            : [...state.vault, { id: film.id, title: film.title || film.name || 'Unknown', poster_path: film.poster_path, format }],
                    }))
                }
            },

            removeFromVault: async (filmId) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { error } = await supabase.from('vaults').delete().eq('user_id', user.id).eq('film_id', filmId)
                if (!error) set((state) => ({ vault: state.vault.filter((f) => f.id !== filmId) }))
            },

            createList: async (list) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { data, error } = await supabase.from('lists').insert([{
                    user_id: user.id, title: list.title, description: list.description || '',
                }]).select().single()
                if (!error && data) {
                    set((state) => ({ lists: [{ id: data.id, title: list.title || 'Untitled', description: list.description || '', isRanked: false, isPrivate: false, films: [], createdAt: data.created_at }, ...state.lists] }))
                }
            },

            addFilmToList: async (listId, film) => {
                const { error } = await supabase.from('list_items').insert([{
                    list_id: listId, film_id: film.id, film_title: film.title || film.name || 'Unknown',
                    poster_path: film.poster_path || null,
                }])
                if (!error) {
                    set((state) => ({
                        lists: state.lists.map((l) => l.id === listId
                            ? { ...l, films: l.films.find((f) => f.id === film.id) ? l.films : [...l.films, { id: film.id, title: film.title || film.name || 'Unknown', poster_path: film.poster_path }] }
                            : l
                        ),
                    }))
                }
            },

            removeFilmFromList: async (listId, filmId) => {
                const { error } = await supabase.from('list_items').delete().eq('list_id', listId).eq('film_id', filmId)
                if (!error) {
                    set((state) => ({
                        lists: state.lists.map((l) => l.id === listId
                            ? { ...l, films: l.films.filter((f) => f.id !== filmId) }
                            : l
                        ),
                    }))
                }
            },

            // ── PHYSICAL ARCHIVE ──
            fetchPhysicalArchive: async (userId?: string) => {
                const uid = userId || useAuthStore.getState().user?.id
                if (!uid) return []
                const { data, error } = await supabase
                    .from('physical_archive').select('*').eq('user_id', uid)
                    .order('created_at', { ascending: false }).limit(2000)
                if (!error && data) {
                    const items = data.map((item: any) => ({
                        id: item.id,
                        filmId: item.film_id,
                        title: item.film_title,
                        poster_path: item.poster_path || null,
                        year: item.year || null,
                        formats: item.formats || [],
                        notes: item.notes || '',
                        condition: item.condition || 'good',
                        createdAt: item.created_at,
                    }))
                    if (!userId || userId === useAuthStore.getState().user?.id) {
                        set({ physicalArchive: items })
                    }
                    return items
                }
                return []
            },

            addToPhysicalArchive: async (film, formats, notes = '', condition = 'good') => {
                const user = useAuthStore.getState().user
                if (!user) return
                // Upsert — if film already exists, update formats
                const { data, error } = await supabase.from('physical_archive').upsert([{
                    user_id: user.id,
                    film_id: film.id,
                    film_title: film.title || film.name || 'Unknown',
                    poster_path: film.poster_path || null,
                    year: film.release_date ? new Date(film.release_date).getFullYear() : null,
                    formats,
                    notes,
                    condition,
                }], { onConflict: 'user_id,film_id' }).select().single()
                if (!error && data) {
                    set((state) => {
                        const exists = state.physicalArchive.find(a => a.filmId === film.id)
                        if (exists) {
                            return { physicalArchive: state.physicalArchive.map(a => a.filmId === film.id ? { ...a, formats, notes, condition } : a) }
                        }
                        return { physicalArchive: [{ id: data.id, filmId: film.id, title: film.title || film.name || 'Unknown', poster_path: film.poster_path || null, year: film.release_date ? new Date(film.release_date).getFullYear() : undefined, formats, notes, condition, createdAt: data.created_at }, ...state.physicalArchive] }
                    })
                }
            },

            removeFromPhysicalArchive: async (filmId) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { error } = await supabase.from('physical_archive').delete().eq('user_id', user.id).eq('film_id', filmId)
                if (!error) set((state) => ({ physicalArchive: state.physicalArchive.filter(a => a.filmId !== filmId) }))
            },

            updatePhysicalArchiveItem: async (filmId, updates) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const dbUpdates: any = {}
                if (updates.formats) dbUpdates.formats = updates.formats
                if (updates.notes !== undefined) dbUpdates.notes = updates.notes
                if (updates.condition !== undefined) dbUpdates.condition = updates.condition
                const { error } = await supabase.from('physical_archive').update(dbUpdates).eq('user_id', user.id).eq('film_id', filmId)
                if (!error) set((state) => ({ physicalArchive: state.physicalArchive.map(a => a.filmId === filmId ? { ...a, ...updates } : a) }))
            },
        }),
        {
            name: 'reelhouse-films',
            // ── PERSIST AUDIT — only safe, essential fields survive to localStorage ──
            // Private notes and abandoned reasons are NEVER stored in localStorage — Supabase only
            // Stubs are decorative and regenerated on next addLog — no need to persist
            partialize: (state) => ({
                logs: state.logs.map((l) => ({
                    id: l.id, filmId: l.filmId, title: l.title, poster: l.poster,
                    year: l.year, rating: l.rating, review: l.review, status: l.status,
                    isSpoiler: l.isSpoiler, watchedDate: l.watchedDate, createdAt: l.createdAt,
                    // privateNotes omitted — never in localStorage
                    // abandonedReason omitted — never in localStorage
                })),
                watchlist: state.watchlist.map((f) => ({ id: f.id, title: f.title, poster_path: f.poster_path, year: f.year })),
                vault: state.vault.map((f) => ({ id: f.id, title: f.title, poster_path: f.poster_path, year: f.year, format: f.format })),
                lists: state.lists.map((l) => ({ id: l.id, title: l.title, description: l.description, films: l.films.map((f) => ({ id: f.id, title: f.title })) })),
                // stubs NOT persisted — decorative, always regenerated
            }),
        }
    )
)

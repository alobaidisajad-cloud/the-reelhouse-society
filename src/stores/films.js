import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../supabaseClient'
import { useAuthStore } from './auth'

export const useFilmStore = create(
    persist(
        (set, get) => ({
            logs: [],
            watchlist: [],
            vault: [],
            lists: [],
            stubs: [],       // Supabase-backed digital tickets — fetched on login
            interactions: [], // { type: 'endorse', targetId, timestamp }

            toggleEndorse: async (targetId) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const exists = get().interactions.find((i) => i.targetId === targetId && i.type === 'endorse')
                if (exists) {
                    const { error } = await supabase.from('interactions').delete()
                        .eq('user_id', user.id).eq('target_log_id', targetId).eq('type', 'endorse_log')
                    if (!error) set((state) => ({ interactions: state.interactions.filter((i) => !(i.targetId === targetId && i.type === 'endorse')) }))
                } else {
                    const { error } = await supabase.from('interactions').insert([
                        { user_id: user.id, target_log_id: targetId, type: 'endorse_log' }
                    ])
                    if (!error) set((state) => ({ interactions: [...state.interactions, { type: 'endorse', targetId, timestamp: new Date().toISOString() }] }))
                }
            },

            hasEndorsed: (targetId) => get().interactions.some((i) => i.targetId === targetId && i.type === 'endorse'),

            fetchLogs: async () => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { data, error } = await supabase
                    .from('logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
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
                    .from('watchlists').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
                if (!error && data) {
                    set({ watchlist: data.map((w) => ({ id: w.film_id, title: w.film_title, poster_path: w.poster_path || null, year: w.year || null })) })
                }
            },

            fetchVault: async () => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { data, error } = await supabase
                    .from('vaults').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
                if (!error && data) {
                    set({ vault: data.map((v) => ({ id: v.film_id, title: v.film_title, poster_path: v.poster_path || null, year: v.year || null, format: v.format || 'Digital' })) })
                }
            },

            fetchLists: async () => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { data: lists, error } = await supabase
                    .from('lists').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
                if (!error && lists) {
                    const fullLists = await Promise.all(lists.map(async (list) => {
                        const { data: items } = await supabase.from('list_items').select('*').eq('list_id', list.id)
                        return {
                            id: list.id, title: list.title, description: list.description,
                            isRanked: list.is_ranked, createdAt: list.created_at,
                            films: (items || []).map((i) => ({ id: i.film_id, title: i.film_title })),
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
                if (!error && data) {
                    set({
                        stubs: data.map((t) => ({
                            id: t.id,
                            filmTitle: t.showtimes?.film_title || 'Unknown Film',
                            date: t.showtimes?.date || '',
                            seat: t.seat,
                            ticketType: t.ticket_type,
                            amount: t.amount,
                            qrCode: t.qr_code || null,
                            screenName: t.screen_name || null,
                            createdAt: t.created_at,
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
                set((state) => ({ stubs: [stub, ...state.stubs] }))
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
                    logs: [{ ...log, id: data.id, createdAt: data.created_at }, ...state.logs],
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
                const dbUpdates = {}
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
                const user = useAuthStore.getState().user
                const isPaid = user?.role === 'archivist' || user?.role === 'auteur'
                const logToRemove = get().logs.find((l) => l.id === id)
                if (!logToRemove) return

                if (isPaid) {
                    // Paid users: optimistic remove with 5s undo toast
                    set((state) => ({ logs: state.logs.filter((l) => l.id !== id) }))
                    let undone = false
                    const { default: toast } = await import('react-hot-toast')
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
                } else {
                    // Free users: require confirmation before permanent delete
                    const confirmed = window.confirm(`Remove "${logToRemove.title}" from your archive? This cannot be undone.`)
                    if (!confirmed) return
                    const { error } = await supabase.from('logs').delete().eq('id', id)
                    if (!error) set((state) => ({ logs: state.logs.filter((l) => l.id !== id) }))
                }
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
                            : [...state.watchlist, { id: film.id, title: film.title || film.name, poster_path: film.poster_path, year: film.release_date ? new Date(film.release_date).getFullYear() : null }],
                    }))
                }
            },

            removeFromWatchlist: async (filmId) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { error } = await supabase.from('watchlists').delete().eq('user_id', user.id).eq('film_id', filmId)
                if (!error) set((state) => ({ watchlist: state.watchlist.filter((f) => f.id !== filmId) }))
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
                            : [...state.vault, { id: film.id, title: film.title || film.name, poster_path: film.poster_path, format }],
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
                    set((state) => ({ lists: [{ ...list, id: data.id, films: [], createdAt: data.created_at }, ...state.lists] }))
                }
            },

            addFilmToList: async (listId, film) => {
                const { error } = await supabase.from('list_items').insert([{
                    list_id: listId, film_id: film.id, film_title: film.title || film.name || 'Unknown',
                }])
                if (!error) {
                    set((state) => ({
                        lists: state.lists.map((l) => l.id === listId
                            ? { ...l, films: l.films.find((f) => f.id === film.id) ? l.films : [...l.films, film] }
                            : l
                        ),
                    }))
                }
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

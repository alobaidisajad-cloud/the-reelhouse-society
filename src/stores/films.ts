import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { get, set, del } from 'idb-keyval'
import { supabase } from '../supabaseClient'
import { useAuthStore } from './auth'
import { FilmLog, WatchlistItem, VaultItem, FilmList, TicketStub, Interaction, PhysicalArchiveItem } from '../types'
import reelToast from '../utils/reelToast'
import { enqueueMutation } from '../utils/offlineQueue'

// ── Undo Queue — replaces brittle window globals with a proper cancellation system ──
const _undoTimers = new Map<string, ReturnType<typeof setTimeout>>()
function cancelPendingDelete(id: string) {
    const timer = _undoTimers.get(id)
    if (timer) { clearTimeout(timer); _undoTimers.delete(id) }
}
function scheduleDeletion(id: string, fn: () => Promise<void>, delayMs = 5200) {
    cancelPendingDelete(id)
    _undoTimers.set(id, setTimeout(async () => { _undoTimers.delete(id); await fn() }, delayMs))
}

// ── Undo Callback Registry — maps toast IDs to undo functions ──
const _undoCallbacks = new Map<string, () => void>()
if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        // Walk up from click target to find a toast container with data-toast-id
        const toastEl = target.closest('[data-toast-id]') || target.closest('[role="status"]')
        if (!toastEl) return
        // Match by data-toast-id attribute first (precise), fallback to role="status" parent
        const dataId = toastEl.getAttribute('data-toast-id')
        if (dataId && _undoCallbacks.has(dataId)) {
            _undoCallbacks.get(dataId)!()
            _undoCallbacks.delete(dataId)
            return
        }
        // Fallback: find any undo callback associated with a visible toast
        const statusEl = target.closest('[role="status"]')
        if (statusEl?.textContent?.toLowerCase().includes('undo')) {
            for (const [toastId, callback] of _undoCallbacks) {
                callback()
                _undoCallbacks.delete(toastId)
                return
            }
        }
    })
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

    toggleListEndorse: (listId: string) => Promise<void>
    hasListEndorsed: (listId: string) => boolean
    fetchListEndorsements: () => Promise<void>
    
    // Pagination state
    logsHasMore: boolean
    logsPage: number
    vaultHasMore: boolean
    vaultPage: number
    listsHasMore: boolean
    listsPage: number

    fetchLogs: (loadMore?: boolean) => Promise<void>
    fetchWatchlist: () => Promise<void>
    fetchVault: (loadMore?: boolean) => Promise<void>
    fetchLists: (loadMore?: boolean) => Promise<void>
    fetchStubs: () => Promise<void>
    saveStub: (stub: Partial<TicketStub> & { showtimeId?: string, slotId?: string }) => Promise<string | null>
    addLog: (log: Partial<FilmLog>) => Promise<void>
    markAsWatched: (film: TMDBFilmInput, status?: 'watched' | 'rewatched' | 'abandoned') => Promise<void>
    unmarkWatched: (filmId: number) => Promise<void>
    getCinephileStats: (overrideCount?: number) => { count: number, level: string, color: string, progress: number }
    updateLog: (id: string, updates: Partial<FilmLog>) => Promise<void>
    removeLog: (id: string) => Promise<void>
    addToWatchlist: (film: TMDBFilmInput) => Promise<void>
    removeFromWatchlist: (filmId: number) => Promise<void>
    addToVault: (film: TMDBFilmInput, format?: string) => Promise<void>
    removeFromVault: (filmId: number) => Promise<void>
    createList: (list: Partial<FilmList>) => Promise<void>
    updateList: (listId: string, updates: Partial<FilmList>) => Promise<void>
    deleteList: (listId: string) => Promise<void>
    addFilmToList: (listId: string, film: TMDBFilmInput) => Promise<void>
    removeFilmFromList: (listId: string, filmId: number) => Promise<void>
    fetchPhysicalArchive: (userId?: string) => Promise<PhysicalArchiveItem[]>
    addToPhysicalArchive: (film: TMDBFilmInput, formats: string[], notes?: string, condition?: string) => Promise<void>
    removeFromPhysicalArchive: (filmId: number) => Promise<void>
    updatePhysicalArchiveItem: (filmId: number, updates: Partial<PhysicalArchiveItem>) => Promise<void>
    /** O(1) endorsement lookup index — rebuilt on every interactions mutation */
    _endorsedIndex: Record<string, true>
    /** O(1) list endorsement lookup index */
    _listEndorsedIndex: Record<string, true>
    /** O(1) watchlist lookup index */
    _watchlistIndex: Record<number, true>
    /** O(1) logged film lookup index (maps filmId to its single log) */
    _loggedIndex: Record<number, FilmLog>
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
            logsHasMore: true,
            logsPage: 0,
            vaultHasMore: true,
            vaultPage: 0,
            listsHasMore: true,
            listsPage: 0,
            _endorsedIndex: {} as Record<string, true>,  // O(1) lookup — rebuilt on mutations
            _listEndorsedIndex: {} as Record<string, true>,
            _watchlistIndex: {} as Record<number, true>,
            _loggedIndex: {} as Record<number, FilmLog>,

            toggleEndorse: async (targetId) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const prevInteractions = get().interactions
                const exists = prevInteractions.find((i) => i.targetId === targetId && i.type === 'endorse')

                // Optimistic update — UI responds instantly
                if (exists) {
                    const current = get().interactions
                    const next = current.filter((i: Interaction) => !(i.targetId === targetId && i.type === 'endorse'))
                    const idx: Record<string, true> = {}
                    next.forEach((i: Interaction) => { if (i.type === 'endorse') idx[i.targetId] = true })
                    set({ interactions: next, _endorsedIndex: idx })
                } else {
                    const current = get().interactions
                    const next: Interaction[] = [...current, { type: 'endorse' as const, targetId, timestamp: new Date().toISOString() }]
                    set({ interactions: next, _endorsedIndex: { ...get()._endorsedIndex, [targetId]: true as const } })
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
                        
                        // Database level trigger handles interaction notifications beautifully
                    }
                } catch (e: unknown) {
                    const err = e as Error
                    if (err?.message?.toLowerCase().includes('fetch') || err?.message?.toLowerCase().includes('network')) {
                        // Offline Background Queue — Keep the optimistic UI, sync later
                        if (!exists) {
                            enqueueMutation({ type: 'endorse_log', payload: { user_id: user.id, target_log_id: targetId } }).catch(() => {})
                        }
                    } else {
                        // Functional Rollback to prevent race condition erasure
                        if (exists) {
                            set((state) => ({ 
                                interactions: [...state.interactions, exists],
                                _endorsedIndex: { ...state._endorsedIndex, [targetId]: true as const }
                            }))
                        } else {
                            set((state) => {
                                const nextIdx = { ...state._endorsedIndex }
                                delete nextIdx[targetId]
                                return {
                                    interactions: state.interactions.filter((i) => !(i.targetId === targetId && i.type === 'endorse')),
                                    _endorsedIndex: nextIdx
                                }
                            })
                        }
                        reelToast.error('Endorsement failed — please try again.')
                    }
                }
            },

            hasEndorsed: (targetId) => !!get()._endorsedIndex[targetId],

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
                    const mapped: Interaction[] = (data || []).map(r => ({
                        type: 'endorse' as const,
                        targetId: r.target_log_id,
                        timestamp: r.created_at,
                    }))
                    const idx: Record<string, true> = {}
                    mapped.forEach(i => { if (i.type === 'endorse') idx[i.targetId] = true })
                    set({ interactions: mapped, _endorsedIndex: idx })
                }
            },

            toggleListEndorse: async (listId) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const prev = get().interactions
                const exists = prev.find((i) => i.targetId === listId && i.type === 'endorse_list')

                if (exists) {
                    const next = prev.filter((i) => !(i.targetId === listId && i.type === 'endorse_list'))
                    const idx: Record<string, true> = {}
                    next.forEach((i) => { if (i.type === 'endorse_list') idx[i.targetId] = true })
                    set({ interactions: next, _listEndorsedIndex: idx })
                } else {
                    const next = [...prev, { type: 'endorse_list', targetId: listId, timestamp: new Date().toISOString() }]
                    set({ interactions: next as Interaction[], _listEndorsedIndex: { ...get()._listEndorsedIndex, [listId]: true } })
                }

                try {
                    if (exists) {
                        const { error } = await supabase.from('interactions').delete()
                            .eq('user_id', user.id).eq('target_list_id', listId).eq('type', 'endorse_list')
                        if (error) throw error
                    } else {
                        const { error } = await supabase.from('interactions').insert([
                            { user_id: user.id, target_list_id: listId, type: 'endorse_list' }
                        ])
                        if (error && !error.message?.includes('duplicate')) throw error
                        
                        // Database level trigger handles list endorsement notifications beautifully
                    }
                } catch (e: unknown) {
                    const err = e as Error
                    if (err?.message?.toLowerCase().includes('fetch') || err?.message?.toLowerCase().includes('network')) {
                        // Offline queueing
                        if (!exists) {
                            enqueueMutation({ type: 'endorse_list', payload: { user_id: user.id, target_list_id: listId } }).catch(() => {})
                        }
                    } else {
                        if (exists) {
                            const next = [...get().interactions, exists]
                            set({ interactions: next, _listEndorsedIndex: { ...get()._listEndorsedIndex, [listId]: true } })
                        } else {
                            const next = get().interactions.filter((i) => !(i.targetId === listId && i.type === 'endorse_list'))
                            const idx = { ...get()._listEndorsedIndex }
                            delete idx[listId]
                            set({ interactions: next, _listEndorsedIndex: idx })
                        }
                        reelToast.error('Failed to certify list.')
                    }
                }
            },

            hasListEndorsed: (listId) => !!get()._listEndorsedIndex[listId],

            fetchListEndorsements: async () => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { data, error } = await supabase
                    .from('interactions')
                    .select('target_list_id, created_at')
                    .eq('user_id', user.id)
                    .eq('type', 'endorse_list')
                    .limit(2000)
                if (!error && data) {
                    const newListEndorsements = (data || []).map(r => ({
                        type: 'endorse_list' as const,
                        targetId: r.target_list_id,
                        timestamp: r.created_at,
                    }))
                    
                    const idx: Record<string, true> = {}
                    newListEndorsements.forEach(i => { idx[i.targetId] = true })

                    set((state) => ({
                        interactions: [
                            ...state.interactions.filter(i => i.type !== 'endorse_list'), 
                            ...newListEndorsements
                        ],
                        _listEndorsedIndex: idx
                    }))
                }
            },

            fetchLogs: async (loadMore = false) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const state = get()
                if (loadMore && !state.logsHasMore) return

                const PAGE_SIZE = 50
                const page = loadMore ? state.logsPage : 0

                const { data, error } = await supabase
                    .from('logs').select('id, user_id, film_id, film_title, poster_path, year, rating, review, status, watched_date, is_spoiler, watched_with, private_notes, abandoned_reason, physical_media, is_autopsied, autopsy, alt_poster, editorial_header, drop_cap, pull_quote, video_url, format, created_at, view_count, viewing_history').eq('user_id', user.id)
                    .order('watched_date', { ascending: false })
                    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
                
                if (error || !data) return
                
                const hasMore = data.length === PAGE_SIZE

                const newLogs = data.map((dbLog) => ({
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
                        videoUrl: dbLog.video_url || null,
                        createdAt: dbLog.created_at,
                        viewCount: dbLog.view_count || 1,
                        viewingHistory: dbLog.viewing_history || [],
                }))

                const nextLogs = loadMore ? [...state.logs, ...newLogs] : newLogs
                const idx: Record<number, FilmLog> = {}
                nextLogs.forEach(l => { if (l.filmId && !idx[l.filmId]) idx[l.filmId] = l as FilmLog })

                set({ 
                    logs: nextLogs as FilmLog[], 
                    _loggedIndex: idx,
                    logsPage: page + 1,
                    logsHasMore: hasMore
                })
            },

            fetchWatchlist: async () => {
                const user = useAuthStore.getState().user
                if (!user) return
                let allItems: { film_id: number; film_title: string; poster_path: string | null; year: number | null; created_at: string }[] = []
                let page = 0
                const PAGE_SIZE = 1000
                const MAX_PAGES = 10 // Safety cap — 10,000 items max to prevent infinite loops
                while (page < MAX_PAGES) {
                    const { data, error } = await supabase
                        .from('watchlists').select('id, user_id, film_id, film_title, poster_path, year, created_at').eq('user_id', user.id)
                        .order('created_at', { ascending: false })
                        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
                    if (error || !data || data.length === 0) break
                    allItems = allItems.concat(data)
                    if (data.length < PAGE_SIZE) break
                    page++
                }
                const newWatchlist = allItems.map((w) => ({ id: w.film_id, title: w.film_title, poster_path: w.poster_path || null, year: w.year || undefined }))
                const idx: Record<number, true> = {}
                newWatchlist.forEach(w => { idx[w.id] = true })
                set({ watchlist: newWatchlist, _watchlistIndex: idx })
            },

            fetchVault: async (loadMore = false) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const state = get()
                if (loadMore && !state.vaultHasMore) return

                const PAGE_SIZE = 50
                const page = loadMore ? state.vaultPage : 0

                const { data, error } = await supabase
                    .from('vaults').select('id, user_id, film_id, film_title, poster_path, year, format, created_at').eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

                if (!error && data) {
                    const hasMore = data.length === PAGE_SIZE
                    const newVault = data.map((v) => ({ id: v.film_id, title: v.film_title, poster_path: v.poster_path || null, year: v.year || null, format: v.format || 'Digital' }))
                    
                    set({ 
                        vault: loadMore ? [...state.vault, ...newVault] : newVault,
                        vaultPage: page + 1,
                        vaultHasMore: hasMore
                    })
                }
            },

            fetchLists: async (loadMore = false) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const state = get()
                if (loadMore && !state.listsHasMore) return

                const PAGE_SIZE = 20
                const page = loadMore ? state.listsPage : 0

                const { data: lists, error } = await supabase
                    .from('lists').select('id, user_id, title, description, is_ranked, is_private, created_at').eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
                
                if (!error && lists) {
                    const hasMore = lists.length === PAGE_SIZE

                    // ── Batched fetch: single query for ALL list items instead of N+1 ──
                    const listIds = lists.map(l => l.id)
                    let allItems: { list_id: string; film_id: number; film_title: string; poster_path: string | null }[] = []
                    if (listIds.length > 0) {
                        const { data: items } = await supabase
                            .from('list_items').select('list_id, film_id, film_title, poster_path').in('list_id', listIds).limit(1000)
                        allItems = items || []
                    }
                    // Group items by list_id client-side
                    const itemsByList = new Map<string, typeof allItems>()
                    for (const item of allItems) {
                        const arr = itemsByList.get(item.list_id) || []
                        arr.push(item)
                        itemsByList.set(item.list_id, arr)
                    }
                    const fullLists = lists.map((list) => ({
                        id: list.id, title: list.title, description: list.description,
                        isRanked: list.is_ranked, isPrivate: list.is_private || false, createdAt: list.created_at,
                        films: (itemsByList.get(list.id) || []).map((i) => ({ id: i.film_id, title: i.film_title, poster: i.poster_path || null })),
                    }))
                    
                    set({ 
                        lists: loadMore ? [...state.lists, ...fullLists] : fullLists,
                        listsPage: page + 1,
                        listsHasMore: hasMore
                    })
                }
            },

            fetchStubs: async () => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { data, error } = await supabase
                    .from('tickets')
                    .select('id, user_id, seat, ticket_type, amount, qr_code, screen_name, created_at, showtimes(film_title, date)')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(500)
                if (!error && data) {
                    set({
                        stubs: data.map((t) => ({
                            id: t.id || '',
                            filmTitle: (t.showtimes as any)?.film_title || 'Unknown Film',
                            date: (t.showtimes as any)?.date || '',
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

            addLog: async (log) => {
                const user = useAuthStore.getState().user
                if (!user) return

                // Fetch directly from server as a pre-flight if missing in client paginated cache
                let existingLog = log.filmId ? get()._loggedIndex[log.filmId] : undefined
                if (!existingLog && log.filmId) {
                    const { data: serverCheck } = await supabase.from('logs')
                        .select('id, rating, review, watched_date, watched_with, view_count, viewing_history, created_at, status')
                        .eq('user_id', user.id).eq('film_id', log.filmId).maybeSingle()
                    if (serverCheck) {
                        existingLog = {
                            id: serverCheck.id, filmId: log.filmId, rating: serverCheck.rating, review: serverCheck.review, 
                            watchedDate: serverCheck.watched_date, watchedWith: serverCheck.watched_with, 
                            viewCount: serverCheck.view_count, viewingHistory: serverCheck.viewing_history,
                            createdAt: serverCheck.created_at, status: serverCheck.status
                        } as FilmLog
                    }
                }

                // ── Rewatch: if a log already exists for this film, archive old review into viewing_history ──
                if (existingLog) {
                    const oldHistory = existingLog.viewingHistory || []
                    const archivedEntry = {
                        date: existingLog.watchedDate || existingLog.createdAt || new Date().toISOString(),
                        rating: existingLog.rating,
                        review: existingLog.review || '',
                        watchedWith: existingLog.watchedWith || null,
                    }
                    const newHistory = [archivedEntry, ...oldHistory]
                    const newViewCount = (existingLog.viewCount || 1) + 1

                    await get().updateLog(existingLog.id, {
                        rating: log.rating || 0,
                        review: log.review || '',
                        status: 'rewatched',
                        watchedDate: log.watchedDate || new Date().toISOString(),
                        watchedWith: log.watchedWith || null,
                        isSpoiler: log.isSpoiler || false,
                        privateNotes: log.privateNotes || null,
                        physicalMedia: log.physicalMedia || null,
                        viewCount: newViewCount,
                        viewingHistory: newHistory,
                    } as Partial<FilmLog>)
                    return
                }

                // ── First watch: create new log ──
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
                    video_url: log.videoUrl || null,
                    format: log.physicalMedia || 'Digital',
                    view_count: 1,
                    viewing_history: '[]',
                }]).select().single()

                if (error) return

                const fullLog = { ...log, id: data.id, createdAt: data.created_at, viewCount: 1, viewingHistory: [] } as FilmLog
                set((state) => {
                    const nextIdx = { ...state._loggedIndex }
                    if (log.filmId) nextIdx[log.filmId] = fullLog
                    return { logs: [fullLog, ...state.logs], _loggedIndex: nextIdx }
                })

                // Auto-sync into Physical Archive if they claimed ownership
                const syncFormatMap: Record<string, string> = { 'DVD': 'dvd', 'Blu-Ray': 'bluray', '4K UHD': '4k', 'VHS': 'vhs' }
                if (log.physicalMedia && syncFormatMap[log.physicalMedia] && log.filmId !== undefined) {
                    const fmt = syncFormatMap[log.physicalMedia]
                    try {
                        await get().addToPhysicalArchive({ id: log.filmId, title: log.title || '', poster_path: log.poster, release_date: log.year?.toString() }, [fmt])
                    } catch (e) {
                        console.error('Failed to auto-sync physical archive', e)
                    }
                }
            },

            markAsWatched: async (film, status = 'watched') => {
                const user = useAuthStore.getState().user
                if (!user) return
                
                let existingLog = get()._loggedIndex[film.id]
                if (!existingLog) {
                    const { data: serverCheck } = await supabase.from('logs').select('id, status').eq('user_id', user.id).eq('film_id', film.id).maybeSingle()
                    if (serverCheck) existingLog = { id: serverCheck.id, status: serverCheck.status } as FilmLog
                }

                // If already logged, just update the status on the existing log
                if (existingLog) {
                    await get().updateLog(existingLog.id, { status } as Partial<FilmLog>)
                    return
                }
                // Create a new log — first time watch
                const { data, error } = await supabase.from('logs').insert([{
                    user_id: user.id,
                    film_id: film.id,
                    film_title: film.title || film.name || 'Untitled',
                    poster_path: film.poster_path || null,
                    year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : null,
                    rating: 0,
                    review: '',
                    status,
                    watched_date: new Date().toISOString(),
                    is_spoiler: false,
                    view_count: 1,
                    viewing_history: '[]',
                }]).select().single()
                if (error) return
                const newLog: FilmLog = {
                    id: data.id,
                    filmId: film.id,
                    title: film.title || film.name || 'Untitled',
                    poster: film.poster_path,
                    year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : undefined,
                    rating: 0,
                    status,
                    createdAt: data.created_at,
                    watchedDate: new Date().toISOString(),
                    viewCount: 1,
                    viewingHistory: [],
                }
                set(state => {
                    const nextIdx = { ...state._loggedIndex }
                    nextIdx[film.id] = newLog
                    return { logs: [newLog, ...state.logs], _loggedIndex: nextIdx }
                })
                // Auto-remove from watchlist if present
                const inWatchlist = get().watchlist.some(w => w.id === film.id)
                if (inWatchlist) get().removeFromWatchlist(film.id)
            },

            unmarkWatched: async (filmId) => {
                const existingLog = get().logs.find(l => l.filmId === filmId)
                if (!existingLog) return
                // Only remove if it's a quick-watch (no rating, no review)
                if (existingLog.rating > 0 || (existingLog.review && existingLog.review.length > 0)) return
                await get().removeLog(existingLog.id)
            },

            getCinephileStats: (overrideCount?: number) => {
                const logs = get().logs
                const count = overrideCount ?? logs.length
                let level = 'FIRST REEL'
                let color = 'var(--fog)'
                if (count > 50) { level = 'THE ORACLE'; color = 'var(--sepia)' }
                else if (count > 20) { level = 'MIDNIGHT DEVOTEE'; color = 'var(--blood-reel)' }
                else if (count > 5) { level = 'THE REGULAR'; color = 'var(--flicker)' }
                return { count, level, color, progress: (count % 20) * 5 }
            },

            updateLog: async (id, updates) => {
                const dbUpdates: Record<string, unknown> = {}
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
                if (updates.pullQuote !== undefined) dbUpdates.pull_quote = updates.pullQuote
                if (updates.dropCap !== undefined) dbUpdates.drop_cap = updates.dropCap
                if (updates.editorialHeader !== undefined) dbUpdates.editorial_header = updates.editorialHeader
                if (updates.altPoster !== undefined) dbUpdates.alt_poster = updates.altPoster
                if (updates.videoUrl !== undefined) dbUpdates.video_url = updates.videoUrl
                if (updates.viewCount !== undefined) dbUpdates.view_count = updates.viewCount
                if (updates.viewingHistory !== undefined) dbUpdates.viewing_history = JSON.stringify(updates.viewingHistory)
                const { error } = await supabase.from('logs').update(dbUpdates).eq('id', id)
                if (!error) {
                    set((state) => {
                        let filmIdToUpdate: number | undefined
                        const nextLogs = state.logs.map((l) => {
                            if (l.id === id) {
                                filmIdToUpdate = l.filmId
                                return { ...l, ...updates } as FilmLog
                            }
                            return l
                        })
                        const nextIdx = { ...state._loggedIndex }
                        if (filmIdToUpdate) {
                            const updated = nextLogs.find(l => l.filmId === filmIdToUpdate)
                            if (updated) nextIdx[filmIdToUpdate] = updated as FilmLog
                        }
                        return { logs: nextLogs, _loggedIndex: nextIdx }
                    })
                    
                    // Auto-sync into Physical Archive if they updated a log to physical media
                    const syncFormatMap: Record<string, string> = { 'DVD': 'dvd', 'Blu-Ray': 'bluray', '4K UHD': '4k', 'VHS': 'vhs' }
                    if (updates.physicalMedia && syncFormatMap[updates.physicalMedia]) {
                        const fmt = syncFormatMap[updates.physicalMedia]
                        const logToUpdate = get().logs.find(l => l.id === id)
                        if (logToUpdate && logToUpdate.filmId !== undefined) {
                            try {
                                await get().addToPhysicalArchive({ id: logToUpdate.filmId, title: logToUpdate.title || '', poster_path: logToUpdate.poster, release_date: logToUpdate.year?.toString() }, [fmt])
                            } catch (e) {
                                console.error('Failed to auto-sync physical archive on update', e)
                            }
                        }
                    }
                }
            },

            removeLog: async (id) => {
                const logToRemove = get().logs.find((l) => l.id === id)
                if (!logToRemove) return

                // Optimistic remove with 5s undo window
                set((state) => {
                    const nextIdx = { ...state._loggedIndex }
                    if (logToRemove.filmId) delete nextIdx[logToRemove.filmId]
                    return { logs: state.logs.filter((l) => l.id !== id), _loggedIndex: nextIdx }
                })

                const toastId = `undo-${id}`
                // Register undo callback
                _undoCallbacks.set(toastId, () => {
                    cancelPendingDelete(`log-${id}`)
                    set((state) => {
                        const nextIdx = { ...state._loggedIndex }
                        if (logToRemove.filmId) nextIdx[logToRemove.filmId] = logToRemove
                        return { logs: [logToRemove, ...state.logs], _loggedIndex: nextIdx }
                    })
                    reelToast.dismiss(toastId)
                    reelToast.success(`"${logToRemove.title}" restored.`)
                    _undoCallbacks.delete(toastId)
                })
                reelToast(`"${logToRemove.title}" removed. Tap to undo.`, {
                    duration: 5000, id: toastId,
                    style: { cursor: 'pointer' },
                })
                // Auto-cleanup callback after toast expires
                setTimeout(() => _undoCallbacks.delete(toastId), 5500)

                // Schedule actual deletion — cancellable via undo
                scheduleDeletion(`log-${id}`, async () => { await supabase.from('logs').delete().eq('id', id) })
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
                if (error) throw error
                set((state) => {
                    const exists = state.watchlist.find((f) => f.id === film.id)
                    const nextWatchlist = exists ? state.watchlist : [...state.watchlist, { id: film.id, title: film.title || film.name || 'Unknown', poster_path: film.poster_path, year: film.release_date ? new Date(film.release_date).getFullYear() : undefined }]
                    return {
                        watchlist: nextWatchlist,
                        _watchlistIndex: { ...state._watchlistIndex, [film.id]: true }
                    }
                })
            },

            removeFromWatchlist: async (filmId) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const itemToRemove = get().watchlist.find((f) => f.id === filmId)

                // Optimistic remove with 5s undo window
                set((state) => {
                    const nextIndex = { ...state._watchlistIndex }
                    delete nextIndex[filmId]
                    return { 
                        watchlist: state.watchlist.filter((f) => f.id !== filmId),
                        _watchlistIndex: nextIndex 
                    }
                })

                const toastId = `undo-wl-${filmId}`
                _undoCallbacks.set(toastId, () => {
                    cancelPendingDelete(`wl-${filmId}`)
                    if (itemToRemove) {
                        set((state) => ({ 
                            watchlist: [itemToRemove, ...state.watchlist],
                            _watchlistIndex: { ...state._watchlistIndex, [filmId]: true }
                        }))
                    }
                    reelToast.dismiss(toastId)
                    reelToast.success(`"${itemToRemove?.title || 'Film'}" restored to watchlist.`)
                    _undoCallbacks.delete(toastId)
                })
                reelToast(`"${itemToRemove?.title || 'Film'}" removed from watchlist. Tap to undo.`, {
                    duration: 5000, id: toastId,
                    style: { cursor: 'pointer' },
                })
                setTimeout(() => _undoCallbacks.delete(toastId), 5500)

                // Schedule actual deletion — cancellable via undo
                const uid = user.id
                scheduleDeletion(`wl-${filmId}`, async () => { await supabase.from('watchlists').delete().eq('user_id', uid).eq('film_id', filmId) })
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
                if (error) throw error
                set((state) => ({
                    vault: state.vault.find((f) => f.id === film.id) ? state.vault
                        : [...state.vault, { id: film.id, title: film.title || film.name || 'Unknown', poster_path: film.poster_path, format }],
                }))
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
                    user_id: user.id, title: list.title, description: list.description || '', is_private: list.isPrivate || false
                }]).select().single()
                if (error) throw error
                if (data) {
                    set((state) => ({ lists: [{ id: data.id, title: list.title || 'Untitled', description: list.description || '', isRanked: false, isPrivate: list.isPrivate || false, films: [], createdAt: data.created_at }, ...state.lists] }))
                }
            },

            updateList: async (listId, updates) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const dbUpdates: Record<string, unknown> = {}
                if (updates.title !== undefined) dbUpdates.title = updates.title
                if (updates.description !== undefined) dbUpdates.description = updates.description
                if (updates.isPrivate !== undefined) dbUpdates.is_private = updates.isPrivate
                if (updates.isRanked !== undefined) dbUpdates.is_ranked = updates.isRanked
                
                const { error } = await supabase.from('lists').update(dbUpdates).eq('id', listId).eq('user_id', user.id)
                if (error) throw error
                
                set((state) => ({
                    lists: state.lists.map(l => l.id === listId ? { ...l, ...updates } : l)
                }))
            },

            deleteList: async (listId) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { error } = await supabase.from('lists').delete().eq('id', listId).eq('user_id', user.id)
                if (error) throw error
                set((state) => ({
                    lists: state.lists.filter(l => l.id !== listId)
                }))
            },

            addFilmToList: async (listId, film) => {
                const { error } = await supabase.from('list_items').insert([{
                    list_id: listId, film_id: film.id, film_title: film.title || film.name || 'Unknown',
                    poster_path: film.poster_path || null,
                }])
                if (error) throw error
                set((state) => ({
                    lists: state.lists.map((l) => l.id === listId
                        ? { ...l, films: l.films.find((f) => f.id === film.id) ? l.films : [...l.films, { id: film.id, title: film.title || film.name || 'Unknown', poster_path: film.poster_path }] }
                        : l
                    ),
                }))
            },

            removeFilmFromList: async (listId, filmId) => {
                const { error } = await supabase.from('list_items').delete().eq('list_id', listId).eq('film_id', filmId)
                if (error) throw error
                set((state) => ({
                    lists: state.lists.map((l) => l.id === listId
                        ? { ...l, films: l.films.filter((f) => f.id !== filmId) }
                        : l
                    ),
                }))
            },

            // ── PHYSICAL ARCHIVE ──
            fetchPhysicalArchive: async (userId?: string) => {
                const uid = userId || useAuthStore.getState().user?.id
                if (!uid) return []
                const { data, error } = await supabase
                    .from('physical_archive').select('id, user_id, film_id, film_title, poster_path, year, formats, notes, condition, created_at').eq('user_id', uid)
                    .order('created_at', { ascending: false }).limit(2000)
                if (!error && data) {
                    const items = data.map((item) => ({
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
                if (error) throw error
                if (data) {
                    set((state) => {
                        const exists = state.physicalArchive.find(a => a.filmId === film.id)
                        if (exists) {
                            return { physicalArchive: state.physicalArchive.map(a => a.filmId === film.id ? { ...a, formats, notes, condition } : a) }
                        }
                        return { physicalArchive: [{ id: data.id, filmId: film.id, title: film.title || film.name || 'Unknown', poster_path: film.poster_path || null, year: film.release_date ? new Date(film.release_date).getFullYear() : undefined, formats, notes, condition, createdAt: data.created_at }, ...state.physicalArchive] }
                    })
                }
            },

            removeFromPhysicalArchive: async (filmId: number) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { error } = await supabase.from('physical_archive').delete().eq('user_id', user.id).eq('film_id', filmId)
                if (!error) set((state) => ({ physicalArchive: state.physicalArchive.filter(a => a.filmId !== filmId) }))
            },

            updatePhysicalArchiveItem: async (filmId: number, updates: Partial<PhysicalArchiveItem>) => {
                const user = useAuthStore.getState().user
                if (!user) return
                const dbUpdates: Record<string, unknown> = {}
                if (updates.formats) dbUpdates.formats = updates.formats
                if (updates.notes !== undefined) dbUpdates.notes = updates.notes
                if (updates.condition !== undefined) dbUpdates.condition = updates.condition
                const { error } = await supabase.from('physical_archive').update(dbUpdates).eq('user_id', user.id).eq('film_id', filmId)
                if (error) throw error
                set((state) => ({ physicalArchive: state.physicalArchive.map(a => a.filmId === filmId ? { ...a, ...updates } : a) }))
            },
        }),
        {
            name: 'reelhouse-films',
            storage: createJSONStorage(() => {
                // Debounce IDB writes — coalesces rapid mutations into a single write
                let _pendingWrite: ReturnType<typeof setTimeout> | null = null
                let _pendingValue: string | null = null
                let _pendingName: string | null = null
                const DEBOUNCE_MS = 2000

                return {
                    getItem: async (name: string): Promise<string | null> => {
                        return (await get(name)) || null
                    },
                    setItem: async (name: string, value: string): Promise<void> => {
                        _pendingValue = value
                        _pendingName = name
                        if (_pendingWrite) clearTimeout(_pendingWrite)
                        _pendingWrite = setTimeout(async () => {
                            if (_pendingName && _pendingValue) {
                                await set(_pendingName, _pendingValue)
                            }
                            _pendingWrite = null
                        }, DEBOUNCE_MS)
                    },
                    removeItem: async (name: string): Promise<void> => {
                        if (_pendingWrite) { clearTimeout(_pendingWrite); _pendingWrite = null }
                        await del(name)
                    },
                }
            }),
            partialize: (state) => ({
                // IndexedDB has virtually unlimited space, so we persist the full dataset and indexes
                logs: state.logs,
                watchlist: state.watchlist,
                vault: state.vault,
                lists: state.lists,
                interactions: state.interactions,
                physicalArchive: state.physicalArchive,
                _endorsedIndex: state._endorsedIndex,
                _listEndorsedIndex: state._listEndorsedIndex,
                _watchlistIndex: state._watchlistIndex,
                _loggedIndex: state._loggedIndex,
            }),
        }
    )
)

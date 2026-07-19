// ============================================================
// Film domain types — extracted from monolithic types.ts
// ============================================================

/**
 * Core film log — the atomic unit of user film data.
 * Represents a user's logged viewing of a film.
 */
export interface DomainLog {
    id: string
    filmId: number
    title: string
    poster?: string | null
    altPoster?: string | null
    year?: number
    rating: number
    status: 'watched' | 'rewatched' | 'abandoned'
    review?: string | null
    pullQuote?: string | null
    director?: string | null
    directors?: string[]
    genres?: { id: number; name: string }[] | number[]
    runtime?: number | null
    popularity?: number
    createdAt?: string
    userId?: string
    
    // Half-life tracking
    genreIds?: number[]
    format?: string | null
    watchedDate?: string | null
    
    // UI mapping properties
    isSpoiler?: boolean
    watchedWith?: string | null
    privateNotes?: string | null
    abandonedReason?: string | null
    physicalMedia?: string | null
    isAutopsied?: boolean
    autopsy?: Record<string, number> | null
    editorialHeader?: string | null
    dropCap?: boolean
    videoUrl?: string | null
    
    // Viewing Chronicle — rewatch history stored in same log
    viewCount?: number
    viewingHistory?: {
        date?: string
        rating: number
        review?: string
        watchedWith?: string | null
        status?: 'watched' | 'rewatched' | 'abandoned'
        isSpoiler?: boolean
        privateNotes?: string | null
        physicalMedia?: string | null
        abandonedReason?: string | null
        isAutopsied?: boolean
        autopsy?: Record<string, number> | null
        altPoster?: string | null
        editorialHeader?: string | null
        dropCap?: boolean
        pullQuote?: string | null
        videoUrl?: string | null
        format?: string | null
    }[] | null
}

export interface WatchlistItem {
    id: number
    title: string
    poster: string | null  // Standardized from poster_path
    poster_path?: string | null  // DB boundary alias — deprecated, use `poster`
    year?: number | null
}

export interface VaultItem {
    id: number
    title: string
    poster_path?: string | null
    year?: number
    format: string
}

export interface PhysicalArchiveItem {
    id: string | number
    filmId: number
    title: string
    poster: string | null  // Standardized from poster_path
    poster_path?: string | null  // UI compat alias — mappers handle conversion
    year?: number | null
    formats: string[]
    notes?: string
    condition?: string
    createdAt?: string
}

// Standardized on `poster` for domain model consistency.
// DB column is `poster_path` — mapping happens at listSlice boundary.
export interface FilmListFilm {
    id: number
    title: string
    poster: string | null
    poster_path?: string | null // Backward-compat alias for transitional consumers
}

export interface FilmList {
    id: string
    title: string
    name?: string
    description?: string
    films: FilmListFilm[]
    userId: string
    createdAt: string
    isPrivate: boolean
    isRanked: boolean
}

/** Alias for FilmList — used by listSlice domain store */
export type CustomList = FilmList;

export interface HalfLifeEntry {
    count: number;
    trajectory: 'ASCENDING' | 'DECAYING' | 'ETERNAL';
    delta: number;
}

// ── Ticket Stub ──
export interface TicketStub {
    id: string
    filmTitle?: string
    film_title?: string
    venue_name?: string  // Legacy — kept for existing ticket stubs in DB
    showtime_date?: string
    date?: string
    seat_label?: string
    seat?: string
    ticketType?: string
    amount?: number
    qrCode?: string | null
    screenName?: string | null
    poster_path?: string | null
    createdAt?: string
    created_at?: string
}

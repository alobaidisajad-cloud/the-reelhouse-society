// ============================================================
// REELHOUSE — SHARED TYPE DEFINITIONS
// ============================================================

// ── Auth ──
export interface User {
    id: string
    username: string
    email?: string
    bio?: string
    avatar?: string
    /** @deprecated Use `avatar` instead — kept for Supabase column compatibility */
    avatar_url?: string
    role: 'free' | 'cinephile' | 'archivist' | 'auteur'
    /** @deprecated Use `role` instead */
    tier?: 'free' | 'cinephile' | 'archivist' | 'auteur'
    displayName?: string
    /** @deprecated Use `displayName` instead */
    display_name?: string
    persona?: string
    socialVisibility?: 'public' | 'members' | 'private'
    /** @deprecated Use `socialVisibility` instead */
    social_visibility?: string
    following?: string[]
    requested?: string[]
    followers_count?: number
    following_count?: number
    isSocialPrivate?: boolean
    /** @deprecated Use `isSocialPrivate` instead */
    is_social_private?: boolean
    created_at?: string
    preferences?: Record<string, unknown>
    is_banned?: boolean
    ban_reason?: string
    social_links?: Record<string, string>
}

/**
 * Normalize a raw Supabase profile into canonical camelCase properties.
 * Apply once at the hydration boundary (login, auth state change).
 */
export function normalizeUser(raw: Record<string, unknown>): Partial<User> {
    return {
        ...raw,
        avatar: (raw.avatar_url as string) || (raw.avatar as string) || undefined,
        displayName: (raw.display_name as string) || (raw.displayName as string) || undefined,
        isSocialPrivate: raw.is_social_private != null ? Boolean(raw.is_social_private) : (raw.isSocialPrivate as boolean | undefined),
        socialVisibility: (raw.social_visibility as string) || (raw.socialVisibility as string) || undefined,
        role: (raw.role as User['role']) || 'free',
    } as Partial<User>
}

// ── Film Log ──
export interface FilmLog {
    id: string
    filmId: number
    title: string
    poster?: string | null
    altPoster?: string | null
    year?: number
    rating: number
    status: 'watched' | 'rewatched' | 'abandoned'
    review?: string
    pullQuote?: string
    tags?: string[]
    director?: string
    directors?: string[]
    genres?: Array<{ id: number; name: string }> | number[]
    runtime?: number
    popularity?: number
    release_date?: string
    loggedAt?: string
    created_at?: string
    createdAt?: string
    user_id?: string
    // Half-life tracking
    genre_ids?: number[]
    
    // UI mapping properties
    isSpoiler?: boolean
    watchedDate?: string
    watchedWith?: string | null
    /**
     * The note the member is writing in the log form, carried from the form to
     * the save. It is NEVER read from, or written to, the log row: a note belongs
     * to a VIEWING and lives in `log_private_notes`, read through
     * services/vault.ts. The `logs.private_notes` column is kept blank by the
     * database on purpose — reading it is how both apps came to show a member an
     * empty Vault they had written in.
     */
    privateNotes?: string | null
    abandonedReason?: string | null
    physicalMedia?: string | null
    isAutopsied?: boolean
    autopsy?: string | null
    editorialHeader?: string | null
    dropCap?: boolean
    videoUrl?: string | null
    // Viewing Chronicle — rewatch history stored in same log
    viewCount?: number
    /** The viewing this log is ON. A private note belongs to one of these. */
    viewingId?: string | null
    viewingHistory?: Array<{
        /** This past viewing's own identity; the server gives every one of them one. */
        viewingId?: string
        date?: string
        rating: number
        review?: string
        watchedWith?: string | null
    }>
}

// ── Watchlist ──
export interface WatchlistItem {
    id: number
    title: string
    poster_path?: string | null
    year?: number
}

// ── Physical Archive ──
export interface PhysicalArchiveItem {
    id: string
    filmId: number
    title: string
    poster_path?: string | null
    year?: number
    formats: string[]
    notes?: string
    condition?: string
    createdAt?: string
}

// ── List ──
export interface FilmList {
    id: string
    title: string
    name?: string
    description?: string
    films: Array<{ id: number; title: string; poster_path?: string | null }>
    user_id?: string
    created_at?: string
    isPrivate?: boolean
    isRanked?: boolean
}

// ── Interaction ──
export interface Interaction {
    type: 'endorse' | 'endorse_list'
    targetId: string
    timestamp: string
}

// ── Dispatch (Dossier) ──
export interface Dossier {
    id: string
    title: string
    excerpt?: string
    fullContent?: string
    // DB-mapped fields
    content?: string          // Legacy alias — prefer fullContent
    full_content?: string     // Raw DB column name
    author?: string           // Uppercase display name
    authorUsername?: string
    authorId?: string
    author_id?: string
    author_name?: string
    author_avatar?: string
    views?: number
    certifyCount?: number
    date?: string             // Formatted display date
    film_id?: number
    film_title?: string
    film_poster?: string | null
    type?: 'essay' | 'review' | 'list' | 'letter'
    published?: boolean
    is_published?: boolean
    endorsements?: number
    created_at?: string
}

// ── Notification ──
export interface Notification {
    id: string
    type: 'endorse' | 'follow' | 'annotate' | 'retransmit' | 'system' | 'reaction'
    message?: string
    from?: string
    from_user?: string
    from_avatar?: string
    target_id?: string
    read: boolean
    created_at?: string
    timestamp: string
}

// ── Legacy venue/cinema types removed — replaced by The Lounge ──
// DB tables preserved for safe rollback; frontend no longer references them.

// ── TMDB API Types ──
export interface TMDBMovie {
    id: number
    title?: string
    name?: string
    poster_path: string | null
    backdrop_path: string | null
    release_date?: string
    overview?: string
    vote_average?: number
    vote_count?: number
    popularity?: number
    genre_ids?: number[]
    media_type?: 'movie' | 'person' | 'tv'
    runtime?: number
}

export interface TMDBPerson {
    id: number
    name: string
    profile_path: string | null
    popularity?: number
    known_for?: TMDBMovie[]
    media_type?: 'person'
}

export interface TMDBSearchResult {
    results: Array<TMDBMovie | TMDBPerson>
    total_pages: number
    total_results: number
    page: number
    searchType?: 'exact' | 'typo' | 'semantic' | 'person' | 'failed'
    matchedContext?: string
}

// ── UI State ──
export interface UIState {
    logModalOpen: boolean
    signupModalOpen: boolean
    paywallOpen: boolean
    paywallFeature: string
    handbookOpen: boolean
    handbookSection: string | null
    onboardingOpen: boolean
    theme: string
}


// ============================================================
// REELHOUSE — SHARED TYPE DEFINITIONS
// ============================================================

// ── Auth ──
export interface UserPreferences {
    social_visibility?: string
    privacy_endorsements?: string
    privacy_annotations?: string
    notif_follows?: boolean
    notif_endorsements?: boolean
    notif_comments?: boolean
    notif_system?: boolean
    [key: string]: unknown
}

export interface User {
    id: string
    username: string
    email?: string
    bio?: string
    avatar?: string
    avatar_url?: string
    role: 'free' | 'cinephile' | 'archivist' | 'auteur'
    tier?: 'free' | 'cinephile' | 'archivist' | 'auteur'
    displayName?: string
    display_name?: string
    persona?: string
    socialVisibility?: 'public' | 'members' | 'private'
    social_visibility?: string
    following?: string[]
    followers_count?: number
    following_count?: number
    isSocialPrivate?: boolean
    is_social_private?: boolean
    created_at?: string
    preferences?: UserPreferences
    is_banned?: boolean
    ban_reason?: string
    social_links?: Record<string, string> | {title: string; url: string}[]
}

// ── Film Log ──
export interface FilmLog {
    id: string
    filmId: number
    title: string
    film_title?: string
    poster?: string | null
    altPoster?: string | null | undefined
    year?: number
    rating: number
    status: 'watched' | 'rewatched' | 'abandoned' | string
    review?: string | null
    pullQuote?: string | null
    tags?: string[]
    director?: string | null
    directors?: string[]
    genres?: { id: number; name: string }[] | number[]
    runtime?: number | null
    popularity?: number
    release_date?: string | null
    loggedAt?: string
    created_at?: string
    createdAt?: string
    user_id?: string
    // Half-life tracking
    genre_ids?: number[]
    format?: string | null
    watched_date?: string | null
    
    // UI mapping properties
    isSpoiler?: boolean
    watchedDate?: string | null
    watchedWith?: string | null
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
    viewingHistory?: {
        date?: string
        rating: number
        review?: string
        watchedWith?: string | null
    }[] | null
}

// ── Watchlist ──
export interface WatchlistItem {
    id: number
    title: string
    poster_path?: string | null
    year?: number | null
}

// ── Vault ──
export interface VaultItem {
    id: number
    title: string
    poster_path?: string | null
    year?: number
    format: string
}

// ── Physical Archive ──
export interface PhysicalArchiveItem {
    id: string | number
    filmId: number
    film_id?: number
    title: string
    poster_path?: string | null
    year?: number | null
    formats: string[]
    notes?: string
    condition?: string
    createdAt?: string
    created_at?: string
}

// ── List ──
export interface FilmList {
    id: string
    title: string
    name?: string
    description?: string
    films: { id: number; title: string; poster_path?: string | null }[]
    user_id?: string
    created_at?: string
    isPrivate?: boolean
    isRanked?: boolean
}

/** Alias for FilmList — used by listSlice domain store */
export type CustomList = FilmList;

// ── Interaction ──
export interface Interaction {
    type: 'endorse' | 'endorse_list'
    targetId: string
    timestamp: string
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

// ── Dispatch (Dossier) — distinct from content.ts Dossier which is the store model ──
export interface DispatchDossier {
    id: string
    title: string
    content: string
    excerpt?: string
    author_id?: string
    author_name?: string
    author_avatar?: string
    film_id?: number
    film_title?: string
    film_poster?: string | null
    type: 'essay' | 'review' | 'list' | 'letter'
    published: boolean
    endorsements?: number
    created_at?: string
}

// ── Programme (Nightly Programme) ──
export interface Programme {
    id: string
    title: string
    description?: string
    films: { id: number; title?: string; poster_path?: string | null }[]
    date?: string
    user_id?: string
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
    results: (TMDBMovie | TMDBPerson)[]
    total_pages: number
    total_results: number
    page: number
    searchType?: 'exact' | 'typo' | 'semantic' | 'person' | 'failed'
    matchedContext?: string
}

// ── Dossier Detail (read screen) ──
export interface DossierDetail {
    id: string
    title: string
    excerpt?: string
    full_content?: string
    author?: string
    author_username?: string
    user_id?: string
    created_at?: string
    views?: number
    certify_count?: number
}

// ── Dossier Comment (annotation) ──
export interface DossierComment {
    id: string
    user_id: string
    username: string
    body: string
    created_at: string
}

// ── Lounge Member ──
export interface LoungeMember {
    user_id: string
    username: string
    avatar_url?: string
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
}

// ── Profile Types ──
export interface ProfileVaultItem {
    id: string;
    film_id?: number;
    filmId: number;
    title: string;
    poster_path: string | null;
    year?: number | null;
    formats: string[];
    notes: string;
    condition: string;
    created_at?: string;
    createdAt: string;
}

export interface FormatCount {
    id: string;
    label: string;
    count: number;
    color: string;
}

export interface ProfileLog {
    id: string;
    filmId: number;
    title: string;
    poster: string | null;
    year: number | string | null | undefined;
    rating: number;
    review?: string | null | undefined;
    status: string;
    watchedDate?: string | null | undefined;
    pullQuote?: string | null | undefined;
    altPoster?: string | null | undefined;
    physicalMedia?: string | null | undefined;
    watchedWith?: string | null | undefined;
    abandonedReason?: string | null | undefined;
    createdAt: string;
}

export interface ProfileWatchlistItem {
    id: number;
    title: string;
    poster_path: string | null;
    year?: number | null;
}

export interface ProfileListFilm {
    id: number;
    title: string;
    poster: string | null;
}

export interface ProfileList {
    id: string;
    title: string;
    description: string;
    isRanked: boolean;
    isPrivate: boolean;
    createdAt: string;
    films: ProfileListFilm[];
}

export interface HalfLifeEntry {
    count: number;
    trajectory: 'ASCENDING' | 'DECAYING' | 'ETERNAL';
    delta: number;
}

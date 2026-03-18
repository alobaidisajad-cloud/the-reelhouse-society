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
    avatar_url?: string
    role: 'free' | 'archivist' | 'auteur'
    following?: string[]
    followers_count?: number
    following_count?: number
    isSocialPrivate?: boolean
    is_social_private?: boolean
    created_at?: string
    preferences?: any
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
    privateNotes?: string | null
    abandonedReason?: string | null
    physicalMedia?: string | null
    isAutopsied?: boolean
    autopsy?: string | null
    editorialHeader?: string | null
    dropCap?: boolean
}

// ── Watchlist ──
export interface WatchlistItem {
    id: number
    title: string
    poster_path?: string | null
    year?: number
}

// ── Vault ──
export interface VaultItem {
    id: number
    title: string
    poster_path?: string | null
    year?: number
    format: string
}

// ── List ──
export interface FilmList {
    id: string
    title: string
    description?: string
    films: Array<{ id: number; title: string; poster_path?: string | null }>
    user_id?: string
    created_at?: string
    isPublic?: boolean
}

// ── Interaction ──
export interface Interaction {
    type: 'endorse'
    targetId: string
    timestamp: string
}

// ── Ticket Stub ──
export interface TicketStub {
    id: string
    filmTitle?: string
    film_title?: string
    venue_name?: string
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

// ── Dispatch (Dossier) ──
export interface Dossier {
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
    films: Array<{ id: number; title?: string; poster_path?: string | null }>
    date?: string
    user_id?: string
    created_at?: string
}

// ── Notification ──
export interface Notification {
    id: string
    type: 'endorse' | 'follow' | 'annotate' | 'retransmit' | 'system'
    message?: string
    from_user?: string
    from_avatar?: string
    target_id?: string
    read: boolean
    created_at?: string
    timestamp: string
}

// ── Venue ──
export interface Venue {
    id: string | null
    name: string
    location: string
    address: string
    description: string
    bio: string
    email: string
    phone: string
    website: string
    instagram: string
    logo: string | null
    vibes: string[]
    seatLayout: SeatLayout
    screens: Screen[]
    lat: number | null
    lng: number | null
    followers: number
    verified: boolean
    paymentConnected: boolean
    platformFeePercent: number
}

export interface SeatLayout {
    rows: number
    cols: number
    vipRows: number
    aisleAfterCol: number
    blockedSeats: string[]
}

export interface Screen {
    name: string
    seatLayout: SeatLayout
}

// ── Showtime ──
export interface Showtime {
    id: string
    film: string
    film_title?: string
    date: string
    time?: string
    venue_id?: string
    screen_name?: string
    slots: Array<any>
    durationMins: number
    price?: number
}

// ── Cinema Review ──
export interface CinemaReview {
    id: string
    venue_id?: string
    user_id?: string
    username: string
    rating: number
    text?: string
    review?: string
    created_at?: string
    createdAt?: string
}

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

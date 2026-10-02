// ============================================================
// TMDB API types — extracted from monolithic types.ts
// ============================================================

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
    // ── Detail-response properties (populated by tmdb.detail()) ──
    genres?: { id: number; name: string }[]
    status?: string
    original_language?: string
    budget?: number
    revenue?: number
    credits?: { cast: TMDBPerson[]; crew: (TMDBPerson & { job: string })[] }
    videos?: { results: TMDBVideo[] }
    'watch/providers'?: { results: Record<string, unknown> }
    production_companies?: FilmStudio[]
    release_dates?: unknown
    images?: { backdrops?: { file_path: string }[]; posters?: { file_path: string }[] }
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
    /** 'failed': nothing matched, every tier tried. (A catalogue that could not be asked throws.) */
    searchType?: 'exact' | 'typo' | 'semantic' | 'person' | 'failed'
    matchedContext?: string
}

export interface TMDBVideo {
    id: string;
    iso_639_1: string;
    iso_3166_1: string;
    key: string;
    name: string;
    site: string;
    size: number;
    type: string;
    published_at?: string;
}

export interface FilmStudio {
    id: number;
    logo_path: string | null;
    name: string;
    origin_country: string;
}

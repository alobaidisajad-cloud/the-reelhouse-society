export interface TMDBMovie {
    id: number;
    title: string;
    original_title?: string;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    release_date: string;
    vote_average: number;
    vote_count: number;
    popularity?: number;
    genres?: Array<{ id: number; name: string }>;
    runtime?: number;
    tagline?: string;
    status?: string;
    original_language?: string;
    budget?: number;
    revenue?: number;
    production_countries?: Array<{ iso_3166_1: string; name: string }>;
    production_companies?: Array<{ id: number; logo_path: string | null; name: string; origin_country: string }>;
    credits?: TMDBCredits;
    videos?: { results: TMDBVideo[] };
    'watch/providers'?: { results: Record<string, any> };
    release_dates?: { results: Array<{ iso_3166_1: string; release_dates: any[] }> };
}

export interface TMDBCredits {
    cast: Array<{
        id: number;
        name: string;
        character: string;
        profile_path: string | null;
        order?: number;
    }>;
    crew: Array<{
        id: number;
        name: string;
        job: string;
        department: string;
        profile_path: string | null;
    }>;
}

export interface TMDBVideo {
    id: string;
    key: string;
    name: string;
    site: string;
    type: string;
    official: boolean;
    published_at: string;
}

export interface TMDBPerson {
    id: number;
    name: string;
    biography: string;
    profile_path: string | null;
    birthday?: string | null;
    deathday?: string | null;
    place_of_birth?: string | null;
    known_for_department?: string;
}

export interface TMDBPaginatedResponse<T> {
    page: number;
    results: T[];
    total_pages: number;
    total_results: number;
}

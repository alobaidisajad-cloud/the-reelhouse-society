// ============================================================
// Profile domain types — extracted from monolithic types.ts
// ============================================================
import type { DomainLog } from './film.types';

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
    isSpoiler?: boolean;
    pullQuote?: string | null | undefined;
    altPoster?: string | null | undefined;
    physicalMedia?: string | null | undefined;
    watchedWith?: string | null | undefined;
    abandonedReason?: string | null | undefined;
    isAutopsied?: boolean;
    // TYPES-3: derive the autopsy/viewingHistory shapes from the canonical
    // DomainLog instead of leaking `any` (these two interfaces are near-duplicates).
    autopsy?: Record<string, number> | null;
    viewCount?: number;
    viewingHistory?: NonNullable<DomainLog['viewingHistory']> | null;
    videoUrl?: string | null;
    format?: string | null;
    dropCap?: boolean;
    editorialHeader?: string | null;
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

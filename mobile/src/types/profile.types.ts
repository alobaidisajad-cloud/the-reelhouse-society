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
    /**
     * Posters to render — deliberately capped at 4 for other members' profiles, because
     * only four are shown. `films.length` is therefore NOT the size of the stack.
     */
    films: ProfileListFilm[];
    /**
     * How many films the stack actually holds.
     *
     * #46: the card rendered `films.length`, and the visitor query caps that array at 4
     * — so a 96-film journey was advertised to the entire Society as "4 FILMS". Seven of
     * nine live stacks displayed the wrong number. Only the OWNER saw the truth, because
     * their own path has no cap.
     *
     * REQUIRED, not optional, and that is the point: this type has two producers (the
     * owner's store and the visitor service), and an optional field would let one of
     * them be forgotten, compile cleanly, and render `undefined FILMS` at runtime. The
     * compiler refuses to build until both are wired.
     */
    filmCount: number;
}

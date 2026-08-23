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

/**
 * What the Ledger's rating filter can be.
 *
 * Written out by hand as `number | 'all'` in SIX places — the controller's
 * state, the computed props, the room's props twice, the data hook and the
 * service's query options. Adding `'high'` to five of them would have compiled
 * cleanly and quietly filtered nothing at the sixth. One type, imported.
 *
 * `'high'` is 4-or-better: the thing a member actually reaches for, and the one
 * filter that cannot be expressed by picking a single rating. It is a SENTINEL,
 * not a number, so it survives the round trip through the service without ever
 * being mistaken for `.eq('rating', 4)`.
 */
export type LedgerRating = number | 'all' | 'high';

/** 4 reels or better. Named so the query and the chip can never disagree. */
export const LEDGER_HIGH_FLOOR = 4;

/**
 * The decade a queue is filtered to — `1990` means 1990–1999, `null` means all.
 *
 * A queue of two hundred films has exactly two ways in today: alphabetical, and
 * a search box you have to already know the answer to type into. "What have I
 * been meaning to watch from the seventies" is the question a member actually
 * has, and `watchlists.year` has been sitting in the SELECT the whole time.
 */
export type WatchlistDecade = number | null;

/**
 * How a shelf of OBJECTS is read — the Vault's cases and the Stacks' volumes.
 *
 * The same three the Watchlist already offers, deliberately: a member should
 * not have to learn a second vocabulary for "in what order" one room down. It
 * runs all the way to the server, keyed cursor and all, so sorting a 300-disc
 * vault sorts the vault and not the 150 rows that happen to be in hand.
 */
export type ShelfSort = 'default' | 'az' | 'za';

/** Which decade a year belongs to, or null for a film with no year on record. */
export function decadeOf(year: number | null | undefined): number | null {
  if (typeof year !== 'number' || !Number.isFinite(year) || year <= 0) return null;
  return Math.floor(year / 10) * 10;
}

/** "1990s". Never through Intl — Hermes may not carry it. */
export function decadeLabel(decade: number): string {
  return `${decade}s`;
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

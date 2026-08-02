/**
 * mappers.test.ts — Row→Domain Mapper Property-Based & Unit Tests
 * ────────────────────────────────────────────────────────────────
 * T1-1 FIX: Validates the pure mapping functions that transform
 * Supabase row shapes into domain model types. Uses fast-check
 * to verify that mappers never crash on valid input shapes and
 * always produce required output fields.
 *
 * These functions are the anti-corruption layer between the DB
 * schema and the domain model — correctness here prevents
 * cascading failures across all screens.
 */

import * as fc from 'fast-check';
import {
    mapLogRow,
    mapWatchlistRow,
    mapListRow,
    mapArchiveRow,
    mapDossierRow,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mapMessageRow,
    mapLogToDbPayload,
    type LogRow,
    type WatchlistRow,
    type ListRow,
    type ArchiveRow,
    type DossierRow,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    type LoungeMessageRow,
} from '../../src/utils/mappers';
// `MappedLog` was imported from mappers and has never existed there. mapLogRow
// returns DomainLog, which is what the two `keyof` uses below actually want.
import type { DomainLog } from '../../src/types/film.types';

// ── fast-check Arbitraries (random row generators) ──

// Safe ISO date string arbitrary — avoids fc.date() Invalid Date edge case
const arbISODate = fc.integer({ min: -2208988800000, max: 4102444800000 })
    .map(ts => new Date(ts).toISOString());

const arbLogRow: fc.Arbitrary<LogRow> = fc.record({
    id: fc.uuid(),
    film_id: fc.integer({ min: 1, max: 999999 }),
    film_title: fc.string({ minLength: 1, maxLength: 100 }),
    poster_path: fc.option(fc.string(), { nil: null }),
    year: fc.option(fc.integer({ min: 1888, max: 2030 }), { nil: null }),
    rating: fc.integer({ min: 0, max: 10 }),
    review: fc.option(fc.string(), { nil: null }),
    status: fc.option(fc.constantFrom('watched', 'abandoned', 'rewatched'), { nil: null }),
    watched_date: fc.option(arbISODate, { nil: null }),
    is_spoiler: fc.option(fc.boolean(), { nil: null }),
    watched_with: fc.option(fc.string(), { nil: null }),
    private_notes: fc.option(fc.string(), { nil: null }),
    abandoned_reason: fc.option(fc.string(), { nil: null }),
    physical_media: fc.option(fc.string(), { nil: null }),
    is_autopsied: fc.option(fc.boolean(), { nil: null }),
    autopsy: fc.option(fc.string(), { nil: null }),
    alt_poster: fc.option(fc.string(), { nil: null }),
    editorial_header: fc.option(fc.string(), { nil: null }),
    drop_cap: fc.option(fc.boolean(), { nil: null }),
    pull_quote: fc.option(fc.string(), { nil: null }),
    video_url: fc.option(fc.string(), { nil: null }),
    format: fc.option(fc.string(), { nil: null }),
    created_at: arbISODate,
    view_count: fc.option(fc.integer({ min: 0 }), { nil: null }),
    viewing_history: fc.option(fc.constant([]), { nil: null }),
});

const arbWatchlistRow: fc.Arbitrary<WatchlistRow> = fc.record({
    id: fc.uuid(),
    user_id: fc.uuid(),
    film_id: fc.integer({ min: 1, max: 999999 }),
    film_title: fc.string({ minLength: 1, maxLength: 100 }),
    poster_path: fc.option(fc.string(), { nil: null }),
    year: fc.option(fc.integer({ min: 1888, max: 2030 }), { nil: null }),
    created_at: arbISODate,
});

const arbArchiveRow: fc.Arbitrary<ArchiveRow> = fc.record({
    id: fc.uuid(),
    user_id: fc.uuid(),
    film_id: fc.integer({ min: 1, max: 999999 }),
    film_title: fc.string({ minLength: 1, maxLength: 100 }),
    poster_path: fc.option(fc.string(), { nil: null }),
    year: fc.option(fc.integer({ min: 1888, max: 2030 }), { nil: null }),
    formats: fc.option(fc.array(fc.string(), { maxLength: 5 }), { nil: null }),
    notes: fc.option(fc.string(), { nil: null }),
    condition: fc.option(fc.constantFrom('excellent', 'good', 'fair', 'poor'), { nil: null }),
    created_at: arbISODate,
});

// ── Unit Tests ──

describe('mappers', () => {
    // ── mapLogRow ──

    describe('mapLogRow', () => {
        it('should correctly map all fields from snake_case to camelCase', () => {
            const input: LogRow = {
                id: 'log-123',
                film_id: 550,
                film_title: 'Fight Club',
                poster_path: '/poster.jpg',
                year: 1999,
                rating: 9,
                review: 'First rule...',
                status: 'watched',
                watched_date: '2024-01-15',
                is_spoiler: true,
                watched_with: 'Tyler',
                private_notes: 'Secret notes',
                abandoned_reason: null,
                physical_media: 'Blu-ray',
                is_autopsied: false,
                autopsy: null,
                alt_poster: '/alt.jpg',
                editorial_header: 'A Masterpiece',
                drop_cap: true,
                pull_quote: 'You do not talk about Fight Club',
                video_url: null,
                format: 'theatrical',
                created_at: '2024-01-15T12:00:00Z',
                view_count: 42,
                viewing_history: [],
            };

            const result = mapLogRow(input);

            expect(result.id).toBe('log-123');
            expect(result.filmId).toBe(550);
            expect(result.title).toBe('Fight Club');
            expect(result.poster).toBe('/poster.jpg');
            expect(result.year).toBe(1999);
            expect(result.rating).toBe(9);
            expect(result.review).toBe('First rule...');
            expect(result.status).toBe('watched');
            expect(result.isSpoiler).toBe(true);
            expect(result.watchedDate).toBe('2024-01-15');
            expect(result.watchedWith).toBe('Tyler');
            expect(result.privateNotes).toBe('Secret notes');
            expect(result.physicalMedia).toBe('Blu-ray');
            expect(result.isAutopsied).toBe(false);
            expect(result.altPoster).toBe('/alt.jpg');
            expect(result.editorialHeader).toBe('A Masterpiece');
            expect(result.dropCap).toBe(true);
            expect(result.pullQuote).toBe('You do not talk about Fight Club');
            expect(result.viewCount).toBe(42);
            expect(result.createdAt).toBe('2024-01-15T12:00:00Z');
        });

        it('should apply safe defaults for null/undefined fields', () => {
            const minimal: LogRow = {
                id: 'log-min',
                film_id: 1,
                film_title: 'Minimal',
                rating: 5,
                created_at: '2024-01-01T00:00:00Z',
            };

            const result = mapLogRow(minimal);

            expect(result.poster).toBeNull();
            expect(result.year).toBeNull();
            expect(result.review).toBeUndefined();
            expect(result.status).toBe('watched');
            expect(result.isSpoiler).toBe(false);
            expect(result.isAutopsied).toBe(false);
            expect(result.dropCap).toBe(false);
            expect(result.pullQuote).toBe('');
            expect(result.viewCount).toBe(1); // Defaults to 1, not 0
            expect(result.viewingHistory).toEqual([]);
        });
    });

    // ── mapWatchlistRow ──

    describe('mapWatchlistRow', () => {
        it('should correctly map watchlist fields', () => {
            const input: WatchlistRow = {
                id: 'wl-123',
                user_id: 'user-1',
                film_id: 550,
                film_title: 'Fight Club',
                poster_path: '/poster.jpg',
                year: 1999,
                created_at: '2024-01-15T12:00:00Z',
            };

            const result = mapWatchlistRow(input);

            expect(result.rowId).toBe('wl-123');
            expect(result.filmId).toBe(550);
            expect(result.id).toBe(550); // deprecated alias
            expect(result.title).toBe('Fight Club');
            expect(result.poster).toBe('/poster.jpg');
            expect(result.year).toBe(1999);
        });

        it('should handle null poster_path and year', () => {
            const input: WatchlistRow = {
                id: 'wl-124',
                user_id: 'user-1',
                film_id: 100,
                film_title: 'No Poster Film',
                created_at: '2024-01-01T00:00:00Z',
            };

            const result = mapWatchlistRow(input);
            expect(result.poster).toBeNull();
            expect(result.year).toBeNull();
        });
    });

    // ── mapArchiveRow ──

    describe('mapArchiveRow', () => {
        it('should correctly map archive fields with defaults', () => {
            const input: ArchiveRow = {
                id: 'arc-1',
                user_id: 'user-1',
                film_id: 550,
                film_title: 'Fight Club',
                poster_path: null,
                year: null,
                formats: null,
                notes: null,
                condition: null,
                created_at: '2024-01-01T00:00:00Z',
            };

            const result = mapArchiveRow(input);

            expect(result.poster).toBeNull();
            expect(result.year).toBeNull();
            expect(result.formats).toEqual([]);
            expect(result.notes).toBe('');
            expect(result.condition).toBe('good'); // Default
        });
    });

    // ── mapListRow ──

    describe('mapListRow', () => {
        it('should correctly map list with items', () => {
            const input: ListRow = {
                id: 'list-1',
                user_id: 'user-1',
                title: 'Best Films',
                description: 'My top picks',
                is_ranked: true,
                is_private: false,
                created_at: '2024-01-01T00:00:00Z',
                list_items: [
                    { id: 'li-1', film_id: 550, film_title: 'Fight Club', poster_path: '/fc.jpg', rank_position: 0 },
                    { id: 'li-2', film_id: 680, film_title: 'Pulp Fiction', poster_path: null, rank_position: 1 },
                ],
            };

            const result = mapListRow(input);

            expect(result.id).toBe('list-1');
            expect(result.title).toBe('Best Films');
            expect(result.isRanked).toBe(true);
            expect(result.isPrivate).toBe(false);
            expect(result.films).toHaveLength(2);
            expect(result.films[0]).toEqual({ id: 550, title: 'Fight Club', poster: '/fc.jpg' });
            expect(result.films[1]).toEqual({ id: 680, title: 'Pulp Fiction', poster: null });
        });

        it('should handle empty list_items', () => {
            const input: ListRow = {
                id: 'list-empty',
                title: 'Empty List',
                description: null,
                is_ranked: false,
                is_private: true,
                created_at: '2024-01-01T00:00:00Z',
                user_id: 'user-1',
                list_items: [],
            };

            const result = mapListRow(input);
            expect(result.films).toEqual([]);
            expect(result.description).toBeUndefined();
        });
    });

    // ── mapDossierRow ──

    describe('mapDossierRow', () => {
        it('should correctly map dossier with null fields', () => {
            const input: DossierRow = {
                id: 'dos-1',
                title: 'Test Dossier',
                user_id: 'user-1',
                created_at: '2024-06-15T12:00:00Z',
            };

            const result = mapDossierRow(input);

            expect(result.excerpt).toBe('');
            expect(result.fullContent).toBe('');
            expect(result.author).toBe('ANONYMOUS');
            expect(result.authorUsername).toBe('');
            expect(result.views).toBe(0);
            expect(result.certifyCount).toBe(0);
        });
    });

    // ── mapLogToDbPayload (reverse mapper) ──

    describe('mapLogToDbPayload', () => {
        it('should reverse-map domain fields to DB columns', () => {
            const updates: Partial<Record<keyof DomainLog, unknown>> = {
                rating: 8,
                review: 'Updated review',
                isSpoiler: true,
            };

            const result = mapLogToDbPayload(updates as any);

            expect(result.rating).toBe(8);
            expect(result.review).toBe('Updated review');
            expect(result.is_spoiler).toBe(true);
        });

        it('should only include provided fields', () => {
            const updates: Partial<Record<keyof DomainLog, unknown>> = {
                rating: 7,
            };

            const result = mapLogToDbPayload(updates as any);

            expect(Object.keys(result)).toEqual(['rating']);
        });
    });

    // ── Property-Based Tests ──

    describe('property-based tests (fast-check)', () => {
        it('PROPERTY: mapLogRow always produces required fields', () => {
            fc.assert(
                fc.property(arbLogRow, (row) => {
                    const result = mapLogRow(row);
                    return (
                        typeof result.id === 'string' &&
                        typeof result.filmId === 'number' &&
                        typeof result.title === 'string' &&
                        typeof result.createdAt === 'string' &&
                        typeof result.rating === 'number' &&
                        typeof result.status === 'string' &&
                        typeof result.isSpoiler === 'boolean' &&
                        typeof result.isAutopsied === 'boolean' &&
                        typeof result.dropCap === 'boolean' &&
                        typeof result.viewCount === 'number'
                    );
                }),
                { numRuns: 100 },
            );
        });

        it('PROPERTY: mapLogRow never throws on valid input', () => {
            fc.assert(
                fc.property(arbLogRow, (row) => {
                    // Should not throw
                    mapLogRow(row);
                    return true;
                }),
                { numRuns: 100 },
            );
        });

        it('PROPERTY: mapWatchlistRow always produces required fields', () => {
            fc.assert(
                fc.property(arbWatchlistRow, (row) => {
                    const result = mapWatchlistRow(row);
                    return (
                        typeof result.rowId === 'string' &&
                        typeof result.filmId === 'number' &&
                        typeof result.title === 'string' &&
                        result.id === result.filmId // deprecated alias
                    );
                }),
                { numRuns: 100 },
            );
        });

        it('PROPERTY: mapArchiveRow always produces required fields', () => {
            fc.assert(
                fc.property(arbArchiveRow, (row) => {
                    const result = mapArchiveRow(row);
                    return (
                        typeof result.id === 'string' &&
                        typeof result.filmId === 'number' &&
                        typeof result.title === 'string' &&
                        Array.isArray(result.formats) &&
                        typeof result.notes === 'string' &&
                        typeof result.condition === 'string' &&
                        typeof result.createdAt === 'string'
                    );
                }),
                { numRuns: 100 },
            );
        });

        it('PROPERTY: mapArchiveRow never throws on valid input', () => {
            fc.assert(
                fc.property(arbArchiveRow, (row) => {
                    mapArchiveRow(row);
                    return true;
                }),
                { numRuns: 100 },
            );
        });

        it('PROPERTY: mapLogRow preserves id and filmId exactly', () => {
            fc.assert(
                fc.property(arbLogRow, (row) => {
                    const result = mapLogRow(row);
                    return result.id === row.id && result.filmId === row.film_id;
                }),
                { numRuns: 100 },
            );
        });
    });
});

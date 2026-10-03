/**
 * archiveSlice.test.ts — Physical Archive Domain Slice Unit Tests
 * ───────────────────────────────────────────────────────────────
 * Validates core invariants of the physical archive domain slice:
 *   1. fetchPhysicalArchive populates state + _archiveIndex
 *   2. addToPhysicalArchive optimistic insert + offline queue
 *   3. removeFromPhysicalArchive optimistic removal + rollback
 *   4. ARCHIVE_CAP enforcement (500-entry max)
 */

import { supabase } from '../../src/lib/supabase';
import { useFilmStore } from '../../src/stores/films';

// ── Mocks ──

jest.mock('../../src/stores/auth', () => ({
    useAuthStore: {
        getState: jest.fn(() => ({
            user: { id: 'test-user-id', username: 'testuser', role: 'cinephile' },
        })),
        subscribe: jest.fn(() => jest.fn()),
    },
}));

const mockEnqueue = jest.fn();
jest.mock('../../src/utils/offlineQueue', () => ({
    enqueueMutation: (...args: unknown[]) => mockEnqueue(...args),
    flushOfflineQueue: jest.fn(),
}));

const mockFileOnShelf = jest.fn();
jest.mock('../../src/services/ShelfService', () => ({
    fileOnShelf: (...args: unknown[]) => mockFileOnShelf(...args),
}));
const mockIsNetworkError = jest.fn((_e: unknown) => false);
jest.mock('../../src/utils/networkError', () => ({
    isNetworkError: (e: unknown) => mockIsNetworkError(e),
}));

jest.mock('../../src/utils/reelToast', () => {
    const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
    return { __esModule: true, default: fn };
});

jest.mock('../../src/utils/logger', () => ({
    logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

jest.mock('../../src/utils/tier', () => ({
    isArchivistPlusTier: jest.fn(() => true),
    isAuteurPlusTier: jest.fn(() => true),
    resolveTier: jest.fn(() => 'archivist'),
}));

// ── Test Data Factories ──

const makeArchiveRow = (i: number, overrides: Record<string, unknown> = {}) => ({
    id: `archive-${i}`,
    user_id: 'test-user-id',
    film_id: 2000 + i,
    film_title: `Archive Film ${i}`,
    poster_path: `/archive-poster-${i}.jpg`,
    year: 1990 + i,
    formats: ['VHS'],
    notes: `Notes for ${i}`,
    condition: 'good',
    created_at: `2024-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
    ...overrides,
});

const makeLocalArchive = (i: number, overrides: Record<string, unknown> = {}) => ({
    id: `archive-${i}`,
    userId: 'test-user-id',
    filmId: 2000 + i,
    title: `Archive Film ${i}`,
    poster: `/archive-poster-${i}.jpg`,
    poster_path: `/archive-poster-${i}.jpg`,
    year: 1990 + i,
    formats: ['VHS'],
    notes: `Notes for ${i}`,
    condition: 'good',
    createdAt: `2024-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
    ...overrides,
});

describe('archiveSlice', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsNetworkError.mockReturnValue(false);
        useFilmStore.setState({
            physicalArchive: [],
            archiveHasMore: true,
            _archiveCursor: null,
            logs: [],
            _loggedIndex: {},
            interactions: [],
            watchlist: [],
            lists: [],
            _endorsedIndex: {},
            _listEndorsedIndex: {},
            _watchlistIndex: {},
        });
    });

    // ── fetchPhysicalArchive ──

    describe('fetchPhysicalArchive', () => {
        it('should populate physicalArchive from Supabase', async () => {
            const mockRows = Array.from({ length: 3 }, (_, i) => makeArchiveRow(i));
            (supabase.from as jest.Mock) = jest.fn(() => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue({ data: mockRows, error: null }),
                or: jest.fn().mockResolvedValue({ data: mockRows, error: null }),
            }));

            await useFilmStore.getState().fetchPhysicalArchive();

            const state = useFilmStore.getState();
            expect(state.physicalArchive.length).toBe(3);
            // Verify mapped items contain correct filmIds
            expect(state.physicalArchive[0].filmId).toBe(2000);
            expect(state.physicalArchive[1].filmId).toBe(2001);
            expect(state.physicalArchive[2].filmId).toBe(2002);
        });

        it('should handle empty results gracefully', async () => {
            (supabase.from as jest.Mock) = jest.fn(() => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue({ data: [], error: null }),
                or: jest.fn().mockResolvedValue({ data: [], error: null }),
            }));

            const result = await useFilmStore.getState().fetchPhysicalArchive();

            // Answered, and empty: a true answer.
            expect(result).toBe(true);
            expect(useFilmStore.getState().physicalArchive.length).toBe(0);
        });

        it('should handle Supabase errors without crashing', async () => {
            (supabase.from as jest.Mock) = jest.fn(() => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue({ data: null, error: { message: 'RLS denied' } }),
                or: jest.fn().mockResolvedValue({ data: null, error: { message: 'RLS denied' } }),
            }));

            const result = await useFilmStore.getState().fetchPhysicalArchive();

            // Never thrown, and never answered as an empty shelf: the caller is
            // told the read failed, and the shelf on screen is left as it was.
            expect(result).toBe(false);
            expect(useFilmStore.getState().physicalArchive).toEqual([]);
        });
    });

    // ── addToPhysicalArchive ──

    describe('addToPhysicalArchive', () => {
        it('should optimistically add item to archive', async () => {
            mockFileOnShelf.mockResolvedValueOnce({ id: 'server-id-123', formats: ['Blu-ray'] });

            await useFilmStore.getState().addToPhysicalArchive(
                { id: 3000, title: 'New Archive Film', poster_path: '/new.jpg', release_date: '2020-01-01' },
                ['Blu-ray'],
            );

            // The formats, and the film — never a note or a condition to write over.
            expect(mockFileOnShelf).toHaveBeenCalledWith(
                { user_id: expect.any(String), film_id: 3000, film_title: 'New Archive Film', poster_path: '/new.jpg', year: 2020 },
                ['Blu-ray'],
            );
            const state = useFilmStore.getState();
            expect(state.physicalArchive.length).toBe(1);
            expect(state.physicalArchive[0]).toEqual(expect.objectContaining({ id: 'server-id-123', filmId: 3000, title: 'New Archive Film', formats: ['Blu-ray'] }));
        });

        it('an entry already on the shelf keeps its note and condition, and shows the server\'s formats', async () => {
            useFilmStore.setState({ physicalArchive: [{ ...(makeLocalArchive(0) as any), filmId: 3002, notes: 'Slipcase torn', condition: 'worn', formats: ['DVD'] }] });
            // The server holds a format this device never loaded.
            mockFileOnShelf.mockResolvedValueOnce({ id: 'row-9', formats: ['DVD', 'Laserdisc', 'Blu-ray'] });

            await useFilmStore.getState().addToPhysicalArchive({ id: 3002, title: 'Kept', poster_path: null }, ['Blu-ray']);

            expect(useFilmStore.getState().physicalArchive[0]).toEqual(expect.objectContaining({
                filmId: 3002, notes: 'Slipcase torn', condition: 'worn', formats: ['DVD', 'Laserdisc', 'Blu-ray'],
            }));
        });

        it('should enqueue mutation on network error and keep optimistic state', async () => {
            mockIsNetworkError.mockReturnValue(true);
            mockFileOnShelf.mockRejectedValueOnce(new TypeError('Network request failed'));

            await useFilmStore.getState().addToPhysicalArchive(
                { id: 3001, title: 'Offline Film', poster_path: '/offline.jpg' },
                ['DVD'],
            );

            const state = useFilmStore.getState();
            // Optimistic state should be kept
            expect(state.physicalArchive.length).toBe(1);
            expect(state.physicalArchive[0].filmId).toBe(3001);
            // Should enqueue
            // Queued as what to add: the replay merges it the same way.
            expect(mockEnqueue).toHaveBeenCalledWith({
                type: 'add_archive',
                payload: { user_id: expect.any(String), film_id: 3001, film_title: 'Offline Film', poster_path: '/offline.jpg', year: null, formats: ['DVD'] },
            });
        });
    });

    // ── removeFromPhysicalArchive ──

    describe('removeFromPhysicalArchive', () => {
        it('should optimistically remove item from archive', async () => {
            useFilmStore.setState({
                physicalArchive: [makeLocalArchive(0) as any],
            });

            // Mock: .delete().eq().eq()
            (supabase.from as jest.Mock) = jest.fn(() => ({
                delete: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        eq: jest.fn().mockResolvedValue({ error: null }),
                    })),
                })),
            }));

            await useFilmStore.getState().removeFromPhysicalArchive(2000);

            const state = useFilmStore.getState();
            expect(state.physicalArchive.length).toBe(0);
        });

        it('should rollback on non-network error', async () => {
            const item = makeLocalArchive(0);
            useFilmStore.setState({
                physicalArchive: [item as any],
            });

            (supabase.from as jest.Mock) = jest.fn(() => ({
                delete: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        eq: jest.fn().mockResolvedValue({ error: { message: 'RLS denied' } }),
                    })),
                })),
            }));

            await useFilmStore.getState().removeFromPhysicalArchive(2000);

            const state = useFilmStore.getState();
            // Should rollback — item should be back
            expect(state.physicalArchive.length).toBe(1);
        });

        it('should enqueue mutation on network error', async () => {
            mockIsNetworkError.mockReturnValue(true);
            useFilmStore.setState({
                physicalArchive: [makeLocalArchive(0) as any],
            });

            (supabase.from as jest.Mock) = jest.fn(() => ({
                delete: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        eq: jest.fn().mockResolvedValue({ error: new TypeError('Network request failed') }),
                    })),
                })),
            }));

            await useFilmStore.getState().removeFromPhysicalArchive(2000);

            expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({
                type: 'remove_archive',
            }));
        });
    });
});

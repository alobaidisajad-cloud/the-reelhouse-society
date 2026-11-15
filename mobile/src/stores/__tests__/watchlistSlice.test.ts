/**
 * watchlistSlice.test.ts — Domain Slice Unit Tests
 * ─────────────────────────────────────────────────
 * Validates core invariants of the watchlist domain slice:
 *   1. O(1) _watchlistIndex integrity on add/remove
 *   2. Deduplication — no double-add
 *   3. no cap: a long watchlist pages whole (the cap that dropped items past 500 is gone)
 *   4. Optimistic rollback on non-network server error
 *   5. _fetchingWatchlist mutex prevents concurrent fetches
 *   6. loadMore pagination appends correctly
 */

import { supabase } from '../../lib/supabase';
import * as offlineQueue from '../../utils/offlineQueue';
import { useLogStore } from '../films';

// ── Mock Auth Store ──
jest.mock('../auth', () => ({
    useAuthStore: {
        getState: jest.fn(() => ({
            user: { id: 'test-user-id', username: 'testuser', role: 'cinephile' },
        })),
        subscribe: jest.fn(() => jest.fn()),
    },
}));

// ── Test Data Factory ──
const makeWatchlistRow = (i: number) => ({
    id: `wl-${i}`,
    user_id: 'test-user-id',
    film_id: 2000 + i,
    film_title: `WL Film ${i}`,
    poster_path: `/wl-poster-${i}.jpg`,
    year: 2020 + (i % 5),
    created_at: `2024-02-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
});

const makeWatchlistItem = (i: number) => ({
    id: 2000 + i,
    title: `WL Film ${i}`,
    poster: `/wl-poster-${i}.jpg`,
    poster_path: `/wl-poster-${i}.jpg`,
    year: 2020 + (i % 5),
});

describe('watchlistSlice', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        useLogStore.setState({
            logs: [],
            watchlist: [],
            lists: [],
            interactions: [],
            physicalArchive: [],
            _loggedIndex: {},
            _watchlistIndex: {},
            _endorsedIndex: {},
            _listEndorsedIndex: {},
            _addLogMutex: false,
            _fetchingWatchlist: false,
            watchlistHasMore: true,
            // was `watchlistCursor` — no such field. The real one is
            // _watchlistCursor (in watchlistSlice), so the pagination cursor was
            // never actually reset between tests in this file either.
            _watchlistCursor: null,
        });
    });

    // ── fetchWatchlist ──

    describe('fetchWatchlist', () => {
        const answers = (rows: unknown[]) => {
            const result = { data: rows, error: null };
            const chain = {
                select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(), or: jest.fn().mockReturnThis(),
                then: jest.fn((cb) => cb(result)),
            };
            (supabase.from as jest.Mock) = jest.fn(() => chain);
        };

        it('read again, keeps the saves and removals the queue still holds', async () => {
            answers([makeWatchlistRow(0), makeWatchlistRow(1)]);
            const queued = jest.spyOn(offlineQueue, 'getOfflineQueue').mockReturnValue([
                { id: 'q1', type: 'add_watchlist', timestamp: 1, owner: 'test-user-id', payload: { user_id: 'test-user-id', film_id: 3000, film_title: 'Saved on the train', poster_path: null, year: 1999 } },
                { id: 'q2', type: 'remove_watchlist', timestamp: 2, owner: 'test-user-id', payload: { user_id: 'test-user-id', film_id: 2001 } },
            ] as never);
            await useLogStore.getState().fetchWatchlist();
            const s = useLogStore.getState();
            expect(s.watchlist.map((w) => w.id)).toEqual([3000, 2000]);
            expect(s._watchlistIndex[3000]).toBe(true);
            expect(s._watchlistIndex[2001]).toBeUndefined();
            queued.mockRestore();
        });

        it('a next page joins the list as it stands when it lands, not the copy taken before', async () => {
            useLogStore.setState({ watchlist: [makeWatchlistItem(0)], watchlistHasMore: true, _watchlistCursor: '2024-02-01T12:00:00Z|wl-0' });
            let land: ((v: unknown) => void) | null = null;
            const chain = {
                select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(), or: jest.fn().mockReturnThis(),
                then: jest.fn((cb) => new Promise((r) => { land = r as (v: unknown) => void; }).then(cb)),
            };
            (supabase.from as jest.Mock) = jest.fn(() => chain);
            const more = useLogStore.getState().fetchWatchlist(true);
            // The read asks for its answer a beat after it is made (an await): until then it is not away.
            for (let i = 0; i < 50 && !land; i++) await Promise.resolve();
            expect(land).not.toBeNull();
            // Saved while the page was on its way.
            useLogStore.setState((st) => ({ watchlist: [makeWatchlistItem(9), ...st.watchlist] }));
            land!({ data: [makeWatchlistRow(1)], error: null });
            await more;
            expect(useLogStore.getState().watchlist.map((w) => w.id)).toEqual([2009, 2000, 2001]);
        });

        it('should populate _watchlistIndex after fetch', async () => {
            const mockRows = Array.from({ length: 5 }, (_, i) => makeWatchlistRow(i));
            const mockResult = { data: mockRows, error: null };
            const chainable = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                or: jest.fn().mockReturnThis(),
                then: jest.fn((cb) => cb(mockResult)),
            };
            (supabase.from as jest.Mock) = jest.fn(() => chainable);

            await useLogStore.getState().fetchWatchlist();

            const state = useLogStore.getState();
            expect(state.watchlist.length).toBe(5);
            for (let i = 0; i < 5; i++) {
                expect(state._watchlistIndex[2000 + i]).toBe(true);
            }
        });

        it('should append on loadMore without replacing existing entries', async () => {
            // Pre-populate page 1
            const page1Items = Array.from({ length: 3 }, (_, i) => makeWatchlistItem(i));
            const page1Index: Record<number, true> = {};
            page1Items.forEach(w => { page1Index[w.id] = true; });
            useLogStore.setState({
                watchlist: page1Items as any[],
                _watchlistIndex: page1Index,
                _watchlistCursor: '2024-02-03T12:00:00Z|wl-2',
                watchlistHasMore: true,
            });

            // Mock page 2
            const page2Rows = Array.from({ length: 3 }, (_, i) => makeWatchlistRow(i + 10));
            const mockResult = { data: page2Rows, error: null };
            const chainable = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                or: jest.fn().mockReturnThis(),
                then: jest.fn((cb) => cb(mockResult)),
            };
            (supabase.from as jest.Mock) = jest.fn(() => chainable);

            await useLogStore.getState().fetchWatchlist(true);

            const state = useLogStore.getState();
            expect(state.watchlist.length).toBe(6); // 3 + 3
            expect(state._watchlistIndex[2000]).toBe(true); // page 1 still there
            expect(state._watchlistIndex[2010]).toBe(true); // page 2 added
        });

        it('should prevent concurrent fetches via _fetchingWatchlist mutex', async () => {
            let resolvePromise: () => void;
            const hangingPromise = new Promise<void>(r => { resolvePromise = r; });

            const fromMock = jest.fn(() => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                or: jest.fn().mockReturnThis(),
                abortSignal: jest.fn().mockImplementation(async () => {
                    await hangingPromise;
                    return { data: [], error: null };
                }),
            }));
            (supabase.from as jest.Mock) = fromMock;

            const firstFetch = useLogStore.getState().fetchWatchlist();
            await useLogStore.getState().fetchWatchlist();

            expect(fromMock).toHaveBeenCalledTimes(1);

            resolvePromise!();
            await firstFetch;
        });

        it('should handle supabase errors without corrupting state', async () => {
            const existing = makeWatchlistItem(0);
            useLogStore.setState({
                watchlist: [existing as any],
                _watchlistIndex: { 2000: true },
            });

            const mockResult = { data: null, error: { message: 'Connection reset' } };
            (supabase.from as jest.Mock) = jest.fn(() => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                or: jest.fn().mockReturnThis(),
                abortSignal: jest.fn().mockResolvedValue(mockResult),
            }));

            await useLogStore.getState().fetchWatchlist();

            const state = useLogStore.getState();
            expect(state.watchlist.length).toBe(1);
            expect(state._watchlistIndex[2000]).toBe(true);
            expect(state._fetchingWatchlist).toBe(false);
        });
    });

    // ── addToWatchlist ──

    describe('addToWatchlist', () => {
        it('should add film to watchlist and update _watchlistIndex', async () => {
            (supabase.from as jest.Mock) = jest.fn(() => ({
                insert: jest.fn().mockResolvedValue({ error: null }),
            }));

            await useLogStore.getState().addToWatchlist({
                id: 5000, title: 'New Film', poster_path: '/new.jpg', release_date: '2024',
            });

            const state = useLogStore.getState();
            expect(state.watchlist.length).toBe(1);
            expect(state.watchlist[0].id).toBe(5000);
            expect(state._watchlistIndex[5000]).toBe(true);
        });

        it('should deduplicate — no double-add for same film', async () => {
            useLogStore.setState({
                watchlist: [{ id: 5000, title: 'Existing', poster_path: null, year: null } as any],
                _watchlistIndex: { 5000: true },
            });

            await useLogStore.getState().addToWatchlist({
                id: 5000, title: 'Existing', poster_path: null,
            });

            expect(useLogStore.getState().watchlist.length).toBe(1);
        });

        it('should rollback on non-network server error', async () => {
            (supabase.from as jest.Mock) = jest.fn(() => ({
                insert: jest.fn().mockReturnValue({
                    // A refusal. (A duplicate, 23505, is a film already queued: it
                    // stays — see aFilmAlreadyQueuedStaysQueued.)
                    then: jest.fn((cb) => cb({
                        error: { message: 'new row violates row-level security policy', code: '42501' },
                    })),
                }),
            }));

            await useLogStore.getState().addToWatchlist({
                id: 6000, title: 'Refused Film', poster_path: '/dupe.jpg',
            });

            // Wait for the detached promise chain to complete
            await new Promise(resolve => setTimeout(resolve, 0));

            const state = useLogStore.getState();
            // Optimistic add should be rolled back
            expect(state.watchlist.length).toBe(0);
            expect(state._watchlistIndex[6000]).toBeUndefined();
        });
    });

    // ── removeFromWatchlist ──

    describe('removeFromWatchlist', () => {
        it('should remove film and clear _watchlistIndex entry', async () => {
            useLogStore.setState({
                watchlist: [{ id: 7000, title: 'To Remove', poster_path: null, year: null } as any],
                _watchlistIndex: { 7000: true },
            });

            (supabase.from as jest.Mock) = jest.fn(() => ({
                delete: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        eq: jest.fn().mockReturnValue({
                            then: jest.fn((cb) => cb({ error: null })),
                        }),
                    })),
                })),
            }));

            await useLogStore.getState().removeFromWatchlist(7000);

            // Wait for the detached promise chain to complete
            await new Promise(resolve => setTimeout(resolve, 0));

            const state = useLogStore.getState();
            expect(state.watchlist.length).toBe(0);
            expect(state._watchlistIndex[7000]).toBeUndefined();
        });

        it('should rollback on non-network server error', async () => {
            useLogStore.setState({
                watchlist: [{ id: 8000, title: 'Keep Me', poster_path: null, year: null } as any],
                _watchlistIndex: { 8000: true },
            });

            (supabase.from as jest.Mock) = jest.fn(() => ({
                delete: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        eq: jest.fn().mockReturnValue({
                            then: jest.fn((cb) => cb({
                                error: { message: 'Permission denied', code: '42501' },
                            })),
                        }),
                    })),
                })),
            }));

            await useLogStore.getState().removeFromWatchlist(8000);

            // Wait for the detached promise chain to complete
            await new Promise(resolve => setTimeout(resolve, 0));

            const state = useLogStore.getState();
            // Should be restored
            expect(state.watchlist.length).toBe(1);
            expect(state._watchlistIndex[8000]).toBe(true);
        });

        it('should no-op if film not in watchlist', async () => {
            await useLogStore.getState().removeFromWatchlist(9999);

            expect(supabase.from).not.toHaveBeenCalled();
        });
    });
});

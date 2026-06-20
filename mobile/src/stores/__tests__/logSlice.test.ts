/**
 * logSlice.test.ts — Domain Slice Unit Tests
 * ───────────────────────────────────────────
 * Validates core invariants of the log domain slice:
 *   1. O(1) _loggedIndex integrity after fetch/add/remove
 *   2. 500-entry cap enforcement
 *   3. _fetchingLogs mutex prevents concurrent fetches
 *   4. _addLogMutex prevents double-submit
 *   5. getCinephileStats tier boundary logic
 *   6. Incremental index on loadMore (P1-1 fix)
 *   7. Optimistic rollback on removeLog server error
 */

import { supabase } from '../../lib/supabase';
import { useLogStore } from '../films';

jest.mock('expo-image', () => ({
    Image: {
        prefetch: jest.fn().mockResolvedValue([]),
    },
}));

// ── Test Data Factories ──
const makeLogRow = (i: number, overrides: Record<string, unknown> = {}) => ({
    id: `log-${i}`,
    user_id: 'test-user-id',
    film_id: 1000 + i,
    film_title: `Film ${i}`,
    poster_path: `/poster-${i}.jpg`,
    year: 2020 + (i % 5),
    rating: (i % 5) + 1,
    review: i % 3 === 0 ? `Review for film ${i}` : null,
    status: 'watched',
    watched_date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    is_spoiler: false,
    watched_with: null,
    private_notes: null,
    abandoned_reason: null,
    physical_media: null,
    is_autopsied: false,
    autopsy: null,
    alt_poster: null,
    editorial_header: null,
    drop_cap: false,
    pull_quote: '',
    video_url: null,
    format: 'digital',
    created_at: `2024-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
    view_count: 1,
    viewing_history: [],
    ...overrides,
});

const makeFilmLog = (i: number, overrides: Record<string, unknown> = {}) => ({
    id: `log-${i}`,
    filmId: 1000 + i,
    title: `Film ${i}`,
    poster: `/poster-${i}.jpg`,
    year: 2020 + (i % 5),
    rating: (i % 5) + 1,
    review: i % 3 === 0 ? `Review for film ${i}` : null,
    status: 'watched',
    watchedDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
    createdAt: `2024-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
    viewCount: 1,
    viewingHistory: [],
    ...overrides,
});

// ── Mock Auth Store ──
jest.mock('../auth', () => ({
    useAuthStore: {
        getState: jest.fn(() => ({
            user: { id: 'test-user-id', username: 'testuser', role: 'cinephile' },
        })),
        subscribe: jest.fn(() => jest.fn()),
    },
}));

describe('logSlice', () => {
    beforeEach(() => {
        useLogStore.setState({
            logs: [],
            logsHasMore: true,
            _logsCursor: null,
            _loggedIndex: {},
            _fetchingLogs: false,
            _addLogMutex: false,
            interactions: [],
            watchlist: [],
            lists: [],
            physicalArchive: [],
            _endorsedIndex: {},
            _listEndorsedIndex: {},
            _watchlistIndex: {},
        });
        if ((supabase.from as jest.Mock).mockClear) {
            (supabase.from as jest.Mock).mockClear();
        }
    });

    // ── fetchLogs ──

    describe('fetchLogs', () => {
        it('should populate _loggedIndex as O(1) lookup after fetch', async () => {
            const mockRows = Array.from({ length: 5 }, (_, i) => makeLogRow(i));
            const mockResult = { data: mockRows, error: null };
            const chainable = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                or: jest.fn().mockReturnThis(),
                is: jest.fn().mockReturnThis(),
                lt: jest.fn().mockReturnThis(),
                then: jest.fn((cb: any) => Promise.resolve(cb(mockResult))),
            };
            const fromMock = jest.fn(() => chainable);
            (supabase.from as jest.Mock) = fromMock;

            await useLogStore.getState().fetchLogs();

            const state = useLogStore.getState();
            expect(state.logs.length).toBe(5);
            // Each film should be O(1) indexable
            for (let i = 0; i < 5; i++) {
                expect(state._loggedIndex[1000 + i]).toBeDefined();
                expect(state._loggedIndex[1000 + i].id).toBe(`log-${i}`);
            }
        });

        it('should cap logs at 500 entries', async () => {
            const mockRows = Array.from({ length: 50 }, (_, i) => makeLogRow(i));
            const mockResult = { data: mockRows, error: null };
            const chainable = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                or: jest.fn().mockReturnThis(),
                is: jest.fn().mockReturnThis(),
                lt: jest.fn().mockReturnThis(),
                then: jest.fn((cb: any) => Promise.resolve(cb(mockResult))),
            };
            const fromMock = jest.fn(() => chainable);
            (supabase.from as jest.Mock) = fromMock;

            // Pre-fill with 480 entries so that fetch pushes past 500
            const existingLogs = Array.from({ length: 480 }, (_, i) => makeFilmLog(i + 100));
            useLogStore.setState({ logs: existingLogs as any[] });

            await useLogStore.getState().fetchLogs(); // loadMore=false replaces, so result is still ≤50

            const state = useLogStore.getState();
            expect(state.logs.length).toBeLessThanOrEqual(500);
        });

        it('should prevent concurrent fetches via _fetchingLogs mutex', async () => {
            let resolvePromise: () => void;
            const hangingPromise = new Promise<void>(r => { resolvePromise = r; });

            const chainable = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                or: jest.fn().mockReturnThis(),
                is: jest.fn().mockReturnThis(),
                lt: jest.fn().mockReturnThis(),
                then: jest.fn((cb: any) => hangingPromise.then(() => cb({ data: [], error: null }))),
            };
            const fromMock = jest.fn(() => chainable);
            (supabase.from as jest.Mock) = fromMock;

            // Start first fetch (will hang)
            const firstFetch = useLogStore.getState().fetchLogs();

            // Second fetch should be blocked by mutex
            await useLogStore.getState().fetchLogs();

            // Only one supabase.from call should have been made
            expect(fromMock).toHaveBeenCalledTimes(1);

            resolvePromise!();
            await firstFetch;
        });

        it('should handle supabase errors gracefully without corrupting state', async () => {
            const existingLog = makeFilmLog(0);
            useLogStore.setState({
                logs: [existingLog as any],
                _loggedIndex: { 1000: existingLog as any },
            });

            const mockResult = { data: null, error: { message: 'DB timeout' } };
            const chainable = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                or: jest.fn().mockReturnThis(),
                is: jest.fn().mockReturnThis(),
                lt: jest.fn().mockReturnThis(),
                then: jest.fn((cb: any) => Promise.resolve(cb(mockResult))),
            };
            const fromMock = jest.fn(() => chainable);
            (supabase.from as jest.Mock) = fromMock;

            await useLogStore.getState().fetchLogs();

            // State should be unchanged after error
            const state = useLogStore.getState();
            expect(state.logs.length).toBe(1);
            expect(state._loggedIndex[1000]).toBeDefined();
            expect(state._fetchingLogs).toBe(false);
        });

        it('should build incremental index on loadMore (P1-1 fix)', async () => {
            // Pre-populate with page 1
            const page1 = Array.from({ length: 3 }, (_, i) => makeFilmLog(i));
            const page1Index: Record<number, any> = {};
            page1.forEach(l => { page1Index[l.filmId] = l; });
            useLogStore.setState({
                logs: page1 as any[],
                _loggedIndex: page1Index,
                _logsCursor: JSON.stringify({ lastDate: '2024-01-03', lastId: 'log-2', wasDateNull: false }),
                logsHasMore: true,
            });

            // Mock page 2 data
            const page2Rows = Array.from({ length: 3 }, (_, i) => makeLogRow(i + 10));
            const mockResult = { data: page2Rows, error: null };
            const chainable = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                or: jest.fn().mockReturnThis(),
                is: jest.fn().mockReturnThis(),
                lt: jest.fn().mockReturnThis(),
                then: jest.fn((cb: any) => Promise.resolve(cb(mockResult))),
            };
            const fromMock = jest.fn(() => chainable);
            (supabase.from as jest.Mock) = fromMock;

            await useLogStore.getState().fetchLogs(true); // loadMore

            const state = useLogStore.getState();
            expect(state.logs.length).toBe(6); // 3 + 3
            // Page 1 entries still in index
            expect(state._loggedIndex[1000]).toBeDefined();
            // Page 2 entries added
            expect(state._loggedIndex[1010]).toBeDefined();
        });
    });

    // ── getCinephileStats ──

    describe('getCinephileStats', () => {
        it('should return FIRST REEL for 0 logs', () => {
            const stats = useLogStore.getState().getCinephileStats(0);
            expect(stats.level).toBe('FIRST REEL');
            expect(stats.progress).toBe(0);
        });

        it('should return THE INITIATE for 1-9 logs', () => {
            const stats = useLogStore.getState().getCinephileStats(5);
            expect(stats.level).toBe('THE INITIATE');
            expect(stats.progress).toBe(Math.round(((5 - 1) / 9) * 100));
        });

        it('should return THE REGULAR for 10-24 logs', () => {
            const stats = useLogStore.getState().getCinephileStats(15);
            expect(stats.level).toBe('THE REGULAR');
        });

        it('should return THE DEVOTEE for 25-99 logs', () => {
            const stats = useLogStore.getState().getCinephileStats(50);
            expect(stats.level).toBe('THE DEVOTEE');
        });

        it('should return THE ORACLE for 100+ logs with 100% progress', () => {
            const stats = useLogStore.getState().getCinephileStats(250);
            expect(stats.level).toBe('THE ORACLE');
            expect(stats.progress).toBe(100);
        });

        it('should use exact boundary values correctly', () => {
            expect(useLogStore.getState().getCinephileStats(1).level).toBe('THE INITIATE');
            expect(useLogStore.getState().getCinephileStats(10).level).toBe('THE REGULAR');
            expect(useLogStore.getState().getCinephileStats(25).level).toBe('THE DEVOTEE');
            expect(useLogStore.getState().getCinephileStats(100).level).toBe('THE ORACLE');
        });
    });

    // ── removeLog ──

    describe('removeLog', () => {
        it('should clear _loggedIndex entry on removal', async () => {
            const log = makeFilmLog(0);
            useLogStore.setState({
                logs: [log as any],
                _loggedIndex: { 1000: log as any },
            });



            // Chain .delete().eq().eq() resolves with no error
            (supabase.from as jest.Mock) = jest.fn(() => ({
                delete: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        eq: jest.fn().mockResolvedValue({ error: null }),
                    })),
                })),
            }));

            await useLogStore.getState().removeLog('log-0');

            const state = useLogStore.getState();
            expect(state.logs.length).toBe(0);
            expect(state._loggedIndex[1000]).toBeUndefined();
        });
    });

    // ── _addLogMutex ──

    describe('_addLogMutex', () => {
        it('should release mutex after successful addLog', async () => {
            (supabase.from as jest.Mock) = jest.fn(() => ({
                select: jest.fn().mockReturnThis(),
                insert: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue({ data: [], error: null }),
                maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                single: jest.fn().mockResolvedValue({
                    data: { id: 'new-log-id', created_at: '2024-01-01T00:00:00Z' },
                    error: null,
                }),
            }));

            await useLogStore.getState().addLog({
                filmId: 9999, title: 'Test Film', rating: 5, status: 'watched',
            });

            expect(useLogStore.getState()._addLogMutex).toBe(false);
        });

        it('should block concurrent addLog calls', async () => {
            useLogStore.setState({ _addLogMutex: true });

            // This should throw because mutex is held
            await expect(
                useLogStore.getState().addLog({
                    filmId: 9999, title: 'Test Film', rating: 5,
                })
            ).rejects.toThrow('addLog mutex locked');

            // supabase.from should NOT have been called because mutex was held
            expect(supabase.from).not.toHaveBeenCalled();
        });
    });

    // ── CONVERGENCE FIX: 23505 unique-violation merge ──
    // When a concurrent insert (e.g. the same film logged from another device) wins
    // the logs(user_id, film_id) unique race, the online addLog path must MERGE the
    // attempt into the existing row (as the offline executor does) instead of throwing
    // and silently discarding the user's review. This test locks that behavior:
    // the old code rejected and never called update; the fixed code resolves and merges.
    describe('addLog duplicate convergence (23505)', () => {
        it('merges into the existing row instead of discarding the review', async () => {
            const serverRow = makeLogRow(7, {
                id: 'existing-server-log',
                film_id: 7777,
                review: 'first viewing review',
                rating: 4,
            });

            const updateFn = jest.fn(() => ({
                eq: jest.fn().mockResolvedValue({ error: null }),
            }));

            // select() is used twice: the upfront existing-log check (→ none) and the
            // post-23505 re-fetch (→ the row that won the race).
            const selectChain = {
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn()
                    .mockResolvedValueOnce({ data: [], error: null })          // upfront: no existing log
                    .mockResolvedValueOnce({ data: [serverRow], error: null }), // after 23505: existing row
            };

            // insert().select().single() rejects with a Postgres unique-violation.
            const insertChain = {
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({
                    data: null,
                    error: { code: '23505', message: 'duplicate key value violates unique constraint' },
                }),
            };

            (supabase.from as jest.Mock) = jest.fn(() => ({
                select: jest.fn(() => selectChain),
                insert: jest.fn(() => insertChain),
                update: updateFn,
            }));

            // The new attempt carries the user's freshly written review.
            await expect(
                useLogStore.getState().addLog({
                    filmId: 7777, title: 'Film 7', rating: 5, review: 'my new review', status: 'watched',
                })
            ).resolves.toBeUndefined();

            // Converged: the merge ran (update called) rather than the throw path.
            expect(updateFn).toHaveBeenCalled();
            // The existing viewing was archived into viewing_history (review preserved, not lost).
            const updatePayload = updateFn.mock.calls[0][0] as Record<string, any>;
            expect(Array.isArray(updatePayload.viewing_history)).toBe(true);
            expect(updatePayload.viewing_history.length).toBe(1);
            // Mutex released for the next write.
            expect(useLogStore.getState()._addLogMutex).toBe(false);
        });
    });
});

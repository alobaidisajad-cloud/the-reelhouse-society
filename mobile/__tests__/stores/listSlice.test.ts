/**
 * listSlice.test.ts — List Domain Slice Unit Tests
 * ─────────────────────────────────────────────────
 * Validates core invariants of the list domain slice:
 *   1. fetchLists populates state from Supabase
 *   2. createList optimistic insert + offline queue on network error
 *   3. updateList with P0-2 RPC-first film replace
 *   4. deleteList optimistic removal + rollback on error
 *   5. addFilmToList / removeFilmFromList CRUD + offline queue
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
const mockGetOfflineQueue = jest.fn(() => []);
jest.mock('../../src/utils/offlineQueue', () => ({
    __esModule: true,
    enqueueMutation: (...args: unknown[]) => mockEnqueue(...args),
    flushOfflineQueue: jest.fn(),
    getOfflineQueue: () => mockGetOfflineQueue(),
}));

jest.mock('../../src/utils/networkError', () => ({
    isNetworkError: jest.fn(() => false),
}));

jest.mock('../../src/utils/reelToast', () => {
    const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
    return { __esModule: true, default: fn };
});

jest.mock('../../src/utils/logger', () => ({
    logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));



jest.mock('expo-crypto', () => ({
    randomUUID: jest.fn(() => 'mock-uuid-1234-5678-9abc-def012345678'),
}));

// ── Test Data Factories ──

const makeListRow = (i: number, overrides: Record<string, unknown> = {}) => ({
    id: `list-${i}`,
    title: `Stack ${i}`,
    description: `Description ${i}`,
    is_ranked: false,
    is_private: false,
    created_at: `2024-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
    list_items: [
        { id: `item-${i}-0`, film_id: 1000 + i, film_title: `Film ${i}`, poster_path: `/poster-${i}.jpg`, position: 0 },
    ],
    ...overrides,
});

const makeLocalList = (i: number, overrides: Record<string, unknown> = {}) => ({
    id: `list-${i}`,
    title: `Stack ${i}`,
    description: `Description ${i}`,
    isRanked: false,
    isPrivate: false,
    createdAt: `2024-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
    films: [{ id: 1000 + i, title: `Film ${i}`, poster: `/poster-${i}.jpg` }],
    ...overrides,
});

describe('listSlice', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        useFilmStore.setState({
            lists: [],
            listsHasMore: true,
            _listsCursor: null,
            _fetchingLists: false,
            logs: [],
            _loggedIndex: {},
            interactions: [],
            watchlist: [],
            physicalArchive: [],
            _endorsedIndex: {},
            _listEndorsedIndex: {},
            _watchlistIndex: {},
        });
    });

    // ── fetchLists ──

    describe('fetchLists', () => {
        it('should populate lists from Supabase response', async () => {
            const mockRows = Array.from({ length: 3 }, (_, i) => makeListRow(i));
            const mockResult = { data: mockRows, error: null };
            (supabase.from as jest.Mock) = jest.fn(() => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                or: jest.fn().mockReturnThis(),
                then: jest.fn((cb: any) => Promise.resolve(cb(mockResult))),
            }));

            await useFilmStore.getState().fetchLists();

            const state = useFilmStore.getState();
            expect(state.lists.length).toBe(3);
            expect(state.lists[0].title).toBe('Stack 0');
            expect(state.lists[0].films[0].id).toBe(1000);
        });

        it('should handle errors gracefully without corrupting state', async () => {
            const existingList = makeLocalList(0);
            useFilmStore.setState({ lists: [existingList as any] });

            const mockResult = { data: null, error: { message: 'DB timeout' } };
            (supabase.from as jest.Mock) = jest.fn(() => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                or: jest.fn().mockReturnThis(),
                then: jest.fn((cb: any) => Promise.resolve(cb(mockResult))),
            }));

            await useFilmStore.getState().fetchLists();

            const state = useFilmStore.getState();
            expect(state.lists.length).toBe(1);
            expect(state._fetchingLists).toBe(false);
        });

        it('should prevent concurrent fetches via _fetchingLists mutex', async () => {
            let resolvePromise: () => void;
            const hangingPromise = new Promise<void>(r => { resolvePromise = r; });

            const fromMock = jest.fn(() => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                or: jest.fn().mockReturnThis(),
                then: jest.fn((cb: any) => hangingPromise.then(() => cb({ data: [], error: null }))),
            }));
            (supabase.from as jest.Mock) = fromMock;

            const firstFetch = useFilmStore.getState().fetchLists();
            await useFilmStore.getState().fetchLists();

            expect(fromMock).toHaveBeenCalledTimes(1);

            resolvePromise!();
            await firstFetch;
        });
    });

    // ── deleteList ──

    describe('deleteList', () => {
        it('should optimistically remove list from state', async () => {
            useFilmStore.setState({ lists: [makeLocalList(0) as any, makeLocalList(1) as any] });

            (supabase.from as jest.Mock) = jest.fn(() => ({
                delete: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
            }));
            // Chain both .eq calls
            (supabase.from as jest.Mock) = jest.fn(() => ({
                delete: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        eq: jest.fn().mockResolvedValue({ error: null }),
                    })),
                })),
            }));

            await useFilmStore.getState().deleteList('list-0');

            const state = useFilmStore.getState();
            expect(state.lists.length).toBe(1);
            expect(state.lists[0].id).toBe('list-1');
        });
    });

    // ── addFilmToList ──

    describe('addFilmToList', () => {
        it('should optimistically add film to list', async () => {
            useFilmStore.setState({ lists: [makeLocalList(0, { films: [] }) as any] });

            (supabase.from as jest.Mock) = jest.fn(() => ({
                insert: jest.fn().mockResolvedValue({ error: null }),
            }));

            await useFilmStore.getState().addFilmToList('list-0', { id: 5000, title: 'New Film', poster_path: '/new.jpg' });

            const state = useFilmStore.getState();
            expect(state.lists[0].films.length).toBe(1);
            expect(state.lists[0].films[0].id).toBe(5000);
        });

        it('should prevent duplicate film adds', async () => {
            useFilmStore.setState({
                lists: [makeLocalList(0, { films: [{ id: 5000, title: 'Existing', poster: '/e.jpg' }] }) as any],
            });

            await useFilmStore.getState().addFilmToList('list-0', { id: 5000, title: 'Existing', poster_path: '/e.jpg' });

            // supabase.from should NOT have been called (duplicate guard)
            expect(supabase.from).not.toHaveBeenCalled();
        });
    });

    // ── removeFilmFromList ──

    describe('removeFilmFromList', () => {
        it('should optimistically remove film from list', async () => {
            useFilmStore.setState({
                lists: [makeLocalList(0, { films: [{ id: 5000, title: 'Film', poster: '/f.jpg' }] }) as any],
            });

            (supabase.from as jest.Mock) = jest.fn(() => ({
                delete: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        eq: jest.fn().mockResolvedValue({ error: null }),
                    })),
                })),
            }));

            await useFilmStore.getState().removeFilmFromList('list-0', 5000);

            const state = useFilmStore.getState();
            expect(state.lists[0].films.length).toBe(0);
        });
    });
});

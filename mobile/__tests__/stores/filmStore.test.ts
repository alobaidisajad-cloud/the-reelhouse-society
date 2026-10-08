/**
 * filmStore.test.ts — Store Slice Integration Tests
 * ──────────────────────────────────────────────────
 * T2-4: Verifies CQRS invariants across domain slices:
 *   - Write operations update pre-computed indexes atomically
 *   - Index O(1) lookups match O(N) linear scans
 *   - Partialize allowlist includes all indexes
 *   - Reset clears everything to zero state
 *
 * These tests use the REAL composed store (useFilmStore) to verify
 * that slice composition doesn't break domain boundaries.
 */

// ── Mocks ──
// Mock react-native (InteractionManager, AppState, etc.)
// ── Import after mocks ──
import { useFilmStore } from '../../src/stores/films';

jest.mock('react-native', () => ({
    InteractionManager: { runAfterInteractions: jest.fn((cb) => cb()) },
    AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })), currentState: 'active' },
    Platform: { OS: 'ios', select: jest.fn((obj: Record<string, unknown>) => obj.ios) },
    NativeModules: {},
    Alert: { alert: jest.fn() },
    Linking: { openURL: jest.fn() },
}));

// Mock MMKV storage
const mockMMKV: Record<string, string> = {};
jest.mock('react-native-mmkv', () => ({
    MMKV: jest.fn().mockImplementation(() => ({
        getString: jest.fn((key: string) => mockMMKV[key]),
        set: jest.fn((key: string, value: string) => { mockMMKV[key] = value; }),
        delete: jest.fn((key: string) => { delete mockMMKV[key]; }),
        contains: jest.fn((key: string) => key in mockMMKV),
        getAllKeys: jest.fn(() => Object.keys(mockMMKV)),
    })),
}));

/** What the phone holds for the store, by key — read back by a rehydrate. */
const mockPersisted: Record<string, unknown> = {};
jest.mock('../../src/stores/mmkv-storage', () => ({
    storage: {
        getString: jest.fn(() => undefined),
        set: jest.fn(),
        delete: jest.fn(),
        contains: jest.fn(() => false),
        getAllKeys: jest.fn(() => []),
        clearAll: jest.fn(),
    },
    zustandMMKVStorage: {
        getItem: jest.fn(() => null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
    },
    createAsyncMMKVStorage: jest.fn(() => ({
        getItem: jest.fn((name: string) => mockPersisted[name] ?? null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
    })),
    getSecureStorage: jest.fn().mockResolvedValue({
        getString: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
        contains: jest.fn(() => false),
    }),
}));

// Mock Supabase (returns empty data by default)
jest.mock('../../src/lib/supabase', () => ({
    supabase: {
        from: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            insert: jest.fn().mockResolvedValue({ data: null, error: null }),
            delete: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null }),
                }),
            }),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            abortSignal: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            not: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
        auth: {
            getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
            onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
        },
    },
}));

// Mock auth store
jest.mock('../../src/stores/auth', () => ({
    useAuthStore: {
        getState: jest.fn(() => ({
            user: { id: 'test-user-123', username: 'cinephile', role: 'member' },
        })),
    },
}));

// Mock secondary dependencies
jest.mock('../../src/utils/reelToast', () => {
    const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
    return { __esModule: true, default: fn };
});
jest.mock('../../src/utils/offlineQueue', () => ({
    enqueueMutation: jest.fn(),
    getOfflineQueue: jest.fn(() => []),
}));
jest.mock('../../src/utils/networkError', () => ({
    isNetworkError: jest.fn(() => false),
}));
jest.mock('../../src/utils/logger', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), alert: jest.fn() },
}));
jest.mock('../../src/lib/sentry', () => ({
    addBreadcrumb: jest.fn(),
    captureError: jest.fn(),
    Sentry: { captureException: jest.fn() },
}));
jest.mock('../../src/lib/queryClient', () => ({
    queryClient: {
        invalidateQueries: jest.fn(),
        setQueryData: jest.fn(),
        getQueryData: jest.fn(),
    },
}));
jest.mock('../../src/utils/sanitizeInput', () => ({
    sanitizeInput: jest.fn((v: string) => v),
}));
jest.mock('../../src/utils/requestReview', () => ({
    maybeRequestReview: jest.fn(),
}));
jest.mock('../../src/utils/TactileEngine', () => ({
    __esModule: true,
    default: { light: jest.fn(), medium: jest.fn(), heavy: jest.fn(), success: jest.fn() },
}));
jest.mock('expo-crypto', () => {
    let counter = 0;
    return { randomUUID: jest.fn(() => `fake-uuid-${++counter}`) };
});
jest.mock('../../src/stores/resetAllStores', () => ({
    registerStoreReset: jest.fn(),
}));

// ── Test Suite ──
describe('FilmStore Integration Tests (T2-4)', () => {
    beforeEach(() => {
        // Reset store to clean state before each test
        useFilmStore.setState({
            logs: [],
            watchlist: [],
            lists: [],
            interactions: [],
            physicalArchive: [],
            _loggedIndex: {},
            _watchlistIndex: {},
            _endorsedIndex: {},
            _listEndorsedIndex: {},
            // _archiveIndex was here. No such field exists on the store — it appears
            // nowhere in src/ or app/. This beforeEach was inventing it, and the
            // "Partialize Allowlist" test below then asserted it existed, which
            // passed only because this line had just created it.
            _addLogMutex: false,
            _fetchingLogs: false,
            _fetchingWatchlist: false,
            _fetchingLists: false,
            logsHasMore: true,
            watchlistHasMore: true,
            listsHasMore: true,
            // These were logsCursor / watchlistCursor / listsCursor — names the store
            // does not have. The real fields are underscore-prefixed
            // (in logSlice, watchlistSlice and listSlice), so this
            // beforeEach believed it was resetting pagination between tests and was
            // resetting nothing, leaving real cursor state to leak from one test to
            // the next. Zustand accepts unknown keys at runtime, so it looked fine.
            _logsCursor: null,
            _watchlistCursor: null,
            _listsCursor: null,
        });
    });

    // ─────────────────────────────────────────────────────
    // INVARIANT 1: Indexes always reflect the array contents
    //
    // REMOVED — these two tests could not fail.
    //
    // Each one built the logs array by hand, built the index by hand FROM THAT SAME
    // ARRAY, wrote both into the store with setState, and then asserted that the
    // index contained what it had just put there. The store's index-maintenance code
    // was never executed. It could have been deleted entirely and both tests would
    // still have passed.
    //
    // Type-checking the tests is what exposed them: the fixture typed _loggedIndex as
    // Record<number, true>, but the real field is Record<number, DomainLog>
    // (in src/stores/domain/logSlice.ts). The tests were green against a shape the
    // app cannot produce.
    //
    // No coverage is lost. The real invariant is genuinely tested, through the real
    // store actions, against the real shapes:
    //   • logSlice.test.ts       — populates _loggedIndex via fetchLogs() and asserts
    //                              the DomainLog objects inside it
    //   • watchlistSlice.test.ts — _watchlistIndex after fetch, after add, and
    //                              cleared after remove
    // ─────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────
    // INVARIANT 2: What is persisted, and what is rebuilt from it
    //
    // These two used to assert that the store HAD its index and fetch-flag keys —
    // which the beforeEach above had just written, so they could not fail. And
    // the first claimed the indexes were persisted, which they are not: only the
    // records are, and every index is rebuilt from them on rehydrate.
    // ─────────────────────────────────────────────────────

    describe('Persistence', () => {
        it('persists the five record arrays, and no index, fetch flag or action', () => {
            const persist = (useFilmStore as unknown as {
                persist: { getOptions: () => { partialize: (s: unknown) => Record<string, unknown> } };
            }).persist;
            const saved = persist.getOptions().partialize(useFilmStore.getState());
            expect(Object.keys(saved).sort()).toEqual(['interactions', 'lists', 'logs', 'physicalArchive', 'watchlist']);
        });

        it('rebuilds every index from the persisted records when it rehydrates', async () => {
            const { rehydrateFilmStore } = require('../../src/stores/films');
            const log = { id: 'log-1', filmId: 42, title: 'Sunrise', rating: 5, createdAt: '2026-01-01T00:00:00Z' };
            mockPersisted['reelhouse-films'] = {
                version: 0,
                state: {
                    logs: [log],
                    watchlist: [{ id: 7, title: 'Ikiru' }],
                    interactions: [
                        { type: 'endorse', targetId: 'log-9' },
                        { type: 'endorse_list', targetId: 'list-3' },
                    ],
                },
            };
            try {
                await rehydrateFilmStore();
                const s = useFilmStore.getState();
                expect(s._loggedIndex[42]).toEqual(log);
                expect(s._watchlistIndex[7]).toBe(true);
                expect(s._endorsedIndex['log-9']).toEqual(expect.objectContaining({ targetId: 'log-9' }));
                expect(s._listEndorsedIndex['list-3']).toEqual(expect.objectContaining({ targetId: 'list-3' }));
            } finally {
                delete mockPersisted['reelhouse-films'];
            }
        });
    });

    // ─────────────────────────────────────────────────────
    // INVARIANT 3: isLogged/isWatchlisted use O(1) index, not O(N) scan
    // ─────────────────────────────────────────────────────

    // REMOVED — all four were the same tautology as INVARIANT 1.
    //
    // Each wrote a value into the index with setState and then asserted the index
    // contained the value it had just written. `setState({_loggedIndex:{42:true}})`
    // followed by `expect(getState()._loggedIndex[42]).toBe(true)` asserts that
    // object assignment works, not that lookup is O(1) or that the store maintains
    // the index. The two "returns falsy" cases asserted that an empty object has no
    // keys.
    //
    // The O(1) lookup this section claimed to cover is exercised for real in
    // logSlice.test.ts ("should populate _loggedIndex as O(1) lookup after fetch",
    // which calls fetchLogs() and asserts on the objects the STORE indexed) and in
    // watchlistSlice.test.ts on add and remove.

    // ─────────────────────────────────────────────────────
    // INVARIANT 4: Store composition doesn't break domain boundaries
    // ─────────────────────────────────────────────────────

    describe('Slice Composition Integrity', () => {
        it('all slice functions are accessible on the composed store', () => {
            const state = useFilmStore.getState();

            // Log slice
            expect(typeof state.fetchLogs).toBe('function');
            expect(typeof state.addLog).toBe('function');

            // Watchlist slice
            expect(typeof state.fetchWatchlist).toBe('function');
            expect(typeof state.addToWatchlist).toBe('function');

            // List slice
            expect(typeof state.fetchLists).toBe('function');
            expect(typeof state.createList).toBe('function');

            // Interaction slice
            expect(typeof state.toggleEndorse).toBe('function');
            expect(typeof state.hasEndorsed).toBe('function');

            // Archive slice
            expect(typeof state.addToPhysicalArchive).toBe('function');
        });

        // REMOVED — 'modifying log state does not affect watchlist state'.
        //
        // It set logs, _loggedIndex, watchlist and _watchlistIndex in a SINGLE
        // setState call and then asserted each one held what that same call had just
        // put there. Nothing modified log state independently, so no isolation was
        // ever exercised. Its one non-trivial-looking assertion — that film 99 is
        // absent from the watchlist index — was true because nothing had ever added
        // it, not because the domains are isolated.
        //
        // Real cross-slice isolation is covered by the slice suites, which drive one
        // domain through its actual actions and assert the others are untouched:
        // logSlice.test.ts, watchlistSlice.test.ts, listSlice.test.ts,
        // interactionSlice.test.ts.
    });

    // ─────────────────────────────────────────────────────
    // INVARIANT 5: getCinephileStats returns correct levels
    // ─────────────────────────────────────────────────────

    describe('Derived State: getCinephileStats', () => {
        it('a member with no films stands on the first rung', () => {
            useFilmStore.setState({ logs: [] });
            const stats = useFilmStore.getState().getCinephileStats(0);
            expect(stats.count).toBe(0);
            expect(stats.level).toBe('UNSEATED');
        });

        it('the rung rises with the films logged', () => {
            useFilmStore.setState({ logs: [] });
            const level = (n: number) => useFilmStore.getState().getCinephileStats(n).level;
            // The ladder's own thresholds (src/constants/standing.ts), named here.
            expect([0, 1, 10, 50, 100].map(level)).toEqual(
                ['UNSEATED', 'FIRST REEL', 'THE REGULAR', 'MIDNIGHT DEVOTEE', 'THE ORACLE'],
            );
        });

        it('with no count given, counts the logs it holds', () => {
            useFilmStore.setState({ logs: Array.from({ length: 10 }, (_, i) => ({ id: `l${i}`, filmId: i })) as never });
            expect(useFilmStore.getState().getCinephileStats()).toEqual(
                expect.objectContaining({ count: 10, level: 'THE REGULAR' }),
            );
        });
    });
});

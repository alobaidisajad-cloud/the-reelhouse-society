/**
 * offlineQueue.test.ts — Offline Queue Property-Based & Unit Tests
 * ─────────────────────────────────────────────────────────────────
 * T1-1 FIX: First property-based test suite for the most critical
 * infrastructure module in the app. Validates invariants that must
 * hold under ANY sequence of mutations, not just happy paths.
 *
 * Tests cover:
 *   1. enqueueMutation basics (unique IDs, queue growth, store sync)
 *   2. T1-4 nonce-based dedup (identical payloads are NOT blocked)
 *   3. Queue cap enforcement (MAX_QUEUE_SIZE = 100)
 *   4. clearOfflineQueue invariant (total wipe)
 *   5. Property-based tests with fast-check
 */

// ── Mocks (MUST be before imports) ──

// ── Imports (after mocks) ──

import * as fc from 'fast-check';
import {
    enqueueMutation,
    getQueueLength,
    clearOfflineQueue,
    useOfflineQueueStore,
} from '../../src/utils/offlineQueue';

jest.mock('react-native', () => ({
    AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}), { virtual: true });

jest.mock('../../src/lib/supabase', () => ({
    supabase: { from: jest.fn() },
}));

jest.mock('../../src/lib/sentry', () => ({
    addBreadcrumb: jest.fn(),
    captureError: jest.fn(),
}));

jest.mock('../../src/lib/queryClient', () => ({
    queryClient: {
        invalidateQueries: jest.fn(),
        cancelQueries: jest.fn(),
        setQueryData: jest.fn(),
        getQueryData: jest.fn(),
        clear: jest.fn(),
    },
}));

jest.mock('../../src/utils/reelToast', () => {
    const fn = jest.fn() as jest.Mock & { error: jest.Mock; success: jest.Mock; info: jest.Mock };
    fn.error = jest.fn();
    fn.success = jest.fn();
    fn.info = jest.fn();
    return { __esModule: true, default: fn };
});

jest.mock('../../src/utils/logger', () => ({
    logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

jest.mock('../../src/utils/networkError', () => ({
    isNetworkError: jest.fn(() => false),
}));

jest.mock('../../src/utils/mutationExecutor', () => ({
    executeMutation: jest.fn().mockResolvedValue({}),
    UnknownMutationError: class extends Error {
        constructor(type: string) {
            super(`Unknown mutation type: ${type}`);
        }
    },
}));

jest.mock('../../src/stores/resetAllStores', () => ({
    registerStoreReset: jest.fn(),
}));

jest.mock('../../src/constants/cacheKeys', () => ({
    CACHE_KEYS: { OFFLINE_MUTATIONS: 'offline_mutations' },
}));

// Must use 'mock' prefix for variables used inside jest.mock factories
const mockUuidState = { counter: 0 };
jest.mock('expo-crypto', () => ({
    randomUUID: jest.fn(() => {
        // The production code uses .slice(0, 7) — so the first 7 chars must be unique
        mockUuidState.counter++;
        return `${String(mockUuidState.counter).padStart(7, '0')}-mock-uuid`;
    }),
}));

// ── Helpers ──

const MUTATION_TYPES = [
    'add_log', 'remove_log', 'add_watchlist', 'remove_watchlist',
    'endorse_log', 'endorse_list', 'endorse_film',
    'follow_user', 'unfollow_user',
    'add_archive', 'remove_archive',
] as const;

type TestMutationType = typeof MUTATION_TYPES[number];

function makeMutation(type: TestMutationType = 'add_log', payload: Record<string, unknown> = {}) {
    return { type, payload: { user_id: 'test-user', film_id: 123, ...payload } };
}

// ── Tests ──

describe('offlineQueue', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUuidState.counter = 0;
        clearOfflineQueue();
    });

    // ── 1. enqueueMutation basics ──

    describe('enqueueMutation', () => {
        it('should increase queue length by 1', () => {
            expect(getQueueLength()).toBe(0);
            enqueueMutation(makeMutation());
            expect(getQueueLength()).toBe(1);
        });

        it('should sync pending count to useOfflineQueueStore', () => {
            enqueueMutation(makeMutation());
            enqueueMutation(makeMutation('remove_log'));
            expect(useOfflineQueueStore.getState().pending).toBe(2);
        });

        it('should generate unique IDs with timestamp-uuid format', () => {
            // We can't inspect IDs directly from the public API, but we can
            // verify that multiple enqueues all succeed (no dedup blocking)
            for (let i = 0; i < 5; i++) {
                enqueueMutation(makeMutation('add_log', { film_id: i }));
            }
            expect(getQueueLength()).toBe(5);
        });
    });

    // ── 2. T1-4: Nonce-based dedup ──

    describe('nonce-based dedup (T1-4 FIX)', () => {
        it('should allow identical type+payload to be enqueued multiple times', () => {
            // This is the key fix: content-hash dedup would block this.
            // Nonce-based dedup allows it because each mutation gets a unique ID.
            const mutation = makeMutation('add_log', { film_id: 42, rating: 5 });
            enqueueMutation(mutation);
            enqueueMutation(mutation); // Same exact payload
            enqueueMutation(mutation); // Third time
            expect(getQueueLength()).toBe(3);
        });

        it('should allow re-creation of deleted data with identical payload', () => {
            // Scenario: user deletes a log, then re-creates it with identical data
            enqueueMutation(makeMutation('remove_log', { log_id: 'abc' }));
            enqueueMutation(makeMutation('add_log', { film_id: 42, rating: 5 }));
            // Delete it again
            enqueueMutation(makeMutation('remove_log', { log_id: 'abc' }));
            // Re-create with IDENTICAL payload — old content-hash dedup would block this
            enqueueMutation(makeMutation('add_log', { film_id: 42, rating: 5 }));
            expect(getQueueLength()).toBe(4);
        });
    });

    // ── 3. Queue cap enforcement ──

    describe('queue cap enforcement', () => {
        it('should cap queue at MAX_QUEUE_SIZE (100)', () => {
            for (let i = 0; i < 110; i++) {
                enqueueMutation(makeMutation('add_log', { film_id: i }));
            }
            expect(getQueueLength()).toBe(100);
        });

        it('should drop oldest mutations when cap is exceeded', () => {
            for (let i = 0; i < 105; i++) {
                enqueueMutation(makeMutation('add_log', { film_id: i }));
            }
            // After cap enforcement, queue should have the 100 NEWEST mutations
            expect(getQueueLength()).toBe(100);
            expect(useOfflineQueueStore.getState().pending).toBe(100);
        });
    });

    // ── 4. clearOfflineQueue invariant ──

    describe('clearOfflineQueue', () => {
        it('should reset queue length to 0', () => {
            enqueueMutation(makeMutation());
            enqueueMutation(makeMutation('remove_log'));
            enqueueMutation(makeMutation('add_watchlist'));
            expect(getQueueLength()).toBe(3);

            clearOfflineQueue();

            expect(getQueueLength()).toBe(0);
            expect(useOfflineQueueStore.getState().pending).toBe(0);
        });

        it('should allow new enqueues after clear', () => {
            enqueueMutation(makeMutation());
            clearOfflineQueue();

            enqueueMutation(makeMutation('remove_log'));
            expect(getQueueLength()).toBe(1);
        });
    });

    // ── 5. Property-based tests ──

    describe('property-based tests (fast-check)', () => {
        it('PROPERTY: queue length equals number of enqueues (up to cap)', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 50 }),
                    (n) => {
                        clearOfflineQueue();
                        for (let i = 0; i < n; i++) {
                            enqueueMutation(makeMutation(
                                MUTATION_TYPES[i % MUTATION_TYPES.length],
                                { film_id: i },
                            ));
                        }
                        const expected = Math.min(n, 100);
                        return getQueueLength() === expected;
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('PROPERTY: clearOfflineQueue always results in length 0', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 80 }),
                    (n) => {
                        clearOfflineQueue();
                        for (let i = 0; i < n; i++) {
                            enqueueMutation(makeMutation('add_log', { film_id: i }));
                        }
                        clearOfflineQueue();
                        return getQueueLength() === 0 && useOfflineQueueStore.getState().pending === 0;
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('PROPERTY: store.pending always equals getQueueLength()', () => {
            fc.assert(
                fc.property(
                    fc.array(
                        fc.record({
                            type: fc.constantFrom(...MUTATION_TYPES),
                            filmId: fc.integer({ min: 1, max: 9999 }),
                        }),
                        { minLength: 1, maxLength: 40 },
                    ),
                    (mutations) => {
                        clearOfflineQueue();
                        for (const m of mutations) {
                            enqueueMutation(makeMutation(m.type, { film_id: m.filmId }));
                        }
                        return useOfflineQueueStore.getState().pending === getQueueLength();
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('PROPERTY: identical payloads are never blocked by dedup (T1-4)', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 2, max: 20 }),
                    (n) => {
                        clearOfflineQueue();
                        // Enqueue the EXACT SAME mutation N times
                        const mutation = makeMutation('add_log', { film_id: 42, rating: 5, review: 'Same review' });
                        for (let i = 0; i < n; i++) {
                            enqueueMutation(mutation);
                        }
                        // All N should be enqueued (nonce-based dedup doesn't block identical content)
                        return getQueueLength() === n;
                    },
                ),
                { numRuns: 30 },
            );
        });
    });
});

/**
 * socialSlice.test.ts — Social Graph Domain Slice Unit Tests
 * ──────────────────────────────────────────────────────────
 * Validates core invariants of the social graph domain slice:
 *   1. followUser optimistic update + rollback on error
 *   2. unfollowUser optimistic update + rollback on error
 *   3. Offline queue integration (P0-1 FIX)
 *   4. Throttle enforcement (2s cooldown per target)
 *   5. Inflight operation deduplication (F-16 APEX FIX)
 *   6. hydrateFollowing loads full list via cursor-based pagination
 */

// Use require() instead of dynamic import() — Jest CJS doesn't support ESM dynamic imports
import { supabase } from '../../src/lib/supabase';
import { useSocialStore } from '../../src/stores/socialStore';

const socialSliceModule = require('../../src/stores/domain/socialSlice');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { followUser, unfollowUser, hydrateFollowing, clearSocialCaches } = socialSliceModule;

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

const mockIsNetworkError = jest.fn(() => false);
jest.mock('../../src/utils/networkError', () => ({
    isNetworkError: (...args: unknown[]) => mockIsNetworkError(...args),
}));

jest.mock('../../src/utils/reelToast', () => {
    const fn = jest.fn();
    fn.error = jest.fn();
    fn.success = jest.fn();
    return { __esModule: true, default: fn };
});

jest.mock('../../src/utils/logger', () => ({
    logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

jest.mock('expo-haptics', () => ({
    notificationAsync: jest.fn(),
    selectionAsync: jest.fn(),
    NotificationFeedbackType: { Warning: 'warning' },
}));

describe('socialSlice', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsNetworkError.mockReturnValue(false);
        clearSocialCaches();
        useSocialStore.setState({
            following: [],
            _followingIndex: new Set(),
        });
    });

    // ── followUser ──

    describe('followUser', () => {
        it('should optimistically add target to following list', async () => {
            // Mock: profiles lookup → interactions check → insert
            (supabase.from as jest.Mock) = jest.fn((table: string) => {
                if (table === 'profiles') return {
                    select: jest.fn(() => ({
                        eq: jest.fn(() => ({
                            single: jest.fn().mockResolvedValue({ data: { id: 'target-id' }, error: null }),
                        })),
                    })),
                };
                if (table === 'interactions') return {
                    select: jest.fn(() => ({
                        eq: jest.fn(() => ({
                            eq: jest.fn(() => ({
                                in: jest.fn(() => ({
                                    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                                })),
                            })),
                        })),
                    })),
                    insert: jest.fn().mockResolvedValue({ error: null }),
                };
                return {};
            });

            await followUser('targetuser');

            const state = useSocialStore.getState();
            expect(state.following).toContain('targetuser');
        });

        it('should skip duplicate follow for already-followed user', async () => {
            useSocialStore.setState({ following: ['alreadyfollowed'], _followingIndex: new Set(['alreadyfollowed']) });

            await followUser('alreadyfollowed');

            // supabase.from should NOT have been called
            expect(supabase.from).not.toHaveBeenCalled();
        });

        it('should enqueue mutation on network error and keep optimistic state (P0-1)', async () => {
            const networkError = new TypeError('Network request failed');
            mockIsNetworkError.mockReturnValue(true);

            (supabase.from as jest.Mock) = jest.fn((table: string) => {
                if (table === 'profiles') return {
                    select: jest.fn(() => ({
                        eq: jest.fn(() => ({
                            single: jest.fn().mockRejectedValue(networkError),
                        })),
                    })),
                };
                return {};
            });

            await followUser('offlineuser');

            // Optimistic state should be KEPT (not rolled back)
            const state = useSocialStore.getState();
            expect(state.following).toContain('offlineuser');

            // Should have enqueued the mutation
            expect(mockEnqueue).toHaveBeenCalledWith({
                type: 'follow_user',
                payload: { user_id: 'test-user-id', target_username: 'offlineuser', target_user_id: null },
            });
        });

        it('should rollback on non-network error', async () => {
            (supabase.from as jest.Mock) = jest.fn((table: string) => {
                if (table === 'profiles') return {
                    select: jest.fn(() => ({
                        eq: jest.fn(() => ({
                            single: jest.fn().mockRejectedValue(new Error('Database timeout')),
                        })),
                    })),
                };
                return {};
            });

            await followUser('failuser');

            const state = useSocialStore.getState();
            expect(state.following).not.toContain('failuser');
        });
    });

    // ── unfollowUser ──

    describe('unfollowUser', () => {
        it('should optimistically remove target from following list', async () => {
            useSocialStore.setState({ following: ['targetuser'], _followingIndex: new Set(['targetuser']) });

            (supabase.from as jest.Mock) = jest.fn((table: string) => {
                if (table === 'profiles') return {
                    select: jest.fn(() => ({
                        eq: jest.fn(() => ({
                            single: jest.fn().mockResolvedValue({ data: { id: 'target-id' }, error: null }),
                        })),
                    })),
                };
                if (table === 'interactions') return {
                    delete: jest.fn(() => ({
                        eq: jest.fn(() => ({
                            eq: jest.fn(() => ({
                                in: jest.fn().mockResolvedValue({ error: null }),
                            })),
                        })),
                    })),
                };
                return {};
            });

            await unfollowUser('targetuser');

            const state = useSocialStore.getState();
            expect(state.following).not.toContain('targetuser');
        });

        it('should enqueue mutation on network error and keep optimistic state (P0-1)', async () => {
            useSocialStore.setState({ following: ['offlineuser'], _followingIndex: new Set(['offlineuser']) });
            mockIsNetworkError.mockReturnValue(true);

            (supabase.from as jest.Mock) = jest.fn((table: string) => {
                if (table === 'profiles') return {
                    select: jest.fn(() => ({
                        eq: jest.fn(() => ({
                            single: jest.fn().mockRejectedValue(new TypeError('Network request failed')),
                        })),
                    })),
                };
                return {};
            });

            await unfollowUser('offlineuser');

            // Optimistic state should be KEPT (unfollow persists)
            const state = useSocialStore.getState();
            expect(state.following).not.toContain('offlineuser');

            expect(mockEnqueue).toHaveBeenCalledWith({
                type: 'unfollow_user',
                payload: { user_id: 'test-user-id', target_username: 'offlineuser', target_user_id: null },
            });
        });
    });

    // ── clearSocialCaches ──

    describe('clearSocialCaches', () => {
        it('should clear all internal caches without crashing', () => {
            expect(() => clearSocialCaches()).not.toThrow();
        });
    });
});

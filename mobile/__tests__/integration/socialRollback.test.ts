/**
 * socialRollback.test.ts — Integration: Social Graph Optimistic Update + Rollback
 * ────────────────────────────────────────────────────────────────────────────────
 * Exercises the REAL socialSlice + followStore Zustand stores to verify:
 *   1. followUser + server error → state rolls back to pre-update
 *   2. followUser + network error → mutation queued, optimistic state preserved
 */

import { useSocialStore } from '@/src/stores/followStore';

// ── Mock dependencies ────────────────────────────────────────────────────────

jest.mock('@/src/stores/auth', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      user: { id: 'test-user-id', username: 'testuser', role: 'cinephile' },
    })),
    subscribe: jest.fn(() => jest.fn()),
  },
}));

const mockEnqueue = jest.fn();
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: (...args: unknown[]) => mockEnqueue(...args),
  flushOfflineQueue: jest.fn(),
}));

const mockIsNetworkError = jest.fn(() => false);
jest.mock('@/src/utils/networkError', () => ({
  isNetworkError: (...args: unknown[]) => mockIsNetworkError(...args),
}));

jest.mock('@/src/utils/reelToast', () => {
  const fn = jest.fn();
  fn.error = jest.fn();
  fn.success = jest.fn();
  return { __esModule: true, default: fn };
});

jest.mock('@/src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  NotificationFeedbackType: { Warning: 'warning' },
}));

// Mock supabase with controllable responses
const mockSupabaseFrom = jest.fn();
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

// ── Import socialSlice AFTER mocks ──────────────────────────────────────────

const socialSlice = require('@/src/stores/domain/socialSlice');
const { followUser, clearSocialCaches } = socialSlice;

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Social Rollback Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsNetworkError.mockReturnValue(false);
    clearSocialCaches();
    // Reset to clean state using REAL store
    useSocialStore.setState({
      following: [],
      requested: [],
      _followingIndex: new Set(),
      _requestedIndex: new Set(),
    });
  });

  it('followUser + server error → state rolls back to pre-update', async () => {
    // Pre-condition: user has an existing following list
    useSocialStore.setState({
      following: ['existingfriend'],
      _followingIndex: new Set(['existingfriend']),
      requested: [],
      _requestedIndex: new Set(),
    });

    // Snapshot pre-state
    const preFollowing = [...useSocialStore.getState().following];

    // Mock: profiles lookup throws a server error (non-network)
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockRejectedValue(new Error('Database connection lost')),
            }),
          }),
        };
      }
      return {};
    });

    // Execute follow
    const result = await followUser('newuser');

    // Verify: follow failed
    expect(result).toBe(false);

    // Verify: state rolled back — following list should match pre-state
    const postState = useSocialStore.getState();
    expect(postState.following).toEqual(preFollowing);
    expect(postState.following).not.toContain('newuser');
    expect(postState.isFollowing('newuser')).toBe(false);

    // Verify: no mutation was enqueued (non-network errors don't queue)
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('followUser + network error → mutation queued, optimistic state preserved', async () => {
    // Pre-condition: empty following
    useSocialStore.setState({
      following: [],
      requested: [],
      _followingIndex: new Set(),
      _requestedIndex: new Set(),
    });

    // Configure: network error detection
    mockIsNetworkError.mockReturnValue(true);

    // Mock: profiles lookup fails with network error
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockRejectedValue(new TypeError('Network request failed')),
            }),
          }),
        };
      }
      return {};
    });

    // Execute follow
    const result = await followUser('offlineuser');

    // Verify: follow returns true (optimistic success)
    expect(result).toBe(true);

    // Verify: optimistic state is PRESERVED (not rolled back)
    const postState = useSocialStore.getState();
    expect(postState.following).toContain('offlineuser');
    expect(postState.isFollowing('offlineuser')).toBe(true);

    // Verify: mutation was enqueued for background sync
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'follow_user',
        payload: expect.objectContaining({
          user_id: 'test-user-id',
          target_username: 'offlineuser',
        }),
      })
    );
  });
});

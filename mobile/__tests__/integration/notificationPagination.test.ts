/**
 * notificationPagination.test.ts — Integration: Notification Cursor Pagination
 * ─────────────────────────────────────────────────────────────────────────────
 * Exercises the REAL notificationStore Zustand store with mocked Supabase to verify:
 *   1. Fetch page 1 → cursor extracted → fetch page 2 → no overlap between pages
 *
 * Uses compound cursor (created_at|id) to prevent duplicates across page boundaries.
 */

import type { AppNotification } from '@/src/stores/notificationStore';
import { useNotificationStore } from '@/src/stores/notificationStore';

// ── Mock auth store ─────────────────────────────────────────────────────────

jest.mock('@/src/stores/auth', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      user: { id: 'test-user-id', username: 'testuser' },
      isAuthenticated: true,
    })),
    subscribe: jest.fn(() => jest.fn()),
  },
}));

// ── Mock Supabase ───────────────────────────────────────────────────────────

let mockFetchCallCount = 0;

const mockPage1Notifications: AppNotification[] = Array.from({ length: 30 }, (_, i) => ({
  id: `notif-page1-${String(i).padStart(2, '0')}`,
  user_id: 'test-user-id',
  type: i % 2 === 0 ? 'follow' : 'endorsement',
  message: `Notification page 1 item ${i}`,
  from_username: `user_${i}`,
  read: i < 5, // first 5 are read
  created_at: `2024-06-${String(30 - i).padStart(2, '0')}T10:00:00Z`,
}));

const mockPage2New: AppNotification[] = Array.from({ length: 20 }, (_, i) => ({
  id: `notif-page2-${String(i).padStart(2, '0')}`,
  user_id: 'test-user-id',
  type: 'system',
  message: `Notification page 2 item ${i}`,
  read: true,
  created_at: `2024-05-${String(30 - i).padStart(2, '0')}T10:00:00Z`,
}));
/**
 * Page 2 as a server may send it: led by page 1's last row again (one that
 * arrived over the socket, or a tie on the boundary), then twenty new ones.
 */
const mockPage2Notifications: AppNotification[] = [mockPage1Notifications[29], ...mockPage2New];
/** Every chain the store built, in order, so a test can read what each read ASKED. */
const mockChains: Record<string, jest.Mock>[] = [];

function mockMakeNotifChain(data: AppNotification[]) {
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn().mockImplementation(self);
  chain.eq = jest.fn().mockImplementation(self);
  chain.order = jest.fn().mockImplementation(self);
  chain.limit = jest.fn().mockImplementation(self);
  chain.or = jest.fn().mockImplementation(self);
  chain.lt = jest.fn().mockImplementation(self);
  chain.then = jest.fn((cb) => Promise.resolve(cb({ data, error: null })));
  mockChains.push(chain);
  return chain;
}

const mockSupabaseFrom = jest.fn();

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    })),
    removeChannel: jest.fn(),
  },
}));

jest.mock('@/src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Notification Pagination Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchCallCount = 0;
    mockChains.length = 0;
    // Configure the mock to return different data per call
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'notifications') {
        mockFetchCallCount++;
        if (mockFetchCallCount === 1) {
          return mockMakeNotifChain(mockPage1Notifications);
        }
        return mockMakeNotifChain(mockPage2Notifications);
      }
      return mockMakeNotifChain([]);
    });
    // Reset to initial state using REAL store
    useNotificationStore.setState({
      notifications: [],
      loading: false,
      _fetching: false,
      _fetchingMore: false,
      _unreadCount: 0,
      _hasMore: true,
      _cursor: null,
    });
  });

  it('fetch page 1 → cursor extracted → fetch page 2 → no overlap', async () => {
    // 1. Fetch page 1
    await useNotificationStore.getState().fetchNotifications();

    const stateAfterPage1 = useNotificationStore.getState();

    // Verify page 1 loaded
    expect(stateAfterPage1.notifications).toHaveLength(30);
    expect(stateAfterPage1._hasMore).toBe(true);

    // Verify cursor was extracted (compound format: created_at|id)
    expect(stateAfterPage1._cursor).not.toBeNull();
    expect(stateAfterPage1._cursor).toContain('|');

    // Verify cursor matches last item
    const lastPage1 = mockPage1Notifications[mockPage1Notifications.length - 1];
    expect(stateAfterPage1._cursor).toBe(`${lastPage1.created_at}|${lastPage1.id}`);

    // 2. Fetch page 2 using loadMore
    await useNotificationStore.getState().loadMoreNotifications();

    const stateAfterPage2 = useNotificationStore.getState();

    // The second read ASKED from the cursor: older than its time, or the same
    // time and a lower id. Without it the server answers page 1 again.
    const page2Chain = mockChains[mockChains.length - 1];
    const [at, id] = [lastPage1.created_at, lastPage1.id];
    expect(page2Chain.or).toHaveBeenCalledWith(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${id})`);

    // Page 2 was appended, and the row it repeated is drawn once: 30 + 20, not 51.
    expect(stateAfterPage2.notifications.length).toBe(50);
    const allIds = stateAfterPage2.notifications.map(n => n.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds.filter((x) => x === lastPage1.id)).toHaveLength(1);

    // Verify cursor updated to last page 2 item
    const lastPage2 = mockPage2Notifications[mockPage2Notifications.length - 1];
    expect(stateAfterPage2._cursor).toBe(`${lastPage2.created_at}|${lastPage2.id}`);

    // Verify _hasMore is false since page 2 returned < PAGE_SIZE (21 < 30)
    expect(stateAfterPage2._hasMore).toBe(false);
  });
});

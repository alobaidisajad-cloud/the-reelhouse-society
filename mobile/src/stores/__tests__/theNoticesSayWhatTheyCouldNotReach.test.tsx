/**
 * theNoticesSayWhatTheyCouldNotReach.test.tsx — the board's paging and its
 * rows, read as a member uses them.
 *
 * The first page was ordered by time alone while the next page is asked for
 * by time and id, so notices written in one transaction (one timestamp) could
 * be skipped or shown twice at the boundary. An older page that could not be
 * read just ended the list. And a screen reader heard "Notice: …" with no who,
 * no when, and no word of whether it was new.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';

type Op = [string, ...unknown[]];
const mockReads: Op[][] = [];
let mockAnswer: { data: unknown; error: unknown; count?: number } = { data: [], error: null, count: 0 };
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: () => {
      const ops: Op[] = [];
      mockReads.push(ops);
      const chain: Record<string, unknown> = {};
      for (const k of ['select', 'eq', 'order', 'limit', 'or', 'lt']) chain[k] = (...a: unknown[]) => { ops.push([k, ...a]); return chain; };
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(mockAnswer).then(res, rej);
      return chain;
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: jest.fn(),
  },
}));
jest.mock('@/src/stores/auth', () => {
  const s = { user: { id: 'me', username: 'kane' }, isAuthenticated: true };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as any).getState = () => s;
  (useAuthStore as any).subscribe = () => () => {};
  return { useAuthStore };
});
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock('@/src/hooks/useFollowRequests', () => ({ refreshFollowRequestCount: jest.fn() }));
jest.mock('@/src/components/profile/FollowRequestsPanel', () => () => null);

// eslint-disable-next-line import/first
import { useNotificationStore, type AppNotification } from '../notificationStore';
// eslint-disable-next-line import/first
import NotificationsModal from '@/app/(modals)/notifications-modal';

const down = { data: null, error: { message: 'Network request failed' } };
const notice = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: 'n1', user_id: 'me', type: 'endorse', message: 'certified your log of Vertigo.',
  from_username: 'orson', read: false, created_at: new Date().toISOString(), ...over,
} as AppNotification);

beforeEach(() => {
  mockReads.length = 0;
  mockAnswer = { data: [], error: null, count: 0 };
  useNotificationStore.setState({
    notifications: [], fetchFailed: false, moreFailed: false, loading: false,
    _fetching: false, _fetchingMore: false, _hasMore: true, _cursor: null,
  });
});

describe('the paging', () => {
  it('the first page is ordered as the next page is asked for: by time, then id', async () => {
    await useNotificationStore.getState().fetchNotifications();
    const firstPage = mockReads.find((ops) => ops.some(([k]) => k === 'limit'))!;
    const orders = firstPage.filter(([k]) => k === 'order').map(([, col, o]) => [col, (o as { ascending: boolean }).ascending]);
    expect(orders).toEqual([['created_at', false], ['id', false]]);
  });

  it('an older page that could not be read is recorded, and forgotten once one is', async () => {
    useNotificationStore.setState({ notifications: [notice()], _cursor: '2026-10-01T00:00:00Z|n1', _hasMore: true });
    mockAnswer = down;
    await useNotificationStore.getState().loadMoreNotifications();
    expect(useNotificationStore.getState().moreFailed).toBe(true);
    mockAnswer = { data: [], error: null };
    await useNotificationStore.getState().loadMoreNotifications();
    expect(useNotificationStore.getState().moreFailed).toBe(false);
  });
});

describe('the board', () => {
  it('a notice says whether it is new, who, what and when', async () => {
    mockAnswer = down; // the cached board stays on screen
    useNotificationStore.setState({ notifications: [notice()] });
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<NotificationsModal />); });
    expect(r.getByLabelText(/^Unread\. @orson certified your log of Vertigo\., \S/)).toBeTruthy();
  });

  it('says the rest could not be reached, and asks again', async () => {
    mockAnswer = down;
    useNotificationStore.setState({ notifications: [notice({ read: true })], moreFailed: true, _cursor: '2026-10-01T00:00:00Z|n1' });
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<NotificationsModal />); });
    expect(r.getByText('The rest could not be reached.')).toBeTruthy();
    expect(r.getByLabelText(/^@orson certified/)).toBeTruthy();
  });
});

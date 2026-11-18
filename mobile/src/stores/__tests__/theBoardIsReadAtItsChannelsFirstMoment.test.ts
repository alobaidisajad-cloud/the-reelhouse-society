/**
 * The board is read at its channel's first moment (review round 13, the notices).
 *
 * At launch the board is read first and its channel opens seconds later: a notice that came between
 * the read and the channel going live was in neither, and the bell stayed one short until some later
 * read. And a read asked while one was out was dropped, so the read a channel's return asked for
 * never came. Now each channel's first SUBSCRIBED reads the board again, and a read asked while one
 * is out is made once more when that one is answered.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useNotificationStore } from '../notificationStore';

let mockAsked = 0;
const mockHouse = supabaseFake({
  rows: { notifications: [] },
  rpc: { notices_page: () => { mockAsked += 1; return { rows: [], unread: 0 }; } },
});
/** Each channel opened, with the status handler it was subscribed with. */
const mockStatuses: ((s: string) => void)[] = [];
const mockChannel = () => {
  const channel: Record<string, unknown> = {};
  Object.assign(channel, {
    on: () => channel,
    subscribe: (cb?: (s: string) => void) => { if (cb) mockStatuses.push(cb); return channel; },
  });
  return channel;
};
jest.mock('@/src/lib/supabase', () => ({
  get supabase() { return { ...mockHouse.client, channel: () => mockChannel(), removeChannel: async () => 'ok' }; },
}));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }), subscribe: () => () => {} } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }), subscribe: () => () => {} } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));

const settled = async () => { for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve)); };

let leave: unknown = null;
beforeEach(() => {
  mockAsked = 0;
  mockStatuses.length = 0;
  useNotificationStore.setState({ notifications: [], _unreadCount: 0, _fetching: false, _fetchingMore: false, loading: false });
});
afterEach(() => { if (typeof leave === 'function') (leave as () => void)(); leave = null; });

it('each channel\'s first live moment reads the board again, and the second, asked while the first is out, is made after it', async () => {
  leave = useNotificationStore.getState().setupRealtime();
  expect(mockStatuses).toHaveLength(2);
  for (const status of mockStatuses) status('SUBSCRIBED');
  await settled();
  expect(mockAsked).toBe(2);
  // Live again with no break: nothing more is read.
  for (const status of mockStatuses) status('SUBSCRIBED');
  await settled();
  expect(mockAsked).toBe(2);
});

it('a read asked while one is out is made once more when it is answered, never dropped', async () => {
  const first = useNotificationStore.getState().fetchNotifications();
  void useNotificationStore.getState().fetchNotifications();
  void useNotificationStore.getState().fetchNotifications();
  await first;
  await settled();
  // Two asks while one was out are one read more: what they asked for is in it.
  expect(mockAsked).toBe(2);
  expect(useNotificationStore.getState()._fetching).toBe(false);
});

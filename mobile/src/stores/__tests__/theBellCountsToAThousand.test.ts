/**
 * The bell counts to a thousand, then says "more" (the kinds pass, kind 13: built for millions).
 *
 * The board's one read (notices_page) counted every unread notice of the member: the load house's
 * celebrity, 50,000 at each open of the board, a read that grows with a member's audience and so with
 * the house. The house now counts to a thousand and says whether there are more (20261122_04); a house
 * without the one read is asked for a thousand unread ids (the API's ceiling), never a count of all. The
 * bell holds the count and whether there are more, and says it so: the number under a thousand, "a
 * thousand or more" past it, never a number it did not read.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useNotificationStore, unreadSaid } from '../notificationStore';

const ME = '33333333-3333-4333-8333-333333333333';
const ANA = '66666666-6666-4666-8666-666666666666';
const START = Date.parse('2026-11-18T10:00:00Z');
const idOf = (i: number) => `77777777-7777-4777-8777-${String(i).padStart(12, '0')}`;
const notice = (i: number, read = false) => ({
  id: idOf(i), user_id: ME, type: 'endorse', from_username: 'ana', from_user_id: ANA, message: `certified your entry ${i}`,
  is_read: read, created_at: new Date(START + i * 1000).toISOString(), film_id: null, poster_path: null, group_key: null,
  title: null, related_lounge_id: null, metadata: null,
});

/** What the house's one read answers; null: the house lacks it. */
let mockPage: Record<string, unknown> | null = null;
const mockHouse = supabaseFake({
  rows: { notifications: Array.from({ length: 1003 }, (_, i) => notice(i)) },
  rpc: {
    notices_page: () => mockPage ?? { error: { code: 'PGRST202', message: 'Could not find the function public.notices_page' } },
  },
});
jest.mock('@/src/lib/supabase', () => ({
  get supabase() {
    return { ...mockHouse.client, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: async () => 'ok' };
  },
}));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }), subscribe: () => () => {} } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }), subscribe: () => () => {} } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));

const bell = () => ({ count: useNotificationStore.getState()._unreadCount, more: useNotificationStore.getState()._unreadMore });

beforeEach(() => {
  mockPage = null;
  mockHouse.asked.length = 0;
  useNotificationStore.setState({ notifications: [], _unreadCount: 0, _unreadMore: false, _fetching: false, _fetchingMore: false, loading: false });
});

it('holds the house\'s count to a thousand, and that there are more', async () => {
  mockPage = { rows: [notice(2), notice(1)], unread: 1000, unread_more: true };
  await useNotificationStore.getState().fetchNotifications();
  expect(bell()).toEqual({ count: 1000, more: true });
});

it('holds a count under a thousand as it is, with no more', async () => {
  mockPage = { rows: [notice(2), notice(1)], unread: 2, unread_more: false };
  await useNotificationStore.getState().fetchNotifications();
  expect(bell()).toEqual({ count: 2, more: false });
});

it('reads a house from before the count as before: no more said', async () => {
  mockPage = { rows: [notice(2)], unread: 1 };
  await useNotificationStore.getState().fetchNotifications();
  expect(bell()).toEqual({ count: 1, more: false });
});

it('asks a house without the one read for a thousand unread ids, never a count of all: a full thousand is a floor', async () => {
  await useNotificationStore.getState().fetchNotifications();
  expect(bell()).toEqual({ count: 1000, more: true });
  const counted = mockHouse.asked.filter((a) => a.table === 'notifications' && JSON.stringify(a).includes('exact'));
  expect(counted).toEqual([]);
});

it('says the count aloud under a thousand, and past it "a thousand or more"', () => {
  expect(unreadSaid(0, false)).toBe('Notices');
  expect(unreadSaid(3, false)).toBe('Notices, 3 unread');
  expect(unreadSaid(1000, true)).toBe('Notices, a thousand or more unread');
  // Read down from past a thousand, the count no longer knows how many: still "or more" until read again.
  expect(unreadSaid(999, true)).toBe('Notices, a thousand or more unread');
});

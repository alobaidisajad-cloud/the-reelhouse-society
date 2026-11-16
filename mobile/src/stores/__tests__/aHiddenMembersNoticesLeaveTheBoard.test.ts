/**
 * aHiddenMembersNoticesLeaveTheBoard.test.ts — review round 7
 * ─────────────────────────────────────────────────────────────────────────────
 * The house withholds a hidden member's notices from every read, but the board kept what it had
 * read: after a block or a mute the bell still counted theirs and the board drew them until it
 * was read again, and offline for good. Blocking or muting a member now takes their notices off
 * the board at once, and their unread ones off the bell.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useNotificationStore, type AppNotification } from '../notificationStore';
import { useBlockStore } from '../blockStore';

const ME = '77777777-7777-4777-8777-777777777777';
const ORSON = '22222222-2222-4222-8222-222222222222';
const AGNES = '33333333-3333-4333-8333-333333333333';

// Nothing here is asked of the house: the board changes on the phone alone.
const mockHouse = supabaseFake();
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ user: { id: '77777777-7777-4777-8777-777777777777', username: 'me' } }) },
}));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));

const notice = (id: string, from: string | undefined, read = false): AppNotification => ({
  id, user_id: ME, type: 'comment', message: 'x', read, created_at: '2026-11-16T10:00:00Z', from_user_id: from,
});
const board = () => useNotificationStore.getState().notifications.map((n) => n.id);
const bell = () => useNotificationStore.getState()._unreadCount;

beforeEach(() => {
  useBlockStore.setState({ blocked: [], muted: [] });
  // Orson: one unread, one read. Agnes: one unread. The house's own notice: unread.
  useNotificationStore.setState({
    notifications: [
      notice('orson-unread', ORSON),
      notice('orson-read', ORSON, true),
      notice('agnes-unread', AGNES),
      notice('house', undefined),
    ],
    _unreadCount: 3,
  } as never);
});

it('a member blocked takes their notices off the board, and their unread one off the bell', () => {
  useBlockStore.setState({ blocked: [ORSON] });
  expect(board()).toEqual(['agnes-unread', 'house']);
  expect(bell()).toBe(2);
});

it('a member muted takes their notices off the board and the bell, and leaves everyone else’s', () => {
  useBlockStore.setState({ muted: [AGNES] });
  expect(board()).toEqual(['orson-unread', 'orson-read', 'house']);
  expect(bell()).toBe(2);
  useBlockStore.setState({ blocked: [ORSON], muted: [AGNES] });
  expect(board()).toEqual(['house']);
  expect(bell()).toBe(1);
});

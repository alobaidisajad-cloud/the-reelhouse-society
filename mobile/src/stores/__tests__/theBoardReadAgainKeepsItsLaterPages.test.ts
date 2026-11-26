/**
 * theBoardReadAgainKeepsItsLaterPages.test.ts — the notices board, read again, keeps what was read.
 *
 * The board is read page by page. Read again when the app is come back to, when its channel is back
 * or at its first live moment, its first page alone was put in place of the notices: every page the
 * member had read past it left. Read again, the board comes back as far as it was read, as the house
 * holds it; a pull asks for the newest and reads it from the top; a page past the first that cannot be
 * read leaves the board as it was, said as not read, never cut short.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { useNotificationStore } from '../notificationStore';

const ME = '33333333-3333-4333-8333-333333333333';
const START = Date.parse('2026-11-18T10:00:00Z');
const idOf = (i: number) => `77777777-7777-4777-8777-${String(i).padStart(12, '0')}`;
/** Notice i, i minutes older than the newest. */
const notice = (i: number) => ({
  id: idOf(i), user_id: ME, type: 'endorse', from_username: 'ana', from_user_id: null, message: `certified your entry ${i}`,
  is_read: true, created_at: new Date(START - i * 60_000).toISOString(), film_id: null, poster_path: null, group_key: null,
  title: null, related_lounge_id: null, metadata: null,
});
const BOARD = Array.from({ length: 120 }, (_, i) => notice(i + 1));
let mockBoard = BOARD;
let mockOlderFails = false;
const mockAsked: string[] = [];
/** The notices older than the cursor's row, as many as the read asks. */
const mockOlder = (ask: Ask) => {
  const before = /created_at\.lt\.([^,]+),/.exec(ask.ors?.[0] ?? '')?.[1];
  mockAsked.push(`older ${ask.limit}`);
  if (mockOlderFails) return { code: '57014', message: 'canceling statement due to statement timeout' };
  return mockBoard.filter((n) => before === undefined || n.created_at < before).slice(0, ask.limit ?? undefined);
};
const mockHouse = supabaseFake({
  answer: { notifications: mockOlder },
  rpc: {
    notices_page: (args: Record<string, unknown>) => {
      mockAsked.push(`first ${String(args.p_limit)}`);
      return { rows: mockBoard.slice(0, Math.min(Number(args.p_limit), 100)), unread: 0 };
    },
  },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: ME } }) } }));

const store = () => useNotificationStore.getState();
const ids = () => store().notifications.map((n) => n.id);

/** The board opened and read to 90 notices: its first page and two older ones. */
async function readTo90() {
  await store().fetchNotifications();
  await store().loadMoreNotifications();
  await store().loadMoreNotifications();
  expect(ids()).toEqual(BOARD.slice(0, 90).map((n) => n.id));
  mockAsked.length = 0;
}

beforeEach(() => {
  mockBoard = BOARD;
  mockOlderFails = false;
  mockAsked.length = 0;
  useNotificationStore.setState({ notifications: [], loading: false, fetchFailed: false, _fetching: false, _fetchingMore: false, _hasMore: true, _cursor: null } as never);
});

it('read again (the app come back to), the board keeps the notices read past its first page, as the house holds them', async () => {
  await readTo90();
  // The second was taken back by the house meanwhile.
  mockBoard = BOARD.filter((n) => n.id !== idOf(2));
  await store().fetchNotifications();
  expect(mockAsked).toEqual(['first 90']);
  expect(ids()).toEqual(mockBoard.slice(0, 90).map((n) => n.id));
  expect(store()._hasMore).toBe(true);
  // A page more reads on from where the read again ended.
  await store().loadMoreNotifications();
  expect(ids()).toEqual(mockBoard.slice(0, 119).map((n) => n.id));
  expect(store()._hasMore).toBe(false);
});

it('read past the most one read of the board asks, it is read on from the first read’s last row', async () => {
  await readTo90();
  await store().loadMoreNotifications();
  expect(ids()).toHaveLength(120);
  mockAsked.length = 0;
  await store().fetchNotifications();
  expect(mockAsked).toEqual(['first 100', 'older 20']);
  expect(ids()).toEqual(BOARD.map((n) => n.id));
});

it('a pull asks for the newest: the board is read from its top', async () => {
  await readTo90();
  await store().fetchNotifications({ fromTop: true });
  expect(mockAsked).toEqual(['first 30']);
  expect(ids()).toEqual(BOARD.slice(0, 30).map((n) => n.id));
});

it('a page past the first that cannot be read leaves the board as it was, said as not read', async () => {
  await readTo90();
  await store().loadMoreNotifications();
  const held = ids();
  expect(held).toHaveLength(120);
  // Past the board's first read of 100, the older page is refused.
  mockOlderFails = true;
  mockBoard = BOARD.filter((n) => n.id !== idOf(2));
  await store().fetchNotifications();
  expect(store().fetchFailed).toBe(true);
  expect(ids()).toEqual(held);
});

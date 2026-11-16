/**
 * aNoticeReadWhileTheBoardIsReadStaysRead.test.ts — review round 7
 * ─────────────────────────────────────────────────────────────────────────────
 * A push tapped as the app opened was read by its tap, and the board's read, asked first and
 * landing after, wrote it back unread, counted in the bell. A notice marked read while a read of
 * the board is out now stays read in that read's answer, and the bell does not count it; a mark
 * the house refused is not laid over, and once a read asked after the mark has answered, the
 * board follows the house again.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { heldClient } from '@/test-utils/heldClient';
import { useNotificationStore, type AppNotification } from '../notificationStore';

const ME = '77777777-7777-4777-8777-777777777777';
const N1 = '00000001-0000-4000-8000-000000000001';
const N2 = '00000002-0000-4000-8000-000000000002';

type Row = Record<string, unknown>;
/** The house's notices, as each case says. */
let mockRows: Row[] = [];
/** Notices whose mark the house refuses. */
let mockRefused = new Set<string>();
/** Each page the house answered, as it stood when the read was asked: [id, is_read]. */
let mockPages: [unknown, unknown][][] = [];

const where = (ask: Ask) => (r: Row) => ask.filters.every(([op, col, val]) =>
  op === 'eq' ? r[col] === val : op === 'in' ? (val as unknown[]).includes(r[col]) : true);
const mockHouse = supabaseFake({
  answer: {
    notifications: (ask) => {
      const hit = mockRows.filter(where(ask));
      if (ask.op === 'update') {
        if (hit.some((r) => mockRefused.has(r.id as string))) return { code: '42501', message: 'permission denied for table notifications' };
        for (const r of hit) Object.assign(r, ask.values?.[0] ?? {});
        return [];
      }
      if (!ask.head) mockPages.push(hit.map((r) => [r.id, r.is_read]));
      return hit.map((r) => ({ ...r }));
    },
  },
});
// Every answer is worked out when it is asked (the house as it stood then) and held until let go.
const mockHeld = heldClient(mockHouse.client);
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHeld.client; } }));
jest.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ user: { id: '77777777-7777-4777-8777-777777777777', username: 'me' } }) },
}));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));

const row = (id: string, at: string): Row => ({
  id, user_id: ME, type: 'comment', message: 'x', is_read: false, created_at: at, from_user_id: null,
});
const notice = (id: string, at: string): AppNotification => ({
  id, user_id: ME, type: 'comment', message: 'x', read: false, created_at: at,
});
const board = () => useNotificationStore.getState().notifications.map((n) => [n.id, n.read]);
const bell = () => useNotificationStore.getState()._unreadCount;
const turns = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

/** The board's read (its page, then its count), asked now and held. */
const askTheBoard = async () => {
  const read = useNotificationStore.getState().fetchNotifications();
  await turns();
  // Inside an object: an async function handing back the promise itself would wait on it.
  return { read };
};
/** The board's read let go: its page, then its count, each the oldest of the table's waiting. */
const answerTheBoard = async (read: Promise<void>) => {
  await mockHeld.release('notifications');
  await mockHeld.release('notifications');
  await read;
};

let clock = 1_000_000;
beforeEach(() => {
  clock += 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  mockRefused = new Set();
  mockPages = [];
  mockRows = [row(N1, '2026-11-16T10:00:02Z'), row(N2, '2026-11-16T10:00:01Z')];
  useNotificationStore.setState({
    notifications: [notice(N1, '2026-11-16T10:00:02Z'), notice(N2, '2026-11-16T10:00:01Z')],
    _unreadCount: 2, _hasMore: false, _cursor: null, loading: false, _fetching: false, _fetchingMore: false,
  } as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('a notice read while the board was being read stays read, and the bell does not count it', async () => {
  const { read } = await askTheBoard();                       // asked: both unread, as the house holds them
  const mark = useNotificationStore.getState().markRead(N1);
  await mockHeld.release('notifications', 2);             // the mark lands first
  await mark;
  await answerTheBoard(read);                             // the read, asked before it, lands after

  // The house answered as it stood when asked: both unread.
  expect(mockPages).toEqual([[[N1, false], [N2, false]]]);

  expect(board()).toEqual([[N1, true], [N2, false]]);
  expect(bell()).toBe(1);
});

it('a group read while the board was being read stays read, and the bell counts none of it', async () => {
  const { read } = await askTheBoard();
  const mark = useNotificationStore.getState().markGroupRead([N1, N2]);
  await mockHeld.release('notifications', 2);
  await mark;
  await answerTheBoard(read);

  expect(board()).toEqual([[N1, true], [N2, true]]);
  expect(bell()).toBe(0);
});

it('a mark the house refused is not laid over the read: that notice reads unread again, the one taken stays read', async () => {
  mockRefused = new Set([N1]);
  const { read } = await askTheBoard();
  const refused = useNotificationStore.getState().markRead(N1);
  const taken = useNotificationStore.getState().markRead(N2);
  await mockHeld.release('notifications', 2);             // N1's mark: refused
  await mockHeld.release('notifications', 2);             // N2's mark: taken
  await Promise.all([refused, taken]);
  await answerTheBoard(read);

  expect(board()).toEqual([[N1, false], [N2, true]]);
  expect(bell()).toBe(1);
});

it('once a read asked after the mark has answered, the board shows the notice as the house holds it', async () => {
  const { read: first } = await askTheBoard();
  clock += 1;
  const mark = useNotificationStore.getState().markRead(N1);
  await mockHeld.release('notifications', 2);
  await mark;
  await answerTheBoard(first);
  expect(board()).toEqual([[N1, true], [N2, false]]);

  // Asked later than the house took the mark, a read is the house's word, unread included.
  clock += 1_000;
  const unreadAgain = mockRows.find((r) => r.id === N1);
  expect(unreadAgain).toBeDefined();
  unreadAgain!.is_read = false;
  const { read: second } = await askTheBoard();
  await answerTheBoard(second);
  expect(board()).toEqual([[N1, false], [N2, false]]);
  expect(bell()).toBe(2);
});

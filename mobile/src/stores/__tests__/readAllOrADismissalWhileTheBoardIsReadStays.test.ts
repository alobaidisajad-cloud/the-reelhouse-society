/**
 * readAllOrADismissalWhileTheBoardIsReadStays.test.ts — review round 8
 * ─────────────────────────────────────────────────────────────────────────────
 * READ ALL tapped while a read of the board was out, that read asked before the mark landed,
 * wrote every notice back unread when it landed, the bell's count with them and READ ALL lit
 * again; and a notice dismissed while such a read was out came back on the board with it. READ
 * ALL and the dismissals are now laid over a read asked before they landed (allReadAt, goneHere),
 * as a single mark is (readHere, aNoticeReadWhileTheBoardIsReadStaysRead.test.ts); one the house
 * refused is not, and a read asked after the act landed is the house's word.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { heldClient } from '@/test-utils/heldClient';
import { useNotificationStore, type AppNotification } from '../notificationStore';

const ME = '77777777-7777-4777-8777-777777777777';
const N1 = '00000001-0000-4000-8000-000000000001';
const N2 = '00000002-0000-4000-8000-000000000002';
const N3 = '00000003-0000-4000-8000-000000000003';

type Row = Record<string, unknown>;
/** The house's notices, as each case says. */
let mockRows: Row[] = [];
/** Notices whose mark or deletion the house refuses. */
let mockRefused = new Set<string>();

const where = (ask: Ask) => (r: Row) => ask.filters.every(([op, col, val]) =>
  op === 'eq' ? r[col] === val : op === 'in' ? (val as unknown[]).includes(r[col]) : true);
const refusal = { code: '42501', message: 'permission denied for table notifications' };
const mockHouse = supabaseFake({
  answer: {
    notifications: (ask) => {
      const hit = mockRows.filter(where(ask));
      if (ask.op === 'update' || ask.op === 'delete') {
        if (hit.some((r) => mockRefused.has(r.id as string))) return refusal;
        if (ask.op === 'update') for (const r of hit) Object.assign(r, ask.values?.[0] ?? {});
        else mockRows = mockRows.filter((r) => !hit.includes(r));
        return [];
      }
      return hit.map((r) => ({ ...r }));
    },
  },
});
// Every answer is worked out when it is asked (the house as it stood then) and held until let go.
const mockHeld = heldClient(mockHouse.client);
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHeld.client; } }));
/** Who is signed in: the member, or (after a sign-out) the next one. */
let mockUser: { id: string; username: string } = { id: '77777777-7777-4777-8777-777777777777', username: 'me' };
jest.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ user: mockUser }) },
}));
// Each store's own reset, kept as a sign-out runs them (the factory is hoisted above this file's names).
jest.mock('../resetAllStores', () => {
  const resets: (() => void)[] = [];
  return { resets, registerStoreReset: (reset: () => void) => { resets.push(reset); } };
});
const signOut = () => { for (const reset of (jest.requireMock('../resetAllStores') as { resets: (() => void)[] }).resets) reset(); };

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
/** The act's answer: the oldest waiting behind the board's read (two), or the oldest once that read has landed (0). */
const actLands = (behind: 0 | 2 = 2) => mockHeld.release('notifications', behind);

let clock = 1_000_000;
beforeEach(() => {
  clock += 1_000_000;
  jest.spyOn(performance, 'now').mockImplementation(() => clock);
  mockUser = { id: ME, username: 'me' };
  mockRefused = new Set();
  mockRows = [row(N1, '2026-11-16T10:00:03Z'), row(N2, '2026-11-16T10:00:02Z'), row(N3, '2026-11-16T10:00:01Z')];
  useNotificationStore.setState({
    notifications: [notice(N1, '2026-11-16T10:00:03Z'), notice(N2, '2026-11-16T10:00:02Z'), notice(N3, '2026-11-16T10:00:01Z')],
    _unreadCount: 3, _hasMore: false, _cursor: null, loading: false, _fetching: false, _fetchingMore: false,
  } as never);
});

afterEach(() => {
  expect(mockHeld.count()).toBe(0);
  jest.restoreAllMocks();
});

it('READ ALL tapped while the board was being read leaves every notice read and the bell at 0 when that read lands', async () => {
  const { read } = await askTheBoard();                   // asked: all three unread, as the house holds them
  const all = useNotificationStore.getState().markAllRead();
  await actLands();                                       // READ ALL lands first
  await all;
  await answerTheBoard(read);                             // the read, asked before it, lands after

  expect(board()).toEqual([[N1, true], [N2, true], [N3, true]]);
  expect(bell()).toBe(0);
});

it('READ ALL still on its way when the board\'s read lands leaves every notice read', async () => {
  const { read } = await askTheBoard();
  const all = useNotificationStore.getState().markAllRead();
  await answerTheBoard(read);                             // the read lands first, READ ALL not yet taken
  expect(board()).toEqual([[N1, true], [N2, true], [N3, true]]);
  expect(bell()).toBe(0);

  await actLands(0);
  await all;
  expect(board()).toEqual([[N1, true], [N2, true], [N3, true]]);
  expect(bell()).toBe(0);
});

it('READ ALL the house refused is not laid over the read: the notices read unread, but one dismissed meanwhile stays gone', async () => {
  mockRefused = new Set([N1]);                            // the update touches N1 too: refused whole
  const { read } = await askTheBoard();
  const all = useNotificationStore.getState().markAllRead();
  await actLands();
  await all;
  const gone = useNotificationStore.getState().dismiss(N3);
  await actLands();
  await gone;
  await answerTheBoard(read);

  expect(board()).toEqual([[N1, false], [N2, false]]);
  expect(bell()).toBe(2);
});

it('once a read asked after READ ALL landed has answered, the board shows the notices as the house holds them', async () => {
  const { read: first } = await askTheBoard();
  clock += 1;
  const all = useNotificationStore.getState().markAllRead();
  await actLands();
  await all;
  await answerTheBoard(first);
  expect(board()).toEqual([[N1, true], [N2, true], [N3, true]]);
  expect(bell()).toBe(0);

  // Asked later than the house took READ ALL, a read is the house's word, unread included.
  clock += 1_000;
  const unreadAgain = mockRows.find((r) => r.id === N1);
  expect(unreadAgain).toBeDefined();
  unreadAgain!.is_read = false;
  const { read: second } = await askTheBoard();
  await answerTheBoard(second);
  expect(board()).toEqual([[N1, false], [N2, true], [N3, true]]);
  expect(bell()).toBe(1);
});

it('a notice dismissed while the board was being read does not come back, and the bell does not count it', async () => {
  const { read } = await askTheBoard();
  const gone = useNotificationStore.getState().dismiss(N1);
  await actLands();
  await gone;
  await answerTheBoard(read);

  expect(board()).toEqual([[N2, false], [N3, false]]);
  expect(bell()).toBe(2);
});

it('a group dismissed while the board was being read, still on its way when the read lands, stays gone and uncounted', async () => {
  const { read } = await askTheBoard();
  const gone = useNotificationStore.getState().dismissGroup([N1, N2]);
  await answerTheBoard(read);                             // the read lands before the deletion is taken
  expect(board()).toEqual([[N3, false]]);
  expect(bell()).toBe(1);

  await actLands(0);
  await gone;
  expect(board()).toEqual([[N3, false]]);
  expect(bell()).toBe(1);
});

it('a dismissal the house refused puts the notice back on the board; the one it took stays gone', async () => {
  mockRefused = new Set([N1]);
  const { read } = await askTheBoard();
  const refused = useNotificationStore.getState().dismiss(N1);
  const taken = useNotificationStore.getState().dismiss(N2);
  await actLands();                                       // N1's deletion: refused
  await actLands();                                       // N2's deletion: taken
  await Promise.all([refused, taken]);
  await answerTheBoard(read);

  expect(board()).toEqual([[N1, false], [N3, false]]);
  expect(bell()).toBe(2);
});

it('READ ALL landing after a sign-out leaves the next member\'s board as the house holds it', async () => {
  const NEXT = '88888888-8888-4888-8888-888888888888';
  const all = useNotificationStore.getState().markAllRead();   // on its way when the member signs out
  await turns();
  mockUser = { id: NEXT, username: 'next' };
  signOut();
  mockRows.push({ ...row('00000009-0000-4000-8000-000000000009', '2026-11-16T10:00:09Z'), user_id: NEXT });
  const { read } = await askTheBoard();                   // the next member's board, asked before it lands
  clock += 1;
  await actLands(0);                                      // the last member's READ ALL lands now
  await all;
  await answerTheBoard(read);

  expect(board()).toEqual([['00000009-0000-4000-8000-000000000009', false]]);
  expect(bell()).toBe(1);
});

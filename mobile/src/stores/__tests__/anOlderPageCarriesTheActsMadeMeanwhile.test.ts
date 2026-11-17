/**
 * anOlderPageCarriesTheActsMadeMeanwhile.test.ts — review round 9 (B7)
 * ─────────────────────────────────────────────────────────────────────────────
 * The board's own read already lays over its answer the acts made on this phone while it was on its
 * way (a mark read, READ ALL, a dismissal). An older page, asked as the member scrolled, laid none:
 * one on its way as READ ALL was tapped came in unread, the notices lit again under a bell that said
 * none, and a notice dismissed meanwhile came back with it. An older page now comes in with those
 * acts laid over it; one asked after the act landed is the house's word.
 * Against the house as strict as it is (test-utils/supabaseFake), each answer held until let go.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { heldClient } from '@/test-utils/heldClient';
import { useNotificationStore, type AppNotification } from '../notificationStore';

const ME = '77777777-7777-4777-8777-777777777777';

type Row = Record<string, unknown> & { id: string; created_at: string; is_read: boolean };
/** The house's notices, newest first, as each case says. */
let mockRows: Row[] = [];

const where = (ask: Ask) => (r: Row) => ask.filters.every(([op, col, val]) =>
  op === 'eq' ? r[col] === val : op === 'in' ? (val as unknown[]).includes(r[col]) : true);
/** Every row strictly after the keyset cursor an `or()` names (created_at, then id, newest first). */
const pastTheCursor = (ask: Ask) => (r: Row) => {
  const or = ask.ors?.[0];
  if (!or) return true;
  const m = /^created_at\.lt\.([^,]+),and\(created_at\.eq\.[^,]+,id\.lt\.([^)]+)\)$/.exec(or);
  expect(m).not.toBeNull();
  const [, at = '', id = ''] = m ?? [];
  return r.created_at < at || (r.created_at === at && r.id < id);
};
const mockHouse = supabaseFake({
  answer: {
    notifications: (ask) => {
      const hit = mockRows.filter(where(ask));
      if (ask.op === 'update') { for (const r of hit) Object.assign(r, ask.values?.[0] ?? {}); return []; }
      if (ask.op === 'delete') { mockRows = mockRows.filter((r) => !hit.includes(r)); return []; }
      return hit.filter(pastTheCursor(ask)).map((r) => ({ ...r }));
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

/** The nth notice, newest first: the first thirty are the board's first page. */
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`;
const atOf = (n: number) => `2026-11-16T${String(23 - Math.floor(n / 60)).padStart(2, '0')}:${String(59 - (n % 60)).padStart(2, '0')}:00Z`;
const row = (n: number): Row => ({
  id: idOf(n), user_id: ME, type: 'comment', message: `notice ${n}`, is_read: false, created_at: atOf(n), from_user_id: null,
});
const notice = (n: number): AppNotification => ({
  id: idOf(n), user_id: ME, type: 'comment', message: `notice ${n}`, read: true, created_at: atOf(n),
});
const FIRST = 30;

/** The notices from n to m (not m), as the board holds them: [id, read]. */
const onBoard = (from: number, to: number) => {
  const held = new Map(useNotificationStore.getState().notifications.map((n) => [n.id, n.read]));
  return Array.from({ length: to - from }, (_, i) => [idOf(from + i), held.get(idOf(from + i))]);
};
const turns = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

/** An older page asked as the member scrolls, and held. */
const askAnOlderPage = async () => {
  const more = useNotificationStore.getState().loadMoreNotifications();
  await turns();
  expect(mockHeld.count('notifications')).toBe(1);
  // Inside an object: an async function handing back the promise itself would wait on it.
  return { more };
};
/** An act's write, asked after the older page, let go first (the page waits at 0). */
const landTheAct = async (act: Promise<void>) => {
  await turns();
  expect(mockHeld.count('notifications')).toBe(2);
  await mockHeld.release('notifications', 1);
  await act;
};
const landThePage = async (more: Promise<void>) => {
  await mockHeld.release('notifications');
  await more;
};

let clock = 1_000_000;
beforeEach(() => {
  clock += 1_000_000;
  jest.spyOn(performance, 'now').mockImplementation(() => clock);
  // The house: the first page read and marked read here, and an older page and a little more unread.
  mockRows = Array.from({ length: FIRST + 35 }, (_, n) => ({ ...row(n), is_read: n < FIRST }));
  const last = FIRST - 1;
  useNotificationStore.setState({
    notifications: Array.from({ length: FIRST }, (_, n) => notice(n)),
    _unreadCount: 35, _hasMore: true, _cursor: `${atOf(last)}|${idOf(last)}`,
    loading: false, _fetching: false, _fetchingMore: false,
  } as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('READ ALL tapped while an older page is on its way: that page comes in read, and one asked after is the house’s word', async () => {
  const { more } = await askAnOlderPage();
  clock += 1;
  await landTheAct(useNotificationStore.getState().markAllRead());
  await landThePage(more);

  // The older page, answered as the house stood before READ ALL took: every notice on it read here.
  expect(onBoard(FIRST, FIRST + 30)).toEqual(Array.from({ length: 30 }, (_, i) => [idOf(FIRST + i), true]));
  expect(useNotificationStore.getState()._unreadCount).toBe(0);

  // Asked after READ ALL landed, the next older page is the house's word: one it holds unread again
  // (a notice the house wrote unread since) comes in unread.
  const deeper = mockRows.find((r) => r.id === idOf(FIRST + 31));
  expect(deeper).toBeDefined();
  deeper!.is_read = false;
  clock += 1_000;
  const { more: next } = await askAnOlderPage();
  await landThePage(next);
  expect(onBoard(FIRST + 30, FIRST + 35)).toEqual([
    [idOf(FIRST + 30), true], [idOf(FIRST + 31), false], [idOf(FIRST + 32), true], [idOf(FIRST + 33), true], [idOf(FIRST + 34), true],
  ]);
});

it('a notice marked read while an older page is on its way comes in read; the rest of the page as the house holds it', async () => {
  const { more } = await askAnOlderPage();
  clock += 1;
  // Its push tapped: read by the tap.
  await landTheAct(useNotificationStore.getState().markRead(idOf(FIRST + 2)));
  await landThePage(more);

  expect(onBoard(FIRST, FIRST + 4)).toEqual([
    [idOf(FIRST), false], [idOf(FIRST + 1), false], [idOf(FIRST + 2), true], [idOf(FIRST + 3), false],
  ]);
});

it('a notice dismissed while an older page is on its way does not come back with it', async () => {
  const { more } = await askAnOlderPage();
  clock += 1;
  await landTheAct(useNotificationStore.getState().dismiss(idOf(FIRST + 2)));
  await landThePage(more);

  const ids = useNotificationStore.getState().notifications.map((n) => n.id);
  expect(ids).not.toContain(idOf(FIRST + 2));
  expect(ids).toContain(idOf(FIRST + 1));
  expect(ids).toContain(idOf(FIRST + 3));
});

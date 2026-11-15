/**
 * anOlderPageFollowsItsOwnList.test.ts — an older page of notices joins only the list it followed.
 *
 * A pull to refresh while an older page was on its way replaced the list; the older page then
 * landed under the new first page, its cursor taken, and every notice between the two was hidden
 * until the next refresh. And whichever read ended first lowered `loading` for both, so a second
 * older page could be asked while the first was still away.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { useNotificationStore } from '../notificationStore';

const ME = '11111111-1111-4111-8111-111111111111';

type Row = Record<string, unknown>;
/** The house's notices: the first page and the older page, as each case says. */
let mockFirstPage: Row[] = [];
let mockOlderPage: Row[] = [];
/** While set, an older page's answer waits for it: the read is on its way. */
let mockHold: Promise<void> | null = null;

const mockHouse = supabaseFake({
  answer: { notifications: (ask: Ask) => (ask.ors?.length ? mockOlderPage : mockFirstPage) },
});
/** The fake's client, an older page's answer held while mockHold is set (the fake answers at once). */
function mockHeld(client: typeof mockHouse.client): typeof mockHouse.client {
  const from = (table: string) => {
    const query = client.from(table);
    let older = false;
    const held: unknown = new Proxy(query, {
      get(target, key) {
        const value = Reflect.get(target, key) as unknown;
        if (key === 'then') {
          const gate = older ? mockHold : null;
          return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            (gate ?? Promise.resolve()).then(() => target.then(res, rej));
        }
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          if (key === 'or') older = true;
          const out = (value as (...a: unknown[]) => unknown).apply(target, args);
          return out === target ? held : out;
        };
      },
    });
    return held as ReturnType<typeof client.from>;
  };
  return { ...client, from };
}
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHeld(mockHouse.client); } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: ME } }) } }));

const idOf = (n: number) => `00000000-0000-4000-8000-${String(n + 100).padStart(12, '0')}`;
const notice = (n: number) => ({
  id: idOf(n), user_id: ME, type: 'endorse', message: `certified your log ${n}.`,
  is_read: true, created_at: new Date(Date.UTC(2026, 10, 15, 9, 0, 0) - n * 60_000).toISOString(),
});
const page = (from: number, count: number) => Array.from({ length: count }, (_, i) => notice(from + i));
const opened = () => { let open: () => void = () => {}; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
const ids = () => useNotificationStore.getState().notifications.map((n) => n.id);

beforeEach(() => {
  mockHold = null;
  useNotificationStore.setState({ notifications: [], loading: false, _fetching: false, _fetchingMore: false, _hasMore: true, _cursor: null } as never);
});

it('an older page asked before a refresh is not laid under the refreshed list', async () => {
  mockFirstPage = page(0, 30);
  await useNotificationStore.getState().fetchNotifications();
  expect(ids()).toHaveLength(30);

  const gate = opened();
  mockHold = gate.p;
  mockOlderPage = page(30, 30);
  const more = useNotificationStore.getState().loadMoreNotifications();

  // Five new notices arrive; the refresh reads a first page that now ends earlier.
  mockFirstPage = [...page(-5, 5), ...page(0, 25)];
  await useNotificationStore.getState().fetchNotifications();
  const refreshed = ids();
  const cursorAfterRefresh = useNotificationStore.getState()._cursor;

  gate.open();
  await more;

  expect(ids()).toEqual(refreshed);                       // the five between are not skipped over
  expect(useNotificationStore.getState()._cursor).toBe(cursorAfterRefresh);
});

it('an older page asked on the list it followed is laid under it', async () => {
  mockFirstPage = page(0, 30);
  await useNotificationStore.getState().fetchNotifications();
  mockOlderPage = page(30, 30);
  await useNotificationStore.getState().loadMoreNotifications();
  expect(ids()).toEqual(page(0, 60).map((n) => n.id));
});

it('a refresh ending first leaves the list reading while its older page is away', async () => {
  mockFirstPage = page(0, 30);
  await useNotificationStore.getState().fetchNotifications();
  const gate = opened();
  mockHold = gate.p;
  mockOlderPage = [];
  const more = useNotificationStore.getState().loadMoreNotifications();
  await useNotificationStore.getState().fetchNotifications();

  expect(useNotificationStore.getState().loading).toBe(true);   // the older page is still away
  gate.open();
  await more;
  expect(useNotificationStore.getState().loading).toBe(false);
});

/**
 * aStacksNextPageLaysOntoTheListAsItStands.test.ts — review round 10 (the stacks' next page)
 * ─────────────────────────────────────────────────────────────────────────────
 * A member's stacks are read a page at a time. The next page was laid under the list as it stood
 * when the page was ASKED: a stack made while it was on its way left the list, and one deleted
 * meanwhile came back. Now the page is laid under the list as it stands when it lands, a stack the
 * list already holds is not laid twice, and one deleted since is not laid back.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { heldClient } from '@/test-utils/heldClient';
import { useFilmStore } from '@/src/stores/films';

const ME = '33333333-3333-4333-8333-333333333333';
const PAGE = 20;

type Row = Record<string, unknown>;
const stackId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** The member's stack n, older as n grows: one minute apart. */
const stack = (n: number): Row => ({
  id: stackId(n), user_id: ME, title: `Stack ${n}`, description: '', is_ranked: false, is_private: false,
  created_at: `2026-11-01T12:${String(59 - n).padStart(2, '0')}:00.000Z`,
});
const FIRST_PAGE = Array.from({ length: PAGE }, (_, i) => stack(i + 1));
/** The next page, as the house answers it (each case says). */
let mockNextPage: Row[] = [];

const mockHouse = supabaseFake({
  rows: { list_items: [] },
  answer: {
    // The first page has no cursor; the next is asked past it (an `or()` the fake leaves to the test).
    lists: (ask: Ask) => (ask.ors?.length ? mockNextPage : FIRST_PAGE),
  },
  rpc: {
    save_stack: (args: Row) => ({ ...stack(0), id: args.p_id, title: args.p_title, created_at: '2026-11-17T09:00:00.000Z' }),
    delete_list_cascade: null,
  },
});
/**
 * The fake reads a page's own order; a stack's films ordered within it (an embed's order) it cannot,
 * so that one order, and only that one, is taken as asked.
 */
const mockOrdered = {
  ...mockHouse.client,
  from: (table: string) => {
    const query = mockHouse.client.from(table);
    const wrapped: typeof query = new Proxy(query, {
      get(target, key) {
        // The select as PostgREST reads it: the space the app writes before an embed's columns is
        // nothing to it, and the fake reads the embed only without it.
        if (key === 'select') {
          return (text?: string, opts?: { count?: 'exact'; head?: boolean }) => {
            target.select(text?.replace(/\s+/g, ' ').replace(/\s*\(\s*/g, '(').replace(/\s*\)/g, ')').trim(), opts);
            return wrapped;
          };
        }
        if (key === 'order') {
          return (col: string, opts?: { ascending?: boolean; foreignTable?: string }) => {
            if (opts?.foreignTable) {
              expect([table, opts.foreignTable, col]).toEqual(['lists', 'list_items', 'rank_position']);
              return wrapped;
            }
            target.order(col, opts);
            return wrapped;
          };
        }
        const own = Reflect.get(target, key) as unknown;
        if (typeof own !== 'function') return own;
        return (...args: unknown[]) => {
          const out = (own as (...a: unknown[]) => unknown).apply(target, args);
          return out === target ? wrapped : out;
        };
      },
    });
    return wrapped;
  },
};
const mockHeld = heldClient(mockOrdered);
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHeld.client; } }));
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me', role: 'cinephile' } }),
    subscribe: () => () => {},
  },
}));
jest.mock('@/src/utils/offlineQueue', () => ({
  ...jest.requireActual('@/src/utils/offlineQueue'),
  getOfflineQueue: () => [],
  enqueueMutation: jest.fn(() => true),
  flushOfflineQueue: jest.fn(),
}));

const titles = () => useFilmStore.getState().lists.map((l) => l.title);
const firstTitles = FIRST_PAGE.map((r) => String(r.title));

/** The first page read and laid, and the next one asked: held on its way. */
const askTheNextPage = async () => {
  const first = useFilmStore.getState().fetchLists();
  await mockHeld.release('lists');
  await first;
  expect(titles()).toEqual(firstTitles);
  const next = useFilmStore.getState().fetchLists(true);
  // Asked, and held: it waits on the house until it lands.
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(mockHeld.count('lists')).toBe(1);
  return { land: async () => { await mockHeld.release('lists'); return next; } };
};

beforeEach(() => {
  mockNextPage = [stack(21), stack(22)];
  useFilmStore.setState({ lists: [], _listsCursor: null, listsHasMore: true, _fetchingLists: false } as never);
});

it('a stack made while the next page was on its way stays at the top, the page laid under the rest', async () => {
  const { land } = await askTheNextPage();
  await useFilmStore.getState().createList({ title: 'Made meanwhile', description: '', isPrivate: false, isRanked: false });
  expect(titles()[0]).toBe('Made meanwhile');
  await land();
  expect(titles()).toEqual(['Made meanwhile', ...firstTitles, 'Stack 21', 'Stack 22']);
});

it('a stack deleted while the next page was on its way does not come back with it', async () => {
  const { land } = await askTheNextPage();
  await useFilmStore.getState().deleteList(stackId(4));
  expect(titles()).not.toContain('Stack 4');
  await land();
  expect(titles()).toEqual([...firstTitles.filter((t) => t !== 'Stack 4'), 'Stack 21', 'Stack 22']);
});

it('a page that carries a stack the list already holds lays it once', async () => {
  mockNextPage = [stack(20), stack(21)];
  const { land } = await askTheNextPage();
  await land();
  expect(titles()).toEqual([...firstTitles, 'Stack 21']);
  expect(new Set(useFilmStore.getState().lists.map((l) => l.id)).size).toBe(PAGE + 1);
});

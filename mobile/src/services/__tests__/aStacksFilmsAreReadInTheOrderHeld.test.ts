/**
 * aStacksFilmsAreReadInTheOrderHeld.test.ts — a stack's films past its first page.
 * ─────────────────────────────────────────────────────────────────────────────
 * A stack's films were read past the first page by their count (`.range(offset, …)`): a film moved
 * by its curator while the member scrolled (its rank changed) moved every film after it, and the
 * next page began past a film (never drawn) or on one already drawn. The first read now holds the
 * order of the stack's first HELD_FILMS films, and the next pages walk it, each read by id; past it,
 * each page begins after the last film read, as it was read, and a film read there again is dropped.
 * Against the house as strict as it is (test-utils/supabaseFake).
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { HELD_FILMS, STACK_ITEMS_LIMIT, StackService, type StackFilm, type StackPlace } from '../StackService';

const STACK = '0000005c-0000-4000-9000-000000000001';
const CURATOR = '55555555-5555-4555-8555-555555555555';
const N = HELD_FILMS + 200;
const START = Date.UTC(2026, 0, 1);
const filmOf = (n: number) => 100_000 + n;
/** Film n of the stack, at rank n, added n seconds into the year. */
const item = (n: number, rank: number | null = n) => ({
  id: `0000001e-0000-4000-9000-${String(n).padStart(12, '0')}`, list_id: STACK, film_id: filmOf(n), film_title: `Film ${n}`,
  poster_path: null, rank_position: rank, created_at: new Date(START + n * 1000).toISOString(),
});

let mockHouse = supabaseFake({ rows: {} });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: null }) } }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

const houseOf = (items: Record<string, unknown>[]) => supabaseFake({
  rows: {
    lists: [{ id: STACK, user_id: CURATOR, title: 'Every film', description: '', is_private: false, is_ranked: true, created_at: '2026-01-01T00:00:00Z' }],
    profiles: [{ id: CURATOR, username: 'mara' }],
    list_items: items, list_comments: [],
  },
  rpc: { list_certify_count: () => 0 },
});
const items = () => mockHouse.rows('list_items') as { film_id: number; rank_position: number | null }[];
const ids = (films: StackFilm[]) => films.map((f) => f.id);
const moveTo = (n: number, rank: number | null) => { const r = items().find((x) => x.film_id === filmOf(n)); if (r) r.rank_position = rank; };

it('the first read draws its page and holds the order of the rest, to HELD_FILMS', async () => {
  mockHouse = houseOf(Array.from({ length: N }, (_, n) => item(n)));
  const payload = await StackService.getStackFullPayload(STACK);
  expect(ids(payload!.films)).toEqual(Array.from({ length: STACK_ITEMS_LIMIT }, (_, n) => filmOf(n)));
  expect(payload!.filmsNext.held).toEqual(Array.from({ length: HELD_FILMS - STACK_ITEMS_LIMIT }, (_, i) => filmOf(STACK_ITEMS_LIMIT + i)));
  expect(payload!.filmsNext.past).toEqual({ rank: HELD_FILMS - 1, at: item(HELD_FILMS - 1).created_at, film: filmOf(HELD_FILMS - 1) });
  expect(payload!.filmCount).toBe(N);
});

it('films moved while the member reads skip and repeat no film of the order held, and past it none is drawn twice', async () => {
  mockHouse = houseOf(Array.from({ length: N }, (_, n) => item(n)));
  const payload = await StackService.getStackFullPayload(STACK);
  const drawn = [...payload!.films];
  // Moved while the first page is read: a film of the order held to the top, one drawn to the
  // very end, and one past the order held up into the films drawn.
  moveTo(600, -1);
  moveTo(100, 50_000);
  moveTo(HELD_FILMS + 50, -2);
  let place = payload!.filmsNext;
  for (let i = 0; i < 10; i++) {
    const page = await StackService.getStackItemsPage(STACK, place, new Set(ids(drawn)));
    drawn.push(...page.films);
    place = page.place;
    if (!page.more) break;
  }
  // No film drawn twice; every film of the order held drawn in that order.
  expect(new Set(ids(drawn)).size).toBe(drawn.length);
  expect(ids(drawn).slice(0, HELD_FILMS)).toEqual(Array.from({ length: HELD_FILMS }, (_, n) => filmOf(n)));
  // Past it, the films after the last one read, as it was read: the one moved up past the order held
  // stands before it now, and is the one film not reached.
  expect(ids(drawn).slice(HELD_FILMS)).toEqual(Array.from({ length: N - HELD_FILMS }, (_, i) => filmOf(HELD_FILMS + i)).filter((id) => id !== filmOf(HELD_FILMS + 50)));
});

it('films with no rank come last, as the order has them, and a page past the order held reaches them', async () => {
  mockHouse = houseOf(Array.from({ length: N }, (_, n) => item(n, n >= HELD_FILMS + 100 ? null : n)));
  let place: StackPlace | null = null;
  const drawn: StackFilm[] = [];
  for (let i = 0; i < 10; i++) {
    const page = await StackService.getStackItemsPage(STACK, place, new Set(ids(drawn)));
    drawn.push(...page.films);
    place = page.place;
    if (!page.more) break;
  }
  expect(ids(drawn)).toEqual(Array.from({ length: N }, (_, n) => filmOf(n)));
});

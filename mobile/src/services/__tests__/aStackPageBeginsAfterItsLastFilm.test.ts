/**
 * A stack's next page begins after the last film read, not after a count of films.
 * ─────────────────────────────────────────────────────────────────────────────
 * The films past a stack's first page were asked by their count (`.range(500, 999)`). A film taken
 * out of the stack on another phone while the first page was held moved every film after it up one,
 * and the 501st was never drawn; one put in drew the 500th twice. The next pages now walk the order
 * held as the first was read, and past it begin after the last film's own place (its rank, when it
 * was added, its film), read from the house as strict as it is (test-utils/supabaseFake).
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { postgresOrder, type Row } from '@/test-utils/postgrestFilter';
import { StackService, STACK_ITEMS_LIMIT, type StackPlace } from '@/src/services/StackService';

const STACK = '11111111-1111-4111-8111-111111111111';
const house = (items: Row[]) => supabaseFake({ rows: { list_items: items } });
let mockHouse = house([]);
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333' } }) } }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

/**
 * A stack of `n` films, unranked after the 700th (so a page ends on a ranked film with unranked ones
 * after it), ten added in each moment: ties on both first axes.
 */
function stack(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    list_id: STACK,
    film_id: 1000 + i,
    film_title: `Film ${i + 1}`,
    poster_path: null,
    rank_position: i < 700 ? i : null,
    created_at: `2026-01-01T00:00:${String(Math.floor(i / 10) % 60).padStart(2, '0')}+00:00`,
  }));
}
const inOrder = (rows: Row[]) => [...rows].sort(postgresOrder([
  { column: 'rank_position', direction: 'asc' }, { column: 'created_at', direction: 'asc' }, { column: 'film_id', direction: 'asc' },
]));
const rows = () => mockHouse.rows('list_items');

it('a film taken out of the stack while the first page was held: the next page still begins at the film after the last drawn', async () => {
  mockHouse = house(stack(STACK_ITEMS_LIMIT + 3));
  const first = await StackService.getStackItemsPage(STACK, null, new Set());
  expect(first.films).toHaveLength(STACK_ITEMS_LIMIT);
  // Taken out on another phone: every film after it moves up one place.
  rows().splice(rows().findIndex((r) => r.film_id === 1002), 1);
  const next = await StackService.getStackItemsPage(STACK, first.place, new Set(first.films.map((f) => f.id)));
  expect(next.films.map((f) => f.title)).toEqual(['Film 501', 'Film 502', 'Film 503']);
  expect(mockHouse.asked.some((a) => a.range)).toBe(false);
});

it('a film put in at the top meanwhile: the last film drawn is not drawn again', async () => {
  mockHouse = house(stack(STACK_ITEMS_LIMIT + 2));
  const first = await StackService.getStackItemsPage(STACK, null, new Set());
  rows().unshift({ ...rows()[0]!, film_id: 1, film_title: 'Newly put in', rank_position: -1 });
  const next = await StackService.getStackItemsPage(STACK, first.place, new Set(first.films.map((f) => f.id)));
  expect(next.films.map((f) => f.title)).toEqual(['Film 501', 'Film 502']);
});

it('pages a stack whose films are unranked and added together, every film once and in its order', async () => {
  mockHouse = house(stack(1234));
  const drawn: { id: number; title: string }[] = [];
  let place: StackPlace | null = null;
  for (let guard = 0; guard < 10; guard += 1) {
    const page: Awaited<ReturnType<typeof StackService.getStackItemsPage>> = await StackService.getStackItemsPage(STACK, place, new Set(drawn.map((f) => f.id)));
    drawn.push(...page.films);
    place = page.place;
    if (!page.more) break;
  }
  expect(drawn.map((f) => f.title)).toEqual(inOrder(stack(1234)).map((r) => r.film_title));
});

/**
 * A stack's next page begins after the last film read, not after a count of films.
 * ─────────────────────────────────────────────────────────────────────────────
 * The films past a stack's first page were asked by their count (`.range(500, 999)`). A film taken
 * out of the stack on another phone while the first page was held moved every film after it up one,
 * and the 501st was never drawn; one put in drew the 500th twice. The page now begins after the last
 * film's own place (its rank, when it was added, its film), read from the house: a stack held by the
 * shared fake is read here through the very filter the page writes.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { holdsFilter, postgresOrder, type Row } from '@/test-utils/postgrestFilter';
import { StackService, STACK_ITEMS_LIMIT } from '@/src/services/StackService';

const STACK = '11111111-1111-4111-8111-111111111111';
let mockItems: Row[] = [];
const mockOrs: string[] = [];
/** The house's list_items, answered for every query of them: its filters read, the `.or()` among them. */
const house = () => supabaseFake({
  answer: {
    list_items: (ask) => {
      for (const or of ask.ors ?? []) mockOrs.push(or);
      return mockItems.filter((r) => ask.filters.every(([op, col, v]) => op === 'eq' && r[col] === v)
        && (ask.ors ?? []).every((f) => holdsFilter(f, r)));
    },
  },
});
let mockHouse = house();
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

beforeEach(() => { mockOrs.length = 0; mockHouse = house(); });

it('a film taken out of the stack while the first page was held: the next page still begins at the film after the last drawn', async () => {
  mockItems = stack(STACK_ITEMS_LIMIT + 3);
  const first = await StackService.getStackItemsPage(STACK, null);
  expect(first).toHaveLength(STACK_ITEMS_LIMIT);
  // Taken out on another phone: every film after it moves up one place.
  mockItems = mockItems.filter((r) => r.film_id !== 1002);
  const next = await StackService.getStackItemsPage(STACK, first[first.length - 1]!.id);
  expect(next.map((f) => f.title)).toEqual(['Film 501', 'Film 502', 'Film 503']);
  expect(mockHouse.asked.some((a) => a.range)).toBe(false);
});

it('a film put in at the top meanwhile: the last film drawn is not drawn again', async () => {
  mockItems = stack(STACK_ITEMS_LIMIT + 2);
  const first = await StackService.getStackItemsPage(STACK, null);
  mockItems = [{ ...mockItems[0]!, film_id: 1, film_title: 'Newly put in', rank_position: -1 }, ...mockItems];
  const next = await StackService.getStackItemsPage(STACK, first[first.length - 1]!.id);
  expect(next.map((f) => f.title)).toEqual(['Film 501', 'Film 502']);
});

it('pages a stack whose films are unranked and added together, every film once and in its order', async () => {
  mockItems = stack(1234);
  const drawn: string[] = [];
  let after: number | null = null;
  for (let guard = 0; guard < 10; guard += 1) {
    const page = await StackService.getStackItemsPage(STACK, after);
    if (page.length === 0) break;
    drawn.push(...page.map((f) => f.title));
    after = page[page.length - 1]!.id;
  }
  expect(mockOrs.some((f) => f.includes('rank_position.is.null'))).toBe(true);
  expect(drawn).toEqual(inOrder(stack(1234)).map((r) => r.film_title));
});

it('a film the stack no longer holds is said, never answered as a stack that ends there', async () => {
  mockItems = stack(10);
  await expect(StackService.getStackItemsPage(STACK, 99999)).rejects.toThrow(/no longer in the stack/);
});

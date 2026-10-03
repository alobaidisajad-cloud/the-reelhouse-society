/**
 * stackFilmCount.test.ts — #46, "4 FILMS" on a 96-film stack
 * ──────────────────────────────────────────────────────────
 * The visitor query caps the embedded posters at 4 (deliberately — only four render).
 * The card then took its COUNT from that capped array, so every stack larger than four
 * advertised itself as "4 FILMS" to everyone except its owner, whose own path is
 * uncapped. Seven of nine live stacks displayed the wrong number.
 *
 * `ProfileList` has TWO producers, and the whole risk of this fix is wiring one and
 * forgetting the other. Both are asserted here; the type makes `filmCount` required so
 * the compiler catches it first, and these catch it if the type is ever loosened.
 */
import { toProfileList } from '../mappers';
import { ProfileDataService } from '../../services/ProfileDataService';

/** What the visitor query sent, and the rows PostgREST answers it with. */
const mockSent: { select?: string } = {};
let mockRows: unknown[] = [];
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const k of ['eq', 'order', 'limit', 'or']) chain[k] = () => chain;
      chain.select = (cols: string) => { mockSent.select = cols; return chain; };
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: mockRows, error: null }).then(res);
      return chain;
    },
  },
}));

describe('the OWNER path — uncapped, so the array is the truth', () => {
  it('counts every film in the stack', () => {
    const list = toProfileList({
      id: 'l1', title: 'Comfort movies', description: '', isRanked: false, isPrivate: false,
      createdAt: '2026-01-01T00:00:00Z',
      films: Array.from({ length: 88 }, (_, i) => ({ id: i, title: `f${i}`, poster: null })),
    } as never);

    expect(list.filmCount).toBe(88);
    expect(list.films).toHaveLength(88);
  });

  it('an empty stack counts zero, not a fallback', () => {
    const list = toProfileList({
      id: 'l2', title: 'Hhh', description: '', isRanked: false, isPrivate: false,
      createdAt: '2026-01-01T00:00:00Z', films: [],
    } as never);
    expect(list.filmCount).toBe(0);
  });

  it('survives a stack with no films array at all', () => {
    const list = toProfileList({
      id: 'l3', title: 'x', description: '', isRanked: false, isPrivate: false,
      createdAt: '2026-01-01T00:00:00Z',
    } as never);
    expect(list.filmCount).toBe(0);
  });
});

describe('the VISITOR path — capped posters, aggregate count', () => {
  // The shape PostgREST actually returns, verified against this project's live API:
  //   "Comfort movies" -> list_items:[4 items], film_count:[{count: 88}]   HTTP 200
  // The aggregate arrives as an ARRAY — reading `film_count.count` would be undefined.
  // Driven through the service a visitor's profile reads, not a copy of its rule.
  const row = (id: string, fetched: number, filmCount?: number) => ({
    id, title: id, description: null, is_ranked: false, is_private: false,
    created_at: '2026-01-01T00:00:00Z',
    list_items: Array.from({ length: fetched }, (_, i) => ({
      list_id: id, film_id: i + 1, film_title: `f${i}`, poster_path: null,
    })),
    ...(filmCount === undefined ? {} : { film_count: [{ count: filmCount }] }),
  });
  const counts = async (rows: unknown[]) => {
    mockRows = rows;
    const { items } = await ProfileDataService.fetchOtherUserLists('them');
    return items.map((l) => l.filmCount);
  };

  beforeEach(() => { mockSent.select = undefined; mockRows = []; });

  it('asks for the true size in the same round trip as the four posters', async () => {
    await counts([]);
    expect(mockSent.select).toContain('film_count:list_items(count)');
  });

  it('reports the true size, not the four posters it fetched', async () => {
    expect(await counts([row('a', 4, 88), row('b', 4, 96)])).toEqual([88, 96]);
  });

  it('an empty stack returns zero from the aggregate', async () => {
    expect(await counts([row('a', 0, 0)])).toEqual([0]);
  });

  it('a stack smaller than the cap is unaffected', async () => {
    expect(await counts([row('a', 3, 3)])).toEqual([3]);
  });

  it('falls back to the capped length if the aggregate ever disappears', async () => {
    // PostgREST can have aggregates disabled. An under-count is a better failure than
    // "undefined FILMS" on a public profile.
    expect(await counts([row('a', 4)])).toEqual([4]);
  });

  it('would have produced the live numbers this finding reported', async () => {
    // Straight from the audit's production sample — the exact rows that were wrong.
    const live = [
      { title: 'Comfort movies', fetched: 4, actual: 88 },
      { title: 'The Best Picture Journey', fetched: 4, actual: 96 },
      { title: 'Films that cut me deep', fetched: 4, actual: 6 },
      { title: 'Hhh', fetched: 0, actual: 0 },
    ];
    expect(await counts(live.map((l) => row(l.title, l.fetched, l.actual))))
      .toEqual(live.map((l) => l.actual));
  });
});

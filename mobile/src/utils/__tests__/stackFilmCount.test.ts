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
  const readCount = (row: { list_items: unknown[]; film_count?: { count: number }[] }) =>
    row.film_count?.[0]?.count ?? row.list_items.length;

  it('reports the true size, not the four posters it fetched', () => {
    expect(readCount({ list_items: [1, 2, 3, 4], film_count: [{ count: 88 }] })).toBe(88);
    expect(readCount({ list_items: [1, 2, 3, 4], film_count: [{ count: 96 }] })).toBe(96);
  });

  it('an empty stack returns zero from the aggregate', () => {
    expect(readCount({ list_items: [], film_count: [{ count: 0 }] })).toBe(0);
  });

  it('a stack smaller than the cap is unaffected', () => {
    expect(readCount({ list_items: [1, 2, 3], film_count: [{ count: 3 }] })).toBe(3);
  });

  it('falls back to the capped length if the aggregate ever disappears', () => {
    // PostgREST can have aggregates disabled. An under-count is a better failure than
    // "undefined FILMS" on a public profile.
    expect(readCount({ list_items: [1, 2, 3, 4] })).toBe(4);
  });

  it('would have produced the live numbers this finding reported', () => {
    // Straight from the audit's production sample — the exact rows that were wrong.
    const live = [
      { title: 'Comfort movies', fetched: 4, actual: 88 },
      { title: 'The Best Picture Journey', fetched: 4, actual: 96 },
      { title: 'Films that cut me deep', fetched: 4, actual: 6 },
      { title: 'Hhh', fetched: 0, actual: 0 },
    ];
    for (const row of live) {
      const shown = readCount({
        list_items: Array(row.fetched).fill(0),
        film_count: [{ count: row.actual }],
      });
      expect(shown).toBe(row.actual);
    }
  });
});

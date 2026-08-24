/**
 * decadeCounts.test.ts — the guard a mutation pass proved was missing.
 *
 * The rule "the server's whole-queue answer beats the page's own partial one"
 * lived as a line inside a useMemo. Breaking it deliberately — making the page
 * prefer its own counts — left all 2,939 tests passing. So the rule was true
 * only by luck, and would have stopped being true the first time somebody
 * simplified that memo.
 *
 * What is actually at stake is not an inaccurate number. Counting only the
 * loaded page DROPS CHIPS: a member whose single 1940s film sits on page eight
 * gets no 1940s filter to press and no way to reach it. The absent control is
 * the bug; the wrong count is the smaller half of it.
 */
import { decadeCounts, decadesOfLoaded } from '../profileComputed';

describe('decadeCounts — whose answer wins', () => {
  /**
   * A FACTORY, not a shared constant.
   *
   * This was a shared array, and a mutation pass caught what that costs: the
   * "does not sort in place" test could not fail. An earlier test in this same
   * block had already called the function, so with an in-place sort the fixture
   * arrived at that test ALREADY sorted, and sorting a sorted array changes
   * nothing. The guard read as green while the behaviour it named was broken.
   *
   * Deliberately not in ascending order, so a sort has visible work to do.
   */
  const makeServer = () => [
    { decade: 1990, count: 12 },
    { decade: 1940, count: 1 },
    { decade: 2010, count: 40 },
  ];
  // What the phone can see: page one, which happens to hold no 1940s film.
  const loaded = [
    { decade: 2010, count: 8 },
    { decade: 1990, count: 2 },
  ];

  it('prefers the server, and keeps the decade the page could not see', () => {
    const out = decadeCounts(makeServer(), () => loaded);
    expect(out.map((d) => d.decade)).toEqual([2010, 1990, 1940]);
    // THE defect: without the server, this chip does not exist and the member
    // has no way to reach their own 1940s film.
    expect(out.find((d) => d.decade === 1940)?.count).toBe(1);
  });

  it('reports the server\'s counts, not the page\'s', () => {
    const out = decadeCounts(makeServer(), () => loaded);
    expect(out.find((d) => d.decade === 2010)?.count).toBe(40);
    expect(out.find((d) => d.decade === 1990)?.count).toBe(12);
  });

  it('returns newest decade first', () => {
    const decades = decadeCounts(makeServer(), () => []).map((d) => d.decade);
    expect(decades).toEqual([...decades].sort((a, b) => b - a));
  });

  it('does not reorder the caller\'s array in place', () => {
    // The payload is shared state; sorting it would reorder it for every other
    // reader, and the bug would surface somewhere else entirely.
    const server = makeServer();
    const original = server.map((d) => ({ ...d }));
    // The array under observation must be the one handed in, or this asserts
    // that an untouched array was not touched.
    decadeCounts(server, () => []);
    expect(server).toEqual(original);
    expect(server.map((d) => d.decade)).toEqual([1990, 1940, 2010]);
  });

  it('falls back to the page when the server has not answered', () => {
    for (const empty of [null, undefined, []]) {
      expect(decadeCounts(empty, () => loaded)).toBe(loaded);
    }
  });

  it('does not compute the page fallback at all when the server answered', () => {
    // The fallback is a thunk for this reason: on the real screen it tallies the
    // loaded page and writes a ref. Running it when the answer is already known
    // is wasted work AND a write nobody asked for.
    const fallback = jest.fn(() => loaded);
    decadeCounts(makeServer(), fallback);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('calls the fallback exactly once when it is needed', () => {
    const fallback = jest.fn(() => loaded);
    decadeCounts(null, fallback);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('an empty server array means "not answered", not "no decades"', () => {
    // A member with a non-empty queue always has at least one decade, so an
    // empty array can only mean the column is not there yet — which is the
    // state of the build currently on TestFlight.
    expect(decadeCounts([], () => loaded)).toBe(loaded);
  });
});

describe('decadesOfLoaded — the fallback tally', () => {
  it('counts films per decade, newest first', () => {
    expect(decadesOfLoaded([
      { year: 1994 }, { year: 1999 }, { year: 2001 }, { year: 1991 },
    ])).toEqual([
      { decade: 2000, count: 1 },
      { decade: 1990, count: 3 },
    ]);
  });

  it('skips a film with no usable year rather than inventing a decade', () => {
    expect(decadesOfLoaded([
      { year: null }, { year: undefined }, { year: 1985 },
    ])).toEqual([{ decade: 1980, count: 1 }]);
  });

  it('returns nothing for an empty list', () => {
    expect(decadesOfLoaded([])).toEqual([]);
  });

  it('puts a film on the decade it belongs to, at both edges', () => {
    // 1990 and 1999 are the same decade; 2000 starts the next one.
    expect(decadesOfLoaded([{ year: 1990 }, { year: 1999 }, { year: 2000 }]))
      .toEqual([{ decade: 2000, count: 1 }, { decade: 1990, count: 2 }]);
  });
});

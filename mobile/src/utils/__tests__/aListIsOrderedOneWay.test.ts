/**
 * aListIsOrderedOneWay.test.ts — a machine's keys by their codes, a reader's titles
 * by the phone's collation (src/utils/order.ts). It runs on Hermes too
 * (scripts/hermes-suites.cjs), whose collation is the one a phone sorts by.
 */
import * as fc from 'fast-check';
import { byKey, byTitle } from '../order';

describe('byKey', () => {
  it('orders the house\'s instants as the instants they name', () => {
    const at = ['2026-11-06T10:00:00.123456+00:00', '2026-01-01T00:00:00+00:00', '2026-11-06T09:59:59.999999+00:00'];
    expect([...at].sort(byKey)).toEqual(['2026-01-01T00:00:00+00:00', '2026-11-06T09:59:59.999999+00:00', '2026-11-06T10:00:00.123456+00:00']);
  });

  it('orders ids and codes as Postgres does: by their characters\' codes, capitals first', () => {
    expect(['b4', 'B4', '4k', 'a-1', 'a1'].sort(byKey)).toEqual(['4k', 'B4', 'a-1', 'a1', 'b4']);
    expect(['GB', 'US', 'DE'].sort(byKey)).toEqual(['DE', 'GB', 'US']);
  });

  it('says two equal keys are equal, and is the same either way round', () => {
    expect(byKey('a', 'a')).toBe(0);
    fc.assert(fc.property(fc.string(), fc.string(), (a, b) => Math.sign(byKey(a, b)) === -Math.sign(byKey(b, a))));
  });
});

describe('byTitle', () => {
  it('alphabetises as a reader does: case is not a letter, and an accent sits by its letter', () => {
    expect(['b', 'C', 'a'].sort(byTitle)).toEqual(['a', 'b', 'C']);
    expect(['f', 'é', 'e'].sort(byTitle)).toEqual(['e', 'é', 'f']);
    expect(['Vertigo', 'alien', 'Ãrvore', 'Breathless'].sort(byTitle)).toEqual(['alien', 'Ãrvore', 'Breathless', 'Vertigo']);
  });

  it('says a title is equal to itself', () => {
    expect(byTitle('Vertigo', 'Vertigo')).toBe(0);
  });
});

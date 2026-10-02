/**
 * aNameIsEarnedOnce.test.ts — every honour and every passport stamp has a name
 * of its own, and none is a rank a member pays for.
 *
 * THE COMPLETIONIST was both an honour (every film rated) and a stamp (films
 * from seven decades), so a member could hold one and lack the other under the
 * same name. And the stamp for a hundred films was THE ARCHIVIST — a paid rank
 * — printed on the file of members who hold no such rank, the mistake the DNA
 * card's archetype was cured of.
 */
import { BADGES } from '../Achievements';
import { PASSPORT_STAMPS } from '../NoirPassport';
import { RANKS } from '@/src/constants/membership';

const plain = (name: string) => name.toUpperCase().replace(/^THE\s+/, '').trim();

it('no two honours or stamps share a name', () => {
  const names = [...BADGES.map((b) => b.title), ...PASSPORT_STAMPS.map((s) => s.label)].map(plain);
  expect(names.length).toBeGreaterThan(15);
  expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
});

it('none is named for a rank', () => {
  const ranks = RANKS.map((r) => plain(r.name));
  expect(ranks).toEqual(expect.arrayContaining(['ARCHIVIST', 'AUTEUR']));
  const names = [...BADGES.map((b) => b.title), ...PASSPORT_STAMPS.map((s) => s.label)].map(plain);
  expect(names.filter((n) => ranks.includes(n))).toEqual([]);
});

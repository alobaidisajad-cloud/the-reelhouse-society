/**
 * theProfileRedrawsForItsOwn.guard.test.ts — the member page redraws for the
 * film-store fields it reads, not for every change in the store.
 *
 * It took the whole store (`useFilmStore()`), so every log, watchlist or stack
 * change anywhere redrew all 1,300 lines of it — the profile tab included,
 * which stays mounted. It reads eight flags; it now asks for those, shallowly.
 */
import { readCode } from '@/test-utils/readCode';

const SRC = readCode('app/user/[username].tsx');

it('never takes the whole film store', () => {
  expect(SRC).not.toMatch(/useFilmStore\(\s*\)/);
});

it('asks for its fields through one shallow selector', () => {
  expect(SRC).toMatch(/useFilmStore\(useShallow\(\(st\) => \(\{/);
});

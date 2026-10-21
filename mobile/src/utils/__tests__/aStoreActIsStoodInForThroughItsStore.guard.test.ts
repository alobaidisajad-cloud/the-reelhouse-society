/**
 * aStoreActIsStoodInForThroughItsStore.guard.test.ts — no test spies on a store's act through the
 * state it reads (`jest.spyOn(useDispatch.getState(), 'end')`).
 *
 * A zustand store copies its state into every new state it makes, so a spy put on the state
 * of the moment is carried into all that follow it, and `mockRestore` puts back only the old
 * object. Two such spies (readerScreen, feedScreen) went on standing in for the act in the tests
 * after them: in a random order, a withdrawal there did nothing at all (nightly 2026-10-21). A
 * test stands in for an act through the store (`setState({ end: jest.fn() })`), and puts the store
 * as built back before every test.
 */
import { readFileSync } from 'fs';
import { relative } from 'path';
import { files } from '../../../test-utils/universe';
import { MOBILE } from '../../../test-utils/readCode';

/** Each line of a test file that spies on a store's act through its state, by line number. */
const spiesIn = (text: string): number[] => text.split(/\r?\n/).flatMap((line, i) =>
  (/jest\.spyOn\(\s*use[A-Z]\w*\.getState\(\)/.test(line) ? [i + 1] : []));

it('finds no spy on a store act through its state, in any test', () => {
  // Every test but this one, whose examples are the shape it looks for.
  const tests = files('tests', { ext: ['.ts', '.tsx'] }).filter((f) => f !== __filename);
  expect(tests.length).toBeGreaterThan(400);
  const found = tests.flatMap((f) => spiesIn(readFileSync(f, 'utf8')).map((n) => `${relative(MOBILE, f).split('\\').join('/')}:${n}`));
  expect(found).toEqual([]);
});

it('can say NO: the spy is found, and standing in through the store is not', () => {
  expect(spiesIn("const end = jest.spyOn(useDispatch.getState(), 'end');")).toEqual([1]);
  expect(spiesIn("x\njest.spyOn( useLoungeStore.getState(), 'sendMessage')")).toEqual([2]);
  expect(spiesIn("useDispatch.setState({ end: jest.fn() } as never);")).toEqual([]);
  expect(spiesIn("jest.spyOn(supabase, 'rpc');")).toEqual([]);
});

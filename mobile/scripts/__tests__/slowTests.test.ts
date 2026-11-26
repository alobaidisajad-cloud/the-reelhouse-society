/**
 * slowTests.test.ts — scripts/slow-tests.cjs finds a test over half its time limit while it still passes:
 * the two that failed push gates on 2026-11-25 among them, and no test that cannot run out of its limit.
 */
const slow = require('../slow-tests.cjs') as {
  PAST: { file: string; test: string; ms: number; limit: number }[];
  SHARE: number;
  over: (times: { file: string; test: string; ms: number; limit: number; waits?: boolean | null }[]) => { test: string; ms: number }[];
  readTimes: (text: string) => { file: string; test: string; ms: number; limit: number }[];
};

it('finds both tests that failed the push gates, and none at half its limit or under', () => {
  expect(slow.SHARE).toBe(0.5);
  expect(slow.over(slow.PAST).map((t) => t.test)).toEqual(slow.PAST.map((t) => t.test).reverse());
  const at = (ms: number, waits?: boolean) => ({ file: 'a.test.ts', test: `t${ms}`, ms, limit: 5000, waits });
  expect(slow.over([at(2500), at(2501), at(900)]).map((t) => t.ms)).toEqual([2501]);
});

it('holds a test that waits to its limit, and lets be one that returns at once, which no limit stops', () => {
  const t = { file: 'a.test.ts', test: 'draws', ms: 9000, limit: 5000 };
  expect([slow.over([{ ...t, waits: true }]).length, slow.over([{ ...t, waits: false }]).length, slow.over([{ ...t, waits: null }]).length]).toEqual([1, 0, 1]);
});

it('keeps a test\'s slowest time of a run, and reads only whole lines with a time and a limit', () => {
  const lines = [
    JSON.stringify({ file: 'src/a.test.ts', test: 'one', ms: 1000, limit: 5000 }),
    JSON.stringify({ file: 'src/a.test.ts', test: 'one', ms: 3000, limit: 5000 }),
    JSON.stringify({ file: 'src/a.test.ts', test: 'two', ms: null, limit: 5000 }),
    '{"file":"src/a.test.ts","test":"half writ',
  ].join('\n');
  const times = slow.readTimes(lines);
  expect(times.map((t) => t.ms)).toEqual([1000, 3000]);
  expect(slow.over(times).map((t) => t.ms)).toEqual([3000]);
});

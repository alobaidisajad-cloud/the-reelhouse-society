/**
 * oneCritiqueRow.guard — a critique under a log and in a stack is drawn by one row.
 *
 * The stack page drew its own copy of the log page's critique, and the copy
 * missed the log page's measured fix: each row reached 15pt into the next, so
 * a press at the foot of one critique reached the next member's. Two copies
 * drift; a fix made to one never reaches the other.
 *
 * So a screen that draws a member's critique with its WITHDRAW and its REPORT
 * does it through CritiqueRow, and nowhere else. (The Dispatch's paper sets its
 * critiques in its own type, and says "this critique", not these.)
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readCode } from '@/test-utils/readCode';

const ROOT = path.resolve(__dirname, '../../../..');
const HOME = 'src/components/critique/CritiqueRow.tsx';

/** What only a critique row says: its WITHDRAW's spoken name, and its REPORT's. */
const MARKS = ["'Withdraw your critique'", '"Withdraw your critique"', 'Report this critique by @${'];

// Files not yet committed too: a new copy is caught before it is.
const sources = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src', 'app'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.tsx?$/.test(f) && !/__tests__|\.test\./.test(f));

// As code: a comment that only mentions the row is not a row.
const drawing = (f: string) => {
  const src = readCode(f);
  return MARKS.some((m) => src.includes(m));
};

it('finds the row where it lives (the scan can see)', () => {
  expect(sources).toContain(HOME);
  expect(drawing(HOME)).toBe(true);
});

it('no other screen draws a critique row of its own', () => {
  // The whole app is read, or "none" would be the answer of an empty scan.
  expect(sources.length).toBeGreaterThan(300);
  expect(sources.filter((f) => f !== HOME && drawing(f))).toEqual([]);
});

it('the log and the stack both draw CritiqueRow', () => {
  for (const f of ['src/components/log/LogComments.tsx', 'app/stacks/[id].tsx']) {
    expect(readCode(f)).toMatch(/<CritiqueRow\b/);
  }
});

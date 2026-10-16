/**
 * flakeHistory.test.ts — a test that both passed and failed at one commit is a
 * flake, found across rounds and nights; the history carries from night to night.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const { addNight, flowOutcomes, jestOutcomes, KEEP } = require('../flake-history.cjs') as {
  addNight: (h: object, commit: string, outcomes: [string, boolean][], at: string) => { history: { started: string; commits: string[]; tests: Record<string, Record<string, { passes: number; failures: number }>> }; flakes: string[] };
  flowOutcomes: (dir: string) => [string, boolean][];
  jestOutcomes: (record: object, root: string) => [string, boolean][];
  KEEP: number;
};

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'flakes-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** One round's folder, with Maestro's JUnit report for each flow. */
function round(name: string, flows: Record<string, boolean>) {
  const reports = join(dir, name, 'flow-reports');
  mkdirSync(reports, { recursive: true });
  for (const [flow, passed] of Object.entries(flows)) {
    writeFileSync(join(reports, `${flow}.xml`), `<?xml version='1.0' encoding='UTF-8'?>\n<testsuites>\n  <testsuite name="Test Suite">\n    <testcase id="${flow}" name="${flow}" status="${passed ? 'SUCCESS' : 'ERROR'}">${passed ? '' : '\n      <failure>No visible element found</failure>\n    '}</testcase>\n  </testsuite>\n</testsuites>\n`);
  }
  return join(dir, name);
}

it('reads each flow of a round from its report, and each jest test from its record, skipped ones left out', () => {
  expect(flowOutcomes(round('r1', { auth_flow: true, lobby_wall_flow: false }))).toEqual([['flow:auth_flow', true], ['flow:lobby_wall_flow', false]]);
  const record = { testResults: [{ name: join(dir, 'src', 'a.test.ts'), assertionResults: [
    { fullName: 'a works', status: 'passed' }, { fullName: 'a breaks', status: 'failed' }, { fullName: 'a waits', status: 'pending' }] }] };
  expect(jestOutcomes(record, dir)).toEqual([['jest:src/a.test.ts › a works', true], ['jest:src/a.test.ts › a breaks', false]]);
});

it('names a test that passed in one round and failed in another at the same commit, and no other', () => {
  const outcomes = [round('r1', { a: true, b: false }), round('r2', { a: false, b: false }), round('r3', { a: true, b: false })].flatMap(flowOutcomes);
  const { history, flakes } = addNight({}, 'c1', outcomes, '2026-10-16');
  expect(flakes).toEqual(['flow:a']);
  expect(history.tests['flow:a']).toEqual({ c1: { passes: 2, failures: 1 } });
  // b failed every time: an answer, not a flake.
  expect(history.tests['flow:b']).toEqual({ c1: { passes: 0, failures: 3 } });
  expect(history.started).toBe('2026-10-16');
});

it('carries the history from night to night, a commit seen again adding to its own counts', () => {
  const first = addNight({}, 'c1', [['flow:a', true]], '2026-10-16').history;
  const second = addNight(first, 'c1', [['flow:a', false]], '2026-10-17');
  expect(second.flakes).toEqual(['flow:a']);
  expect(second.history.started).toBe('2026-10-16');
  expect(addNight(second.history, 'c2', [['flow:a', true]], '2026-10-18').flakes).toEqual([]);
});

it(`keeps the newest ${KEEP} commits, and forgets a test seen at none of them`, () => {
  let h = addNight({}, 'old', [['flow:gone', true]], '2026-10-16').history;
  for (let i = 0; i < KEEP; i++) h = addNight(h, `c${i}`, [['flow:a', true]], '2026-10-16').history;
  expect(h.commits).toHaveLength(KEEP);
  expect(h.commits).not.toContain('old');
  expect(h.tests['flow:gone']).toBeUndefined();
});

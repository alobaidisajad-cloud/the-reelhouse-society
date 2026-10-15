/**
 * mergeCoverage.test.ts — a jest run split in parts, its coverage judged as one
 * run, shown to say what jest itself says of the whole run.
 *
 * A small project is written to a temporary folder and tested by this repo's
 * own jest: once whole, with its floors on, and once in two parts (--shard),
 * floors off, each keeping its coverage-final.json, as god_tier_ci.yml runs
 * them. merge-coverage.cjs then reads the two parts. The summary it writes
 * must equal the whole run's to the last count, and its verdict must be
 * jest's own, word for word: when a directory's floor is not met, and when
 * every floor is. The floors are set so that `global` passes only because a
 * directory key takes its files out of it, as jest judges it.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const MOBILE = join(__dirname, '..', '..');
const SCRIPT = join(MOBILE, 'scripts', 'merge-coverage.cjs');
const JEST = join(MOBILE, 'node_modules', 'jest', 'bin', 'jest.js');
// A child jest is its own run, not a worker of this one.
const ENV: NodeJS.ProcessEnv = { ...process.env };
delete ENV.JEST_WORKER_ID;
// Jest colours its words when it can; the escape that starts a colour is character 27.
const COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const plain = (s: string) => s.replace(COLOUR, '');

let root: string;
const write = (path: string, text: string) => {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), text);
};
/** The project's config, with these floors. */
const config = (floors: Record<string, Record<string, number>>) => write('jest.config.js', `module.exports = ${JSON.stringify({
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', 'other/**/*.js'],
  coverageReporters: ['json', 'json-summary'],
  coverageThreshold: floors,
})};\n`);
// Its own cache: the transforms of the jest running this file are not its to read.
const jest = (...args: string[]) => {
  const r = spawnSync(process.execPath, [JEST, '--config', join(root, 'jest.config.js'), '--ci', '-w', '1',
    '--cacheDirectory', join(root, 'cache'), ...args],
    { cwd: root, encoding: 'utf8', env: ENV });
  return { code: r.status, out: plain(`${r.stdout}\n${r.stderr}`) };
};
const merge = (...files: string[]) => {
  const r = spawnSync(process.execPath, [SCRIPT, '--config', join(root, 'jest.config.js'), ...files], { cwd: root, encoding: 'utf8', env: ENV });
  return { code: r.status, out: plain(`${r.stdout}\n${r.stderr}`) };
};
/** Jest's own words for each floor not met. */
const verdicts = (out: string) => out.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('Jest: '));
const summary = (dir: string) => JSON.parse(readFileSync(join(root, dir, 'coverage-summary.json'), 'utf8')) as Record<string, unknown>;

/** Runs the project whole, then in two parts merged; returns both verdicts and summaries. */
function bothWays() {
  const whole = jest('--coverage', '--coverageDirectory', join(root, 'whole'));
  const parts = [1, 2].map((i) => jest(`--shard=${i}/2`, '--coverage', '--coverageThreshold={}', '--coverageReporters=json',
    '--coverageDirectory', join(root, `part-${i}`)));
  expect(parts.map((p) => p.code)).toEqual([0, 0]);
  const merged = merge(join(root, 'part-1', 'coverage-final.json'), join(root, 'part-2', 'coverage-final.json'));
  return { whole, merged, wholeSummary: summary('whole'), mergedSummary: summary('coverage') };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'merge-coverage-'));
  write('src/a/one.js', 'exports.add = (a, b) => a + b;\nexports.sub = (a, b) => a - b;\n');
  write('src/b/two.js', 'exports.sign = (n) => {\n  if (n > 0) return 1;\n  if (n < 0) return -1;\n  return 0;\n};\n');
  write('other/three.js', 'exports.id = (x) => x;\n');
  write('__tests__/one.test.js', "const { add, sub } = require('../src/a/one');\nit('adds and takes away', () => { expect(add(1, 2) - sub(3, 1)).toBe(1); });\n");
  write('__tests__/two.test.js', "const { sign } = require('../src/b/two');\nit('says a positive number is one', () => { expect(sign(5)).toBe(1); });\n");
  write('__tests__/three.test.js', "const { id } = require('../other/three');\nit('gives back what it is given', () => { expect(id(4)).toBe(4); });\n");
});
afterAll(() => { rmSync(root, { recursive: true, force: true }); });

it("says no as jest does when a directory falls below its floor, naming it, and writes the whole run's summary", () => {
  // src/b is half covered; global, holding only other/three.js once the keys take theirs, is whole.
  config({ global: { lines: 100, functions: 100 }, './src/a/': { lines: 100 }, './src/b/': { lines: 60, branches: 50 } });
  const r = bothWays();
  expect(r.whole.code).toBe(1);
  expect(verdicts(r.whole.out)).toEqual([
    'Jest: "./src/b/" coverage threshold for branches (50%) not met: 25%',
    'Jest: "./src/b/" coverage threshold for lines (60%) not met: 50%',
  ]);
  expect({ code: r.merged.code, verdicts: verdicts(r.merged.out) }).toEqual({ code: 1, verdicts: verdicts(r.whole.out) });
  expect(r.merged.out).toContain('The coverage floors, on 2 parts together: NOT met');
  expect(r.mergedSummary).toEqual(r.wholeSummary);
}, 120_000);

it('says yes as jest does when every floor is met', () => {
  config({ global: { lines: 100, functions: 100 }, './src/a/': { lines: 100 }, './src/b/': { lines: 50, branches: 25 } });
  const r = bothWays();
  expect({ code: r.whole.code, verdicts: verdicts(r.whole.out) }).toEqual({ code: 0, verdicts: [] });
  expect({ code: r.merged.code, verdicts: verdicts(r.merged.out) }).toEqual({ code: 0, verdicts: [] });
  expect(r.merged.out).toContain('The coverage floors, on 2 parts together: met');
  expect(r.mergedSummary).toEqual(r.wholeSummary);
}, 120_000);

it('refuses to judge a part that kept no coverage, or a file that is not coverage, by name', () => {
  const missing = merge(join(root, 'part-1', 'coverage-final.json'), join(root, 'part-9', 'coverage-final.json'));
  expect({ code: missing.code, out: missing.out.trim() }).toEqual({
    code: 2, out: `✗ ${join(root, 'part-9', 'coverage-final.json')} does not exist: that part kept no coverage`,
  });
  write('not-coverage.json', '[1, 2]');
  const wrong = merge(join(root, 'not-coverage.json'));
  expect({ code: wrong.code, out: wrong.out.trim() }).toEqual({ code: 2, out: `✗ ${join(root, 'not-coverage.json')} is not a coverage-final.json` });
  const none = merge();
  expect(none.code).toBe(2);
}, 30_000);

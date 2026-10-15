/**
 * jestShards.test.ts — the parts of a split jest run, read together, and shown
 * saying no to each way a split run falls short.
 *
 * jest-shards.cjs is run as god_tier_ci.yml's fan-in jobs run it: from the
 * folder jest runs in, on a folder of the parts' downloaded records (one folder
 * per part), with jest's own list of its test files.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'jest-shards.cjs');
// Each case starts Node once or more, which a busy machine can take seconds to do.
jest.setTimeout(30_000);
const NAME = 'jest-shard-{i}';
const FILES = ['src/a.test.ts', 'src/b.test.ts', 'app/c.test.tsx', 'app/d.test.tsx'];
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'jest-shards-'));
  writeFileSync(join(root, 'tests.json'), JSON.stringify(FILES.map((f) => join(root, f))));
  writeFileSync(join(root, 'require.txt'), '# the files whose controls must be measured\nsrc/A.tsx\nsrc/B.tsx\n');
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

/** One part's records: per run its test files (a string is written as it is). Undefined keeps none. */
type Kept = { runs?: Record<string, string[] | string>; sites?: string[] };
function part(i: number, kept: Kept | undefined) {
  if (!kept) return;
  const folder = join(root, 'parts', NAME.replace('{i}', String(i)));
  mkdirSync(folder, { recursive: true });
  for (const [run, files] of Object.entries(kept.runs ?? {})) {
    const record = typeof files === 'string' ? files : JSON.stringify({ testResults: files.map((f) => ({ name: join(root, f) })) });
    writeFileSync(join(folder, run), record);
  }
  if (kept.sites) writeFileSync(join(folder, 'sites.txt'), kept.sites.map((s) => `${s}\n`).join(''));
}
function verdict(kept: (Kept | undefined)[], extra: string[] = [], runs = 'utc.json,tz.json') {
  kept.forEach((k, i) => part(i + 1, k));
  mkdirSync(join(root, 'parts'), { recursive: true });
  const r = spawnSync(process.execPath, [SCRIPT, join(root, 'parts'), '--shards', String(kept.length), '--name', NAME,
    '--tests', join(root, 'tests.json'), '--runs', runs, ...extra], { cwd: root, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr, problems: r.stdout.split('\n').filter((l) => l.startsWith('✗ ')) };
}
const both = (files: string[]) => ({ 'utc.json': files, 'tz.json': files });
const REQUIRE = ['--require', 'require.txt', '--sites', 'sites.txt'];

it('passes parts that between them ran every listed file once, in every run', () => {
  const r = verdict([{ runs: both(['src/a.test.ts', 'app/d.test.tsx']) }, { runs: both(['src/b.test.ts', 'app/c.test.tsx']) }]);
  expect({ code: r.code, problems: r.problems }).toEqual({ code: 0, problems: [] });
  expect(r.out).toContain('jest lists 4 test files');
  expect(r.out).toContain('part 2/2: 2 test files in utc.json, 2 test files in tz.json');
  expect(r.out).toContain('every test file ran in exactly one of 2 parts');
});

it('says no to a file that ran in two parts, naming both', () => {
  const r = verdict([{ runs: both(['src/a.test.ts', 'src/b.test.ts']) }, { runs: both(['src/b.test.ts', 'app/c.test.tsx', 'app/d.test.tsx']) }]);
  expect(r.code).toBe(1);
  expect(r.problems).toEqual([
    '✗ src/b.test.ts ran in parts 1, 2 of utc.json: a file runs in one',
    '✗ src/b.test.ts ran in parts 1, 2 of tz.json: a file runs in one',
  ]);
});

it('says no to a listed file that ran in no part, in the one run that left it out', () => {
  const r = verdict([
    { runs: { 'utc.json': ['src/a.test.ts', 'src/b.test.ts'], 'tz.json': ['src/a.test.ts'] } },
    { runs: both(['app/c.test.tsx', 'app/d.test.tsx']) },
  ]);
  expect(r.code).toBe(1);
  expect(r.problems).toEqual(['✗ src/b.test.ts ran in no part of tz.json']);
});

it('says no to a file a part ran that jest does not list: the parts ran another tree', () => {
  const r = verdict([{ runs: both(['src/a.test.ts', 'src/b.test.ts']) }, { runs: both(['app/c.test.tsx', 'app/d.test.tsx', 'app/e.test.tsx']) }], [], 'utc.json');
  expect(r.code).toBe(1);
  expect(r.problems).toEqual(['✗ app/e.test.tsx ran in part 2 of utc.json, but jest does not list it: the parts ran another tree']);
});

it('says no to a part that kept nothing, and to one whose record is missing or broken, by number', () => {
  const r = verdict([
    { runs: both(FILES) },
    undefined,
    { runs: { 'utc.json': '{"testResults": [' } },
  ]);
  expect(r.code).toBe(1);
  expect(r.problems).toEqual([
    '✗ part 2/3 kept nothing: it never ran, or ended before it kept its records',
    '✗ part 3/3 wrote no record of utc.json: its jest did not finish',
    '✗ part 3/3 wrote no record of tz.json: its jest did not finish',
  ]);
  expect(r.out).toContain('part 3/3: no record of utc.json, no record of tz.json');
});

it('holds the required controls over every part together: none needs to have measured them all', () => {
  const r = verdict([
    { runs: both(['src/a.test.ts', 'src/b.test.ts']), sites: ['src/A.tsx:12', 'src/Other.tsx:3'] },
    { runs: both(['app/c.test.tsx', 'app/d.test.tsx']), sites: ['src/B.tsx:40'] },
  ], REQUIRE);
  expect({ code: r.code, problems: r.problems }).toEqual({ code: 0, problems: [] });
  expect(r.out).toContain('part 1/2: 2 test files in utc.json, 2 test files in tz.json, 2 controls measured');
  expect(r.out).toContain('and every required control was measured');
});

it('says no to a required file no part measured, and to a part that wrote no list of what it measured', () => {
  const lost = verdict([
    { runs: both(['src/a.test.ts', 'src/b.test.ts']), sites: ['src/A.tsx:12'] },
    { runs: both(['app/c.test.tsx', 'app/d.test.tsx']), sites: [] },
  ], REQUIRE);
  expect(lost.code).toBe(1);
  expect(lost.problems).toEqual(["✗ LOST  src/B.tsx — no control of it was measured beside a neighbour, on any part's screens"]);

  rmSync(join(root, 'parts'), { recursive: true, force: true });
  const unlisted = verdict([
    { runs: both(['src/a.test.ts', 'src/b.test.ts']), sites: ['src/A.tsx:12'] },
    { runs: both(['app/c.test.tsx', 'app/d.test.tsx']) },
  ], REQUIRE);
  expect(unlisted.code).toBe(1);
  expect(unlisted.problems).toEqual(['✗ part 2/2 wrote no list of the controls it measured']);
  expect(unlisted.out).toContain('(the required controls are not judged: a part wrote no list of what it measured)');
});

it('refuses to judge with no list of test files, or an empty one: a run of nothing would pass', () => {
  writeFileSync(join(root, 'tests.json'), '[]');
  const empty = verdict([{ runs: both([]) }]);
  expect({ code: empty.code, err: empty.err.trim() }).toEqual({ code: 2, err: `✗ ${join(root, 'tests.json')} is not jest's list of its test files, or lists none` });
  const usage = spawnSync(process.execPath, [SCRIPT, join(root, 'parts'), '--shards', '2', '--name', 'no-template',
    '--tests', join(root, 'tests.json'), '--runs', 'utc.json'], { cwd: root, encoding: 'utf8' });
  expect(usage.status).toBe(2);
  const half = spawnSync(process.execPath, [SCRIPT, join(root, 'parts'), '--shards', '2', '--name', NAME,
    '--tests', join(root, 'tests.json'), '--runs', 'utc.json', '--require', 'require.txt'], { cwd: root, encoding: 'utf8' });
  expect(half.status).toBe(2);
});

it("holds each zone's record to that zone's files: the tooling's tests run in UTC alone (scripts/test-timezones.js)", () => {
  writeFileSync(join(root, 'tests.json'), JSON.stringify([...FILES, 'e2e/__tests__/x.test.ts'].map((f) => join(root, f))));
  const runs = 'jest-UTC.json,jest-Asia-Tokyo.json';
  const app = ['src/a.test.ts', 'src/b.test.ts', 'app/c.test.tsx', 'app/d.test.tsx'];
  const zoned = (tokyo: string[]) => verdict([{ runs: { 'jest-UTC.json': [...app, 'e2e/__tests__/x.test.ts'], 'jest-Asia-Tokyo.json': tokyo } }], [], runs);
  expect(zoned(app).problems).toEqual([]);
  expect(zoned([...app, 'e2e/__tests__/x.test.ts']).problems).toEqual(['✗ e2e/__tests__/x.test.ts ran in part 1 of jest-Asia-Tokyo.json, which leaves it out']);
  expect(zoned(app.slice(1)).problems).toEqual(['✗ src/a.test.ts ran in no part of jest-Asia-Tokyo.json']);
});

/**
 * hermesSuites.test.ts — the pure suites run on the phone's own runtime, on every push (WORKLIST P4.52).
 * ─────────────────────────────────────────────────────────────────────────────
 * scripts/hermes-suites.cjs bundles each src/utils suite that needs nothing of
 * Node, and god_tier_ci.yml's hermes-suites job runs them on a Hermes built from
 * the commit React Native pins. This holds the job to that (a job gone, or one
 * that builds another Hermes, fails here), holds the reader that sorts the suites
 * to its reasons, and runs test-utils/hermesHarness.js in a context whose timers
 * are the Hermes CLI's, to show the harness fails what jest fails.
 */
import { existsSync, readFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { files } from '@/test-utils/universe';
import vm from 'vm';

const { parse } = require(require.resolve('yaml/package.json').replace(/package\.json$/, 'dist/index.js')) as typeof import('yaml');
const { staticReason, MUST_RUN, REACHES_NATIVE } = require('../hermes-suites.cjs') as {
  staticReason: (file: string, text: string) => string | null;
  MUST_RUN: string[];
  REACHES_NATIVE: string[];
};

const MOBILE = join(__dirname, '..', '..');
const SUITES = join(MOBILE, 'src/utils/__tests__');
type Step = { name?: string; run?: string; uses?: string; with?: Record<string, string> };
type Workflow = { on: { push?: { branches?: string[] } }; jobs: Record<string, { env?: Record<string, string>; steps: Step[] }> };
const god = parse(readFileSync(join(MOBILE, '..', '.github/workflows/god_tier_ci.yml'), 'utf8')) as Workflow;
const job = god.jobs['hermes-suites'];
const runs = () => job.steps.map((s) => s.run ?? '').join('\n');

describe('the job', () => {
  it('runs on every push to main', () => {
    expect(god.on.push?.branches).toContain('main');
    expect(job).toBeDefined();
  });

  it('builds the Hermes React Native pins, from the tag\'s commit, and keeps it by that commit', () => {
    const pinned = readFileSync(join(MOBILE, 'node_modules/react-native/sdks/.hermesv1version'), 'utf8').trim();
    expect(job.env?.HERMES_TAG).toBe(pinned);
    expect(job.env?.HERMES_COMMIT).toMatch(/^[0-9a-f]{40}$/);
    expect(runs()).toContain('[ "$pinned" = "$HERMES_TAG" ]');
    expect(runs()).toContain('fetch -q --depth 1 https://github.com/facebook/hermes.git "$HERMES_COMMIT"');
    const kept = job.steps.filter((s) => /^actions\/cache\/(restore|save)@/.test(s.uses ?? '')).map((s) => s.with?.key);
    expect(kept).toEqual(['hermes-cli-${{ env.HERMES_COMMIT }}-ubuntu-24.04-intl', 'hermes-cli-${{ env.HERMES_COMMIT }}-ubuntu-24.04-intl']);
  });

  it('bundles the suites, runs them with the app\'s own hermesc, and proves the runtime bare', () => {
    const hermesc = 'node_modules/hermes-compiler/hermesc/linux64-bin/hermesc';
    expect(existsSync(join(MOBILE, hermesc))).toBe(true);
    expect(runs()).toContain('node scripts/hermes-suites.cjs bundle "$RUNNER_TEMP/hermes-suites"\n');
    expect(runs()).toContain(`node scripts/hermes-suites.cjs run "$RUNNER_TEMP/hermes-suites" --hermes ~/hermes-cli/hermes \\\n  --hermesc ${hermesc}`);
    expect(runs()).toContain('node scripts/hermes-suites.cjs bundle "$RUNNER_TEMP/hermes-bare" --bare\n');
    expect(runs()).toContain(`node scripts/hermes-suites.cjs run "$RUNNER_TEMP/hermes-bare" --bare --hermes ~/hermes-cli/hermes \\\n  --hermesc ${hermesc}`);
  });
});

describe('which suites run', () => {
  const suites = files('appTests', { under: ['src/utils/__tests__'] })
    .filter((f) => resolve(dirname(f)) === resolve(SUITES) && /\.test\.tsx?$/.test(f)).map((f) => basename(f));
  const reasonOf = (f: string) => staticReason(join(SUITES, f), readFileSync(join(SUITES, f), 'utf8'));
  const nameOf = (f: string) => f.replace(/\.test\.tsx?$/, '');

  it('withTimeout\'s suite is tried, and is never one let off for the native modules', () => {
    expect(MUST_RUN).toEqual(['withTimeout']);
    expect(reasonOf('withTimeout.test.ts')).toBeNull();
    expect(REACHES_NATIVE.filter((s) => MUST_RUN.includes(s))).toEqual([]);
  });

  it('each suite let off for the native modules is one the reader tries', () => {
    expect(REACHES_NATIVE.length).toBeGreaterThan(0);
    for (const name of REACHES_NATIVE) {
      const file = suites.find((f) => nameOf(f) === name);
      expect(`${name}: ${file ? reasonOf(file) ?? 'tried' : 'NO SUCH SUITE'}`).toBe(`${name}: tried`);
    }
  });

  it('the suites tried are a good share of the folder, and every one refused says why', () => {
    const tried = suites.filter((f) => reasonOf(f) === null);
    expect(tried.length).toBeGreaterThanOrEqual(45);
    const reasons = suites.map(reasonOf).filter((r): r is string => r !== null);
    expect(reasons.filter((r) => !/^(draws a screen|uses Node's |uses jest's module registry|sets or reads __DEV__|jest\.mock|calls jest\.mock|names a jest\.)/.test(r))).toEqual([]);
  });
});

describe('the reader says NO', () => {
  const reason = (text: string, file = 'src/utils/__tests__/planted.test.ts') => staticReason(join(MOBILE, file), text);

  it('to Node, a drawn screen, jest\'s registry and development\'s own code', () => {
    expect(reason("import { readFileSync } from 'fs';")).toBe("uses Node's 'fs'");
    expect(reason("const p = require('node:path');")).toBe("uses Node's 'node:path'");
    expect(reason('const here = process.cwd();')).toBe("uses Node's process.cwd");
    expect(reason("it('x', () => {});", 'src/utils/__tests__/planted.test.tsx')).toBe('draws a screen');
    expect(reason('beforeEach(() => jest.resetModules());')).toBe("uses jest's module registry (jest.resetModules)");
    expect(reason('const was = __DEV__;')).toBe('sets or reads __DEV__, which the release bundle writes in as false');
  });

  it('to a mock it cannot make, and yes to one it can', () => {
    expect(reason("jest.mock('../logger');")).toBe("jest.mock('../logger') without a factory (jest's automock)");
    expect(reason("describe('d', () => { jest.mock('../logger', () => ({})); });")).toBe("calls jest.mock inside a test (jest's module registry)");
    expect(reason("const mockSent = [];\njest.mock('../lib/supabase', () => ({ send: (x) => mockSent.push(x) }));"))
      .toBe("jest.mock('../lib/supabase')'s factory reads the suite's own mockSent");
    expect(reason("import { sent } from './x';\njest.mock('../a', () => ({ f: () => sent }));")).toBe("jest.mock('../a')'s factory reads the suite's own sent");
    // A key or a property that only shares a name is not a read.
    expect(reason("const warn = 1;\njest.mock('../logger', () => ({ logger: { warn: jest.fn() }, other: console.warn }));")).toBeNull();
    expect(reason("jest.mock('../logger', () => ({ ...jest.requireActual('../logger'), alert: jest.fn() }));")).toBeNull();
  });
});

/**
 * The harness, run in a context of its own with the Hermes CLI's timers: setTimeout
 * runs each task once nothing else waits, in order, whatever its delay, and there is
 * no setInterval. Each test hands it a suite and reads back the lines it printed.
 */
async function harness(suite: string): Promise<string[]> {
  const lines: string[] = [];
  const queued = new Set<number>();
  let id = 0;
  const context = vm.createContext({
    print: (line: string) => lines.push(line),
    setTimeout: (fn: () => void) => { const n = ++id; queued.add(n); setImmediate(() => { if (queued.delete(n)) fn(); }); return n; },
    clearTimeout: (n: number) => { queued.delete(n); },
  });
  const code = readFileSync(join(MOBILE, 'test-utils/hermesHarness.js'), 'utf8');
  (vm.runInContext(`(function (require) {\n${code}\n})`, context) as (r: NodeRequire) => void)(require);
  (vm.runInContext(`(function (require) {\n${suite}\n__runSuite('planted', null);\n})`, context) as (r: NodeRequire) => void)(require);
  for (let waited = 0; !lines.some((l) => l.startsWith('SUITE ')) && waited < 200; waited += 1) await new Promise((r) => setTimeout(r, 10));
  return lines;
}

describe('the harness fails what jest fails', () => {
  it('passes a test that asserts, fails one that throws, and names each', async () => {
    const lines = await harness("describe('d', () => { it('holds', () => expect(1).toBe(1)); it('breaks', () => expect(1).toBe(2)); });");
    expect(lines[0]).toBe('PASS planted :: d > holds');
    expect(lines[1]).toMatch(/^FAIL planted :: d > breaks :: Error: expect\(received\)\.toBe\(expected\)/);
    expect(lines[2]).toBe('SUITE planted passed=1 failed=1 skipped=0');
  });

  it('fails a test that asserts nothing, as jest.afterEnv.ts fails it', async () => {
    const lines = await harness("it('does nothing', () => {});");
    expect(lines).toEqual([
      'FAIL planted :: does nothing :: Error: this test asserted nothing: no expect() and no fast-check property ran',
      'SUITE planted passed=0 failed=1 skipped=0',
    ]);
  });

  it('runs a table, its hooks in order, an async test and one that takes done', async () => {
    const lines = await harness([
      'const seen = [];',
      "beforeEach(() => seen.push('before'));",
      "afterEach(() => seen.push('after'));",
      "it.each([[1, 2], [2, 3]])('%i is one short of %i', (a, b) => expect(a + 1).toBe(b));",
      "it('waits', async () => { await Promise.resolve(); expect(seen).toEqual(['before', 'after', 'before', 'after', 'before']); });",
      "it('calls done', (done) => { setTimeout(() => { expect(true).toBe(true); done(); }, 5); });",
    ].join('\n'));
    expect(lines).toEqual([
      'PASS planted :: 1 is one short of 2',
      'PASS planted :: 2 is one short of 3',
      'PASS planted :: waits',
      'PASS planted :: calls done',
      'SUITE planted passed=4 failed=0 skipped=0',
    ]);
  });

  it('keeps each timer\'s delay, which the CLI\'s own setTimeout does not', async () => {
    const lines = await harness([
      "it('runs the earlier first', async () => {",
      '  const seen = [];',
      '  const start = Date.now();',
      '  await new Promise((done) => { setTimeout(() => seen.push(30), 30); setTimeout(() => seen.push(10), 10); setTimeout(done, 40); });',
      '  expect(seen).toEqual([10, 30]);',
      '  expect(Date.now() - start).toBeGreaterThanOrEqual(40);',
      '});',
      "it('repeats an interval until cleared, and runs no cleared timer', async () => {",
      '  let ticks = 0;',
      '  const every = setInterval(() => { ticks += 1; }, 5);',
      '  const never = setTimeout(() => { ticks = -100; }, 1);',
      '  clearTimeout(never);',
      '  await new Promise((done) => setTimeout(done, 28));',
      '  clearInterval(every);',
      '  expect(ticks).toBeGreaterThanOrEqual(4);',
      '});',
    ].join('\n'));
    expect(lines).toEqual([
      'PASS planted :: runs the earlier first',
      'PASS planted :: repeats an interval until cleared, and runs no cleared timer',
      'SUITE planted passed=2 failed=0 skipped=0',
    ]);
  });

  it('gives a suite jest\'s fake clock, and a property test counts as an assertion', async () => {
    const lines = await harness([
      "const fc = require('fast-check');",
      "it('moves the clock', () => { jest.useFakeTimers(); let rang = false; setTimeout(() => { rang = true; }, 1000); jest.advanceTimersByTime(1000); jest.useRealTimers(); expect(rang).toBe(true); });",
      "it('holds a property', () => { fc.assert(fc.property(fc.integer(), (n) => n + 0 === n)); });",
    ].join('\n'));
    expect(lines).toEqual(['PASS planted :: moves the clock', 'PASS planted :: holds a property', 'SUITE planted passed=2 failed=0 skipped=0']);
  });

  it('tells a suite that could not load, by name', async () => {
    const lines: string[] = [];
    const context = vm.createContext({ print: (line: string) => lines.push(line), setTimeout: (fn: () => void) => setImmediate(fn), clearTimeout: () => {} });
    const code = readFileSync(join(MOBILE, 'test-utils/hermesHarness.js'), 'utf8');
    (vm.runInContext(`(function (require) {\n${code}\n})`, context) as (r: NodeRequire) => void)(require);
    vm.runInContext("__runSuite('planted', new ReferenceError(\"Property 'AbortController' doesn't exist\"));", context);
    expect(lines).toEqual([
      "FAIL planted :: (loading the suite) :: ReferenceError: Property 'AbortController' doesn't exist",
      'SUITE planted passed=0 failed=1 skipped=0',
    ]);
  });
});

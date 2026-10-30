/**
 * Stryker's logic files (register/stryker.yaml, WORKLIST P0.70), held to the register: every file the
 * plan names is listed and there, each with its own tests, which really ask it; the config reads the
 * list; every equivalent names a listed file and says why. The judge of each file's report
 * (scripts/stryker-files.cjs) is asked directly.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';

const MOBILE = join(__dirname, '..', '..', '..');
const yaml = require(require.resolve('yaml/package.json').replace(/package\.json$/, 'dist/index.js')) as typeof import('yaml');
const { argumentsFault, judge, STRYKER_ZONE } = require('../../../scripts/stryker-files.cjs') as {
  argumentsFault: (argv: string[]) => string | null;
  STRYKER_ZONE: string;
  judge: (file: string, report: unknown, equivalents: Equivalent[], floor: number) =>
    { score: number | null; killed?: number; survived?: number; equivalent?: number; stale?: Equivalent[]; fault: string | null };
};
type Equivalent = { file: string; code: string; at: number; mutator: string; replacement: string; why: string };
const LIST = yaml.parse(readFileSync(join(MOBILE, 'register', 'stryker.yaml'), 'utf8')) as { floor: number; files: { file: string; tests: string[] }[] };
const EQUIVALENTS_FILE = join(MOBILE, 'register', 'stryker-equivalents.yaml');

/** WORKLIST P0.70's list, as the plan names it; standing.ts's two sentences are refusedForStanding.ts's now. */
const PLANNED = [
  'src/utils/text.ts', 'src/utils/sanitizeInput.ts', 'src/lib/queryPolicy.ts', 'src/utils/offlineQueue.ts',
  'src/utils/mutationExecutor.ts', 'src/utils/tier.ts', 'src/utils/authSignals.ts', 'src/utils/standing.ts', 'src/utils/refusedForStanding.ts',
  'src/utils/timeAgo.ts', 'src/components/dispatch/paper/paperMetrics.ts', 'supabase/functions/revenuecat-webhook/decide.ts',
  'supabase/functions/_shared/storeRecord.ts', 'src/utils/keysetCursor.ts', 'src/utils/searchPattern.ts', 'src/hooks/useClearance.ts',
];

it('lists every file the plan names, each there, at a floor of 90%', () => {
  expect(LIST.floor).toBe(90);
  expect(LIST.files.map((f) => f.file).sort()).toEqual([...PLANNED].sort());
  expect(LIST.files.filter((f) => !existsSync(join(MOBILE, f.file))).map((f) => f.file)).toEqual([]);
});

it('gives each its own tests, each there and asking the file itself', () => {
  const strip = (p: string) => p.replace(/\.(tsx?|jsx?)$/, '').split('\\').join('/');
  const wrong = LIST.files.flatMap(({ file, tests }) => {
    if (!tests?.length) return [`${file}: no tests`];
    return tests.flatMap((t) => {
      if (!existsSync(join(MOBILE, t))) return [`${file}: ${t} is not there`];
      const text = readFileSync(join(MOBILE, t), 'utf8');
      const asks = [...text.matchAll(/(?:from\s+|require\(|requireActual\()\s*['"]([^'"]+)['"]/g)].some((m) => {
        const spec = m[1] ?? '';
        const at = spec.startsWith('@/') ? spec.slice(2) : spec.startsWith('.') ? relative(MOBILE, join(MOBILE, dirname(t), spec)) : null;
        return at !== null && strip(at) === strip(file);
      });
      return asks ? [] : [`${file}: ${t} never imports it`];
    });
  });
  expect(wrong).toEqual([]);
});

it('is the list the config runs, file by file', () => {
  const config = readFileSync(join(MOBILE, 'stryker.config.mjs'), 'utf8');
  expect(config).toContain("new URL('./register/stryker.yaml', import.meta.url)");
  expect(config).toMatch(/mutate: \[entry\.file\]/);
  expect(config).toMatch(/testMatch: entry\.tests\.map/);
  expect(config).toMatch(/enableFindRelatedTests: false/);
});

it('runs every mutant every time, never a verdict kept from a run before', () => {
  const config = readFileSync(join(MOBILE, 'stryker.config.mjs'), 'utf8');
  expect(config).toMatch(/^ {2}incremental: false,$/m);
  expect(config).not.toMatch(/incrementalFile/);
  const nightly = readFileSync(join(MOBILE, '..', '.github', 'workflows', 'nightly.yml'), 'utf8');
  const job = nightly.slice(nightly.indexOf('\n  stryker:'), nightly.indexOf('\n  flake-history:'));
  expect(job).toContain('scripts/stryker-files.cjs');
  expect(job).not.toMatch(/actions\/cache|--incremental/);
});

it('writes every equivalent against a listed file, with why no test can tell it apart', () => {
  const equivalents = existsSync(EQUIVALENTS_FILE) ? (yaml.parse(readFileSync(EQUIVALENTS_FILE, 'utf8')) as { equivalents?: Equivalent[] }).equivalents ?? [] : [];
  const files = LIST.files.map((f) => f.file);
  expect(equivalents.filter((e) => !files.includes(e.file) || !e.code || !Number.isInteger(e.at) || e.at < 1 || !e.mutator || e.replacement === undefined || (e.why ?? '').length < 30)).toEqual([]);
});

it('names by each equivalent code its file still holds: one whose code changed is judged again before a push, not at night', () => {
  const equivalents = (yaml.parse(readFileSync(EQUIVALENTS_FILE, 'utf8')) as { equivalents: Equivalent[] }).equivalents;
  const held = (e: Equivalent) => readFileSync(join(MOBILE, e.file), 'utf8').split('\n').some((l) => l.trim() === e.code && l.trim().length >= e.at);
  expect(equivalents.filter((e) => !held(e)).map((e) => `${e.file}: ${e.code}`)).toEqual([]);
});

it('keeps the tests\' time behind UTC all year, where a calendar date read as UTC midnight is the day before', () => {
  const dayThere = (month: number) => new Intl.DateTimeFormat('en-US', { timeZone: STRYKER_ZONE, day: 'numeric' })
    .format(new Date(Date.UTC(2026, month, 15)));
  expect([dayThere(0), dayThere(6)]).toEqual(['14', '14']);
});

it('refuses a mistyped option or one without its value, so neither starts the run of every file', () => {
  expect([[], ['--judge'], ['--only', 'src/a.ts,src/b.ts', '--judge'], ['--part', '2/3', '--results', 'out.json']].map(argumentsFault))
    .toEqual([null, null, null, null]);
  expect(argumentsFault(['--help'])).toBe('unknown argument --help (the options: --only, --part, --results, --judge)');
  expect(argumentsFault(['src/utils/text.ts'])).toMatch(/^unknown argument src\/utils\/text\.ts /);
  expect([['--only'], ['--part', '--judge'], ['--judge', '--results']].map(argumentsFault))
    .toEqual(['--only wants a value', '--part wants a value', '--results wants a value']);
});

describe('the judge of a file\'s report says NO', () => {
  const mutant = (status: string, line = 1, mutatorName = 'EqualityOperator', replacement = 'a !== b', column = 1) =>
    ({ status, mutatorName, replacement, location: { start: { line, column } } });
  // Line 5 holds the code the equivalents below name, indented; line 9 holds it again, unindented.
  const SOURCE = ['', '', '', '', '    a === b && c === d', '', '', '', 'a === b && c === d'].join('\n');
  const report = (...mutants: ReturnType<typeof mutant>[]) => ({ files: { 'src/x.ts': { mutants, source: SOURCE } } });
  const eqAt = (at: number) => ({ file: 'src/x.ts', code: 'a === b && c === d', at, mutator: 'EqualityOperator', replacement: 'a !== b', why: 'x' });

  it('scores the killed and timed out out of all it could have, and passes at the floor', () => {
    const r = judge('src/x.ts', report(...Array(9).fill(mutant('Killed')), mutant('Survived'), mutant('CompileError')), [], 90);
    expect(r).toMatchObject({ score: 90, killed: 9, survived: 1, fault: null });
  });

  it('to a file under the floor, an untested line counted as a survivor', () => {
    const r = judge('src/x.ts', report(...Array(8).fill(mutant('Killed')), mutant('Timeout'), mutant('NoCoverage', 4), mutant('Survived', 5)), [], 90);
    expect(r.fault).toBe('81.81% is under 90%');
  });

  it('leaves out a survivor written as equivalent, and fails an equivalent that names none', () => {
    const eq = eqAt(1);
    const r = judge('src/x.ts', report(...Array(9).fill(mutant('Killed')), mutant('Survived', 5, 'EqualityOperator', 'a !== b', 5)), [eq], 90);
    expect(r).toMatchObject({ score: 100, equivalent: 1, fault: null });
    const stale = judge('src/x.ts', report(...Array(9).fill(mutant('Killed'))), [eq], 90);
    expect(stale.fault).toBe('1 equivalent(s) name no survivor');
  });

  it('excuses only the mutant at its own column: the same change elsewhere on the line still counts', () => {
    const r = judge('src/x.ts', report(...Array(8).fill(mutant('Killed')), mutant('Survived', 5, 'EqualityOperator', 'a !== b', 5), mutant('Survived', 5, 'EqualityOperator', 'a !== b', 15)), [eqAt(1)], 90);
    expect(r).toMatchObject({ equivalent: 1, survived: 1, fault: '88.88% is under 90%' });
  });

  it('keeps naming a survivor whose line moved, by its code, and never one on a line of other code', () => {
    // The code is on line 9 now, unindented: the column there is 1, as 5 was under four spaces.
    const moved = judge('src/x.ts', report(...Array(9).fill(mutant('Killed')), mutant('Survived', 9, 'EqualityOperator', 'a !== b', 1)), [eqAt(1)], 90);
    expect(moved).toMatchObject({ score: 100, equivalent: 1, fault: null });
    const elsewhere = judge('src/x.ts', report(...Array(9).fill(mutant('Killed')), mutant('Survived', 2, 'EqualityOperator', 'a !== b', 1)), [eqAt(1)], 90);
    expect(elsewhere).toMatchObject({ equivalent: 0, survived: 1, fault: '1 equivalent(s) name no survivor' });
  });

  it('to a file with no report', () => {
    expect(judge('src/y.ts', report(mutant('Killed')), [], 90).fault).toBe('no report for it');
  });
});

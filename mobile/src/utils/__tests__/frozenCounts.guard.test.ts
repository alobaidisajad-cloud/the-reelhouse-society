/**
 * Frozen counts: every class with a finder is held at an exact count in every
 * file, and a count may only fall (scripts/frozen-counts.cjs).
 * ─────────────────────────────────────────────────────────────────────────────
 * Here: the baseline is whole and the register carries its totals; the rules
 * refuse a count that rose, a count that fell with its baseline left standing,
 * and a baseline raised by hand since the push's base; the tools' output is read
 * so that a tool that broke is never a count of zero; and each typed finder,
 * run for real, counts the cases planted for it. The whole tree is measured in
 * CI and before a push, not here (it takes a minute and a half).
 */
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const MOBILE = join(__dirname, '..', '..', '..');
const ROOT = join(MOBILE, '..');
type Counts = Record<string, Record<string, number>>;
type Change = { check: string; file: string; was: number; now: number };
const frozen = require('../../../scripts/frozen-counts.cjs') as {
  CHECKS: string[];
  CLASSES: Record<string, string[]>;
  baseFaults: (then: Counts, now: Counts, renamedFrom: Record<string, string>) => Change[];
  checksTouchedBy: (paths: string[]) => string[];
  classTotals: (b: Counts) => Record<string, number>;
  compare: (baseline: Counts, measured: Counts) => { rose: Change[]; fell: Change[] };
  denoCheckCounts: (text: string, status: number) => Record<string, number>;
  denoLintCounts: (json: string) => Record<string, number>;
  readBaseline: () => Counts;
  shapeFaults: (b: Counts) => string[];
  tscCounts: (text: string, status: number, cwd: string) => Record<string, number>;
};
const { readCommitted } = require('../../../scripts/register.cjs') as { readCommitted: () => { classes: { id: string; count: number }[] } };

const BASELINE = frozen.readBaseline();

describe('the baseline', () => {
  it('holds the five checks, each count a whole number above 0, with cases in it', () => {
    expect(frozen.shapeFaults(BASELINE)).toEqual([]);
    expect(Object.keys(BASELINE).sort()).toEqual([...frozen.CHECKS].sort());
    expect(Object.values(frozen.classTotals(BASELINE)).every((n) => n > 0)).toBe(true);
  });

  it('names only files that exist', () => {
    const files = Object.values(BASELINE).flatMap((f) => Object.keys(f));
    expect(files.filter((f) => !existsSync(join(ROOT, f)))).toEqual([]);
  });

  it('is what the register says each class counts', () => {
    const register = new Map(readCommitted().classes.map((c) => [c.id, c.count]));
    const totals = frozen.classTotals(BASELINE);
    expect(Object.keys(totals).map((id) => [id, register.get(id)])).toEqual(Object.entries(totals));
  });
});

describe('the rules say NO', () => {
  const was = { 'floating-promise': { 'mobile/a.ts': 2, 'mobile/b.ts': 1 } };

  it('to a count that rose, and to a case in a file the baseline does not name', () => {
    const { rose, fell } = frozen.compare(was, { 'floating-promise': { 'mobile/a.ts': 3, 'mobile/b.ts': 1, 'mobile/new.ts': 1 } });
    expect(rose).toEqual([
      { check: 'floating-promise', file: 'mobile/a.ts', was: 2, now: 3 },
      { check: 'floating-promise', file: 'mobile/new.ts', was: 0, now: 1 },
    ]);
    expect(fell).toEqual([]);
  });

  it('to a count that fell while its baseline stands, a file gone included', () => {
    const { rose, fell } = frozen.compare(was, { 'floating-promise': { 'mobile/a.ts': 1 } });
    expect(rose).toEqual([]);
    expect(fell).toEqual([
      { check: 'floating-promise', file: 'mobile/a.ts', was: 2, now: 1 },
      { check: 'floating-promise', file: 'mobile/b.ts', was: 1, now: 0 },
    ]);
    expect(frozen.compare(was, { 'floating-promise': { 'mobile/a.ts': 2, 'mobile/b.ts': 1 } })).toEqual({ rose: [], fell: [] });
  });

  it('to a baseline raised since the base, or moved to a file it was not in; a rename keeps its allowance', () => {
    expect(frozen.baseFaults(was, { 'floating-promise': { 'mobile/a.ts': 3 } }, {})).toEqual([{ check: 'floating-promise', file: 'mobile/a.ts', was: 2, now: 3 }]);
    expect(frozen.baseFaults(was, { 'floating-promise': { 'mobile/a.ts': 1, 'mobile/c.ts': 1 } }, {}))
      .toEqual([{ check: 'floating-promise', file: 'mobile/c.ts', was: 0, now: 1 }]);
    expect(frozen.baseFaults(was, { 'floating-promise': { 'mobile/moved.ts': 2, 'mobile/b.ts': 1 } }, { 'mobile/moved.ts': 'mobile/a.ts' })).toEqual([]);
    expect(frozen.baseFaults(was, { 'floating-promise': {}, 'edge-lint': { 'supabase/functions/x/index.ts': 4 } }, {})).toEqual([]);
  });

  it('to a baseline that is not whole', () => {
    const whole = Object.fromEntries(frozen.CHECKS.map((c) => [c, {}]));
    expect(frozen.shapeFaults(whole)).toEqual([]);
    expect(frozen.shapeFaults({ ...whole, 'edge-lint': { 'a.ts': 0 } })).toEqual(['edge-lint a.ts: 0 is not a count above 0']);
    expect(frozen.shapeFaults({ ...whole, 'floating-promises': {} })).toEqual(['a check this script does not know: floating-promises']);
    const { 'unchecked-index': _gone, ...short } = whole;
    expect(frozen.shapeFaults(short)).toEqual(['no unchecked-index section']);
  });
});

describe('a tool that broke is never a count of zero', () => {
  it('reads tsc\'s errors by file, a route folder\'s parentheses and a message\'s further lines included', () => {
    const text = [
      "app/(tabs)/index.tsx(12,5): error TS2532: Object is possibly 'undefined'.",
      "src/a.ts(1,1): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.",
      "  Type 'undefined' is not assignable to type 'string'.",
      "src/a.ts(9,2): error TS18048: 'x' is possibly 'undefined'.",
      '',
    ].join('\n');
    expect(frozen.tscCounts(text, 2, MOBILE)).toEqual({ 'mobile/app/(tabs)/index.tsx': 1, 'mobile/src/a.ts': 2 });
    expect(frozen.tscCounts('', 0, MOBILE)).toEqual({});
  });

  it('refuses tsc\'s word that is not a file\'s error, and a failure that names no file', () => {
    expect(() => frozen.tscCounts("error TS5083: Cannot read file 'x/tsconfig.json'.", 1, MOBILE)).toThrow(/not a file's error/);
    expect(() => frozen.tscCounts('', 1, MOBILE)).toThrow(/named no file/);
  });

  // deno check's own words, as Deno 2.1 prints them with NO_COLOR.
  const A = 'supabase/functions/a/index.ts';
  const B = 'supabase/functions/b/index.ts';
  const url = (f: string) => `file:///${join(ROOT, f).split('\\').join('/').replace(/^\//, '')}`;
  const checked = [`Check ${url(A)}`, `Check ${url(B)}`];

  it('places each of deno check\'s errors in its file', () => {
    const text = [...checked,
      "error: TS2322 [ERROR]: Type 'string' is not assignable to type 'number'.",
      'const a: number = "x";', '      ^', `    at ${url(A)}:1:7`, '',
      "TS2345 [ERROR]: Argument of type 'number' is not assignable to parameter of type 'string'.",
      'f(1);', '  ^', `    at ${url(A)}:3:3`, '',
      'Found 2 errors.', ''].join('\n');
    expect(frozen.denoCheckCounts(text, 1)).toEqual({ [A]: 2 });
    expect(frozen.denoCheckCounts(checked.join('\n'), 0)).toEqual({});
    expect(frozen.denoCheckCounts('', 0)).toEqual({});
  });

  it('refuses deno check when it failed with no error, or an error has no place', () => {
    expect(() => frozen.denoCheckCounts(`${checked.join('\n')}\nerror: Module not found "https://esm.sh/x".`, 1)).toThrow(/named no error/);
    expect(() => frozen.denoCheckCounts(`${checked.join('\n')}\nTS2322 [ERROR]: x\n    at ${url(B)}:1:1\nFound 2 errors.`, 1))
      .toThrow(/could not each be placed/);
    expect(() => frozen.denoCheckCounts(`Check ${url(A)}\nTS2322 [ERROR]: x\n`, 1)).toThrow(/could not each be placed/);
  });

  it('reads deno lint\'s report, and refuses one with a file it could not read', () => {
    const at = join(ROOT, B);
    expect(frozen.denoLintCounts(JSON.stringify({ diagnostics: [{ filename: at }, { filename: url(B) }], errors: [] })))
      .toEqual({ [B]: 2 });
    expect(() => frozen.denoLintCounts(JSON.stringify({ diagnostics: [], errors: [{ file_path: at, message: 'parse' }] }))).toThrow(/could not read/);
  });
});

it('measures, before a push, each check a change can move', () => {
  const app = ['floating-promise', 'misused-promise', 'unchecked-index', 'hand-supabase-mock'];
  expect(frozen.checksTouchedBy(['mobile/src/a.ts', 'README.md'])).toEqual(app);
  expect(frozen.checksTouchedBy(['mobile/tsconfig.json'])).toEqual(app);
  expect(frozen.checksTouchedBy(['supabase/functions/sync-films/index.ts'])).toEqual(['edge-type-error', 'edge-lint']);
  expect(frozen.checksTouchedBy(['mobile/supabase/functions/_shared/storeRecord.ts'])).toEqual(['edge-type-error', 'edge-lint']);
  expect(frozen.checksTouchedBy(['mobile/register/frozen-counts.json'])).toEqual(frozen.CHECKS);
  expect(frozen.checksTouchedBy(['mobile/audit/notes.md', 'src/web.ts'])).toEqual([]);
});

it('each finder counts the cases planted for it, by running it', () => {
  const r = spawnSync(process.execPath, [join(MOBILE, 'scripts', 'frozen-counts.cjs'), '--selftest', '--only', 'floating-promise,misused-promise,unchecked-index,hand-supabase-mock'], {
    cwd: MOBILE, encoding: 'utf8',
  });
  expect({ status: r.status, said: `${r.stdout}${r.stderr}`.trim() })
    .toEqual({ status: 0, said: 'Each finder counted the cases planted for it: floating-promise, misused-promise, unchecked-index, hand-supabase-mock.' });
}, 120_000);

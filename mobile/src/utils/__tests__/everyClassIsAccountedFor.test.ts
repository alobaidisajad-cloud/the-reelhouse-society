/**
 * Every class in the register holds what its status claims.
 * ─────────────────────────────────────────────────────────────────────────────
 * mobile/register/classes.yaml is the one source (WORKLIST P0.49–P0.54). A
 * GUARDED class names tests that exist by their exact title (read from the test
 * file's syntax tree, never a substring), four proofs and every mutant caught,
 * and for a serious one a static and a running method; a CLOSED one, a reason
 * from the fixed list and a second review; GUARDED and CLOSED alike, the
 * STANDARDS sections they were checked against; OUT_OF_SCOPE, the user's dated
 * words; PARTIAL never. A class still open in production shows only its id,
 * area, seriousness, count and status. CLASSES.md is what the file makes.
 * Whatever its status, a class found twice carries a static method that is a
 * finder over the whole app and a sweep record, or is owed by its kind in
 * register/finders-owed.yaml.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

const MOBILE = join(__dirname, '..', '..', '..');
type Owed = Record<string, string[]>;
const { faultsOf, finderFaultsOf, owedFaultsOf, owedIds, readCommitted, readOwed, readsTheWholeApp, render } = require('../../../scripts/register.cjs') as {
  faultsOf: (c: Record<string, unknown>, titles: (file: string) => string[] | null) => string[];
  finderFaultsOf: (c: Record<string, unknown>, isFinder: (file: string) => boolean, owed: Set<string>) => string[];
  owedFaultsOf: (classes: Record<string, unknown>[], owed: Owed) => string[];
  owedIds: (owed: Owed) => Set<string>;
  readCommitted: () => { classes: Record<string, unknown>[] };
  readOwed: () => Owed;
  readsTheWholeApp: (source: string) => boolean;
  render: (r: { classes: Record<string, unknown>[] }) => string;
};

/** The local modules a test loads: relative paths, and the `@/` paths the jest config maps to mobile/. */
const loadedBy = (file: string, source: string): string[] => {
  const out: string[] = [];
  for (const m of source.matchAll(/(?:from|require\()\s*'(\.{1,2}\/[^']+|@\/[^']+)'/g)) {
    const spec = m[1] ?? '';
    const base = spec.startsWith('@/') ? join(MOBILE, spec.slice(2)) : join(MOBILE, file, '..', spec);
    const found = ['', '.ts', '.tsx', '.js', '.cjs', '.mjs', '/index.ts', '/index.js'].map((e) => base + e).find((p) => existsSync(p) && !p.endsWith('/'));
    if (found && /\.[cm]?[jt]sx?$/.test(found)) out.push(found);
  }
  return out;
};

/** Whether a method file is a finder over the whole app: it, or a local module it loads, reads the universe or the schema. */
const isFinder = (file: string): boolean => {
  const path = join(MOBILE, file);
  if (!existsSync(path)) return false;
  const source = readFileSync(path, 'utf8');
  if (readsTheWholeApp(source)) return true;
  // The readers themselves are left out: loading one is not reading with it.
  return loadedBy(file, source).some((p) => !/[\\/]test-utils[\\/](universe\.js|schema\.ts)$/.test(p) && readsTheWholeApp(readFileSync(p, 'utf8')));
};

/** A test file's `it`/`test` titles, from its syntax tree; null when the file is not there. */
const titlesIn = (file: string): string[] | null => {
  const path = join(MOBILE, file);
  if (!existsSync(path)) return null;
  const sf = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const titles: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ['it', 'test'].includes(n.expression.text)) {
      const [title] = n.arguments;
      if (title && (ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title))) titles.push(title.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return titles;
};

const REGISTER = readCommitted();

it('reads the register, each class once', () => {
  expect(REGISTER.classes.length).toBeGreaterThanOrEqual(10);
  const ids = REGISTER.classes.map((c) => c.id);
  expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
});

it('every class holds what its status claims', () => {
  const faults = REGISTER.classes.flatMap((c) => faultsOf(c, titlesIn).map((f) => `${c.id}: ${f}`));
  expect(faults).toEqual([]);
});

// A class found twice is a kind: each round fixed its instance and the next round found a sibling,
// until a finder over the whole app listed every site at once. So a class whose count reaches 2
// carries a static finder and a sweep record, or is named in finders-owed.yaml under the kind that
// owes it, and leaves that list the moment it holds them.
it('every class found twice carries a finder over the whole app and its sweep, or is owed by its kind', () => {
  const owed = readOwed();
  expect(owedFaultsOf(REGISTER.classes, owed)).toEqual([]);
  const ids = owedIds(owed);
  const faults = REGISTER.classes.flatMap((c) => finderFaultsOf(c, isFinder, ids).map((f) => `${c.id}: ${f}`));
  expect(faults).toEqual([]);
});

it('CLASSES.md is what classes.yaml makes', () => {
  const md = readFileSync(join(MOBILE, 'register', 'CLASSES.md'), 'utf8').split('\r\n').join('\n');
  expect(md).toBe(render(REGISTER));
});

describe('the rules say NO', () => {
  const base = { id: 'X-planted', title: 't', area: 'a', seriousness: 'code', count: 0 };
  const titles = (file: string) => (file === 'a.test.ts' ? ['the real title'] : null);
  const fault = (c: Record<string, unknown>) => faultsOf({ ...base, ...c }, titles);

  it('to PARTIAL, and to a status it does not know', () => {
    expect(fault({ status: 'PARTIAL' })).toContain('PARTIAL is refused: split it');
    expect(fault({ status: 'DONE' })[0]).toMatch(/^a status from/);
  });

  it('to a GUARDED class whose test is missing, misnamed, or whose proofs and mutants are not all in', () => {
    const guarded = { status: 'GUARDED', standards: ['4.8'], proofs: {}, mutants: [{ status: 'caught' }] };
    expect(fault({ ...guarded, methods: [{ kind: 'static', file: 'b.test.ts', test: 'x' }] })).toContain('a method file that exists (b.test.ts)');
    expect(fault({ ...guarded, methods: [{ kind: 'static', file: 'a.test.ts', test: 'the real' }] }))
      .toContain('a test titled exactly "the real" in a.test.ts');
    expect(fault({ ...guarded, methods: [{ kind: 'static', file: 'a.test.ts', test: 'the real title' }] }))
      .toContain('its whole app proof, with commit and result');
    expect(fault({ ...guarded, mutants: [{ status: 'survived' }], methods: [] })).toContain('every mutant caught');
  });

  it('to a serious GUARDED class with only one kind of method, and to one that names no STANDARDS', () => {
    const f = fault({ status: 'GUARDED', seriousness: 'serious', methods: [{ kind: 'static', file: 'a.test.ts', test: 'the real title' }] });
    expect(f).toContain('a serious class needs a static and a running method');
    expect(f).toContain('the STANDARDS sections it was checked against');
  });

  it('to a CLOSED class with a reason off the list, no second review, or a device-only one with no phone step', () => {
    expect(fault({ status: 'CLOSED', standards: ['4.8'], closed: { reason: 'fixed' } }))
      .toEqual(expect.arrayContaining([expect.stringMatching(/^a CLOSED reason from/), 'a second review (reviewer, date, verdict)']));
    const review = { reviewer: 'r', date: '2026-10-15', verdict: 'yes' };
    expect(fault({ status: 'CLOSED', standards: ['4.8'], closed: { reason: 'device only', second_review: review } }))
      .toContain('a device-only class must name iphone or android-phone among its places');
    expect(fault({ status: 'CLOSED', standards: ['4.8'], places: ['iphone'], closed: { reason: 'device only', second_review: review } }))
      .toContain('the phone check\'s step');
  });

  it('to a class found twice with no finder over the whole app, a component test standing for one, or no sweep', () => {
    const finders = (file: string) => file === 'finder.test.ts';
    const sweep = { read: ['appCode'], found: 3, fixed: 2, judged: 1, commit: 'd030851b' };
    const twice = { ...base, count: 2, methods: [{ kind: 'static', file: 'finder.test.ts', test: 't' }], sweep };
    expect(finderFaultsOf(twice, finders, new Set())).toEqual([]);
    expect(finderFaultsOf({ ...twice, methods: [{ kind: 'static', file: 'one-screen.test.tsx', test: 't' }] }, finders, new Set()))
      .toEqual(['a static method that is a finder over the whole app (it reads the universe or the schema)']);
    expect(finderFaultsOf({ ...twice, methods: [{ kind: 'running', file: 'finder.test.ts', test: 't' }] }, finders, new Set()))
      .toEqual(['a static method that is a finder over the whole app (it reads the universe or the schema)']);
    expect(finderFaultsOf({ ...twice, sweep: undefined }, finders, new Set())).toEqual(['a sweep record']);
    expect(finderFaultsOf({ ...twice, sweep: { ...sweep, read: [] } }, finders, new Set()))
      .toEqual(['the sweep\'s read: the universes or the schema it read']);
    expect(finderFaultsOf({ ...twice, sweep: { ...sweep, judged: 0 } }, finders, new Set()))
      .toEqual(['a sweep whose hits are each fixed or judged (fixed + judged = found)']);
    expect(finderFaultsOf({ ...twice, sweep: { ...sweep, commit: 'HEAD' } }, finders, new Set())).toEqual(['the commit the sweep ran at']);
    // Found once is an accident still, and a class open in production shows nothing.
    expect(finderFaultsOf({ ...base, count: 1 }, finders, new Set())).toEqual([]);
    expect(finderFaultsOf({ ...base, count: 5, open_in_production: true }, finders, new Set())).toEqual([]);
  });

  it('to the owed list: a class owed stays quiet until it holds its finder, then must leave; a name it cannot owe fails', () => {
    const finders = (file: string) => file === 'finder.test.ts';
    const bare = { ...base, count: 4 };
    expect(finderFaultsOf(bare, finders, new Set(['X-planted']))).toEqual([]);
    const held = { ...bare, methods: [{ kind: 'static', file: 'finder.test.ts', test: 't' }], sweep: { read: ['schema'], found: 0, fixed: 0, judged: 0, commit: 'd030851b' } };
    expect(finderFaultsOf(held, finders, new Set(['X-planted']))).toEqual(['holds its finder and sweep, so it comes off finders-owed.yaml']);
    const classes = [bare, { ...base, id: 'X-once', count: 1 }];
    expect(owedFaultsOf(classes, { NOPE: ['X-planted'] })).toEqual([expect.stringMatching(/^NOPE: a kind from/)]);
    expect(owedFaultsOf(classes, { DATE: ['X-gone'] })).toEqual(['DATE: X-gone is no class in the register']);
    expect(owedFaultsOf(classes, { DATE: ['X-once'] })).toEqual(['DATE: X-once is not a class found twice, so it owes no finder']);
    expect(owedFaultsOf(classes, { DATE: ['X-planted'], R: ['X-planted'] })).toEqual(['R: X-planted is named twice']);
  });

  it('to a method file that reads one screen: only a file that reads the universe or the schema is a finder', () => {
    expect(readsTheWholeApp("import { files } from '@/test-utils/universe';\nconst roots = files('appCode');")).toBe(true);
    expect(readsTheWholeApp("const { files } = require('../test-utils/universe');\nfiles(['appCode', 'routes']);")).toBe(true);
    expect(readsTheWholeApp("import { files as universe } from '@/test-utils/universe';\nconst code = universe('appCode');")).toBe(true);
    expect(readsTheWholeApp("import { PENDING_SQL } from '@/test-utils/schema';")).toBe(true);
    expect(readsTheWholeApp("const screen = readFileSync(join(__dirname, '..', 'tribunal.tsx'), 'utf8');")).toBe(false);
    expect(readsTheWholeApp("render(<StackDetail />); expect(screen.getByText('x')).toBeTruthy();")).toBe(false);
    expect(isFinder('src/utils/__tests__/anInstantIsReadByTheHouse.guard.test.ts')).toBe(true);
    expect(isFinder('app/(admin)/__tests__/tribunalNeverLiesEmpty.guard.test.ts')).toBe(false);
    // A finder that runs a script reads the app through it.
    expect(isFinder('src/utils/__tests__/frozenCounts.guard.test.ts')).toBe(true);
  });

  it('to OUT_OF_SCOPE without the user\'s dated words, and to an open hole that says more than its id', () => {
    expect(fault({ status: 'OUT_OF_SCOPE' })).toContain('the user\'s quoted, dated decision');
    expect(faultsOf({ id: 'X-open', area: 'a', seriousness: 'serious', count: 1, status: 'OPEN', open_in_production: true, title: 'how' }, titles)[0])
      .toMatch(/^open in production, so only/);
  });
});

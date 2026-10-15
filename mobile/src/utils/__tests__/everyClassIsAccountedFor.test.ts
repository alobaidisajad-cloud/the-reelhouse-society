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
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

const MOBILE = join(__dirname, '..', '..', '..');
const { faultsOf, readCommitted, render } = require('../../../scripts/register.cjs') as {
  faultsOf: (c: Record<string, unknown>, titles: (file: string) => string[] | null) => string[];
  readCommitted: () => { classes: Record<string, unknown>[] };
  render: (r: { classes: Record<string, unknown>[] }) => string;
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

  it('to OUT_OF_SCOPE without the user\'s dated words, and to an open hole that says more than its id', () => {
    expect(fault({ status: 'OUT_OF_SCOPE' })).toContain('the user\'s quoted, dated decision');
    expect(faultsOf({ id: 'X-open', area: 'a', seriousness: 'serious', count: 1, status: 'OPEN', open_in_production: true, title: 'how' }, titles)[0])
      .toMatch(/^open in production, so only/);
  });
});

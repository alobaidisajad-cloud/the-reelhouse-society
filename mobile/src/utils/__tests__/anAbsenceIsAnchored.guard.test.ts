/**
 * anAbsenceIsAnchored.guard.test.ts — TST-09: a test that finds something
 * absent on a screen also shows the screen drawn, or a blank one, a crash
 * caught upstream or a list still loading passes it as well as the right one.
 * 19 were not; each now shows the drawn thing beside the absent one (a list's
 * own empty line, the row's words, the field, the control the same query
 * finds once it is shown).
 */
import { readFileSync } from 'fs';

const finder = require('../../../scripts/absence-only.cjs') as {
  sitesIn: (file: string, text: string) => { line: number; title: string }[];
  testFiles: () => string[];
};

describe('every absence a test finds on a screen is anchored', () => {
  it('finds no test that only finds things absent on a screen it never shows drawn', () => {
    const tests = finder.testFiles();
    expect(tests.length).toBeGreaterThan(400);
    expect(tests.flatMap((f) => finder.sitesIn(f, readFileSync(f, 'utf8')).map((s) => `${f}:${s.line} ${s.title}`))).toEqual([]);
  });

  it('can say NO: an absence alone is found; one beside anything drawn is not', () => {
    const sites = (body: string) => finder.sitesIn('x.test.tsx', `const r = render(<A />);\nit('t', () => { ${body} });`).length;
    expect(sites("expect(r.queryByText('Gone')).toBeNull();")).toBe(1);
    expect(sites("expect(r.queryAllByText('Gone')).toHaveLength(0);")).toBe(1);
    expect(sites("expect(screen.queryByText('Gone')).not.toBeTruthy();")).toBe(1);
    expect(sites("expect(r.getByText('Here')).toBeTruthy(); expect(r.queryByText('Gone')).toBeNull();")).toBe(0);
    expect(sites("r.getByText('Here'); expect(r.queryByText('Gone')).toBeNull();")).toBe(0);
    expect(sites("expect(onPress).not.toHaveBeenCalled();")).toBe(0);
    expect(sites("expect(r.toJSON()).toBeNull();")).toBe(0);
  });
});

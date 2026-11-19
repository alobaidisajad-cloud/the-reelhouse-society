/**
 * theMeasuringRulesSayNo.test.ts — the layout check's own self-test, a test to each case (round 14).
 *
 * mockups/tools/selftest.cjs draws small pages that each carry one known fault, or none, runs
 * layout.cjs over them and prints a line per case and pass: `ok` or `FAIL`, the case's name, what
 * it wanted and what it got. Run alone it says only that some case failed. Here it is run once,
 * and each rule's cases are a test of their own, named for what the case proves, so a rule broken
 * in layout.cjs fails its own named test. Every case the self-test's own list holds (its CASES,
 * read from its syntax tree) must be answered in every pass, and every other check it makes must
 * say ok.
 *
 * The check measures in a real browser (Playwright's Chromium, installed beside the repo's root
 * packages). Where none is installed (the jest parts in CI install none; CI runs the self-test in
 * the drawings job, which does), the suite skips, as the contract suites skip with no house to ask.
 */
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

const MOBILE = join(__dirname, '..', '..', '..');
const SELFTEST = join(MOBILE, 'mockups', 'tools', 'selftest.cjs');
/** The passes each drawn case is measured in (selftest.cjs's PASSES). */
const PASSES = 5;

/** Whether this machine holds the browser the layout check measures in. */
const hasTheBrowser = (() => {
  try {
    const playwright = require(join(MOBILE, '..', 'node_modules', 'playwright')) as { chromium: { executablePath: () => string } };
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();
const withTheBrowser = hasTheBrowser ? describe : describe.skip;

/** The cases the self-test draws, by name, as its own CASES object lists them. */
export function casesOf(text: string): string[] {
  const sf = ts.createSourceFile('selftest.cjs', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const names: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === 'CASES' && n.initializer && ts.isObjectLiteralExpression(n.initializer)) {
      for (const p of n.initializer.properties) if (p.name) names.push(p.name.getText(sf));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}

type Row = { label: string; ok: boolean; line: string };
let rows: Row[] = [];
let exit: number | null = null;
let said = '';

/** The self-test's lines for one case or check: there, and every one of them ok. */
const holds = (label: string) => {
  const mine = rows.filter((r) => r.label === label);
  expect([label, mine.length > 0 ? 'answered' : `never answered: ${said.trim().split('\n').slice(-3).join(' / ')}`]).toEqual([label, 'answered']);
  expect(mine.filter((r) => !r.ok).map((r) => r.line)).toEqual([]);
};

withTheBrowser('the layout check’s own self-test', () => {
  beforeAll(() => {
    const run = spawnSync(process.execPath, [SELFTEST], { cwd: MOBILE, encoding: 'utf8', maxBuffer: 1e8 });
    said = `${run.stdout}${run.stderr}`;
    exit = run.status;
    rows = `${run.stdout}`.split(/\r?\n/).flatMap((line) => {
      const m = /^(ok {2}|FAIL) {2}(\S+)/.exec(line);
      return m ? [{ ok: m[1] === 'ok  ', label: m[2] ?? '', line }] : [];
    });
  }, 300_000);

  it('answers every case its own list holds, each in every pass', () => {
    const cases = casesOf(readFileSync(SELFTEST, 'utf8'));
    expect(cases.length).toBeGreaterThan(80);
    const unanswered = cases.filter((c) => rows.filter((r) => r.label === c).length !== PASSES);
    expect(unanswered).toEqual([]);
  });

  it('says NO to every fault and nothing to every clean page, in every check it makes', () => {
    expect(rows.filter((r) => !r.ok).map((r) => r.line)).toEqual([]);
    expect([exit, rows.length > 0]).toEqual([0, true]);
  });

  describe('OFF: words no scroll brings onto the screen (round 14)', () => {
    it('a sheet at the foot taller than the screen, nothing in it scrolling, has its title above the top (riseoff)', () => holds('riseoff'));
    it('a card laid from its top on a screen-sized page runs past the home indicator’s edge (cardfoot)', () => holds('cardfoot'));
    it('words drawn over the status bar inside a Modal sit under the clock (underclock)', () => holds('underclock'));
    it('words past the home indicator’s edge inside a Modal are off the screen (modalfoot)', () => holds('modalfoot'));
    it('a page’s own top, which may be an iOS sheet’s below the clock, is not judged under it (sheetpage)', () => holds('sheetpage'));
    it('a board marked a plate is laid out past the foot by design (plateboard)', () => holds('plateboard'));
    it('a page drawn taller than the phone is a generator’s plate: its foot is not the screen’s (tallplate)', () => holds('tallplate'));
    it('words far down a scroll are reached by scrolling, never off the screen (scrolllong)', () => holds('scrolllong'));
  });

  describe('CUT: a field taller than the scroll it stands in (round 14)', () => {
    it('a field taller than its scroll can never be seen whole (fieldcramped)', () => holds('fieldcramped'));
    it('a field its scroll has room for is whole at some position (fieldroomy)', () => holds('fieldroomy'));
    it('a page-sized editor is the page, read by scrolling (fieldpage)', () => holds('fieldpage'));
  });

  describe('WHOLE and UNMEASURED: words read whole in their one place (round 14)', () => {
    it('a listed member’s words cut by a clamp are a fault, not a design (wholecut)', () => holds('wholecut'));
    it('a listed one-line text whose words run past a line break is cut there (wholebroken)', () => holds('wholebroken'));
    it('the same words drawn whole are clean, and an unlisted clamp is still the design (wholekept)', () => holds('wholekept'));
    it('an entry no page drew fails the run as unmeasured (whole-unmeasured)', () => holds('whole-unmeasured'));
    it('the same entry, drawn, is measured and clean (whole-measured)', () => holds('whole-measured'));
  });

  describe('a view hidden at rest holds nothing to measure (round 14)', () => {
    it('a view at opacity 0 is not drawn (hiddenatrest)', () => holds('hiddenatrest'));
    it('the culled projector beam, moved 3000pt up at opacity 0, is not drawn (culledbeam)', () => holds('culledbeam'));
  });

  describe('INK: a letter’s marks reaching another row', () => {
    it('marks piled on later rows reach up through the row above (inkpile)', () => holds('inkpile'));
    it('a piled row a clamp cuts away draws no ink (inkclamped)', () => holds('inkclamped'));
    it('a handle a hair under its own line spills nothing whole-pixel measures could invent (inkround)', () => holds('inkround'));
    it('a script’s own marks at a reader’s leading stand over no row (inkclean)', () => holds('inkclean'));
    it('piled ink under an opaque cover is ink no one sees (inkcovered)', () => holds('inkcovered'));
    it('a tight title shown at 0.7 meets nowhere, its measures scaled to the drawn boxes (inkscaled)', () => holds('inkscaled'));
    it('piled marks shown at 0.7 still reach the row above (inkpilescaled)', () => holds('inkpilescaled'));
  });

  describe('NESTED: a control inside an accessible element', () => {
    it('a control inside an element that offers other acts is lost to VoiceOver (nested-lost)', () => holds('nested-lost'));
    it('a disabled control inside an element is lost too (nested-lostdimmed)', () => holds('nested-lostdimmed'));
    it('an element that offers the control’s act by name loses nothing (nested-offered)', () => holds('nested-offered'));
    it('an adjustable element loses nothing (nested-adjustable)', () => holds('nested-adjustable'));
    it('an element that is no stop hides nothing (nested-container)', () => holds('nested-container'));
    it('a disabled control named otherwise than it shows is still caught as unsaid (nested-dimmedname)', () => holds('nested-dimmedname'));
    it('a disabled control that is no stop is not judged for its name (nested-dimmedbox)', () => holds('nested-dimmedbox'));
  });
});

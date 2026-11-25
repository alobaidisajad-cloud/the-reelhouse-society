/**
 * theMeasuringRulesSayNo.test.ts — the layout check's own self-test, a test to each case (round 14).
 *
 * mockups/tools/selftest.cjs draws small pages that each carry one known fault, or none, runs
 * layout.cjs over them and prints a line per case and pass: `ok` or `FAIL`, the case's name, what
 * it wanted and what it got. Run alone it says only that some case failed. Here it is run once,
 * and each rule's cases are a test of their own, named for what the case proves, so a rule broken
 * in layout.cjs fails its own named test. Every case the self-test's own list holds (its CASES,
 * read from its syntax tree) must be answered in every pass, and every other check it makes must
 * say ok. Every kind a measuring tool reports is proven both ways, a check that says it and a near
 * miss the phone allows (its PROVES list), held here with no browser and read back from the run.
 *
 * The check measures in a real browser (Playwright's Chromium, installed beside the repo's root
 * packages). Where none is installed (the jest parts in CI install none; CI runs the self-test in
 * the drawings job, which does), the suite skips, as the contract suites skip with no house to ask.
 */
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { files, rel } from '@/test-utils/universe';

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

/** The kinds a measuring tool reports: each `kind:` it writes into a finding (in capitals), and each line it prints led by one. */
export function kindsOf(text: string): string[] {
  const sf = ts.createSourceFile('tool.cjs', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const kinds = new Set<string>();
  const literals = (e: ts.Expression): string[] => (ts.isStringLiteral(e) ? [e.text]
    : ts.isConditionalExpression(e) ? [...literals(e.whenTrue), ...literals(e.whenFalse)] : []);
  const visit = (n: ts.Node) => {
    if (ts.isPropertyAssignment(n) && n.name.getText(sf) === 'kind') literals(n.initializer).filter((k) => /^[A-Z]{3,}$/.test(k)).forEach((k) => kinds.add(k));
    if (ts.isCallExpression(n) && n.expression.getText(sf) === 'console.log' && n.arguments[0] && ts.isTemplateExpression(n.arguments[0])) {
      const led = /^(?<kind>[A-Z]{3,}) {2}/.exec(n.arguments[0].head.text)?.groups?.kind;
      if (led) kinds.add(led);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return [...kinds].sort();
}

/** Every kind the measuring tools report: each tool of mockups/tools/ the scripts universe holds, the self-test aside. */
function toolKinds(): string[] {
  const tools = files('scripts').filter((f) => /^mockups\/tools\/[^/]+\.c?js$/.test(rel(f)) && !rel(f).endsWith('/selftest.cjs'));
  return [...new Set(tools.flatMap((f) => kindsOf(readFileSync(f, 'utf8'))))].sort();
}

type Proof = { says: string[]; allows: string[] };

/** A top-level object the self-test declares, by name. */
function declared(sf: ts.SourceFile, name: string): ts.ObjectLiteralExpression | null {
  let found: ts.ObjectLiteralExpression | null = null;
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === name && n.initializer && ts.isObjectLiteralExpression(n.initializer)) found = n.initializer;
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

/** The self-test's PROVES: for each kind, the checks that say it and the near misses that must not. */
export function provesOf(text: string): Record<string, Proof> {
  const sf = ts.createSourceFile('selftest.cjs', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const out: Record<string, Proof> = {};
  const strings = (o: ts.ObjectLiteralExpression, key: string) => {
    const p = o.properties.find((x): x is ts.PropertyAssignment => ts.isPropertyAssignment(x) && x.name.getText(sf) === key);
    return p && ts.isArrayLiteralExpression(p.initializer) ? p.initializer.elements.filter(ts.isStringLiteral).map((s) => s.text) : [];
  };
  for (const p of declared(sf, 'PROVES')?.properties ?? []) {
    if (ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.initializer)) out[p.name.getText(sf)] = { says: strings(p.initializer, 'says'), allows: strings(p.initializer, 'allows') };
  }
  return out;
}

/** The kinds each of the self-test's CASES wants, in any pass: the kind names its expectation holds, through the constants it names. */
export function wantsOf(text: string): Record<string, string[]> {
  const sf = ts.createSourceFile('selftest.cjs', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const consts = new Map<string, ts.Expression>();
  const collect = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) consts.set(n.name.text, n.initializer);
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const kinds = (e: ts.Node, depth = 0): string[] => {
    if (ts.isStringLiteral(e)) return /^[A-Z]{3,}$/.test(e.text) ? [e.text] : [];
    if (ts.isIdentifier(e)) { const made = consts.get(e.text); return made && depth < 2 && ts.isObjectLiteralExpression(made) ? kinds(made, depth + 1) : []; }
    const out: string[] = [];
    ts.forEachChild(e, (c) => { out.push(...kinds(c, depth)); });
    return out;
  };
  const out: Record<string, string[]> = {};
  for (const p of declared(sf, 'CASES')?.properties ?? []) {
    if (ts.isPropertyAssignment(p) && ts.isArrayLiteralExpression(p.initializer) && p.initializer.elements[1]) {
      out[p.name.getText(sf)] = [...new Set(kinds(p.initializer.elements[1]))].sort();
    }
  }
  return out;
}

/** What is wrong with the proofs: a kind proven one way or none, a proof of a kind not reported, a case that wants other than the list says. */
export function unproven(kinds: string[], proves: Record<string, Proof>, wants: Record<string, string[]>, text: string): string[] {
  const wrong: string[] = [];
  for (const k of kinds) {
    const p = proves[k];
    if (!p) wrong.push(`${k}: no proof`);
    else if (!p.says.length || !p.allows.length) wrong.push(`${k}: proven ${p.says.length ? 'only as a fault' : 'only as allowed'}`);
  }
  for (const k of Object.keys(proves)) if (!kinds.includes(k)) wrong.push(`${k}: proven, and not a kind it reports`);
  for (const [k, p] of Object.entries(proves)) {
    for (const label of new Set([...p.says, ...p.allows])) {
      const w = wants[label];
      if (w) {
        if (p.says.includes(label) && !w.includes(k)) wrong.push(`${k}: the case ${label} does not want it`);
        if (p.allows.includes(label) && w.includes(k)) wrong.push(`${k}: the near miss ${label} wants it`);
      } else {
        // A check of its own: its label printed whole, or its name beside the prefix it is printed under.
        const dash = label.indexOf('-');
        const there = text.includes(label) || (dash > 0 && text.includes(`${label.slice(0, dash + 1)}\${`) && text.includes(`'${label.slice(dash + 1)}'`));
        if (!there) wrong.push(`${k}: ${label} is no case and no check of the self-test`);
      }
    }
  }
  return wrong;
}

describe('every kind the measuring tools report is proven both ways', () => {
  const KINDS = toolKinds();
  const TEST = readFileSync(SELFTEST, 'utf8');

  it('reads the kinds, the proofs and the cases, not empty lists', () => {
    expect(KINDS.length).toBeGreaterThan(20);
    expect(KINDS).toEqual(expect.arrayContaining(['EDGE', 'BASELINE', 'LOST', 'UNMEASURED']));
    expect(Object.keys(provesOf(TEST)).length).toBeGreaterThan(20);
    expect(wantsOf(TEST).hangicon).toEqual(['HANG']);
    expect(wantsOf(TEST).nameclipped).toEqual(['CUT', 'NAME']);
    expect(wantsOf(TEST).control).toEqual([]);
  });

  it('each kind has a check that says it and a near miss the phone allows, each wanting what the list says', () => {
    expect(unproven(KINDS, provesOf(TEST), wantsOf(TEST), TEST)).toEqual([]);
  });

  it('finds the kinds it was made for, put back: four with no check at all, and a rule proven only as a fault', () => {
    const proves = provesOf(TEST);
    const without = Object.fromEntries(Object.entries(proves).filter(([k]) => !['ORDER', 'BENEATH', 'COLOUR', 'SHORT'].includes(k)));
    expect(unproven(KINDS, without, wantsOf(TEST), TEST).sort()).toEqual([
      'BENEATH: no proof', 'COLOUR: no proof', 'ORDER: no proof', 'SHORT: no proof',
    ]);
    const oneWay = { ...proves, SMALL: { says: proves.SMALL?.says ?? [], allows: [] } };
    expect(unproven(KINDS, oneWay, wantsOf(TEST), TEST)).toEqual(['SMALL: proven only as a fault']);
  });

  it('can say NO: a kind with no proof, one proven one way, a near miss that wants it, a label that is nothing', () => {
    const planted = `found.push({ kind: 'RUN' }); found.push({ kind: x ? 'FAINT' : 'RUN' }); console.log(\`GONE  \${f}\`);`;
    expect(kindsOf(planted)).toEqual(['FAINT', 'GONE', 'RUN']);
    const wants = { run: ['RUN'], control: [] };
    expect(unproven(['RUN', 'FAINT', 'GONE'], {
      RUN: { says: ['run'], allows: ['run'] },
      FAINT: { says: ['control'], allows: [] },
      OLD: { says: ['run'], allows: ['nowhere'] },
    }, wants, '')).toEqual([
      'FAINT: proven only as a fault',
      'GONE: no proof',
      'OLD: proven, and not a kind it reports',
      'RUN: the near miss run wants it',
      'FAINT: the case control does not want it',
      'OLD: the case run does not want it',
      'OLD: nowhere is no case and no check of the self-test',
    ]);
  });
});

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

  it('proves every kind the tools report both ways, by what this very run answered (proves-*)', () => {
    const kinds = toolKinds();
    for (const k of kinds) holds(`proves-${k}`);
    expect(rows.filter((r) => r.label.startsWith('proves-')).length).toBe(kinds.length);
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

  describe('UNDER and SMALL ask only what the phone does: a page behind its sheet, a control scrolled to', () => {
    it('a line under a docked bar at every scroll position is covered (scrollstuck)', () => holds('scrollstuck'));
    it('the same line on a page the app hides from every reader is not asked (scrollhidden)', () => holds('scrollhidden'));
    it('past the window, a chip keeps its halo along the scroll; 2pt short is small, and past the scroll’s end is cut (fold)', () => holds('fold'));
  });

  describe('ORDER, BENEATH, COLOUR and SHORT: each said, and its near miss allowed', () => {
    it('a stop built after one it is drawn above is read out of turn (order-late)', () => holds('order-late'));
    it('the same two built in the order drawn are read in turn (order-kept)', () => holds('order-kept'));
    it('a page under a sheet laid over it is still reached by a screen reader (beneath-sheet)', () => holds('beneath-sheet'));
    it('the same page hidden while the sheet is up is not asked (beneath-hidden)', () => holds('beneath-hidden'));
    it('a chosen option told from its sibling by colour alone is said (colour-alone)', () => holds('colour-alone'));
    it('the same option underlined as well is told apart in any colour (colour-marked)', () => holds('colour-marked'));
    it('a one-line text the phone ends with an ellipsis is listed as shortened (short-cut)', () => holds('short-cut'));
    it('the same words with room for them are not (short-fits)', () => holds('short-fits'));
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

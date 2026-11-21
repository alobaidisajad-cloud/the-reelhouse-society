/**
 * workEndsWithItsScreen.guard.test.ts — work outlives, or is lost to, its screen's exit.
 * ─────────────────────────────────────────────────────────────────────────────
 * One mechanism behind thirteen findings of review rounds 8 to 12: after a wait, a screen acts as
 * if the member were still on it. The log sheet's seal popped the screen beneath once the sheet was
 * swiped away; reset-password walked home after the member had left; Discard was offered over a
 * save in flight; one busy id freed the wrong row; a double tap on words opened two files; a draft
 * kept part of the form. Each was fixed where it was found, and the same shape stood elsewhere.
 *
 * So the whole app is read, with TypeScript's parser, for each shape of it:
 *   1. after a wait, a walk (nav, router), a timer, an idle task, a focus or a scroll, or words that
 *      point at the screen, stands behind a "still here" check made after that wait: a ref the file
 *      lowers as it leaves (useStillHere, or a mounted ref cleared in an effect's cleanup), asked
 *      there or inside the work put off; a timer the leave clears is not one, since a timer set
 *      after the leave has run is never cleared;
 *   2. Android's back is heard only through useBackCloses, and only while its screen is in front;
 *   3. no way out is held with Discard while the work is on its way: the hold's condition is false
 *      while sending, and work on its way is held by useHoldWhileSending or kept in a draft;
 *   4. a busy row is a set of ids, never one id let go after the wait (the next tap's id is freed);
 *   5. every press on words (`<Text onPress>`) goes through onePress;
 *   6. a kept draft is typed by its kind, read and written alike (memberDrafts' DraftShapes).
 * Each rule is shown failing on planted code first.
 */
import * as path from 'path';
import ts from 'typescript';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const AW = require('@/test-utils/afterAwait') as typeof import('@/test-utils/afterAwait');
const MOBILE = path.join(__dirname, '..', '..', '..');
const rel = (f: string) => path.relative(MOBILE, f).split(path.sep).join('/');

/** The screens' code: what draws a screen, and the hooks and parts it is drawn with. */
const SCREENS = universe('appCode', { ext: ['.ts', '.tsx'] })
  .filter((f) => /^(app|src\/(hooks|components|features|providers))\//.test(rel(f)));

/**
 * A component or hook that lives as long as the app, so nothing after its waits can outlive it.
 * Named one by one, with why.
 */
const LIVES_WITH_THE_APP: Record<string, string> = {
  'src/providers/AppBootstrapper.tsx': 'the root provider: mounted once for the life of the app, it has no screen to leave',
  'app/_layout.tsx': 'the root layout: mounted once for the life of the app, it has no screen to leave',
};

/**
 * A hit whose cure changes what a member sees, so the cure is a design call, put to the lead and
 * not made here. Each names what was asked; none is waiting.
 */
const A_DESIGN_CALL_ASKED: Record<string, string> = {};

const EFFECTS =/^(React\.)?(useEffect|useLayoutEffect|useInsertionEffect|useFocusEffect)$/;
const calleeText = (c: ts.CallExpression) => c.expression.getText();

/** A function that runs as an effect's cleanup: returned by a function handed to an effect. */
function inCleanup(node: ts.Node): boolean {
  const own = AW.ownerOf(node);
  if (!own) return false;
  const holder = own.parent;
  const returned = ts.isReturnStatement(holder) || (ts.isArrowFunction(holder) && holder.body === own);
  if (!returned) return false;
  for (let n: ts.Node | undefined = holder; n; n = n.parent) {
    if (ts.isCallExpression(n) && EFFECTS.test(calleeText(n))) return true;
  }
  return false;
}

/**
 * The file's "still here" vocabulary, read from its own code: each ref its leave sets (a ref set
 * false in a cleanup says 'here' while true; one set true there says 'gone'), each name bound to
 * useStillHere(), and each flag an effect's cleanup sets.
 */
function hereVocabulary(sf: ts.SourceFile) {
  const refs = new Map<string, 'here' | 'gone'>();
  const stillHere = new Set<string>();
  const flags = new Map<string, 'here' | 'gone'>();
  const visit = (n: ts.Node) => {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && (n.right.kind === ts.SyntaxKind.FalseKeyword || n.right.kind === ts.SyntaxKind.TrueKeyword) && inCleanup(n)) {
      const polarity = n.right.kind === ts.SyntaxKind.FalseKeyword ? 'here' : 'gone';
      if (ts.isPropertyAccessExpression(n.left) && n.left.name.text === 'current' && ts.isIdentifier(n.left.expression)) refs.set(n.left.expression.text, polarity);
      // A flag the effect itself holds (`let gone = false`), set as it is cleaned up.
      if (ts.isIdentifier(n.left)) flags.set(n.left.text, polarity);
    }
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isCallExpression(n.initializer)
      && calleeText(n.initializer) === 'useStillHere') stillHere.add(n.name.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const check = (e: ts.Expression): 'here' | 'gone' | null => {
    if (ts.isPropertyAccessExpression(e) && e.name.text === 'current' && ts.isIdentifier(e.expression)) return refs.get(e.expression.text) ?? null;
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && stillHere.has(e.expression.text)) return 'here';
    if (ts.isIdentifier(e)) return flags.get(e.text) ?? null;
    return null;
  };
  return { check };
}

/** Words a toast says that point at the screen it was said from. */
const POINTS_AT_THE_SCREEN = /\b(still here|kept here|below|above)\b/i;

/** What a call after a wait does to a screen, or null when it does nothing to one. */
function walkOf(call: ts.CallExpression): string | null {
  const t = calleeText(call);
  if (/^(nav|router)\.(\w+)$/.test(t) && !/\.(canGoBack|canDismiss)$/.test(t)) return t;
  if (/^(setTimeout|setInterval|deferUntilIdle|requestAnimationFrame|InteractionManager\.runAfterInteractions)$/.test(t)) return t;
  if (/\.(focus|scrollTo|scrollToEnd|scrollToOffset|scrollToIndex|scrollToItem)$/.test(t)) return t;
  if (/(^|\.)(reelToast|toast)(\.\w+)?$|Toast$/.test(t)) {
    const said = call.arguments[0];
    if (said && (ts.isStringLiteral(said) || ts.isNoSubstitutionTemplateLiteral(said) || ts.isTemplateExpression(said)) && POINTS_AT_THE_SCREEN.test(said.getText())) return `${t}(words that point at the screen)`;
  }
  return null;
}

/** Work put off to later whose walks each stand behind the check, asked when it runs: the right place to ask. */
function asksWhenItRuns(call: ts.CallExpression, check: (e: ts.Expression) => 'here' | 'gone' | null): boolean {
  if (!/^(setTimeout|deferUntilIdle|requestAnimationFrame|InteractionManager\.runAfterInteractions)$/.test(calleeText(call))) return false;
  const later = call.arguments[0];
  if (!later || !(ts.isArrowFunction(later) || ts.isFunctionExpression(later))) return false;
  // Every call it makes is a walk asked about first, or a state setter: a gone screen's state is let go with it.
  const calls = AW.ownNodes(later, (n) => (ts.isCallExpression(n) ? n : null));
  return calls.every((c) => (walkOf(c) ? AW.coveredAfter(later, c, -1, check) : check(c) !== null || /^set[A-Z]\w*$/.test(calleeText(c))));
}

/** Rule 1: each walk after a wait, in a component or hook, with no "still here" check after it. */
export function walksPastTheScreen(file: string, text: string): string[] {
  const sf = AW.parse(file, text);
  const { check } = hereVocabulary(sf);
  const out: string[] = [];
  for (const body of AW.waitingBodies(sf)) {
    const owner = AW.outermostOwner(body.fn);
    if (!owner || !/^([A-Z]|use[A-Z])/.test(owner.name)) continue;
    for (const call of AW.ownNodes(body.fn, (n) => (ts.isCallExpression(n) && walkOf(n) ? n : null))) {
      const since = AW.lastWaitBefore(body, call.getStart());
      if (since < 0) continue;
      // A timer the leave clears is not enough after a wait: set once the leave has run, nothing clears it.
      if (asksWhenItRuns(call, check)) continue;
      if (AW.coveredAfter(body.fn, call, since, check)) continue;
      out.push(`${file}:${AW.lineOf(sf, call)} ${owner.name}: ${walkOf(call)}`);
    }
  }
  return out;
}

/** Rule 2: each place Android's back is heard, outside useBackCloses, or there without its screen in front. */
export function backsHeardElsewhere(file: string, text: string): string[] {
  const sf = AW.parse(file, text);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && calleeText(n) === 'BackHandler.addEventListener') {
      if (file !== 'src/hooks/useBackCloses.ts') out.push(`${file}:${AW.lineOf(sf, n)} hears back outside useBackCloses`);
      else {
        let effect: ts.Node | undefined = n.parent;
        while (effect && !(ts.isCallExpression(effect) && EFFECTS.test(calleeText(effect)))) effect = effect.parent;
        const deps = effect && ts.isCallExpression(effect) ? effect.arguments[1]?.getText() ?? '' : '';
        if (!/\binFront\b/.test(deps) || !/useIsFocused\(\)/.test(text)) out.push(`${file}:${AW.lineOf(sf, n)} hears back while its screen is covered`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** A flag that holds while the work is on its way to the house. */
const IN_FLIGHT = /^(is)?(saving|sending|submitting|sealing|filing|posting|busy|inFlight|deleting|leavingTo)$/i;

/** Rule 3: each hold of the ways out that can offer Discard over a save in flight, or that lets in-flight work go unkept. */
export function holdsOverASaveInFlight(file: string, text: string): string[] {
  if (file === 'src/hooks/useAskBeforeLeaving.ts') return [];
  const sf = AW.parse(file, text);
  const consts = new Map<string, ts.Expression>();
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) consts.set(n.name.text, n.initializer);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  /** The condition false whenever a flight flag is up: some flag appears negated in an `&&` chain, through one const. */
  const excludesFlight = (e: ts.Expression, depth = 0): boolean => {
    e = AW.strip(e);
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return excludesFlight(e.left, depth) || excludesFlight(e.right, depth);
    if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) {
      const name = AW.strip(e.operand).getText().replace(/^.*\./, '');
      return IN_FLIGHT.test(name);
    }
    if (ts.isIdentifier(e) && depth < 2 && consts.has(e.text)) return excludesFlight(consts.get(e.text)!, depth + 1);
    return false;
  };
  const holds = /useHoldWhileSending\(/.test(text) || /\bwriteDraft\(/.test(text);
  const look = (n: ts.Node) => {
    if (ts.isCallExpression(n) && /^(useAskBeforeLeaving|usePreventRemove)$/.test(calleeText(n)) && n.arguments[0]) {
      if (!excludesFlight(n.arguments[0])) out.push(`${file}:${AW.lineOf(sf, n)} ${calleeText(n)} offers Discard while the work is on its way`);
      else if (!holds) out.push(`${file}:${AW.lineOf(sf, n)} ${calleeText(n)} lets the work on its way go: neither held (useHoldWhileSending) nor kept (writeDraft)`);
    }
    ts.forEachChild(n, look);
  };
  look(sf);
  return out;
}

/** Rule 4: each one-id busy set before a wait and let go after it. */
export function busyHeldAsOneId(file: string, text: string): string[] {
  const sf = AW.parse(file, text);
  const oneId = new Set<string>();
  /** Each setter's value: `[busyId, setBusyId]` holds busyId. */
  const holderOf = new Map<string, string>();
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isArrayBindingPattern(n.name) && n.initializer && ts.isCallExpression(n.initializer)
      && calleeText(n.initializer) === 'useState' && n.initializer.arguments[0]?.kind === ts.SyntaxKind.NullKeyword) {
      const setter = n.name.elements[1];
      const value = n.name.elements[0];
      if (setter && ts.isBindingElement(setter) && ts.isIdentifier(setter.name)) {
        oneId.add(setter.name.text);
        if (value && ts.isBindingElement(value) && ts.isIdentifier(value.name)) holderOf.set(setter.name.text, value.name.text);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const out: string[] = [];
  for (const body of AW.waitingBodies(sf)) {
    if (body.tail) continue;
    const sets = AW.ownNodes(body.fn, (n) => (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && oneId.has(n.expression.text) ? n : null));
    for (const name of new Set(sets.map((c) => (c.expression as ts.Identifier).text))) {
      const mine = sets.filter((c) => (c.expression as ts.Identifier).text === name);
      const raised = mine.find((c) => AW.lastWaitBefore(body, c.getStart()) < 0 && c.arguments[0] && c.arguments[0].kind !== ts.SyntaxKind.NullKeyword
        && !ts.isArrowFunction(c.arguments[0]));
      const lowered = mine.find((c) => AW.lastWaitBefore(body, c.getStart()) >= 0 && c.arguments[0]?.kind === ts.SyntaxKind.NullKeyword);
      // One act at a time is no busy row: an act that will not start while the hold has a value frees no other tap.
      const held = holderOf.get(name);
      const exclusive = !!held && !!raised && AW.ownNodes(body.fn, (n) => (ts.isIfStatement(n) && n.getStart() < raised.getStart()
        && /^(Return|Throw)Statement$/.test(ts.SyntaxKind[(ts.isBlock(n.thenStatement) ? n.thenStatement.statements[0] : n.thenStatement)?.kind ?? 0] ?? '')
        && new RegExp(`(^|[^\\w.!])${held}\\b`).test(n.expression.getText()) ? n : null)).length > 0;
      if (raised && lowered && !exclusive) out.push(`${file}:${AW.lineOf(sf, raised)} ${name}: one id held busy across a wait, let go whoever tapped since`);
    }
  }
  return out;
}

/** Rule 5: each press on words that does not go through onePress. */
export function wordsPressedTwice(file: string, text: string): string[] {
  if (!file.endsWith('.tsx')) return [];
  const sf = AW.parse(file, text);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && /^(Text|Animated\.Text)$/.test(n.tagName.getText())) {
      const press = n.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === 'onPress');
      if (press && !/\bonePress\(/.test(press.initializer?.getText() ?? '')) out.push(`${file}:${AW.lineOf(sf, n)} <${n.tagName.getText()} onPress> not through onePress`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Rule 6: each draft read or written with a type of its own, not its kind's. */
export function draftsTypedApart(file: string, text: string): string[] {
  const sf = AW.parse(file, text);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && /^(readDraft|writeDraft)$/.test(calleeText(n)) && n.typeArguments?.length) {
      out.push(`${file}:${AW.lineOf(sf, n)} ${calleeText(n)}<${n.typeArguments.map((t) => t.getText()).join(', ')}> typed apart from its kind`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const APP = SCREENS.map((f) => ({ file: rel(f), text: readCode(f) }));
const ALL = universe('appCode', { ext: ['.ts', '.tsx'] }).map((f) => ({ file: rel(f), text: readCode(f) }));
const sweep = (rule: (file: string, text: string) => string[], over = APP) => over.flatMap((f) => rule(f.file, f.text));

describe('each rule says no to its planted shape', () => {
  const plant = (rule: (f: string, t: string) => string[], text: string, file = 'app/planted.tsx') => rule(file, text);

  it('1: a walk, a timer or words that point at the screen, after a wait with no check after it', () => {
    expect(plant(walksPastTheScreen, `export default function S() {
      const save = async () => { await send(); nav.back(); };
      const later = async () => { await send(); setTimeout(() => go(), 300); };
      const said = async () => { await send(); reelToast.error('It did not go. Your words are still here.'); };
      return null; }`)).toEqual([
      'app/planted.tsx:2 S: nav.back', 'app/planted.tsx:3 S: setTimeout', 'app/planted.tsx:4 S: reelToast.error(words that point at the screen)',
    ]);
    // A check made before the wait proves nothing; a ref no leave lowers is no check; a promise's then is after a wait.
    expect(plant(walksPastTheScreen, `export function useX() {
      const ref = useRef(true);
      const go = async () => { if (!ref.current) return; await send(); nav.push('/x'); };
      const then = () => { send().then(() => router.replace('/y')); };
      return go; }`)).toEqual(['app/planted.tsx:3 useX: nav.push', 'app/planted.tsx:4 useX: router.replace']);
    // Review round 8's reset-password, put back: a walk home held in a timer the leave clears, set after
    // the wait with no check, so a leave during the wait has already run and nothing clears it.
    expect(plant(walksPastTheScreen, `export default function Reset() {
      const mountedRef = useRef(true);
      const redirectTimerRef = useRef(null);
      useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; clearTimeout(redirectTimerRef.current); }; }, []);
      const reset = async () => { await restoreSession(); redirectTimerRef.current = setTimeout(() => { nav.dismissTo('/(tabs)'); }, 3000); };
      return null; }`)).toEqual(['app/planted.tsx:5 Reset: setTimeout']);
  });

  it('1: and passes the checks it knows, made after the wait', () => {
    expect(plant(walksPastTheScreen, `export default function S() {
      const here = useStillHere();
      const mounted = useRef(true);
      const left = useRef(false);
      const timer = useRef(null);
      useEffect(() => { mounted.current = true; return () => { mounted.current = false; left.current = true; clearTimeout(timer.current); }; }, []);
      const a = async () => { await send(); if (!here()) return; nav.back(); };
      const b = async () => { await send(); if (mounted.current) nav.back(); };
      const c = async () => { await send(); if (left.current) return; router.push('/z'); };
      const d = async () => { await send(); timer.current = setTimeout(() => { if (here()) nav.back(); }, 300); };
      const e = async () => { await send(); mounted.current && nav.back(); };
      const f = async () => { try { await send(); } catch { if (!here()) return; reelToast.error('Kept here below.'); } };
      return null; }`)).toEqual([]);
  });

  it('2: Android\'s back heard outside useBackCloses', () => {
    expect(plant(backsHeardElsewhere, `useEffect(() => { const s = BackHandler.addEventListener('hardwareBackPress', () => true); return () => s.remove(); }, []);`))
      .toEqual(['app/planted.tsx:1 hears back outside useBackCloses']);
    expect(plant(backsHeardElsewhere, `export function useBackCloses(open, close) { useEffect(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true); return () => sub.remove(); }, [open]); }`, 'src/hooks/useBackCloses.ts'))
      .toEqual(['src/hooks/useBackCloses.ts:2 hears back while its screen is covered']);
  });

  it('3: Discard offered over a save in flight, and in-flight work neither held nor kept', () => {
    expect(plant(holdsOverASaveInFlight, `function S() { const [saving] = useState(false); useAskBeforeLeaving(dirty); return null; }`))
      .toEqual(['app/planted.tsx:1 useAskBeforeLeaving offers Discard while the work is on its way']);
    expect(plant(holdsOverASaveInFlight, `function S() { const unsaved = dirty && !saving; usePreventRemove(unsaved, () => {}); return null; }`))
      .toEqual(['app/planted.tsx:1 usePreventRemove lets the work on its way go: neither held (useHoldWhileSending) nor kept (writeDraft)']);
    expect(plant(holdsOverASaveInFlight, `function S() { const unsaved = dirty && !saving; useAskBeforeLeaving(unsaved); useHoldWhileSending(saving); return null; }`)).toEqual([]);
  });

  it('4: one id held busy across a wait', () => {
    expect(plant(busyHeldAsOneId, `function P() { const [busyId, setBusyId] = useState<string | null>(null);
      const admit = async (id) => { setBusyId(id); await send(id); setBusyId(null); }; return null; }`))
      .toEqual(['app/planted.tsx:2 setBusyId: one id held busy across a wait, let go whoever tapped since']);
    // One act at a time frees no other tap.
    expect(plant(busyHeldAsOneId, `function P() { const [busyId, setBusyId] = useState<string | null>(null);
      const admit = async (id) => { if (busyId) return; setBusyId(id); await send(id); setBusyId(null); }; return null; }`)).toEqual([]);
  });

  it('5: words pressed with no onePress', () => {
    expect(plant(wordsPressedTwice, `const A = () => <Text onPress={() => open()}>@a</Text>;
      const B = () => <Text onPress={() => onePress('b', () => open())}>@b</Text>;`)).toEqual(['app/planted.tsx:1 <Text onPress> not through onePress']);
  });

  it('6: a draft read with a type of its own', () => {
    expect(plant(draftsTypedApart, `const held = readDraft<{ body?: string }>(me, 'critique', id);`)).toEqual([
      'app/planted.tsx:1 readDraft<{ body?: string }> typed apart from its kind',
    ]);
  });
});

describe('the whole app, each rule', () => {
  it('reads the screens, not an empty sweep', () => {
    expect(APP.length).toBeGreaterThan(250);
    expect(APP.some((f) => /useStillHere\(\)/.test(f.text))).toBe(true);
  });

  it('1: no walk, timer or pointed words after a wait outlives its screen', () => {
    const hits = sweep(walksPastTheScreen).filter((h) => !Object.keys(LIVES_WITH_THE_APP).some((f) => h.startsWith(`${f}:`)));
    expect(hits).toEqual([]);
  });

  it('1: each component named as living with the app is still there, and is one', () => {
    for (const f of Object.keys(LIVES_WITH_THE_APP)) expect([f, APP.some((a) => a.file === f)]).toEqual([f, true]);
  });

  it('2: Android\'s back is heard in useBackCloses alone, only while its screen is in front', () => {
    expect(sweep(backsHeardElsewhere, ALL)).toEqual([]);
    expect(ALL.some((f) => f.file === 'src/hooks/useBackCloses.ts' && /BackHandler\.addEventListener/.test(f.text))).toBe(true);
  });

  it('3: no hold offers Discard over a save in flight, and work on its way is held or kept', () => {
    const hits = sweep(holdsOverASaveInFlight).filter((h) => !Object.keys(A_DESIGN_CALL_ASKED).some((f) => h.startsWith(`${f}:`)));
    expect(hits).toEqual([]);
    // Each design call asked is still a hit of this rule: once decided, it leaves this list.
    for (const f of Object.keys(A_DESIGN_CALL_ASKED)) expect([f, sweep(holdsOverASaveInFlight).some((h) => h.startsWith(`${f}:`))]).toEqual([f, true]);
  });

  it('4: no busy row is one id let go after the wait', () => {
    expect(sweep(busyHeldAsOneId)).toEqual([]);
  });

  it('5: every press on words goes through onePress', () => {
    expect(sweep(wordsPressedTwice)).toEqual([]);
  });

  it('6: every draft is typed by its kind', () => {
    expect(sweep(draftsTypedApart, ALL)).toEqual([]);
  });
});

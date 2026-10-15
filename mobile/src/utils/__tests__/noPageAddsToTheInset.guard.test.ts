/**
 * No page adds to the safe-area inset by hand: not at its top, not at its foot.
 *
 * A page that sets its own top by its own sum on `insets.top` disagrees with
 * the bar drawn over it: at a 59pt inset such a sum put the Lounge's title and
 * the member's name under the top bar. At the foot, the signed-out Lobby padded
 * only `insets.bottom`, and its two doors sat under the tab bar. Every edge is
 * read from navMetrics.ts. This reads every file in app/ and src/ with
 * TypeScript's parser and fails, naming file and line, on:
 *
 *   · a sum on the inset's top or bottom: `+`, `-`, or Math.max / Math.min around it;
 *   · the bare inset used as a padding, top, bottom, height, offset or inset;
 *   · the bare bottom inset handed to any helper but navMetrics' own;
 *   · `navTopPadding(` outside navMetrics.ts, and `tabBarHeight(` or
 *     `tabBarBottomPadding(` outside it and the tab bar's own layout.
 *
 * The inset's edge is `x.top` (or `x.bottom`) for any `x = useSafeAreaInsets()`,
 * the call's own `.top`, or a name taken out of it (`{ top }`). Passing the top
 * whole to a helper built on navMetrics is not a sum, and is allowed.
 */
import { readFileSync } from 'fs';
import { join, relative, sep } from 'path';
import ts from 'typescript';
import { MOBILE } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const HOME = 'src/components/layout/navMetrics.ts';
type Side = 'top' | 'bottom';
/** A property or prop that places something from that edge. */
const PLACING: Record<Side, RegExp> = {
  top: /top|height|padding|margin|inset|offset/i,
  bottom: /bottom|height|padding|margin|inset|offset/i,
};
/** navMetrics' helpers that take the bottom inset whole and build the edge from it. */
const BOTTOM_HELPERS = new Set(['bottomEdge', 'contentBottom', 'sheetBottom', 'aboveDockedBar']);
/** The tab bar's own sums: built in navMetrics, drawn by the tab layout, read by no page. */
const TAB_BAR_SUMS = new Set(['tabBarHeight', 'tabBarBottomPadding']);
const TAB_LAYOUT = 'app/(tabs)/_layout.tsx';
/**
 * Files whose read of the bottom inset is not a page's foot, each with why.
 * KeyboardRoom measures the keyboard: React Native's height stops at the
 * navigation bar, and the inset is what reaches the keyboard's real top edge.
 */
const NOT_A_FOOT: Record<string, string> = {
  'src/components/KeyboardRoom.tsx': 'the keyboard’s height, not a page’s foot',
};


const isInsetsCall = (n: ts.Node | undefined): boolean =>
  !!n && ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'useSafeAreaInsets';

/** Climbs past what passes a value through unchanged: parentheses, a branch, a cast. */
function valueSite(n: ts.Node): ts.Node {
  let at = n;
  for (;;) {
    const up = at.parent;
    if (ts.isParenthesizedExpression(up) || ts.isAsExpression(up) || ts.isNonNullExpression(up)) at = up;
    else if (ts.isConditionalExpression(up) && up.condition !== at) at = up;
    else return at;
  }
}

/** Why this read of the inset's edge is a hand-made edge, or null. */
function misuse(read: ts.Node, side: Side): string | null {
  const site = valueSite(read);
  const up = site.parent;
  if (ts.isBinaryExpression(up) && [
    ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken,
    ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.MinusEqualsToken,
  ].includes(up.operatorToken.kind)) return 'a sum on the inset';
  if (ts.isCallExpression(up) && up.arguments.includes(site as ts.Expression)) {
    const callee = up.expression.getText();
    if (callee === 'Math.max' || callee === 'Math.min') return `${callee} on the inset`;
    if (side === 'bottom' && !BOTTOM_HELPERS.has(callee) && !TAB_BAR_SUMS.has(callee)) {
      return `the bare inset handed to ${callee}`;
    }
    return null;
  }
  if (ts.isPropertyAssignment(up) && up.initializer === site && PLACING[side].test(up.name.getText())) {
    return `the bare inset as ${up.name.getText()}`;
  }
  if (ts.isJsxExpression(up) && ts.isJsxAttribute(up.parent) && PLACING[side].test(up.parent.name.getText())) {
    return `the bare inset as ${up.parent.name.getText()}`;
  }
  return null;
}

/** Every hand-made edge in one file's text, as `file:line why`; and how many reads it saw. */
function handMadeEdges(fileName: string, text: string, side: Side) {
  const found: string[] = [];
  let reads = 0;
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  // The names the insets are held under, and the names this edge is taken out as.
  const holders = new Set<string>();
  const edges = new Set<string>();
  const collect = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && isInsetsCall(n.initializer)) {
      if (ts.isIdentifier(n.name)) holders.add(n.name.text);
      else if (ts.isObjectBindingPattern(n.name)) {
        for (const el of n.name.elements) {
          const key = (el.propertyName ?? el.name).getText(sf);
          if (key === side && ts.isIdentifier(el.name)) edges.add(el.name.text);
        }
      }
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);

  const visit = (n: ts.Node) => {
    let read = false;
    if (ts.isPropertyAccessExpression(n) && n.name.text === side) {
      const obj = n.expression;
      read = (ts.isIdentifier(obj) && holders.has(obj.text)) || isInsetsCall(obj);
    } else if (ts.isIdentifier(n) && edges.has(n.text)) {
      // A use of the taken-out name, not its own declaration or a property key.
      const p = n.parent;
      read = !(ts.isBindingElement(p) || (ts.isPropertyAssignment(p) && p.name === n)
        || (ts.isPropertyAccessExpression(p) && p.name === n));
    }
    if (read) {
      reads += 1;
      const why = misuse(n, side);
      if (why) found.push(`${fileName}:${at(n)} ${why}`);
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const name = n.expression.text;
      if (side === 'top' && name === 'navTopPadding') {
        found.push(`${fileName}:${at(n)} navTopPadding( outside navMetrics`);
      }
      if (side === 'bottom' && TAB_BAR_SUMS.has(name) && fileName !== TAB_LAYOUT) {
        found.push(`${fileName}:${at(n)} ${name}( outside navMetrics and the tab layout`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { found, reads };
}

const appFiles = () => universe('appCode').filter((f) => !f.endsWith('.d.ts'))
  .map((f) => relative(MOBILE, f).split(sep).join('/'))
  .filter((f) => f !== HOME);

it('reads every file in app/ and src/, and no page adds to the inset’s top by hand', () => {
  const files = appFiles();
  const found: string[] = [];
  let reads = 0;
  for (const f of files) {
    const r = handMadeEdges(f, readFileSync(join(MOBILE, f), 'utf8'), 'top');
    found.push(...r.found);
    reads += r.reads;
  }
  // A walker that read nothing would pass the check below while proving nothing.
  expect(files.length).toBeGreaterThanOrEqual(440);
  // The reads that remain are handed whole to a helper: the bar's measure, the Concierge.
  expect(reads).toBeGreaterThanOrEqual(2);
  expect(found).toEqual([]);
});

it('reads every file in app/ and src/, and no page adds to the inset’s bottom by hand', () => {
  const files = appFiles();
  const found: string[] = [];
  let reads = 0;
  for (const f of files) {
    const r = handMadeEdges(f, readFileSync(join(MOBILE, f), 'utf8'), 'bottom');
    reads += r.reads;
    if (!NOT_A_FOOT[f]) found.push(...r.found);
  }
  expect(files.length).toBeGreaterThanOrEqual(440);
  // The keyboard room's read stays, and the tab bar's own: a walker blind to both proves nothing.
  expect(reads).toBeGreaterThanOrEqual(2);
  expect(found).toEqual([]);
});

it('names a real file for each read it lets stand, and each still reads the inset', () => {
  for (const f of Object.keys(NOT_A_FOOT)) {
    expect(handMadeEdges(f, readFileSync(join(MOBILE, f), 'utf8'), 'bottom').reads).toBeGreaterThan(0);
  }
});

it('says NO to each shape of a hand-made top, and passes the inset handed to a helper', () => {
  const fixture = [
    "const insets = useSafeAreaInsets();",
    "const a = <View style={{ paddingTop: insets.top }} />;",
    "const b = <View style={{ paddingTop: Math.max(insets.top + 10, 44) }} />;",
    "const c = { top: (inSheet ? 0 : insets.top) + 12 };",
    "const { top } = useSafeAreaInsets();",
    "const d = { height: top };",
    "const e = <List topInset={insets.top} />;",
    "const f = navTopPadding(insets.top);",
    "const g = useSafeAreaInsets().top - 4;",
    "const h = height - insets.top - insets.bottom;",
    "const fine = conciergeGeometry(insets.top, width);",
    "const deps = [insets.top];",
    "const other = { top: insets.bottom };",
  ].join('\n');
  expect(handMadeEdges('fixture.tsx', fixture, 'top').found).toEqual([
    'fixture.tsx:2 the bare inset as paddingTop',
    'fixture.tsx:3 a sum on the inset',
    'fixture.tsx:4 a sum on the inset',
    'fixture.tsx:6 the bare inset as height',
    'fixture.tsx:7 the bare inset as topInset',
    'fixture.tsx:8 navTopPadding( outside navMetrics',
    'fixture.tsx:9 a sum on the inset',
    'fixture.tsx:10 a sum on the inset',
  ]);
});

it('says NO to each shape of a hand-made foot, and passes the inset handed to navMetrics', () => {
  const fixture = [
    "const insets = useSafeAreaInsets();",
    "const a = <View style={[s.container, { paddingTop: topPad, paddingBottom: insets.bottom }]} />;",
    "const b = <View style={{ paddingBottom: Math.max(insets.bottom + 8, 12) }} />;",
    "const c = { bottom: Math.max(insets.bottom, 20) + 82 };",
    "const { bottom } = useSafeAreaInsets();",
    "const d = { height: bottom };",
    "const e = <List bottomInset={insets.bottom + 49} />;",
    "const f = tabBarHeight(insets.bottom);",
    "const g = useModalKeyboardPadding(insets.bottom);",
    "const h = <Dock bottomInset={insets.bottom} />;",
    "const fine = sheetBottom(insets.bottom);",
    "const deps = [insets.bottom];",
    "const other = { bottom: insets.top };",
  ].join('\n');
  expect(handMadeEdges('fixture.tsx', fixture, 'bottom').found).toEqual([
    'fixture.tsx:2 the bare inset as paddingBottom',
    'fixture.tsx:3 a sum on the inset',
    'fixture.tsx:4 Math.max on the inset',
    'fixture.tsx:6 the bare inset as height',
    'fixture.tsx:7 a sum on the inset',
    'fixture.tsx:8 tabBarHeight( outside navMetrics and the tab layout',
    'fixture.tsx:9 the bare inset handed to useModalKeyboardPadding',
    'fixture.tsx:10 the bare inset as bottomInset',
  ]);
  // The tab bar's own layout builds the bar from its sums.
  expect(handMadeEdges(TAB_LAYOUT, 'const h = tabBarHeight(insets.bottom);', 'bottom').found).toEqual([]);
});

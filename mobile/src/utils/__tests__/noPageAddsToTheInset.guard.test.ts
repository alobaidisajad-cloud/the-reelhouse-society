/**
 * No page adds to the safe-area inset by hand.
 *
 * A page that sets its own top by its own sum on `insets.top` disagrees with
 * the bar drawn over it: at a 59pt inset such a sum put the Lounge's title and
 * the member's name under the top bar. Every top is read from navMetrics.ts: a
 * tab's from the bar's measured height, a pushed screen's, a modal's and an
 * overlay's from their helpers there. This reads every file in app/ and src/
 * with TypeScript's parser and fails, naming file and line, on:
 *
 *   · a sum on the inset's top: `+`, `-`, or Math.max / Math.min around it;
 *   · the bare inset's top used as a padding, top, height, offset or inset;
 *   · `navTopPadding(` called outside navMetrics.ts.
 *
 * The inset's top is `x.top` for any `x = useSafeAreaInsets()`, the call's own
 * `.top`, or a name taken out of it (`{ top }`). Passing it whole to a helper
 * built on navMetrics is not a sum, and is allowed.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';
import ts from 'typescript';
import { MOBILE } from '@/test-utils/readCode';

const HOME = 'src/components/layout/navMetrics.ts';
const SKIP = new Set(['__tests__', 'node_modules']);
/** A property or prop that places something from the top. */
const PLACING = /top|height|padding|margin|inset|offset/i;

function codeFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) codeFiles(full, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.|\.d\.ts$/.test(e.name)) out.push(full);
  }
  return out;
}

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

/** Why this read of the inset's top is a hand-made top, or null. */
function misuse(read: ts.Node): string | null {
  const site = valueSite(read);
  const up = site.parent;
  if (ts.isBinaryExpression(up) && [
    ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken,
    ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.MinusEqualsToken,
  ].includes(up.operatorToken.kind)) return 'a sum on the inset';
  if (ts.isCallExpression(up) && up.arguments.includes(site as ts.Expression)) {
    const callee = up.expression.getText();
    if (callee === 'Math.max' || callee === 'Math.min') return `${callee} on the inset`;
    return null;
  }
  if (ts.isPropertyAssignment(up) && up.initializer === site && PLACING.test(up.name.getText())) {
    return `the bare inset as ${up.name.getText()}`;
  }
  if (ts.isJsxExpression(up) && ts.isJsxAttribute(up.parent) && PLACING.test(up.parent.name.getText())) {
    return `the bare inset as ${up.parent.name.getText()}`;
  }
  return null;
}

/** Every hand-made top in one file's text, as `file:line why`; and how many reads it saw. */
function handMadeTops(fileName: string, text: string) {
  const found: string[] = [];
  let reads = 0;
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  // The names the insets are held under, and the names their top is taken out as.
  const holders = new Set<string>();
  const tops = new Set<string>();
  const collect = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && isInsetsCall(n.initializer)) {
      if (ts.isIdentifier(n.name)) holders.add(n.name.text);
      else if (ts.isObjectBindingPattern(n.name)) {
        for (const el of n.name.elements) {
          const key = (el.propertyName ?? el.name).getText(sf);
          if (key === 'top' && ts.isIdentifier(el.name)) tops.add(el.name.text);
        }
      }
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);

  const visit = (n: ts.Node) => {
    let read = false;
    if (ts.isPropertyAccessExpression(n) && n.name.text === 'top') {
      const obj = n.expression;
      read = (ts.isIdentifier(obj) && holders.has(obj.text)) || isInsetsCall(obj);
    } else if (ts.isIdentifier(n) && tops.has(n.text)) {
      // A use of the taken-out name, not its own declaration or a property key.
      const p = n.parent;
      read = !(ts.isBindingElement(p) || (ts.isPropertyAssignment(p) && p.name === n)
        || (ts.isPropertyAccessExpression(p) && p.name === n));
    }
    if (read) {
      reads += 1;
      const why = misuse(n);
      if (why) found.push(`${fileName}:${at(n)} ${why}`);
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'navTopPadding') {
      found.push(`${fileName}:${at(n)} navTopPadding( outside navMetrics`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { found, reads };
}

it('reads every file in app/ and src/, and no page adds to the inset by hand', () => {
  const files = [...codeFiles(join(MOBILE, 'app')), ...codeFiles(join(MOBILE, 'src'))]
    .map((f) => relative(MOBILE, f).split(sep).join('/'))
    .filter((f) => f !== HOME);
  const found: string[] = [];
  let reads = 0;
  for (const f of files) {
    const r = handMadeTops(f, readFileSync(join(MOBILE, f), 'utf8'));
    found.push(...r.found);
    reads += r.reads;
  }
  // A walker that read nothing would pass the check below while proving nothing.
  expect(files.length).toBeGreaterThanOrEqual(440);
  // The reads that remain are handed whole to a helper: the bar's measure, the Concierge.
  expect(reads).toBeGreaterThanOrEqual(2);
  expect(found).toEqual([]);
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
  expect(handMadeTops('fixture.tsx', fixture).found).toEqual([
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

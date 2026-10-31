/**
 * aPageIsSizedByItsColumn.guard.test.ts — a layout sized from the width reads the column's.
 *
 * Every page sits in the reading column (navMetrics). A layout that sized itself from the WINDOW's
 * width would, on a window wider than the column (an iPad, an unfolded phone), lay out for the
 * window inside the column and run past it: poster grids, cards, the Lobby's plan, a menu's anchor.
 * So the window's width is read only where the whole window is meant, each named with why; every
 * other layout reads useColumnWidth(). Read from the syntax tree.
 */
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { files } from '@/test-utils/universe';

const ts = require('typescript');

const MOBILE = join(__dirname, '..', '..', '..', '..');
const rel = (f: string) => relative(MOBILE, f).split('\\').join('/');

/** Where the window's own width is meant. */
const WHOLE_WINDOW: Record<string, string> = {
  'src/components/layout/navMetrics.ts': 'useColumnWidth itself: the window, held to the column',
  'src/components/Preloader.tsx': 'drawn over the whole window, outside the navigator, before any page',
  'src/components/film/ShareCardModal.tsx': 'its own window; the preview is scaled to it and never past full size',
};

/** Each read of the window's width in a file: `{ width } = useWindowDimensions()` or `useWindowDimensions().width`. */
function widthReadsIn(file: string): number[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const isCall = (n: { kind: number; expression?: { getText: () => string } }) =>
    n.kind === ts.SyntaxKind.CallExpression && n.expression?.getText() === 'useWindowDimensions';
  const lines: number[] = [];
  const at = (n: { getStart: () => number }) => source.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const walk = (n: any) => {
    // const { width, ... } = useWindowDimensions();
    if (n.kind === ts.SyntaxKind.VariableDeclaration && n.initializer && isCall(n.initializer)
      && n.name.kind === ts.SyntaxKind.ObjectBindingPattern
      && n.name.elements.some((e: any) => (e.propertyName ?? e.name).getText() === 'width')) lines.push(at(n));
    // useWindowDimensions().width
    if (n.kind === ts.SyntaxKind.PropertyAccessExpression && n.name.getText() === 'width' && isCall(n.expression)) lines.push(at(n));
    ts.forEachChild(n, walk);
  };
  walk(source);
  return lines;
}

const READS = files('appCode', { ext: ['.ts', '.tsx'] }).flatMap((f) => widthReadsIn(f).map((line) => ({ file: rel(f), line })));

it('reads the window\'s width only where the whole window is meant, each with why', () => {
  expect(READS.filter((r) => !(r.file in WHOLE_WINDOW)).map((r) => `${r.file}:${r.line}`)).toEqual([]);
});

it('names nothing that no longer reads the window\'s width', () => {
  expect(Object.keys(WHOLE_WINDOW).filter((f) => !READS.some((r) => r.file === f))).toEqual([]);
});

// A window read once (Dimensions.get) keeps the size the app opened with: an iPad turned on its side or a
// phone unfolded lays out for a window that is gone. The live hook follows the window; a module that
// reads it once also listens for the change.
it('reads the window once only where it also listens for the window to change', () => {
  const once = files('appCode', { ext: ['.ts', '.tsx'] })
    .filter((f) => !/__tests__/.test(f))
    .map((f) => ({ file: rel(f), text: readFileSync(f, 'utf8') }))
    .filter(({ text }) => /\bDimensions\.get\(/.test(text) && !/\bDimensions\.addEventListener\('change'/.test(text));
  expect(once.map(({ file }) => file)).toEqual([]);
});

/** Names a size is held under, from the live hooks, that a state's or a ref's first value takes. */
function sizesFrozenIn(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const LIVE = /^(useWindowDimensions|useColumnWidth)$/;
  const sizes = new Set<string>();
  const frozen: string[] = [];
  const walk = (n: any) => {
    if (n.kind === ts.SyntaxKind.VariableDeclaration && n.initializer?.kind === ts.SyntaxKind.CallExpression && LIVE.test(n.initializer.expression.getText())) {
      if (n.name.kind === ts.SyntaxKind.Identifier) sizes.add(n.name.getText());
      else for (const e of n.name.elements ?? []) sizes.add(e.name.getText());
    }
    if (n.kind === ts.SyntaxKind.CallExpression && /^(useState|useRef)$/.test(n.expression.getText()) && n.arguments[0]) {
      const first = n.arguments[0];
      const reads = (m: any): boolean => (m.kind === ts.SyntaxKind.Identifier && sizes.has(m.getText())) || (m.kind === ts.SyntaxKind.CallExpression && LIVE.test(m.expression.getText())) || !!ts.forEachChild(m, reads);
      if (reads(first)) frozen.push(`${rel(file)}:${source.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
    }
    ts.forEachChild(n, walk);
  };
  walk(source);
  return frozen;
}

// A size given to a state or a ref as its first value keeps the window the screen opened on: the
// screen never lays out again when an iPad turns or a phone unfolds. A memo is held to what it reads
// by the hooks lint, which CI runs with no warning allowed.
it('never freezes a window or column size into a state or a ref', () => {
  expect(files('appCode', { ext: ['.ts', '.tsx'] }).filter((f) => !/__tests__/.test(f)).flatMap(sizesFrozenIn)).toEqual([]);
});

it('finds a size frozen by name or by the hook itself, and none merely read', () => {
  const { writeFileSync, mkdtempSync, rmSync } = require('fs') as typeof import('fs');
  const { tmpdir } = require('os') as typeof import('os');
  const dir = mkdtempSync(join(tmpdir(), 'frozen-'));
  const probe = join(dir, 'probe.tsx');
  writeFileSync(probe, [
    'const a = () => { const { width } = useWindowDimensions(); const [w] = useState(width / 2); };',
    'const b = () => { const col = useColumnWidth(); const r = useRef(col); };',
    'const c = () => { const [h] = useState(() => useWindowDimensions().height); };',
    'const d = () => { const col = useColumnWidth(); const [open] = useState(false); return col; };',
  ].join('\n'));
  expect(sizesFrozenIn(probe).map((at) => at.split(':').pop())).toEqual(['1', '2', '3']);
  rmSync(dir, { recursive: true, force: true });
});

it('draws the mockups in the same column the app holds its pages to', () => {
  const { readingColumn } = require('@/src/components/layout/navMetrics') as typeof import('@/src/components/layout/navMetrics');
  const harness = readFileSync(join(MOBILE, 'mockups', 'tools', 'harness.cjs'), 'utf8');
  const drawn = harness.match(/^const COLUMN = (\{.*\});$/m)?.[1];
  expect(drawn && new Function(`return ${drawn}`)()).toEqual(readingColumn);
});

it('finds both ways a width is read, and none from a height alone', () => {
  const { writeFileSync, mkdtempSync, rmSync } = require('fs') as typeof import('fs');
  const { tmpdir } = require('os') as typeof import('os');
  const dir = mkdtempSync(join(tmpdir(), 'width-'));
  const probe = join(dir, 'probe.tsx');
  writeFileSync(probe, [
    'const a = () => { const { width } = useWindowDimensions(); };',
    'const b = () => { const { width: w, height } = useWindowDimensions(); };',
    'const c = () => useWindowDimensions().width;',
    'const d = () => { const { height } = useWindowDimensions(); };',
  ].join('\n'));
  expect(widthReadsIn(probe)).toEqual([1, 2, 3]);
  rmSync(dir, { recursive: true, force: true });
});

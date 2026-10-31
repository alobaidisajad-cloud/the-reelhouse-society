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

it('draws the mockups in the same column the app holds its pages to', () => {
  const { READING_MAX } = require('@/src/components/layout/navMetrics') as typeof import('@/src/components/layout/navMetrics');
  const harness = readFileSync(join(MOBILE, 'mockups', 'tools', 'harness.cjs'), 'utf8');
  expect(harness.match(/^const COLUMN_MAX = (\d+);$/m)?.[1]).toBe(String(READING_MAX));
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

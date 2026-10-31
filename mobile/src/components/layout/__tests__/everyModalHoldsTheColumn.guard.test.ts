/**
 * everyModalHoldsTheColumn.guard.test.ts — every React Native <Modal> lays out in the reading column.
 *
 * Every page sits in the reading column (the root navigator's content style). A <Modal> is a window
 * of its own: on a window wider than the column (an iPad, an unfolded phone) its sheet or card
 * spanned the whole window, and what it placed by the page's edges stood at the window's (B3: the
 * Concierge's card opened at the window's left edge, far from the ＋ it points at). Each <Modal>
 * holds an InColumn inside it, read from the syntax tree, so a comment naming <Modal> is no modal.
 */
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { files } from '@/test-utils/universe';

const ts = require('typescript');

const MOBILE = join(__dirname, '..', '..', '..', '..');
const rel = (f: string) => relative(MOBILE, f).split('\\').join('/');

/** The modals that are not a page's, each with why. */
const WHOLE_WINDOW: Record<string, string> = {
  'src/components/film/TrailerModal.tsx': 'a film plays across the whole window, as a player does',
  'src/components/layout/ConciergeButton.tsx': 'its scrim spans the window and its card and disc stand in the readingColumn it holds itself',
};

/** Each <Modal> element in a file, with whether an InColumn stands anywhere inside it. */
function modalsIn(file: string): { line: number; held: boolean }[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const tagOf = (n: { openingElement?: { tagName: { getText: () => string } } }) => n.openingElement?.tagName.getText();
  const found: { line: number; held: boolean }[] = [];
  const holds = (n: unknown): boolean => {
    let held = false;
    const look = (c: { kind: number }) => {
      if (held) return;
      if ((c.kind === ts.SyntaxKind.JsxElement && tagOf(c as never) === 'InColumn')) { held = true; return; }
      ts.forEachChild(c, look);
    };
    ts.forEachChild(n, look);
    return held;
  };
  const walk = (n: { kind: number; getStart: () => number }) => {
    if (n.kind === ts.SyntaxKind.JsxElement && tagOf(n as never) === 'Modal') {
      found.push({ line: source.getLineAndCharacterOfPosition(n.getStart()).line + 1, held: holds(n) });
    }
    ts.forEachChild(n, walk);
  };
  walk(source);
  return found;
}

const MODALS = files('appCode', { ext: ['.tsx'] }).flatMap((f) => modalsIn(f).map((m) => ({ file: rel(f), ...m })));

it('finds the app\'s modals', () => {
  expect(MODALS.length).toBeGreaterThanOrEqual(15);
});

it('lays every modal out in the reading column, but those that are the whole window\'s, each with why', () => {
  expect(MODALS.filter((m) => !m.held && !(m.file in WHOLE_WINDOW)).map((m) => `${m.file}:${m.line}`)).toEqual([]);
});

it('names no modal as the whole window\'s that is gone, or that holds the column after all', () => {
  const files = [...new Set(MODALS.map((m) => m.file))];
  expect(Object.keys(WHOLE_WINDOW).filter((f) => !files.includes(f))).toEqual([]);
  expect(MODALS.filter((m) => m.held && m.file in WHOLE_WINDOW).map((m) => m.file)).toEqual([]);
});

it('reads a modal from the tree: a comment that names <Modal> is none, and one inside it is held', () => {
  const { writeFileSync, mkdtempSync, rmSync } = require('fs') as typeof import('fs');
  const { tmpdir } = require('os') as typeof import('os');
  const dir = mkdtempSync(join(tmpdir(), 'modal-'));
  const probe = join(dir, 'probe.tsx');
  writeFileSync(probe, '/** React Native\'s own <Modal> draws above. */\nconst A = () => <Modal visible><View /></Modal>;\nconst B = () => <Modal visible><InColumn><View /></InColumn></Modal>;\n');
  expect(modalsIn(probe)).toEqual([{ line: 2, held: false }, { line: 3, held: true }]);
  rmSync(dir, { recursive: true, force: true });
});

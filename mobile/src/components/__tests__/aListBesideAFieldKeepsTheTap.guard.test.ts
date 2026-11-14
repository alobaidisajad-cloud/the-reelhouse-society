/**
 * aListBesideAFieldKeepsTheTap.guard.test.ts — a list on the same screen as a text field takes the
 * first tap while the keyboard is up.
 *
 * A scrolling list's taps default to 'never': with a field focused, the first tap on a row, a tab
 * or a press inside the list only puts the keyboard away, and the member taps again (the search's
 * section tabs and Share to Lounge's salons did, found by the save-in-reach sweep, 2026-11-14). The
 * page and list wrappers keep the tap by default (CinematicScrollView, CinematicFlashList); every
 * other list in a file that draws a TextInput says what it does with the tap, or is named here with
 * why it holds no press a typing member reaches. Read from the syntax tree.
 */
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { files } from '@/test-utils/universe';

const ts = require('typescript');

const MOBILE = join(__dirname, '..', '..', '..');
const rel = (f: string) => relative(MOBILE, f).split('\\').join('/');

/** The lists whose taps default to 'never'. */
const LISTS = new Set(['ScrollView', 'FlatList', 'FlashList', 'SectionList', 'DraggableFlatList', 'Animated.ScrollView', 'Animated.FlatList']);

/** Lists beside a field that hold no press a typing member reaches, each with why. */
const NO_PRESS: Record<string, string> = {
  'app/(admin)/tribunal.tsx': 'the docket list: its fields are in the verdict sheet, a modal over it',
  'app/dispatch/compose.tsx': 'the door, drawn in place of the composer: no field stands beside it',
};

/** Each list element in a file that sets no keyboardShouldPersistTaps, as `file:line`. */
export function listsLettingTheTapGo(file: string): string[] {
  const code = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let field = false;
  const bare: string[] = [];
  const visit = (n: { kind: number; getStart: () => number }) => {
    const opening = n.kind === ts.SyntaxKind.JsxSelfClosingElement || n.kind === ts.SyntaxKind.JsxOpeningElement;
    if (opening) {
      const el = n as unknown as { tagName: { getText: () => string }; attributes: { properties: { name?: { getText: () => string } }[] } };
      const tag = el.tagName.getText();
      if (tag === 'TextInput') field = true;
      if (LISTS.has(tag) && !el.attributes.properties.some((p) => p.name?.getText() === 'keyboardShouldPersistTaps')) {
        bare.push(`${rel(file)}:${source.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(source);
  return field ? bare : [];
}

const APP = files('appCode', { ext: ['.tsx'] });

it('reads the app at all, and finds the lists beside its fields', () => {
  expect(APP.length).toBeGreaterThan(100);
  const fileOf = (at: string) => at.slice(0, at.lastIndexOf(':'));
  expect(APP.flatMap(listsLettingTheTapGo).map(fileOf).sort()).toEqual(Object.keys(NO_PRESS).sort());
});

it('names no list as pressless that keeps the tap after all, or is gone', () => {
  for (const f of Object.keys(NO_PRESS)) expect([f, listsLettingTheTapGo(join(MOBILE, f)).length]).toEqual([f, 1]);
});

it('finds a list beside a field that lets the first tap go, and none in a file with no field', () => {
  const { writeFileSync, mkdtempSync, rmSync } = require('fs') as typeof import('fs');
  const { tmpdir } = require('os') as typeof import('os');
  const dir = mkdtempSync(join(tmpdir(), 'tap-'));
  const withField = join(dir, 'a.tsx');
  writeFileSync(withField, 'const A = () => <><TextInput /><FlashList horizontal data={[]} /><ScrollView keyboardShouldPersistTaps="handled" /></>;\n');
  const noField = join(dir, 'b.tsx');
  writeFileSync(noField, 'const B = () => <ScrollView />;\n');
  expect(listsLettingTheTapGo(withField).map((at) => at.split(':').pop())).toEqual(['1']);
  expect(listsLettingTheTapGo(noField)).toEqual([]);
  rmSync(dir, { recursive: true, force: true });
});

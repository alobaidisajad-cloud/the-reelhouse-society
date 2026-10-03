/**
 * everyStyleIsRead.guard.test.ts — every style a sheet defines is drawn by the
 * app.
 *
 * Why source: a style nobody reads renders nothing, so no render can find it.
 * The first sweep of the whole app found sixteen, all in the sheets several
 * files share (the Dispatch paper's alone held thirteen), and one of them was
 * drawn only by the paper's mockup: a spacer the page had stopped using, so the
 * drawing showed a page the app no longer built. A dead style is a box waiting
 * to be put back by someone who assumes it means something.
 *
 * A key is read when `<sheet>.<key>` appears in its own file or, for an exported
 * sheet, in any file of the app (under whatever name it was imported). Mockups
 * and tests do not count: a style only they draw lives only in a drawing.
 */
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import ts from 'typescript';
import { readCode, MOBILE } from '@/test-utils/readCode';

/** Sheets read by a computed key, which a sweep cannot follow — each says how. */
const COMPUTED: Record<string, string> = {
  'src/components/profile/NoirPassport.tsx · s': 's[corner] draws the four corner brackets by name',
};

const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) files.push(p);
  }
};
walk(join(MOBILE, 'src'));
walk(join(MOBILE, 'app'));
const code = new Map(files.map((f) => [f, readCode(f)]));
const rel = (f: string) => relative(MOBILE, f).replace(/\\/g, '/');

interface Sheet { file: string; name: string; keys: string[]; exported: boolean }

const sheets: Sheet[] = [];
for (const f of files) {
  const text = code.get(f)!;
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(sf) === 'StyleSheet.create'
      && node.initializer.arguments[0] && ts.isObjectLiteralExpression(node.initializer.arguments[0])) {
      const keys = node.initializer.arguments[0].properties
        .map((p) => (p.name ? p.name.getText(sf).replace(/['"]/g, '') : ''))
        .filter(Boolean);
      const stmt = node.parent?.parent as ts.VariableStatement | undefined;
      const name = node.name.text;
      const exported = !!stmt?.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        || new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(text);
      sheets.push({ file: f, name, keys, exported });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** In its own file a key is read only as `<sheet>.<key>`: a film's `.title` is not the sheet's. */
const readInOwnFile = (sheet: string, k: string, src: string): boolean =>
  new RegExp(`\\b${sheet}\\.${k}\\b`).test(src);

/** Read in its own file, or (exported) in any file naming its module, under any imported name. */
const isRead = (sh: Sheet, k: string): boolean => {
  if (readInOwnFile(sh.name, k, code.get(sh.file)!)) return true;
  if (!sh.exported) return false;
  const stem = rel(sh.file).replace(/\.tsx?$/, '').split('/').pop()!;
  return files.some((g) => g !== sh.file && code.get(g)!.includes(stem) && new RegExp(`\\.${k}\\b`).test(code.get(g)!));
};

it('finds the sheets at all — a sweep of nothing proves nothing', () => {
  expect(sheets.length).toBeGreaterThan(150);
  expect(sheets.filter((s) => s.exported).length).toBeGreaterThan(3);
});

it('every key of every sheet is drawn somewhere in the app', () => {
  const dead: string[] = [];
  for (const sh of sheets) {
    if (COMPUTED[`${rel(sh.file)} · ${sh.name}`]) continue;
    // A key's own definition (`key: {`) is not a read of it.
    for (const k of sh.keys) {
      if (!isRead(sh, k)) dead.push(`${rel(sh.file)} · ${sh.name}.${k}`);
    }
  }
  expect(dead).toEqual([]);
});

it('the detector says no to a key whose name is only read off something else', () => {
  const src = 'const s = StyleSheet.create({ title: {} });\nconst heading = film.title;';
  expect(readInOwnFile('s', 'title', src)).toBe(false);
  expect(readInOwnFile('s', 'title', `${src}\n<Text style={s.title} />`)).toBe(true);
});

it('every sheet read by a computed key still is — the list cannot rot', () => {
  for (const id of Object.keys(COMPUTED)) {
    const [file, name] = id.split(' · ');
    expect(readCode(file)).toMatch(new RegExp(`\\b${name}\\[`));
  }
});

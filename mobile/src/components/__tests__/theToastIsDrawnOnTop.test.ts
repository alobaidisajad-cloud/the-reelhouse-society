/**
 * theToastIsDrawnOnTop.test.ts — a toast raised on a sheet is drawn on the sheet.
 * ─────────────────────────────────────────────────────────────────────────────
 * On iOS every route presented as a modal, and every React Native <Modal>, is a
 * native layer ABOVE the root layout. The one toast overlay lived in the root
 * layout, so a toast raised on the writing desk, a report sheet or a share sheet
 * was drawn behind the thing the member was looking at. On Android a <Modal> is
 * a separate dialog window, with the same result. Four routes patched it by
 * mounting their own overlay, and every overlay heard every toast — so those
 * toasts were drawn twice, spoken twice, timed twice.
 *
 * The fix is structural (see toastBus and ToastHost), so the guard is too. It
 * parses the app with the project's own compiler and holds four promises:
 *
 *   EVERY STACK HOSTS      each <Stack> passes screenLayout={toastScreenLayout}
 *   EVERY <Modal> HOSTS    each React Native <Modal> holds a <ToastHost /> —
 *                          inside its accessibilityViewIsModal view, if it has
 *                          one, or VoiceOver would never reach the toast
 *   ONE ROOT               a single <ToastHost layer="root" />, in app/_layout
 *   NO SECOND WAY          no route sets accessibilityViewIsModal (its layer
 *                          does), nothing mounts the old overlay, and no other
 *                          modal library slips past the <Modal> check
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const ts = require('typescript');

const MOBILE = join(__dirname, '..', '..', '..');
const rel = (f: string) => relative(MOBILE, f).replace(/\\/g, '/');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(full, out); }
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(full);
  }
  return out;
};

const FILES = [...walk(join(MOBILE, 'app')), ...walk(join(MOBILE, 'src'))];

const parse = (name: string, src: string) =>
  ts.createSourceFile(name, src, ts.ScriptTarget.Latest, true, name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

const tagOf = (n: any): string | null =>
  ts.isJsxElement(n) ? n.openingElement.tagName.getText()
    : ts.isJsxSelfClosingElement(n) ? n.tagName.getText()
      : null;

const attrsOf = (n: any) =>
  (ts.isJsxElement(n) ? n.openingElement.attributes : n.attributes).properties as any[];

/** An attribute present and not literally `={false}`. */
const hasFlag = (n: any, name: string) =>
  attrsOf(n).some((a: any) => ts.isJsxAttribute(a) && a.name.getText() === name
    && !(a.initializer && ts.isJsxExpression(a.initializer) && a.initializer.expression?.kind === ts.SyntaxKind.FalseKeyword));

const descendants = (n: any, out: any[] = []): any[] => {
  ts.forEachChild(n, (c: any) => { out.push(c); descendants(c, out); });
  return out;
};

/** The local names `Modal` is imported under from react-native in this file. */
const modalNames = (sf: any): Set<string> => {
  const names = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || st.moduleSpecifier.text !== 'react-native') continue;
    const bindings = st.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      if ((el.propertyName ?? el.name).text === 'Modal') names.add(el.name.text);
    }
  }
  return names;
};

/** Every <Modal> in a source that does not host a toast where it can be seen and heard. */
export const unhostedModals = (name: string, src: string): string[] => {
  const sf = parse(name, src);
  const names = modalNames(sf);
  if (names.size === 0) return [];
  const bad: string[] = [];
  for (const node of descendants(sf)) {
    const tag = tagOf(node);
    if (!tag || !names.has(tag)) continue;
    const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const inside = descendants(node);
    const hosts = inside.filter(n => tagOf(n) === 'ToastHost');
    if (hosts.length === 0) { bad.push(`${name}:${line}  <${tag}> has no <ToastHost />`); continue; }
    const flagged = inside.filter(n => tagOf(n) && hasFlag(n, 'accessibilityViewIsModal'));
    for (const f of flagged) {
      const within = descendants(f);
      if (!hosts.some(h => within.includes(h))) {
        const at = sf.getLineAndCharacterOfPosition(f.getStart()).line + 1;
        bad.push(`${name}:${line}  <${tag}>'s <ToastHost /> is outside its accessibilityViewIsModal view (line ${at}) — VoiceOver would skip it`);
      }
    }
  }
  return bad;
};

describe('every place a toast can be raised draws it on top', () => {
  it('every React Native <Modal> holds a <ToastHost />, where VoiceOver can reach it', () => {
    const bad = FILES.flatMap(f => unhostedModals(rel(f), readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });

  it('the scan finds the modals — it is not passing on an empty list', () => {
    const withModals = FILES.filter(f => modalNames(parse(f, readFileSync(f, 'utf8'))).size > 0);
    expect(withModals.length).toBeGreaterThanOrEqual(15);
  });

  it('every Stack gives each route its own host', () => {
    const layouts = FILES.filter(f => /app[\\/].*_layout\.tsx$/.test(f) || /app[\\/]_layout\.tsx$/.test(f));
    const stacks: string[] = [];
    const bad: string[] = [];
    for (const f of layouts) {
      const sf = parse(f, readFileSync(f, 'utf8'));
      for (const n of descendants(sf)) {
        if (tagOf(n) !== 'Stack') continue;
        stacks.push(rel(f));
        const layout = attrsOf(n).find((a: any) => ts.isJsxAttribute(a) && a.name.getText() === 'screenLayout');
        if (layout?.initializer?.expression?.getText() !== 'toastScreenLayout') bad.push(rel(f));
      }
    }
    expect(stacks).toEqual(expect.arrayContaining(['app/_layout.tsx', 'app/(admin)/_layout.tsx']));
    expect(bad).toEqual([]);
  });

  it('there is one root host, and it is in the root layout', () => {
    const roots = FILES.flatMap(f => {
      const sf = parse(f, readFileSync(f, 'utf8'));
      return descendants(sf)
        .filter(n => tagOf(n) === 'ToastHost' && attrsOf(n).some((a: any) =>
          ts.isJsxAttribute(a) && a.name.getText() === 'layer' && a.initializer?.getText() === '"root"'))
        .map(() => rel(f));
    });
    expect(roots).toEqual(['app/_layout.tsx']);
  });

  it('no route sets accessibilityViewIsModal — its layer does, around the toast too', () => {
    const bad = FILES.filter(f => rel(f).startsWith('app/')).flatMap(f => {
      const sf = parse(f, readFileSync(f, 'utf8'));
      return descendants(sf).filter(n => tagOf(n) && hasFlag(n, 'accessibilityViewIsModal'))
        .map(n => `${rel(f)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
    });
    expect(bad).toEqual([]);
  });

  it('nothing mounts the old overlay, reaches for a full-window one, or brings another modal library', () => {
    const bad = FILES.filter(f => {
      const src = readFileSync(f, 'utf8');
      return /\bToastOverlay\b|\bFullWindowOverlay\b|from 'react-native-modal'|BottomSheetModal\b/.test(src);
    }).map(rel);
    expect(bad).toEqual([]);
  });

  it('the detector can say NO — a modal without a host, and one with it in the wrong place', () => {
    const none = `import { Modal, View } from 'react-native';
      export const A = () => <Modal visible><View /></Modal>;`;
    const aliased = `import { Modal as Sheet } from 'react-native';
      export const A = () => <Sheet visible><ToastHost /></Sheet>;`;
    const outside = `import { Modal, View } from 'react-native';
      export const A = () => <Modal visible><View accessibilityViewIsModal><View /></View><ToastHost /></Modal>;`;
    const right = `import { Modal, View } from 'react-native';
      export const A = () => <Modal visible><View accessibilityViewIsModal={true}><ToastHost /></View></Modal>;`;
    expect(unhostedModals('none.tsx', none)).toHaveLength(1);
    expect(unhostedModals('aliased.tsx', aliased)).toEqual([]);
    expect(unhostedModals('outside.tsx', outside)).toHaveLength(1);
    expect(unhostedModals('right.tsx', right)).toEqual([]);
  });
});

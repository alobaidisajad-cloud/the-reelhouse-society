/**
 * everyControlHasAName.guard.test.ts — a screen reader can name every control,
 * and leave every sheet.
 *
 * Parsed with the project's own compiler, across app/ and src/:
 *
 *   A NAME       a touchable with no accessibilityLabel must hold words: text with
 *                a letter or a digit, or a value put there. An icon, or a glyph
 *                alone (✕ is read "multiplication x"), names nothing.
 *   A FIELD      every TextInput carries an accessibilityLabel.
 *   A FORWARDER  a control that takes its props by spread is named where it is
 *                used; each one here says how that is proved.
 *   A WAY OUT    every React Native <Modal> answers VoiceOver's escape gesture
 *                (a two-finger Z) with the same handler as Android's back:
 *                onAccessibilityEscape={X} where onRequestClose={X}, on an element
 *                holding every control a screen reader can reach in the sheet.
 *
 * A control lifted out of the accessibility tree (accessible={false}, or
 * importantForAccessibility "no…") is exempt: something else speaks for it.
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
    else if (e.name.endsWith('.tsx')) out.push(full);
  }
  return out;
};
const FILES = [...walk(join(MOBILE, 'app')), ...walk(join(MOBILE, 'src'))];

const TOUCHABLES = new Set(['PressableScale', 'Pressable', 'TouchableOpacity', 'TouchableHighlight', 'AnimatedPressable', 'Switch']);
/** Controls that take their props by spread, and where their name is proved. */
const FORWARDERS: Record<string, string> = {
  'src/components/ControlledInput.tsx': 'its props type requires accessibilityLabel (checked below)',
  'src/components/HapticTab.tsx': 'every visible tab sets tabBarAccessibilityLabel (checked below)',
};

const parse = (name: string, src: string) =>
  ts.createSourceFile(name, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const openOf = (n: any) => (ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null);
const attr = (open: any, name: string) =>
  open.attributes.properties.find((a: any) => ts.isJsxAttribute(a) && a.name.getText() === name);
const attrText = (open: any, name: string): string | null => {
  const a = attr(open, name);
  return a ? (a.initializer ? a.initializer.getText() : 'true') : null;
};
const hidden = (open: any) =>
  attrText(open, 'accessible') === '{false}'
  || /"no/.test(attrText(open, 'importantForAccessibility') ?? '')
  || attrText(open, 'accessibilityElementsHidden') === 'true'
  || attrText(open, 'accessibilityElementsHidden') === '{true}';
const spread = (open: any) => open.attributes.properties.some((a: any) => ts.isJsxSpreadAttribute(a));

const hasJsx = (n: any): boolean => {
  let found = false;
  const v = (m: any) => { if (found) return; if (ts.isJsxElement(m) || ts.isJsxSelfClosingElement(m) || ts.isJsxFragment(m)) { found = true; return; } ts.forEachChild(m, v); };
  v(n);
  return found;
};
/** Words among an element's children: a letter or digit, or a value put there. */
const holdsWords = (n: any): boolean => {
  if (!ts.isJsxElement(n)) return false;
  let found = false;
  const visit = (m: any) => {
    if (found || ts.isJsxAttributes(m)) return;
    if (ts.isJsxText(m) && /[\p{L}\p{N}]/u.test(m.getText())) { found = true; return; }
    if (ts.isJsxExpression(m) && m.expression && !hasJsx(m.expression)) {
      const e = m.expression;
      const literal = ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e);
      if (!literal || /[\p{L}\p{N}]/u.test(e.text)) found = true;
      return;
    }
    ts.forEachChild(m, visit);
  };
  n.children.forEach(visit);
  return found;
};

export function namelessControls(name: string, src: string): string[] {
  const sf = parse(name, src);
  const bad: string[] = [];
  const visit = (n: any) => {
    const open = openOf(n);
    if (open) {
      const tag = open.tagName.getText();
      const isField = /(^|\.)TextInput$/.test(tag);
      if ((TOUCHABLES.has(tag) || isField) && !hidden(open) && !attr(open, 'accessibilityLabel')) {
        const where = `${name}:${sf.getLineAndCharacterOfPosition(open.getStart()).line + 1} <${tag}>`;
        if (spread(open)) { if (!FORWARDERS[name]) bad.push(`${where} takes its props by spread, with no proof of its name`); }
        else if (isField) bad.push(`${where} is a field with no accessibilityLabel`);
        else if (!holdsWords(n)) bad.push(`${where} holds no words (an icon or a glyph) and has no accessibilityLabel`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return bad;
}

const modalNames = (sf: any): Set<string> => {
  const names = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || st.moduleSpecifier.text !== 'react-native') continue;
    const b = st.importClause?.namedBindings;
    if (!b || !ts.isNamedImports(b)) continue;
    for (const el of b.elements) if ((el.propertyName ?? el.name).text === 'Modal') names.add(el.name.text);
  }
  return names;
};
const descendants = (n: any, out: any[] = []): any[] => { ts.forEachChild(n, (c: any) => { out.push(c); descendants(c, out); }); return out; };

export function modalsWithoutAWayOut(name: string, src: string): string[] {
  const sf = parse(name, src);
  const names = modalNames(sf);
  const bad: string[] = [];
  for (const node of descendants(sf)) {
    if (!ts.isJsxElement(node) || !names.has(node.openingElement.tagName.getText())) continue;
    const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const close = attrText(node.openingElement, 'onRequestClose');
    if (!close) { bad.push(`${name}:${line} <Modal> has no onRequestClose`); continue; }
    const inside = descendants(node);
    const escapes = inside.filter((n) => { const o = openOf(n); return o && attrText(o, 'onAccessibilityEscape') === close; });
    if (!escapes.length) { bad.push(`${name}:${line} <Modal> has no onAccessibilityEscape=${close}`); continue; }
    const covered = new Set(escapes.flatMap((e) => [e, ...descendants(e)]));
    for (const n of inside) {
      const o = openOf(n);
      if (!o || !(TOUCHABLES.has(o.tagName.getText()) || /TextInput$/.test(o.tagName.getText())) || hidden(o)) continue;
      // Inside a hidden ancestor, it is not reachable either.
      let lifted = false;
      for (let p = n.parent; p && p !== node; p = p.parent) { const po = openOf(p); if (po && hidden(po)) { lifted = true; break; } }
      if (!lifted && !covered.has(n)) {
        bad.push(`${name}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} a control outside the sheet's escape (line ${line})`);
      }
    }
  }
  return bad;
}

describe('a screen reader can name every control', () => {
  it('no control is nameless', () => {
    expect(FILES.flatMap((f) => namelessControls(rel(f), readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('the scan reaches the app — it is not passing on nothing', () => {
    let seen = 0;
    for (const f of FILES) {
      const sf = parse(f, readFileSync(f, 'utf8'));
      for (const n of descendants(sf)) {
        const o = openOf(n);
        if (o && (TOUCHABLES.has(o.tagName.getText()) || /TextInput$/.test(o.tagName.getText()))) seen++;
      }
    }
    expect(seen).toBeGreaterThan(450);
  });

  it('each forwarder is named where it is used', () => {
    const controlled = readFileSync(join(MOBILE, 'src/components/ControlledInput.tsx'), 'utf8');
    expect(controlled).toMatch(/interface ControlledInputProps[^}]*accessibilityLabel: string;/);

    const tabs = readFileSync(join(MOBILE, 'app/(tabs)/_layout.tsx'), 'utf8');
    const screens = tabs.match(/<Tabs\.Screen[\s\S]*?\/>|<Tabs\.Screen[\s\S]*?<\/Tabs\.Screen>/g) ?? [];
    const visible = screens.filter((s) => !/href:\s*null/.test(s));
    expect(visible.length).toBeGreaterThanOrEqual(5);
    for (const s of visible) expect(s).toMatch(/tabBarAccessibilityLabel:/);
  });

  it('the detector can say NO', () => {
    const icon = `export const A = () => <PressableScale onPress={f}><X size={20} /></PressableScale>;`;
    const glyph = `export const A = () => <PressableScale onPress={f}><Text>✕</Text></PressableScale>;`;
    const field = `export const A = () => <TextInput value={v} />;`;
    const spreadIn = `export const A = (p) => <Pressable {...p} />;`;
    const words = `export const A = () => <PressableScale onPress={f}><Text>CLOSE</Text></PressableScale>;`;
    const valued = `export const A = () => <PressableScale onPress={f}><Text>{title}</Text></PressableScale>;`;
    const lifted = `export const A = () => <Pressable onPress={f} accessible={false} />;`;
    expect(namelessControls('a.tsx', icon)).toHaveLength(1);
    expect(namelessControls('a.tsx', glyph)).toHaveLength(1);
    expect(namelessControls('a.tsx', field)).toHaveLength(1);
    expect(namelessControls('a.tsx', spreadIn)).toHaveLength(1);
    expect(namelessControls('a.tsx', words)).toEqual([]);
    expect(namelessControls('a.tsx', valued)).toEqual([]);
    expect(namelessControls('a.tsx', lifted)).toEqual([]);
  });
});

describe('a screen reader can leave every sheet', () => {
  it('every <Modal> answers the escape gesture as it answers back', () => {
    expect(FILES.flatMap((f) => modalsWithoutAWayOut(rel(f), readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('the scan finds the sheets', () => {
    const withModals = FILES.filter((f) => modalNames(parse(f, readFileSync(f, 'utf8'))).size > 0);
    expect(withModals.length).toBeGreaterThanOrEqual(15);
  });

  it('the detector can say NO', () => {
    const imp = `import { Modal, View, Pressable } from 'react-native';\n`;
    const none = imp + `export const A = () => <Modal onRequestClose={close}><View><Pressable onPress={go} accessibilityLabel="Go" /></View></Modal>;`;
    const other = imp + `export const A = () => <Modal onRequestClose={close}><View onAccessibilityEscape={other}><Pressable onPress={go} accessibilityLabel="Go" /></View></Modal>;`;
    const outside = imp + `export const A = () => <Modal onRequestClose={close}><Pressable onPress={go} accessibilityLabel="Go" /><View onAccessibilityEscape={close} /></Modal>;`;
    const right = imp + `export const A = () => <Modal onRequestClose={close}><Pressable onPress={close} accessible={false} /><View onAccessibilityEscape={close}><Pressable onPress={go} accessibilityLabel="Go" /></View></Modal>;`;
    expect(modalsWithoutAWayOut('a.tsx', none)).toHaveLength(1);
    expect(modalsWithoutAWayOut('a.tsx', other)).toHaveLength(1);
    expect(modalsWithoutAWayOut('a.tsx', outside)).toHaveLength(1);
    expect(modalsWithoutAWayOut('a.tsx', right)).toEqual([]);
  });
});

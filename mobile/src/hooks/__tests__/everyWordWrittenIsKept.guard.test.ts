/**
 * everyWordWrittenIsKept.guard.test.ts — words a member writes are kept until the house has them.
 * ─────────────────────────────────────────────────────────────────────────────
 * A box the member writes in (a critique, a message, a reason, a salon's name) held its words in the
 * screen alone: the sheet closed, the app went, the screen was left before the send, and the words
 * were gone, to be typed again (round 1 found the salon, the log and the critiques; round 10 a second
 * critique typed while the first filed). Each box was mended where it was found.
 *
 * So, over the whole app: every text box is found. One whose shape says it holds no words to keep (a
 * secret, a code, an address or handle to come in by, a number, a search asked again) passes by that
 * shape. Every other box's words are kept: by useKeptWords where it is held, by a draft keeper
 * (writeDraft, keepLogDraft) that names it, followed through the props a screen hands a box and the
 * hook it took the words from; or by a keeper named here with what proves it.
 */
import * as path from 'path';
import ts from 'typescript';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const AW = require('@/test-utils/afterAwait') as typeof import('@/test-utils/afterAwait');
const MOBILE = path.join(__dirname, '..', '..', '..');
const rel = (f: string) => path.relative(MOBILE, f).split(path.sep).join('/');
type Src = { file: string; text: string };
const APP: Src[] = universe('appCode', { ext: ['.ts', '.tsx'] }).map((f) => ({ file: rel(f), text: readCode(f) }));

const BOX = /^(?:TextInput|RNTextInput|Controlled\w*Input)$/;
const KEEPER = /^(?:writeDraft|keepLogDraft)$/;

export type Box = { at: string; line: number; shape: string | null };

const attr = (el: ts.JsxOpeningLikeElement, name: string, sf: ts.SourceFile): string | null => {
  for (const a of el.attributes.properties) {
    if (ts.isJsxAttribute(a) && a.name.getText(sf) === name) return a.initializer ? a.initializer.getText(sf) : 'true';
  }
  return null;
};

/** What a box's shape says it holds, when that is no words to keep; null for words. */
function shapeOf(el: ts.JsxOpeningLikeElement, sf: ts.SourceFile): string | null {
  const a = (n: string) => attr(el, n, sf) ?? '';
  if (attr(el, 'secureTextEntry', sf) !== null) return 'a secret';
  const fill = `${a('autoComplete')} ${a('textContentType')}`;
  if (/one-time-code|oneTimeCode/.test(fill)) return 'a code';
  if (/password|newPassword/.test(fill)) return 'a secret';
  if (/email|username|emailAddress/.test(fill)) return 'an address or handle to come in by';
  if (/number-pad|numeric|decimal-pad/.test(a('keyboardType'))) return 'a number';
  if (/\bsearch\b|\bfind\b|name a film/i.test(`${a('accessibilityLabel')} ${a('placeholder')}`)) return 'a search, asked again';
  return null;
}

/** The name a box's words are held by: its value's root, or a form field's name. */
function heldBy(el: ts.JsxOpeningLikeElement, sf: ts.SourceFile): string | null {
  const v = el.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === 'value');
  const e = v?.initializer && ts.isJsxExpression(v.initializer) ? v.initializer.expression : undefined;
  if (e) {
    let x: ts.Expression = e;
    while (ts.isBinaryExpression(x)) x = x.left;                       // `source ?? ''`
    while (ts.isPropertyAccessExpression(x)) x = x.expression;          // `field.value`, `form.title`
    return ts.isIdentifier(x) ? x.text : null;
  }
  const name = attr(el, 'name', sf);
  return name ? `name=${name.replace(/[{}'"`]/g, '').replace(/\..*$/, '')}` : null;
}

/** The name a component or hook is declared by. */
const fnName = (fn: ts.Node, sf: ts.SourceFile): string | null => {
  if ((ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) && fn.name) return fn.name.getText(sf);
  for (let p = fn.parent; p && !ts.isSourceFile(p); p = p.parent) {
    if (ts.isVariableDeclaration(p)) return p.name.getText(sf);
    if (!ts.isCallExpression(p) && !ts.isParenthesizedExpression(p)) break;   // memo(function X …)
  }
  return null;
};

/** Every box in a file: `file name`, its line, and what its shape says (null: words). */
export function boxesOf(file: string, text: string): Box[] {
  if (!file.endsWith('.tsx')) return [];
  const sf = AW.parse(file, text);
  const out: Box[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && BOX.test(n.tagName.getText(sf))) {
      const held = heldBy(n, sf) ?? '(its own)';
      out.push({ at: `${file} ${held}`, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, shape: shapeOf(n, sf) });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

type Made = { kept: boolean; hook?: string; prop?: { component: string }; alias?: string };

/**
 * How a name is made in a file: from useKeptWords, a hook's answer (and which hook), a prop, another
 * name it stands for (`value ?? own`: the first), or none of these. Kept outranks a hook, a hook a
 * prop: a sheet keeping the words and handing them to its own part holds both.
 */
function madeOf(sf: ts.SourceFile, name: string): Made {
  const all: Made[] = [];
  const word = new RegExp(`\\b${name}\\b`);
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && n.initializer && word.test(n.name.getText(sf))) {
      let init: ts.Expression = n.initializer;
      if (ts.isCallExpression(init)) {
        const callee = init.expression.getText(sf);
        if (callee === 'useKeptWords') all.push({ kept: true });
        else if (/^use[A-Z]/.test(callee) && (ts.isObjectBindingPattern(n.name) || ts.isArrayBindingPattern(n.name))) all.push({ kept: false, hook: callee });
      } else if (ts.isIdentifier(n.name)) {
        while (ts.isBinaryExpression(init)) init = init.left;
        if (ts.isIdentifier(init)) all.push({ kept: false, alias: init.text });
      }
    }
    if (ts.isParameter(n) && ts.isObjectBindingPattern(n.name) && n.name.elements.some((b) => b.name.getText(sf) === name)) {
      const component = fnName(n.parent, sf);
      if (component) all.push({ kept: false, prop: { component } });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return all.find((m) => m.kept) ?? all.find((m) => m.hook) ?? all.find((m) => m.alias) ?? all.find((m) => m.prop) ?? { kept: false };
}

/** Whether a file hands a name to a draft keeper (writeDraft, keepLogDraft), anywhere in its arguments. */
function keeperNames(sf: ts.SourceFile, name: string): boolean {
  let hit = false;
  const word = new RegExp(`\\b${name}\\b`);
  const visit = (n: ts.Node) => {
    if (hit) return;
    if (ts.isCallExpression(n) && KEEPER.test(n.expression.getText(sf)) && n.arguments.some((a) => word.test(a.getText(sf)))) hit = true;
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hit;
}

/** The file a hook is imported from, by its import's path. */
function hookFile(sf: ts.SourceFile, hook: string, app: Src[]): Src | undefined {
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !s.importClause?.namedBindings || !ts.isNamedImports(s.importClause.namedBindings)) continue;
    if (!s.importClause.namedBindings.elements.some((e) => e.name.text === hook)) continue;
    const spec = (s.moduleSpecifier as ts.StringLiteral).text.replace(/^@\//, '');
    return app.find((f) => f.file.replace(/\.tsx?$/, '') === spec || f.file.replace(/\/index\.tsx?$/, '') === spec);
  }
  return undefined;
}

/** Whether the words a name holds in a file are kept: there, by the hook it came from, or by every screen handing it in. */
function keptIn(src: Src, name: string, app: Src[], depth = 0): boolean {
  if (depth > 3) return false;
  const sf = AW.parse(src.file, src.text);
  const made = madeOf(sf, name);
  if (made.kept || keeperNames(sf, name)) return true;
  if (made.alias) return keptIn(src, made.alias, app, depth + 1);
  if (made.hook) {
    const h = hookFile(sf, made.hook, app);
    return !!h && keeperNames(AW.parse(h.file, h.text), name);
  }
  if (made.prop) {
    // Each screen drawing the box hands its words in by this prop: each must keep what it hands.
    const uses: { src: Src; passed: string }[] = [];
    for (const f of app) {
      if (!f.file.endsWith('.tsx') || !f.text.includes(`<${made.prop.component}`)) continue;
      const fsf = AW.parse(f.file, f.text);
      const visit = (n: ts.Node) => {
        if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText(fsf) === made.prop!.component) {
          const a = n.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(fsf) === name);
          let e = a?.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : undefined;
          while (e && ts.isPropertyAccessExpression(e)) e = e.expression;
          if (e && ts.isIdentifier(e)) uses.push({ src: f, passed: e.text });
        }
        ts.forEachChild(n, visit);
      };
      visit(fsf);
    }
    return uses.length > 0 && uses.every((u) => keptIn(u.src, u.passed, app, depth + 1));
  }
  return false;
}

/** A box that carries another's words (a shared input, a form field), or holds none: the box → why. */
const CARRIES: Record<string, string> = {
  'src/components/ControlledInput.tsx field': 'the shared form box: a form field’s words are judged where the form is kept',
  'src/components/text/index.tsx (its own)': 'the house’s TextInput itself: every box drawn with it is read here',
  'src/components/profile/RoomParts.tsx value': 'a room’s filter words, asked of the room again',
  'app/(modals)/login.tsx username': 'a handle chosen at the door, read against the house as it is typed',
};

/** A box kept by a keeper the reading above cannot follow: the box → the file and what in it keeps it. */
const KEPT: Record<string, { file: string; by: string }> = {
  'src/features/profile/EditProfileScreen.tsx name=username': { file: 'src/hooks/useEditProfile.ts', by: "writeDraft\\(memberId, 'profile', amendmentsOf\\(values\\)\\)" },
  'src/features/profile/EditProfileScreen.tsx name=displayName': { file: 'src/hooks/useEditProfile.ts', by: "writeDraft\\(memberId, 'profile', amendmentsOf\\(values\\)\\)" },
  'src/features/profile/EditProfileScreen.tsx name=bio': { file: 'src/hooks/useEditProfile.ts', by: "writeDraft\\(memberId, 'profile', amendmentsOf\\(values\\)\\)" },
  'src/features/profile/LinksEditor.tsx name=links': { file: 'src/hooks/useEditProfile.ts', by: "writeDraft\\(memberId, 'profile', amendmentsOf\\(values\\)\\)" },
  // The log's form is handed the whole flow (LogForm's `flow`): useLogFlow keeps the form whole.
  'src/components/log/LogForm.tsx review': { file: 'src/hooks/useLogFlow.ts', by: 'keepLogDraft\\(memberId, \\{\\s*filmId, review,' },
  'src/components/log/LogForm.tsx privateNotes': { file: 'src/hooks/useLogFlow.ts', by: 'keepLogDraft\\(memberId, \\{\\s*filmId, review, rating, privateNotes,' },
  'src/components/log/LogForm.tsx watchedWith': { file: 'src/hooks/useLogFlow.ts', by: 'keepLogDraft\\(memberId, \\{[^}]*\\bwatchedWith\\b' },
  'src/components/log/EditorialDesk.tsx pullQuote': { file: 'src/hooks/useLogFlow.ts', by: 'keepLogDraft\\(memberId, \\{[^}]*\\bpullQuote\\b' },
};

/** Found and not yet mended: each comes off as it is fixed. */
const STILL_TO_FIX: string[] = [];

/** The boxes holding words that nothing keeps, over an app. */
export function openOf(app: Src[]): string[] {
  const open = new Set<string>();
  for (const f of app) {
    for (const b of boxesOf(f.file, f.text)) {
      if (b.shape || b.at in CARRIES) continue;
      const k = KEPT[b.at];
      if (k) { const h = app.find((x) => x.file === k.file); if (h && new RegExp(k.by).test(h.text)) continue; }
      const name = b.at.slice(b.at.indexOf(' ') + 1);
      if (!name.startsWith('name=') && name !== '(its own)' && keptIn(f, name, app)) continue;
      open.add(b.at);
    }
  }
  return [...open].sort();
}

describe('the finder', () => {
  const planted: Src[] = [
    { file: 'src/Planted.tsx', text: `
      import { useKept } from '@/src/hooks/useKept';
      export function Desk({ said }) {
        const [words, setWords] = useKeptWords(me, 'critique', id);
        const [loose, setLoose] = useState('');
        const [title, setTitle] = useState('');
        useEffect(() => { writeDraft(me, 'stack', { title }); }, [title]);
        const { note } = useKept();
        return (<>
          <TextInput value={words} onChangeText={setWords} />
          <TextInput value={loose} onChangeText={setLoose} />
          <TextInput value={title} onChangeText={setTitle} />
          <TextInput value={note} />
          <TextInput value={said} />
          <TextInput value={loose} secureTextEntry />
          <TextInput value={loose} accessibilityLabel="Search the stacks" />
          <TextInput value={loose} keyboardType="number-pad" />
        </>);
      }` },
    { file: 'src/hooks/useKept.ts', text: `export function useKept() { const [note] = useState(''); keepLogDraft(me, { note }); return { note }; }` },
    { file: 'src/Screen.tsx', text: `export function Screen() { const [said] = useState(''); return <Desk said={said} />; }` },
  ];

  it('finds a box whose words nothing keeps, and passes one kept where it is held, by a keeper naming it, by its hook, or by its shape', () => {
    expect(openOf(planted)).toEqual(['src/Planted.tsx loose', 'src/Planted.tsx said']);
  });

  it('follows a prop to every screen handing it in', () => {
    const kept = planted.map((f) => (f.file === 'src/Screen.tsx' ? { ...f, text: `export function Screen() { const [said, setSaid] = useKeptWords(me, 'salon', id); return <Desk said={said} />; }` } : f));
    expect(openOf(kept)).toEqual(['src/Planted.tsx loose']);
    // A box standing for a prop (`value ?? own`) is the prop's: kept by the screen handing it in, or not.
    const box: Src = { file: 'src/Box.tsx', text: `export function Box({ value }) { const [own] = useState(''); const text = value ?? own; return <TextInput value={text} />; }` };
    const handedKept: Src = { file: 'src/Holder.tsx', text: `export function Holder() { const [w] = useKeptWords(me, 'critique', id); return <Box value={w} />; }` };
    const handedLoose: Src = { file: 'src/Holder.tsx', text: `export function Holder() { const [w] = useState(''); return <Box value={w} />; }` };
    expect(openOf([box, handedKept])).toEqual([]);
    expect(openOf([box, handedLoose])).toEqual(['src/Box.tsx text']);
  });

  it('finds the instances it was made for, put back', () => {
    const putBack = (file: string, from: string, to: string) => {
      expect(APP.find((x) => x.file === file)?.text.split(from).length).toBe(2);
      return openOf(APP.map((x) => (x.file === file ? { ...x, text: x.text.split(from).join(to) } : x)));
    };
    // A stack's critique held by the screen alone.
    expect(putBack('app/stacks/[id].tsx', "useKeptWords(user?.id, 'critique', id ? `stack:${id}` : null)", "useState('')"))
      .toContain('app/stacks/[id].tsx commentText');
    // A log critique handed to its box from a screen that keeps nothing.
    expect(putBack('app/log/[id].tsx', "useKeptWords(user?.id, 'critique', id ? `log:${id}` : null)", "useState('')"))
      .toContain('src/components/log/LogComments.tsx newComment');
  });
});

describe('the whole app', () => {
  const BOXES = APP.flatMap((f) => boxesOf(f.file, f.text));

  it('reads the app, not an empty sweep', () => {
    expect(APP.length).toBeGreaterThan(400);
    expect(BOXES.length).toBeGreaterThan(40);
  });

  it('every word written is kept until the house has it, or its box holds none', () => {
    expect(openOf(APP)).toEqual([...STILL_TO_FIX].sort());
  });

  it('judges only boxes that are still there', () => {
    const at = new Set(BOXES.map((b) => b.at));
    expect([...Object.keys(CARRIES), ...Object.keys(KEPT), ...STILL_TO_FIX].filter((k) => !at.has(k))).toEqual([]);
  });
});

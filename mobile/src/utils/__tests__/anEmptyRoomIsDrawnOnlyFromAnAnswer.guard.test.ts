/**
 * An empty room is drawn only from an answer: an empty state, or words that say there is nothing,
 * stand only where the read they speak for has answered, its failure checked first.
 *
 * A read the house refused answers 200 with no rows; a read not yet asked, or one that failed, has
 * no rows either. Drawn as "nothing here", each told the member a fact nobody knew: the docket was
 * clear while its read failed (batch 26), "No salon matches that." stood before the house answered
 * (review round 9), the roster was "kept for those seated" to a seated member before it was read
 * (review round 12). The Tribunal alone was held to it (tribunalNeverLiesEmpty).
 *
 * This finder reads every file of the app (the universe's appCode) as a syntax tree. A site is an
 * EmptyState (or a room's own empty card), any words a screen draws that say there is nothing ("No …",
 * "Nothing …", "… is clear"), a count not read drawn as 0 (`x ?? 0` handed to counted(), a count prop or
 * drawn words: "MEMBERS (0)", "0 BALLOTS CAST"), and a mark not read drawn as off (`x ?? false` handed
 * to a state prop). Each must be guarded: among the conditions it is drawn under (the ternaries and
 * `&&` of the `{…}` it is decided in, the `if`s around it or returning before it in its function, and,
 * for a piece kept in a variable, a function or a component of its own, the conditions where it is
 * drawn) one names a failure or an answer. A site where the nothing is no read's (a refusal said as
 * itself, a fixed sentence, the member's own draft) is listed below with why.
 */
import { readFileSync } from 'fs';
import ts from 'typescript';
import { files, rel } from '@/test-utils/universe';

/** The components that draw a room with nothing in it. */
const EMPTY_CARDS = new Set(['EmptyState', 'EmptyMyLounges']);

/** Words that say there is nothing. */
const SAYS_NOTHING = /^(?![^]*\?\s*$)(?:\s*(?:No [A-Za-z]|Nothing\b|None\b|There (?:is|are) no\b|Not one\b)|[^]*\b(?:is|are|stands|lies) (?:clear|empty|bare)\b)/;

/**
 * A condition that names whether the read failed, or that it answered: a failure (a read failed or
 * lost), an answer, a read's state named as one (`editRead === 'withdrawn'`), or the unknown named
 * apart from the none (`=== null`: a TanStack read's data is undefined until it answers). Loading
 * alone is not one: a read that has stopped loading may have failed.
 */
const ANSWER = /(error|fail|lost\b|unreach|offline|refus|unread|isSuccess|answered|isFetched|known|\w+Read\s*===|===\s*null\b)/i;

type Site = { file: string; line: number; what: string; text: string; guards: string[]; component?: string };

/**
 * The condition texts a node is drawn under, inside its own function: the ternaries and `&&` of the
 * `{…}` it is decided in (a check further out, around the whole screen, is often another read's),
 * and every `if` around it or returning before it in its function.
 */
function guardsOf(node: ts.Node, sf: ts.SourceFile): { guards: string[]; holder: ts.Node | null } {
  const guards: string[] = [];
  let child: ts.Node = node;
  let n: ts.Node | undefined = node.parent;
  let decided = false;
  while (n) {
    if (decided && (ts.isConditionalExpression(n) || ts.isBinaryExpression(n))) {
      // Outside the `{…}` it was decided in.
    } else if (ts.isConditionalExpression(n) && child !== n.condition) {
      guards.push(n.condition.getText(sf));
      // A ternary chain: each earlier link's condition was false to reach this one.
      let up: ts.Node = n;
      while (ts.isConditionalExpression(up.parent) && (up.parent).whenFalse === up) { guards.push(up.parent.condition.getText(sf)); up = up.parent; }
    } else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && child === n.right) {
      guards.push(n.left.getText(sf));
    } else if (ts.isIfStatement(n) && child !== n.expression) {
      guards.push(n.expression.getText(sf));
    } else if (ts.isBlock(n) || ts.isSourceFile(n)) {
      // `if (…) return` before it in the same block: its condition, and what it returns (an
      // `if (!ready) return failed ? <Unreachable /> : <Retrieving />` has checked the failure).
      for (const st of n.statements) {
        if (st === child) break;
        if (ts.isIfStatement(st) && /\breturn\b/.test(st.thenStatement.getText(sf))) guards.push(`${st.expression.getText(sf)} -> ${st.thenStatement.getText(sf)}`);
      }
    }
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)) {
      return { guards, holder: n };
    }
    if (ts.isJsxExpression(n) && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) decided = true;
    child = n;
    n = n.parent;
  }
  return { guards, holder: null };
}

/** The name a function holding a site is kept under: `const x = useMemo(() => …)`, `const x = () => …`, `function x()`. */
function keptName(holder: ts.Node): string | null {
  if (ts.isFunctionDeclaration(holder)) return holder.name?.text ?? null;
  let p: ts.Node | undefined = holder.parent;
  if (p && ts.isCallExpression(p)) p = p.parent; // useMemo(() => …) / useCallback(() => …)
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  return null;
}

/** Whether a function is a component or a hook (its name starts with a capital or `use`), whose body is the screen itself. */
const isScreenBody = (holder: ts.Node) => {
  const name = keptName(holder);
  return !!name && (/^[A-Z]/.test(name) || /^use[A-Z]/.test(name)) && !(holder.parent && ts.isCallExpression(holder.parent));
};

/** Props whose words are said to a screen reader or name a control, not drawn as the room's state. */
const NOT_DRAWN = /^(accessibility\w*|testID|key|style|placeholder)$/;

/**
 * Whether a string is drawn on the screen: a JSX child, or a prop's value (`title="No …"`, the
 * branch of a ternary in one), but not a prop of an empty card (the card is the site) nor a label.
 */
function inDrawnWords(n: ts.Node): boolean {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if (ts.isJsxExpression(p) && ts.isJsxElement(p.parent)) return true;
    if (ts.isJsxExpression(p) && ts.isJsxFragment(p.parent)) return true;
    if (ts.isJsxAttribute(p)) {
      const el = p.parent.parent;
      const tag = ts.isJsxSelfClosingElement(el) || ts.isJsxOpeningElement(el) ? el.tagName.getText() : '';
      return !EMPTY_CARDS.has(tag) && !NOT_DRAWN.test(p.name.getText());
    }
    if (!(ts.isConditionalExpression(p) || ts.isParenthesizedExpression(p) || ts.isJsxExpression(p) || ts.isBinaryExpression(p))) return false;
  }
  return false;
}

/** Props that draw a number as a count. */
const COUNT_PROP = /^(count|total|films|days|votes|members|n)$/i;

/**
 * Whether `x ?? 0` (or `x || 0`) is drawn as a count: handed to counted() or to a count prop, or
 * written in drawn words. A count not read is no count of 0 (`0 BALLOTS CAST`, `MEMBERS (0)`).
 */
function drawnAsACount(n: ts.Node): boolean {
  const p = n.parent;
  if (ts.isCallExpression(p) && p.expression.getText() === 'counted' && p.arguments[0] === n) return true;
  if (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent)) return COUNT_PROP.test(p.parent.name.getText());
  if (ts.isJsxExpression(p) && (ts.isJsxElement(p.parent) || ts.isJsxFragment(p.parent))) return true;
  if (ts.isTemplateSpan(p) && ts.isJsxExpression(p.parent.parent)) return true;
  return false;
}

/** Props, and accessibilityState keys, that draw a member's mark or standing as on or off. */
const STATE_PROP = /^(checked|selected|certified|saved|marked|following|blocked|muted|active|on)$/;

/**
 * Whether `x ?? false` is drawn as a mark: handed to a state prop or an accessibilityState key. A mark
 * not read is no mark off (CERTIFY drawn as not certified before the member's marks were read).
 */
function drawnAsAState(n: ts.Node): boolean {
  const p = n.parent;
  if (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent)) return STATE_PROP.test(p.parent.name.getText());
  if (ts.isPropertyAssignment(p) && STATE_PROP.test(p.name.getText())) {
    const obj = p.parent;
    const holder = obj.parent;
    return ts.isJsxExpression(holder) && ts.isJsxAttribute(holder.parent) && /^accessibilityState$/.test(holder.parent.name.getText());
  }
  return false;
}

/** Where words are decided: the element that draws them (a `{…}` inside it only picks the wording), or the node itself outside JSX. */
function elementOf(node: ts.Node): ts.Node {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) return node;
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p)) return p;
    if (ts.isJsxOpeningElement(p)) return p.parent;
    if (ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isFunctionDeclaration(p)) return node;
  }
  return node;
}

/** Whether `const x = y ?? 0` is drawn as a count where `x` is used: a count kept in a name first. */
function keptAndDrawn(n: ts.Node, sf: ts.SourceFile): boolean {
  const decl = n.parent;
  if (!ts.isVariableDeclaration(decl) || decl.initializer !== n || !ts.isIdentifier(decl.name)) return false;
  const name = decl.name.text;
  let drawn = false;
  const visit = (x: ts.Node): void => {
    if (drawn) return;
    // Said only above 0 (`c > 0 ? counted(c, …) : verb`), the 0 standing for the unknown is never said.
    const aboveNothing = (at: ts.Node) => guardsOf(elementOf(at), sf).guards.some((g) => new RegExp(`\\b${name}\\s*(>\\s*0|>=\\s*1)\\b`).test(g));
    if (ts.isIdentifier(x) && x.text === name && x !== decl.name && !aboveNothing(x)) {
      if (drawnAsACount(x)) drawn = true;
      // Written into words a template draws (`${members} members` in a label or a line).
      else if (ts.isTemplateSpan(x.parent)) drawn = true;
    }
    ts.forEachChild(x, visit);
  };
  visit(sf);
  return drawn;
}

/** A bare name's definition in the file (`const subjectGone = subject.data === null`), so a guard kept in a name is read whole. */
function definitionsIn(sf: ts.SourceFile): Map<string, string> {
  const defs = new Map<string, string>();
  const visit = (x: ts.Node): void => {
    if (ts.isVariableDeclaration(x) && ts.isIdentifier(x.name) && x.initializer && !ts.isArrowFunction(x.initializer) && !ts.isCallExpression(x.initializer)) {
      defs.set(x.name.text, x.initializer.getText(sf));
    }
    ts.forEachChild(x, visit);
  };
  visit(sf);
  return defs;
}

/** Every site in one file. */
export function emptySites(file: string, text: string): Site[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const sites: Site[] = [];
  const defs = definitionsIn(sf);
  const add = (node: ts.Node, what: string) => {
    let { guards, holder } = guardsOf(elementOf(node), sf);
    // A piece kept in a variable or function is guarded where it is drawn, too.
    for (let depth = 0; holder && !isScreenBody(holder) && depth < 3; depth++) {
      const kept = keptName(holder);
      const use = kept ? findUse(sf, kept, holder) : null;
      if (!use) break;
      const up = guardsOf(use, sf);
      guards = guards.concat(up.guards);
      holder = up.holder;
    }
    // A guard kept in a name is read as what the name holds, one step.
    guards = guards.flatMap((g) => {
      const bare = /^!?\s*(\w+)$/.exec(g.trim())?.[1];
      const def = bare ? defs.get(bare) : undefined;
      return def ? [g, def] : [g];
    });
    // Inside a component of its own, the conditions it is drawn under are also where that component is drawn.
    const name = holder ? keptName(holder) : null;
    const component = name && /^[A-Z]/.test(name) ? name : undefined;
    sites.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, what, text: node.getText(sf).replace(/\s+/g, ' ').trim().slice(0, 80), guards, component });
  };
  const visit = (n: ts.Node): void => {
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && ts.isIdentifier(n.tagName) && EMPTY_CARDS.has(n.tagName.text)) {
      add(ts.isJsxOpeningElement(n) ? n.parent : n, 'an empty card');
    } else if (ts.isJsxText(n) && SAYS_NOTHING.test(n.text)) {
      add(n, 'words that say there is nothing');
    } else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && SAYS_NOTHING.test(n.text) && inDrawnWords(n)) {
      add(n, 'words that say there is nothing');
    } else if (ts.isBinaryExpression(n) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(n.operatorToken.kind)
      && n.right.getText(sf) === '0' && (drawnAsACount(n) || keptAndDrawn(n, sf))) {
      add(n, 'an unknown count drawn as 0');
    } else if (ts.isBinaryExpression(n) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(n.operatorToken.kind)
      && n.right.getText(sf) === 'false' && drawnAsAState(n)) {
      add(n, 'an unknown mark drawn as off');
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return sites;
}

/** Whether a site is drawn under a condition that names a failure or an answer. */
export const guarded = (s: Site) => s.guards.some((g) => ANSWER.test(g));

/** The conditions each place that draws `<Name …>` draws it under, in every file given. */
export function drawnAt(name: string, texts: { file: string; text: string }[]): { file: string; guards: string[] }[] {
  const out: { file: string; guards: string[] }[] = [];
  for (const { file, text } of texts) {
    if (!text.includes(`<${name}`)) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n: ts.Node): void => {
      if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText(sf) === name) {
        const at = ts.isJsxOpeningElement(n) ? n.parent : n;
        let { guards, holder } = guardsOf(at, sf);
        for (let depth = 0; holder && !isScreenBody(holder) && depth < 3; depth++) {
          const kept = keptName(holder);
          const use = kept ? findUse(sf, kept, holder) : null;
          if (!use) break;
          const up = guardsOf(use, sf);
          guards = guards.concat(up.guards);
          holder = up.holder;
        }
        out.push({ file, guards });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

/** The first place a kept name is used in its file, other than where it is made. */
function findUse(sf: ts.SourceFile, name: string, holder: ts.Node): ts.Node | null {
  let found: ts.Node | null = null;
  const find = (x: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(x) && x.text === name && x.parent !== holder.parent && !(ts.isVariableDeclaration(x.parent) && x.parent.name === x) && !(ts.isFunctionDeclaration(x.parent) && x.parent.name === x)) found = x;
    ts.forEachChild(x, find);
  };
  find(sf);
  return found;
}

/**
 * Whether every site is guarded: in its own file, or, inside a component of its own, at every place
 * that component is drawn (one step: a component drawn only from an answer draws its nothing from one).
 */
export function unguardedSites(sites: Site[], texts: { file: string; text: string }[]): Site[] {
  return sites.filter((s) => {
    if (guarded(s)) return false;
    if (!s.component) return true;
    const places = drawnAt(s.component, texts);
    return !places.length || places.some((p) => !p.guards.some((g) => ANSWER.test(g)));
  });
}

/**
 * Sites where the nothing is no read's, as `file  words`, each with why.
 */
const JUDGED: Record<string, string> = {
  'app/(admin)/tribunal.tsx  No member named — this case can only be dismissed.':
    "a fact of a case the docket read answered with: the report names no member (proof: theTribunalReadsTheWholeRecord; the docket's own failure, tribunalNeverLiesEmpty)",
  "app/dispatch/compose.tsx  'None, as filed'":
    "the member's own draft, read back to them in its preview: no film or series attached is what they chose, no read's",
  'app/dispatch/room/[username].tsx  No such member.':
    "`missing` is set only when the house answered with no member of that name; a failed read is said as one (proof: roomScreen, 'a read that failed is NOT \"no such member\"')",
  'src/components/MembersOnly.tsx  <EmptyState buster="unimpressed" title="For Members" subtitle="Identify yourself':
    "the door of a members' room to a visitor: the phone's own session decides it, not a read (proof: aMembersRoomAsksAStrangerIn)",
  'src/components/society/PrivilegeLedger.tsx  Nothing is sold here that the house does not do.':
    "a fixed sentence of the Society page about what it sells, not a room's contents",
  'app/(admin)/tribunal.tsx  accused?.warning_count ?? 0':
    'WarningBadge draws nothing for 0, so an unknown count and none are both drawn as nothing, never as "0 WARNINGS"',
  'app/dispatch/compose.tsx  door.films ?? 0':
    "drawn only behind a closed door, and only an answered read closes it (useDoor: no answer leaves the door open with no counts), so the house's number is always there",
  'app/dispatch/compose.tsx  door.days ?? 0':
    "drawn only behind a closed door, and only an answered read closes it (useDoor: no answer leaves the door open with no counts), so the house's number is always there",
  'src/components/lounge/JoinedLoungeCard.tsx  lounge.unread_count ?? 0':
    'said and drawn only above 0 (the news line and the NEW tag both ask unread > 0), so an unknown count says nothing',
};

const keyOf = (s: Site) => `${s.file}  ${s.text}`;

describe('an empty room is drawn only from an answer', () => {
  const texts = files('appCode', { ext: ['.tsx'] }).map((p) => ({ file: rel(p).replace(/^mobile\//, ''), text: readFileSync(p, 'utf8') }));
  const sites = texts.flatMap(({ file, text }) => emptySites(file, text));
  const open = unguardedSites(sites, texts);

  it('reads every screen of the app, and finds its empty rooms', () => {
    expect(texts.length).toBeGreaterThan(150);
    expect(sites.length).toBeGreaterThan(40);
  });

  it('draws no empty room, and says no nothing, before the read has answered, but where judged', () => {
    expect(open.filter((s) => !JUDGED[keyOf(s)]).map((s) => `${s.file}:${s.line}  ${s.what}  ${s.text}  [${s.guards.join(' | ')}]`)).toEqual([]);
    // A judged place that is guarded now, or gone, is let go.
    const held = new Set(open.map(keyOf));
    expect(Object.keys(JUDGED).filter((k) => !held.has(k))).toEqual([]);
  });

  it('finds each planted shape, and passes an empty room drawn from an answer', () => {
    const planted = [
      'export function A({ rows }) { return rows.length === 0 ? <EmptyState title="Nothing" /> : <List rows={rows} />; }',
      'export function B({ q }) { return <View>{q.data?.length === 0 && <Text>No salon matches that.</Text>}</View>; }',
      'export function C({ q }) { const empty = useMemo(() => <EmptyState title="x" />, []); return <FlatList data={q.data} ListEmptyComponent={empty} />; }',
      // Drawn from an answer: the failure first, or the answer named.
      'export function D({ q }) { return q.isError ? <EmptyOffline /> : q.data?.length === 0 ? <EmptyState title="x" /> : null; }',
      'export function E({ q }) { if (q.isError) return <EmptyOffline />; return <EmptyState title="x" />; }',
      'export function F({ q }) { const empty = useMemo(() => (failed ? <EmptyOffline /> : <EmptyState title="x" />), [failed]); return <FlatList ListEmptyComponent={empty} />; }',
      'export function G({ q }) { return <FlatList ListEmptyComponent={q.isSuccess ? <Text>{"No films yet."}</Text> : null} />; }',
      // Words in a prop are drawn words; a label is not; a guard kept in a name is read as it.
      'export function H({ q }) { return <Corridor title={q.data?.length === 0 ? "No salon matches that." : "x"} />; }',
      'export function I() { return <Pressable accessibilityLabel="No thanks" />; }',
      'export function J({ q }) { const gone = q.data === null; return gone ? <EmptyState title="x" /> : null; }',
      // Another read's failure checked around the screen is not this read's (round 9's search).
      'export function K({ q, r }) { return q.isError ? <EmptyOffline /> : <View>{r.data?.length === 0 ? <Text>No salon matches that.</Text> : null}</View>; }',
      'export function L({ r }) { return <View>{r.isError ? <TryAgain /> : r.data?.length === 0 ? <Text>{r.q ? "No one by that name." : "No one here."}</Text> : null}</View>; }',
      // A count not read drawn as 0: handed to counted(), a count prop, drawn words, or kept in a name and drawn.
      'export function M({ room }) { return <Text>{counted(room.member_count ?? 0, "MEMBER", "MEMBERS")}</Text>; }',
      'export function N({ room }) { return <StatCard count={room.followers || 0} />; }',
      'export function O({ room }) { const members = room.member_count || 0; return <Pressable accessibilityLabel={`${members} members`} />; }',
      'export function P({ room }) { const width = room.w ?? 0; return <View style={{ width }} />; }',
      'export function Q({ count }) { const c = count ?? 0; return c > 0 ? <Text>{`${c} critiques`}</Text> : null; }',
      // A mark not read drawn as off, in a prop or in what a screen reader is told.
      'export function R({ marks }) { return <CertifyButton certified={marks.certified ?? false} />; }',
      'export function S({ marks }) { return <Pressable accessibilityState={{ checked: marks.saved || false }} />; }',
      'export function T({ marks }) { return marks.known ? <CertifyButton certified={marks.certified} /> : null; }',
    ].join('\n');
    expect(emptySites('planted.tsx', planted).filter((s) => !guarded(s)).map((s) => s.line)).toEqual([1, 2, 3, 8, 11, 13, 14, 15, 18, 19]);
  });

  it('follows a component of its own to every place it is drawn', () => {
    const card = { file: 'card.tsx', text: 'export const Nothing = memo(function Nothing() { return <Text>Nothing in the tray.</Text>; });' };
    const site = emptySites(card.file, card.text);
    expect(site.map((s) => s.component)).toEqual(['Nothing']);
    const answered = { file: 'a.tsx', text: 'export function A({ q }) { return q.isError ? <EmptyOffline /> : <Nothing />; }' };
    const unasked = { file: 'b.tsx', text: 'export function B({ q }) { return q.data?.length ? null : <Nothing />; }' };
    expect(unguardedSites(site, [card, answered])).toEqual([]);
    expect(unguardedSites(site, [card, answered, unasked]).length).toBe(1);
    // Drawn nowhere it can be seen, it is judged where it stands.
    expect(unguardedSites(site, [card]).length).toBe(1);
  });
});

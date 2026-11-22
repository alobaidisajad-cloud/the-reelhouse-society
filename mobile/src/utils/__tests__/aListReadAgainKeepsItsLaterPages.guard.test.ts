/**
 * aListReadAgainKeepsItsLaterPages.guard.test.ts — a list read again keeps the pages read past its first.
 * ─────────────────────────────────────────────────────────────────────────────
 * A list drawn page by page holds its first page and every page the member read after it. When the
 * first page alone is read again (a count changed, the app came back, a verdict was given) and put in
 * the list's place, every page read past it leaves: the member is thrown back to the top. Round 5
 * found it on a stack past 500 films, round 9 in the Log Archive and a salon read back past 400;
 * each was fixed at its one list.
 *
 * So, over the whole app: every list a file grows page by page (a write whose new value spreads the
 * old one and something more) is found, with every write that puts something else in its place (a
 * value not made from the old one, an emptying aside) and every write that cuts it through a cap. Each
 * such write is either a start over the member asked for (an open, a pull, another search or filter),
 * judged here with its reason, or keeps what was read past the first page, named by what keeps it.
 */
import * as path from 'path';
import ts from 'typescript';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const AW = require('@/test-utils/afterAwait') as typeof import('@/test-utils/afterAwait');
const MOBILE = path.join(__dirname, '..', '..', '..');
const rel = (f: string) => path.relative(MOBILE, f).split(path.sep).join('/');
const APP = universe('appCode', { ext: ['.ts', '.tsx'] }).map((f) => ({ file: rel(f), text: readCode(f) }));

type Write = { key: string; value: ts.Expression; node: ts.Node; setter: boolean };

const unwrap = (e: ts.Expression): ts.Expression => {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return e;
};
const enclosingFn = (n: ts.Node): ts.Node | null => {
  for (let x = n.parent; x && !ts.isSourceFile(x); x = x.parent) if (ts.isFunctionLike(x)) return x;
  return null;
};
const isFn = (n: ts.Node): n is ts.ArrowFunction | ts.FunctionExpression => ts.isArrowFunction(n) || ts.isFunctionExpression(n);
const SETTER = /^set[A-Z]\w*$/;
const STORE_SET = /^(?:set|setState)$/;
const lastName = (e: ts.Expression, sf: ts.SourceFile) => e.getText(sf).replace(/^.*\./, '');

/** Every write of a named value: `setX(v)` writes `x`; an object handed to a store's set (or returned by its updater), or a reducer's `{ ...state, k: v }`, writes `k`. */
function writesOf(sf: ts.SourceFile): Write[] {
  const out: Write[] = [];
  const objectsOf = (e: ts.Expression): ts.ObjectLiteralExpression[] => {
    e = unwrap(e);
    if (ts.isObjectLiteralExpression(e)) return [e];
    if (ts.isConditionalExpression(e)) return [...objectsOf(e.whenTrue), ...objectsOf(e.whenFalse)];
    if (!isFn(e)) return [];
    if (!ts.isBlock(e.body)) return objectsOf(e.body);
    const found: ts.ObjectLiteralExpression[] = [];
    const v = (m: ts.Node) => {
      if (ts.isFunctionLike(m)) return;
      if (ts.isReturnStatement(m) && m.expression) found.push(...objectsOf(m.expression));
      ts.forEachChild(m, v);
    };
    e.body.statements.forEach(v);
    return found;
  };
  const props = (o: ts.ObjectLiteralExpression) => o.properties.filter(ts.isPropertyAssignment)
    .map((p) => ({ key: p.name.getText(sf), value: p.initializer, node: p as ts.Node, setter: false }));
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && n.arguments[0]) {
      const callee = n.expression;
      if (ts.isIdentifier(callee) && SETTER.test(callee.text)) {
        out.push({ key: callee.text.charAt(3).toLowerCase() + callee.text.slice(4), value: n.arguments[0], node: n, setter: true });
      }
      if (STORE_SET.test(lastName(callee, sf))) for (const o of objectsOf(n.arguments[0])) out.push(...props(o));
    }
    if (ts.isObjectLiteralExpression(n) && n.properties.some((p) => ts.isSpreadAssignment(p) && /^(?:state|s|prev)$/.test(p.expression.getText(sf)))) {
      out.push(...props(n));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** The names a write calls the old value by: an updater's parameter, `state`, `get()`. */
function oldNames(w: Write, sf: ts.SourceFile): Set<string> {
  const names = new Set(['state', 'get()']);
  const own = unwrap(w.value);
  if (w.setter && isFn(own) && own.parameters[0]) names.add(own.parameters[0].name.getText(sf));
  for (let x: ts.Node = w.node; !ts.isSourceFile(x); x = x.parent) {
    const c = x.parent;
    if (isFn(x) && ts.isCallExpression(c) && c.arguments[0] === x && (SETTER.test(lastName(c.expression, sf)) || STORE_SET.test(lastName(c.expression, sf)))) {
      const p = x.parameters[0];
      if (p && ts.isIdentifier(p.name)) names.add(p.name.text);
    }
  }
  return names;
}

/** What a name the write's own function declares in scope was made from (null for one from outside it). */
function initIn(w: Write, name: string): ts.Expression | null {
  const fn = enclosingFn(w.node);
  for (let a = w.node.parent; a && a !== fn && !ts.isSourceFile(a); a = a.parent) {
    const stmts = ts.isBlock(a) || ts.isCaseClause(a) || ts.isDefaultClause(a) ? a.statements : null;
    if (!stmts) continue;
    for (const s of stmts) {
      if (!ts.isVariableStatement(s)) continue;
      for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) return d.initializer;
    }
  }
  return null;
}

/** Whether a value is made from the list's old value, following the function's own names back (a callback's body is not the value). */
function fromOld(e: ts.Node, w: Write, sf: ts.SourceFile, seen = new Set<string>()): boolean {
  const names = oldNames(w, sf);
  let hit = false;
  const v = (m: ts.Node) => {
    if (hit) return;
    if (m !== e && isFn(m)) return;
    if (ts.isPropertyAccessExpression(m)) {
      if (m.name.text === w.key && names.has(unwrap(m.expression).getText(sf))) hit = true;
      else v(m.expression);
      return;
    }
    if (ts.isIdentifier(m)) {
      if (w.setter && names.has(m.text)) hit = true;
      else if (m.text === w.key && !initIn(w, m.text)) hit = true;
      else if (!seen.has(m.text)) {
        seen.add(m.text);
        const init = initIn(w, m.text);
        if (init && fromOld(init, w, sf, seen)) hit = true;
      }
      return;
    }
    ts.forEachChild(m, v);
  };
  v(e);
  return hit;
}

/** Whether a value grows the list: an array spreading its old value and something more, or the old value's concat. */
function grows(e: ts.Node, w: Write, sf: ts.SourceFile, seen = new Set<string>()): boolean {
  let hit = false;
  const v = (m: ts.Node) => {
    if (hit) return;
    if (ts.isIdentifier(m) && !seen.has(m.text)) {
      seen.add(m.text);
      const init = initIn(w, m.text);
      if (init && grows(init, w, sf, seen)) hit = true;
      return;
    }
    if (ts.isArrayLiteralExpression(m)) {
      const spread = m.elements.filter(ts.isSpreadElement).map((s) => fromOld(s.expression, w, sf));
      if (spread.length >= 2 && spread.includes(true) && spread.includes(false)) hit = true;
    }
    if (ts.isCallExpression(m) && ts.isPropertyAccessExpression(m.expression) && m.expression.name.text === 'concat' && fromOld(m.expression.expression, w, sf)) hit = true;
    ts.forEachChild(m, v);
  };
  v(e);
  return hit;
}

/** The values a write can end as: each side of a choice, a block's returns, the list a sort, filter or dedupe is given, followed through names. */
function branches(e: ts.Node, w: Write, seen = new Set<string>()): ts.Node[] {
  if (ts.isExpression(e)) e = unwrap(e);
  if (ts.isConditionalExpression(e)) return [...branches(e.whenTrue, w, seen), ...branches(e.whenFalse, w, seen)];
  if (ts.isBinaryExpression(e) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(e.operatorToken.kind)) {
    return [...branches(e.left, w, seen), ...branches(e.right, w, seen)];
  }
  if (ts.isBlock(e)) {
    const found: ts.Node[] = [];
    const v = (m: ts.Node) => {
      if (ts.isFunctionLike(m)) return;
      if (ts.isReturnStatement(m) && m.expression) found.push(...branches(m.expression, w, seen));
      ts.forEachChild(m, v);
    };
    e.statements.forEach(v);
    return found;
  }
  if (ts.isIdentifier(e) && !seen.has(e.text)) {
    seen.add(e.text);
    const init = initIn(w, e.text);
    if (init) return branches(init, w, seen);
  }
  if (ts.isCallExpression(e)) {
    const c = e.expression;
    if (ts.isPropertyAccessExpression(c) && /^(?:filter|sort|slice|map|toSorted|reverse)$/.test(c.name.text)) return branches(c.expression, w, seen);
    if (ts.isIdentifier(c) && e.arguments[0] && !isFn(e.arguments[0])) return branches(e.arguments[0], w, seen);
  }
  return [e];
}

const emptied = (e: ts.Node) => {
  const x = ts.isExpression(e) ? unwrap(e) : e;
  return (ts.isArrayLiteralExpression(x) && !x.elements.length) || (ts.isObjectLiteralExpression(x) && !x.properties.length) || x.kind === ts.SyntaxKind.NullKeyword;
};

/** The name of the function a write stands in: its declaration, its variable, its property, its useCallback. */
function fnName(n: ts.Node, sf: ts.SourceFile): string {
  for (let a = n.parent; a && !ts.isSourceFile(a); a = a.parent) {
    if ((ts.isFunctionDeclaration(a) || ts.isMethodDeclaration(a)) && a.name) return a.name.getText(sf);
    if (isFn(a)) {
      const p = a.parent;
      if (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p)) return p.name.getText(sf);
      if (ts.isCallExpression(p) && /^(?:useCallback|useMemo)$/.test(p.expression.getText(sf)) && ts.isVariableDeclaration(p.parent)) return p.parent.name.getText(sf);
    }
  }
  return '(render)';
}

/** The cap a grown value is put through: a same-file function whose body slices what it is given. */
function capOf(e: ts.Node, w: Write, sf: ts.SourceFile): string | null {
  const caps = new Set<string>();
  const visit = (n: ts.Node) => {
    const body = ts.isFunctionDeclaration(n) ? n.body : ts.isVariableDeclaration(n) && n.initializer && isFn(n.initializer) ? n.initializer.body : undefined;
    const name = ts.isFunctionDeclaration(n) || ts.isVariableDeclaration(n) ? n.name?.getText(sf) : undefined;
    if (body && name && /\.slice\(/.test(body.getText(sf))) caps.add(name);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  // The value's outermost calls on each side of a choice: a cap given the old list, or its slice.
  const tops = (x: ts.Node, seen = new Set<string>()): ts.Node[] => {
    if (ts.isExpression(x)) x = unwrap(x);
    if (ts.isConditionalExpression(x)) return [...tops(x.whenTrue, seen), ...tops(x.whenFalse, seen)];
    if (ts.isBlock(x)) {
      const found: ts.Node[] = [];
      const r = (m: ts.Node) => {
        if (ts.isFunctionLike(m)) return;
        if (ts.isReturnStatement(m) && m.expression) found.push(...tops(m.expression, seen));
        ts.forEachChild(m, r);
      };
      x.statements.forEach(r);
      return found;
    }
    if (ts.isIdentifier(x) && !seen.has(x.text)) {
      seen.add(x.text);
      const init = initIn(w, x.text);
      if (init) return tops(init, seen);
    }
    return [x];
  };
  for (const t of tops(e)) {
    if (!ts.isCallExpression(t)) continue;
    const c = t.expression;
    if (ts.isIdentifier(c) && caps.has(c.text) && t.arguments[0] && fromOld(t.arguments[0], w, sf)) return c.text;
    if (ts.isPropertyAccessExpression(c) && c.name.text === 'slice' && fromOld(c.expression, w, sf)) return '.slice';
  }
  return null;
}

export type PageHit = { at: string; line: number; how: 'replaces' | 'cuts'; by?: string };

/** Each write that puts something else in the place of a list the file grows page by page, or cuts it: `file key in fn`. */
export function pageHits(file: string, text: string): PageHit[] {
  if (!text.includes('...') && !text.includes('concat')) return [];
  const sf = AW.parse(file, text);
  const all = writesOf(sf);
  const valueOf = (w: Write): ts.Node => {
    const v = unwrap(w.value);
    return w.setter && isFn(v) ? v.body : w.value;
  };
  const grown = new Set(all.filter((w) => grows(valueOf(w), w, sf)).map((w) => w.key));
  const hits: PageHit[] = [];
  for (const w of all) {
    if (!grown.has(w.key) || emptied(w.value)) continue;
    const v = valueOf(w);
    const at = `${file} ${w.key} in ${fnName(w.node, sf)}`;
    const line = AW.lineOf(sf, w.node);
    const cap = capOf(v, w, sf);
    if (cap) hits.push({ at, line, how: 'cuts', by: cap });
    else if (branches(v, w).some((b) => !emptied(b) && !fromOld(b, w, sf))) hits.push({ at, line, how: 'replaces' });
  }
  return hits;
}

export const appPageHits = (app: { file: string; text: string }[]) => app.flatMap((f) => pageHits(f.file, f.text));

/** A start over the member asked for, or a ceiling past any reading: the write → why. */
const STARTS_OVER: Record<string, string> = {
  'app/(modals)/social-modal.tsx profiles in showRead': 'the circle read as it opens, or pulled from the top',
  'app/(tabs)/darkroom.tsx accumulatedFilms in fetchContent': 'page one of another search, filter or mood; held to 5,000 films, past any scrolling',
  'src/hooks/useDispatchArchive.ts filings in page': 'page(0): the archive opened on a film or a search, or tried again',
  'src/hooks/useFollowRequests.ts items in load': 'opened, searched or pulled: the requests read from the top',
  'src/hooks/useMemberRoom.ts filings in page': 'page(0): a member’s room opened, or tried again',
  'src/hooks/useProfileData.ts watchlist in profileReducer': 'a room’s first page: the room opened, or its filters changed',
  'src/hooks/useProfileData.ts vault in profileReducer': 'a room’s first page: the room opened, or its filters changed',
  'src/hooks/useProfileData.ts lists in profileReducer': 'a room’s first page: the room opened, or its filters changed',
  'src/stores/domain/archiveSlice.ts physicalArchive in fetchPhysicalArchive': 'the shelf’s first page: its room opened, or its filters changed',
  'src/stores/domain/listSlice.ts lists in fetchLists': 'the stacks’ first page: their room opened',
  'src/stores/domain/watchlistSlice.ts watchlist in fetchWatchlist': 'the watchlist’s first page: its room opened',
  'src/stores/domain/watchlistSlice.ts watchlist in dbOperation': 'a failed write undoes its own act (WRITE-a-rollback-that-undoes-another-write judges it)',
  'src/stores/notificationStore.ts notifications in loadMoreNotifications': 'held to 500 notices on the phone, said at the board’s foot',
  'src/stores/notificationStore.ts notifications in applyIncomingNotification': 'held to 500 notices on the phone: one heard live lets the oldest go',
};

/** A write that keeps what was read past the first page: the write → what keeps it (a pattern its function holds), and how. */
const KEEPS: Record<string, { by: string; why: string }> = {
  'app/film-reviews/[id].tsx logs in showPage': { by: 'heldRaw\\.current = \\(isLoadMore \\? heldRaw\\.current : 0\\)', why: 'the top is read again as far as the member had read (heldRaw sizes it)' },
  'src/stores/lounge.ts currentMessages in fetchMessages': { by: 'return get\\(\\)\\.catchUpMessages\\(loungeId\\)', why: 'a room still held is caught up, never read whole; a room left is kept and caught up' },
  'src/stores/lounge.ts currentMessages in sendMessage': { by: '_readBackIn', why: 'the cap keeps every word of a room read back past its window' },
  'src/components/admin/SanctionsList.tsx items in SanctionsList': { by: 'readAsFar\\(.*asFar\\.current', why: 'read again as far as the admin had read (readAsFar)' },
  'src/components/admin/AppealsDocket.tsx items in AppealsDocket': { by: 'readAsFar\\(.*asFar\\.current', why: 'read again as far as the moderator had read (readAsFar)' },
  'src/components/moderation/VerdictRecord.tsx items in VerdictRecord': { by: 'readAsFar\\(.*asFar\\.current', why: 'read again as far as the member had read (readAsFar)' },
  'src/stores/lounge.ts currentMessages in subscribeToLounge': { by: '_readBackIn', why: 'the cap keeps every word of a room read back past its window' },
};

/** Found and not yet mended: each comes off as it is fixed. */
const STILL_TO_FIX: string[] = [
  // Read again after a verdict (its queries asked again): the dockets go back to their first page.
  'app/(admin)/tribunal.tsx pendingItems in TribunalScreen',
  'app/(admin)/tribunal.tsx priorityItems in TribunalScreen',
  // A profile come back to after its read went stale reads its logs again from the first page
  // (USER_DATA_LOADED for another member's, fetchLogs for the member's own).
  'src/hooks/useProfileData.ts archiveLogs in profileReducer',
  'src/hooks/useProfileData.ts ledgerLogs in profileReducer',
  'src/hooks/useProfileData.ts mainLogs in profileReducer',
  'src/stores/domain/logSlice/helpers/logOperations.ts logs in fetchLogsOp',
  // The app come back to, or its channel back: the board is read again at its first page alone.
  'src/stores/notificationStore.ts notifications in fetchNotifications',
];

/** Whether a kept write still holds the name that keeps it, in the function it stands in. */
function keeps(hit: PageHit, app: { file: string; text: string }[]): boolean {
  const k = KEEPS[hit.at];
  if (!k) return false;
  const file = hit.at.slice(0, hit.at.indexOf(' '));
  // A cut is kept by its cap; a write by its own function.
  const fn = hit.how === 'cuts' && hit.by && hit.by !== '.slice' ? hit.by : hit.at.slice(hit.at.indexOf(' in ') + 4);
  const f = app.find((x) => x.file === file);
  if (!f) return false;
  const sf = AW.parse(file, f.text);
  let body = '';
  const visit = (n: ts.Node) => {
    if (body) return;
    const named = (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name?.getText(sf) === fn ? n
      : (ts.isVariableDeclaration(n) || ts.isPropertyAssignment(n)) && n.name.getText(sf) === fn ? n : null;
    if (named) body = named.getText(sf);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return new RegExp(k.by).test(body);
}

/** The writes neither judged a start over nor kept, over an app. */
export const openOf = (app: { file: string; text: string }[]) =>
  [...new Set(appPageHits(app).filter((h) => !(h.at in STARTS_OVER) && !keeps(h, app)).map((h) => h.at))].sort();

describe('the finder', () => {
  it('finds a list grown page by page put in its place by a first page, or cut, and passes one kept', () => {
    const planted = `
      function Docket() {
        const [items, setItems] = useState([]);
        const more = async () => { const rows = await read(after); setItems((prev) => [...prev, ...rows]); };
        const again = async () => { const first = await read(null); setItems(first); };
        const keep = async () => { const first = await read(null); setItems((prev) => [...first, ...prev.slice(first.length)]); };
        const clear = () => setItems([]);
      }
      const capped = (xs) => xs.slice(-400);
      const useRoom = create((set, get) => ({
        words: [],
        older: async () => { const got = await read(); set((st) => ({ words: [...got, ...st.words] })); },
        heard: (m) => set((st) => ({ words: capped([...st.words, m]) })),
        open: async () => { const got = await read(); set({ words: got }); },
        filter: () => set((st) => ({ words: st.words.filter((w) => w.ok) })),
      }));`;
    expect(pageHits('src/planted.tsx', planted).map((h) => `${h.at} ${h.how}${h.by ? ` ${h.by}` : ''}`)).toEqual([
      'src/planted.tsx items in again replaces',
      'src/planted.tsx words in heard cuts capped',
      'src/planted.tsx words in open replaces',
    ]);
  });

  it('follows a first page through its names, its sort and dedupe, and each side of a choice', () => {
    const planted = `
      function useList() {
        const [rows, setRows] = useState([]);
        const read = async (more) => {
          const page = await ask();
          setRows((prev) => { if (!more) return page; const have = new Set(prev.map((r) => r.id)); return [...prev, ...page.filter((r) => !have.has(r.id))]; });
        };
      }
      function reducer(state, action) {
        switch (action.type) {
          case 'PAGE': { const items = action.append ? [...state.logs, ...action.items] : action.items; return { ...state, logs: items }; }
          case 'TOUCH': { const items = state.logs.map((l) => l); return { ...state, logs: items }; }
        }
      }
      const store = (set) => ({ fetch: async (more) => { const got = await ask(); const next = more ? [...get().logs, ...got] : got; set({ logs: dedupe(next) }); } });`;
    expect(pageHits('src/planted.ts', planted).map((h) => h.at)).toEqual([
      'src/planted.ts rows in read', 'src/planted.ts logs in reducer', 'src/planted.ts logs in fetch',
    ]);
  });

  it('finds the instances it was made for, put back', () => {
    const putBack = (file: string, from: string, to: string) => {
      expect(APP.find((x) => x.file === file)?.text.split(from).length).toBe(2);
      return openOf(APP.map((x) => (x.file === file ? { ...x, text: x.text.split(from).join(to) } : x)));
    };
    // The Log Archive read again at its first page alone, wherever the member had read to.
    expect(putBack('app/film-reviews/[id].tsx', 'heldRaw.current = (isLoadMore ? heldRaw.current : 0) + data.length;', 'heldRaw.current = data.length;'))
      .toContain('app/film-reviews/[id].tsx logs in showPage');
    // A salon past its window cuts the words the member read back to.
    expect(putBack('src/stores/lounge.ts', 'if (_readBackIn !== null && newest !== undefined && newest.lounge_id === _readBackIn) return msgs;', ''))
      .toContain('src/stores/lounge.ts currentMessages in subscribeToLounge');
    // The Tribunal's sanctions read again at their first page alone after a member is lifted.
    expect(putBack('src/components/admin/SanctionsList.tsx', '}), asFar.current, PAGE)', '}), PAGE, PAGE)'))
      .toContain('src/components/admin/SanctionsList.tsx items in SanctionsList');
  });
});

describe('the whole app', () => {
  const HITS = appPageHits(APP);

  it('reads the app, not an empty sweep', () => {
    expect(APP.length).toBeGreaterThan(400);
    expect(HITS.length).toBeGreaterThan(10);
  });

  it('every list read again keeps its later pages, or starts over because the member asked', () => {
    expect(openOf(APP)).toEqual([...STILL_TO_FIX].sort());
  });

  it('judges only writes that are still there', () => {
    const at = new Set(HITS.map((h) => h.at));
    expect([...Object.keys(STARTS_OVER), ...Object.keys(KEEPS), ...STILL_TO_FIX].filter((k) => !at.has(k))).toEqual([]);
  });
});

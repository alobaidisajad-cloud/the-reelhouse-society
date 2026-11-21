/**
 * anAnswerIsStillTheOneAsked.guard.test.ts — no older answer drawn over a newer state.
 * ─────────────────────────────────────────────────────────────────────────────
 * Twenty-two findings of review rounds 8 to 13 were one mechanism: a read asked again (a refresh, a
 * search typed on, a next page, a focus) while the last was still out, and the older answer landed
 * last, over the newer one: READ ALL undone by a board read, a search's last words drawn under new
 * ones, a page begun past its row. Each store and screen got its own ledger, one at a time;
 * staleWriteGuard asks only whether the member changed, and only in the stores.
 *
 * So the whole app is read, with TypeScript's parser (test-utils/afterAwait.js), for its two shapes:
 *   1. a read asked again by design (a function named for reading: fetch, load, refresh, read,
 *      search, more, next…, or work inside an effect that runs again when its inputs change) that
 *      writes what it heard (a store's set, a state setter, a query's data) stands each write behind
 *      a check, made after the wait, that it is still the read asked: a token taken before the wait
 *      compared with its live source after it (`mine !== gen.current`, `gen !== generation`,
 *      `marksWritten() !== before`), or the flag an effect's cleanup raises when it runs again;
 *   2. no page is asked by its count (`.range(from, …)`): a row taken away or added meanwhile shifts
 *      the next page, and a row is skipped or drawn twice. Each page begins after the last row read.
 * Each rule is shown failing on planted code first; each exception is named with why.
 */
import * as path from 'path';
import ts from 'typescript';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const AW = require('@/test-utils/afterAwait') as typeof import('@/test-utils/afterAwait');
const MOBILE = path.join(__dirname, '..', '..', '..');
const rel = (f: string) => path.relative(MOBILE, f).split(path.sep).join('/');

const APP = universe('appCode', { ext: ['.ts', '.tsx'] })
  .map((f) => ({ file: rel(f), text: readCode(f) }));
const SCREENS_AND_STORES = APP.filter((f) => /^(app|src\/(stores|hooks|components|features|providers))\//.test(f.file));

/** A function named for reading: asked again whenever its page or its words change. */
const READS = /^(fetch|load|refresh|read|search|reload|more|next|page|reread|refetch|hydrate|sync|pull)/i;
/** Calls named set… that write no state. */
const NOT_STATE = /^(setTimeout|setInterval|setImmediate|setSensitive|setItem|setString|setParams|setOptions|setStringAsync)$/;

/**
 * A read whose answer cannot be overtaken, by file and line of its function, with why. A hit
 * here is still found by the rule: an entry no longer found fails, so the list never outlives its code.
 */
const CANNOT_BE_OVERTAKEN: Record<string, string> = {
  'app/_layout.tsx:an effect': 'the launch: its effect is keyed on the auth store\'s own functions, which never change, so it runs once, and its one write (the app ready) is the same whenever it lands',
  'src/stores/domain/marksLedger.ts:readMarks': 'one read per member at a time (a second call joins the one out, kept in `reading`); a write that overlapped it is read again once, and what is laid is laid with the queue\'s waiting writes over it (ledgerOf); a failure writes only over a ledger not yet held',
};

/**
 * Found by this sweep, and not yet fixed: each a finding, owned by stage C (kinds LATE). The list
 * only shrinks: a read fixed here is no longer found, and its entry then fails until it is taken out.
 */
const STILL_TO_FIX = [
  'src/stores/dispatch.ts:hydrate',
  'src/stores/dispatch.ts:readTally',
  'src/stores/dispatch.ts:fetchCritiques',
  'src/stores/dispatch.ts:loadMoreCritiques',
  'src/stores/dispatch.ts:loadViewerState',
  'src/stores/dispatch.ts:readCritiquePage',
  'src/stores/dispatch.ts:loadCritiqueCertifications',
  'src/stores/domain/interactionSlice.ts:fetchEndorsements',
  'src/stores/domain/interactionSlice.ts:fetchListEndorsements',
  'src/stores/lounge.ts:fetchLounges',
  'src/stores/lounge.ts:fetchMessages',
  'src/stores/lounge.ts:loadMoreMessages',
  'src/stores/vaultStore.ts:loadForLog',
];

/**
 * A page asked by its count, by file, with why its rows cannot move under it. Each is still found:
 * an entry no longer found fails.
 */
const PAGED_BY_COUNT: Record<string, string> = {};

/** Pages asked by their count found by this sweep, not yet fixed (as STILL_TO_FIX). */
const PAGES_STILL_TO_FIX = ['src/services/StackService.ts', 'src/stores/dispatch.ts'];

const isEquality = (k: ts.SyntaxKind) => k === ts.SyntaxKind.EqualsEqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsEqualsToken;

/** Every `let` a file declares (module or function scope): a value that can move while a read is out. */
function lets(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclarationList(n) && (n.flags & ts.NodeFlags.Let) !== 0) {
      for (const d of n.declarations) if (ts.isIdentifier(d.name)) out.add(d.name.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Each flag an effect's cleanup sets (`return () => { gone = true; }`): 'gone' when set true. */
function cleanupFlags(sf: ts.SourceFile): Map<string, 'here' | 'gone'> {
  const out = new Map<string, 'here' | 'gone'>();
  const visit = (n: ts.Node) => {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left)
      && (n.right.kind === ts.SyntaxKind.TrueKeyword || n.right.kind === ts.SyntaxKind.FalseKeyword)) {
      const own = AW.ownerOf(n);
      const holder = own?.parent;
      if (holder && (ts.isReturnStatement(holder) || (ts.isArrowFunction(holder) && holder.body === own))) {
        out.set(n.left.text, n.right.kind === ts.SyntaxKind.TrueKeyword ? 'gone' : 'here');
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Whether a function runs inside an effect that runs again when its inputs change. */
function inAKeyedEffect(fn: ts.Node): boolean {
  for (let p: ts.Node | undefined = fn.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && /^(React\.)?(useEffect|useLayoutEffect)$/.test(p.expression.getText())) {
      const deps = p.arguments[1];
      return !!deps && ts.isArrayLiteralExpression(deps) && deps.elements.length > 0;
    }
  }
  return false;
}

/** A function's own name: declared, held by a const, or a store's member; null for one passed along. */
function selfName(fn: ts.Node): string | null {
  if (ts.isFunctionDeclaration(fn) && fn.name) return fn.name.text;
  const p = fn.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) return p.name.text;
  if (ts.isMethodDeclaration(fn) && ts.isIdentifier(fn.name)) return fn.name.text;
  // useCallback(async () => …) held by a const: the const's name.
  if (p && ts.isCallExpression(p) && /^(React\.)?useCallback$/.test(p.expression.getText()) && ts.isVariableDeclaration(p.parent) && ts.isIdentifier(p.parent.name)) return p.parent.name.text;
  return null;
}

/**
 * A read that will not start while it is out: before its first wait it raises its own mark
 * (`set({ _fetchingX: true })`, `inflight = …`, `busy.current = true`) and leaves (or joins the one
 * out) when the mark is already up. No newer read can overlap it, so none can be overtaken.
 */
function oneAtATime(fn: ts.FunctionLikeDeclaration, sf: ts.SourceFile): boolean {
  const body = fn.body;
  if (!body || !ts.isBlock(body)) return false;
  const firstWait = Math.min(...AW.ownNodes(fn, (m) => (ts.isAwaitExpression(m) ? m.getStart() : null)), body.getEnd());
  const before = body.statements.filter((s) => s.getEnd() <= firstWait);
  const raised = new Set<string>();
  for (const s of before) {
    const t = s.getText(sf);
    for (const m of t.matchAll(/(\w+):\s*true\b/g)) raised.add(m[1] ?? '');
    // An assignment to a mark already there, never a new const: a value read is no mark raised.
    for (const m of t.matchAll(/(?<!\b(?:const|let|var)\s+)(?<![.\w])(\w+)(?:\.current)?\s*=\s*(?!=)(?!null\b|false\b|undefined\b|0\b)/g)) raised.add(m[1] ?? '');
    for (const m of t.matchAll(/\b(\w+)\.set\(/g)) raised.add(m[1] ?? '');
  }
  return before.some((s, i) => ts.isIfStatement(s) && !s.elseStatement
    && (ts.isReturnStatement(s.thenStatement) || (ts.isBlock(s.thenStatement) && s.thenStatement.statements.some((x) => ts.isReturnStatement(x))))
    && [...raised].some((r) => r && new RegExp(`\\b${r}\\b`).test(s.expression.getText(sf))
      && before.slice(i + 1).some((later) => new RegExp(`\\b${r}\\b`).test(later.getText(sf)))));
}

/**
 * A busy flag let down with the read's own mark (`more.current = false; setLoadingMore(false)`):
 * the mark was raised by this call before its wait, and no other read of its kind starts while it
 * is up, so the flag it lowers is its own, whatever answered meanwhile.
 */
function lowersOwnMark(fn: ts.FunctionLikeDeclaration, w: ts.CallExpression, sf: ts.SourceFile): boolean {
  if (w.arguments.length !== 1 || w.arguments[0]!.kind !== ts.SyntaxKind.FalseKeyword) return false;
  let block: ts.Node | undefined = w.parent;
  while (block && !ts.isBlock(block)) block = block.parent;
  if (!block || !ts.isBlock(block)) return false;
  const firstWait = Math.min(...AW.ownNodes(fn, (m) => (ts.isAwaitExpression(m) ? m.getStart() : null)));
  const markOf = (s: ts.Statement, value: 'true' | 'false') => {
    const m = /^(\w+)\.current\s*=\s*(true|false);?$/.exec(s.getText(sf).trim());
    return m && m[2] === value ? m[1] : null;
  };
  const raised = new Set(AW.ownNodes(fn, (m) => (ts.isExpressionStatement(m) && m.getEnd() <= firstWait ? markOf(m, 'true') : null)));
  return block.statements.some((s) => s.getEnd() <= w.getStart() && raised.has(markOf(s, 'false') ?? ''));
}

/** Rule 1: each write a re-asked read makes after its wait with no "still the read asked" after it. */
export function answersDrawnOverNewer(file: string, text: string): string[] {
  const sf = AW.parse(file, text);
  const moving = lets(sf);
  const flags = cleanupFlags(sf);
  // A reducer's dispatch (`const [state, dispatch] = useReducer(…)`) writes state as a setter does.
  const reducers = new Set<string>();
  const findReducers = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isArrayBindingPattern(n.name) && n.initializer && ts.isCallExpression(n.initializer)
      && /^(React\.)?useReducer$/.test(n.initializer.expression.getText(sf))) {
      const d = n.name.elements[1];
      if (d && ts.isBindingElement(d) && ts.isIdentifier(d.name)) reducers.add(d.name.text);
    }
    ts.forEachChild(n, findReducers);
  };
  findReducers(sf);
  // Every value the file takes into a const (`const mine = ++gen.current`), by name: a token handed on
  // as a parameter of the same name is the same token.
  const takenInFile = new Map<string, string>();
  // Every closure that is one check (`const current = () => seq === reqSeq.current && …`).
  const closures = new Map<string, ts.Expression>();
  const scan = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      takenInFile.set(n.name.text, `${takenInFile.get(n.name.text) ?? ''} ${n.initializer.getText(sf)}`);
      if (ts.isArrowFunction(n.initializer) && !ts.isBlock(n.initializer.body) && n.initializer.parameters.length === 0) closures.set(n.name.text, n.initializer.body);
    }
    ts.forEachChild(n, scan);
  };
  scan(sf);
  const out: string[] = [];
  for (const body of AW.waitingBodies(sf)) {
    const keyed = inAKeyedEffect(body.fn);
    const name = keyed ? '' : selfName(body.fn) ?? AW.namedOwner(body.fn)?.name ?? '';
    if (!READS.test(name) && !keyed) continue;
    // Each value this function (or one around it) took before it waits: a token, if it is compared with where it came from.
    const taken = new Map<string, string>();
    for (let fn: ts.Node | null = body.fn; fn; fn = AW.ownerOf(fn)) {
      AW.ownNodes(fn as ts.FunctionLikeDeclaration, (m) => {
        if (ts.isVariableDeclaration(m) && ts.isIdentifier(m.name) && m.initializer) taken.set(m.name.text, m.initializer.getText(sf));
        return null;
      });
    }
    /**
     * A signal this read made, that the next read cancels: its controller is put in a keeper
     * (`last.current = controller`) whose one before it this function aborts first.
     */
    const cancelledByTheNext = (signal: string): boolean => {
      const ctl = /^(\w+)\.signal$/.exec((taken.get(signal) ?? '').trim())?.[1] ?? signal;
      if (!/^new AbortController\(\)$/.test((taken.get(ctl) ?? '').trim())) return false;
      const own = body.fn.getText(sf);
      return [...own.matchAll(/(\w+)\.current\s*=\s*(\w+)\s*;/g)].some((m) => m[2] === ctl
        && own.indexOf(`${m[1]}.current?.abort()`) >= 0 && own.indexOf(`${m[1]}.current?.abort()`) < own.indexOf(m[0]));
    };
    const live = (e: ts.Expression, from: string): boolean => {
      const t = e.getText(sf);
      if (ts.isPropertyAccessExpression(e) && e.name.text === 'current') return from.includes(e.expression.getText(sf));
      // A ref's entry for one key (`rooms.current[tab]`, `seq.current[id]`): the ref it came from.
      if (ts.isElementAccessExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'current') return from.includes(e.expression.expression.getText(sf));
      if (/^(get|\w+\.getState)\(\)\./.test(t)) return from.includes(t.replace(/^.*\(\)\./, ''));
      if (ts.isIdentifier(e) && moving.has(e.text)) return new RegExp(`\\b${e.text}\\b`).test(from);
      if (ts.isCallExpression(e)) {
        if (from.includes(t)) return true;
        // Asked of the same keeper it was taken from (`reads.take(id)`, then `reads.latest(id)`).
        return ts.isPropertyAccessExpression(e.expression) && from.trim().startsWith(`${e.expression.expression.getText(sf)}.`);
      }
      return false;
    };
    const check = (e: ts.Expression): 'here' | 'gone' | null => {
      if (ts.isIdentifier(e) && flags.has(e.text)) return flags.get(e.text) ?? null;
      if (ts.isPropertyAccessExpression(e) && e.name.text === 'aborted' && ts.isIdentifier(e.expression) && cancelledByTheNext(e.expression.text)) return 'gone';
      if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.arguments.length === 0 && closures.has(e.expression.text)) {
        return AW.provesHere(closures.get(e.expression.text)!, check) ? 'here' : null;
      }
      if (ts.isBinaryExpression(e) && isEquality(e.operatorToken.kind)) {
        const from = (a: ts.Identifier) => `${taken.get(a.text) ?? ''} ${takenInFile.get(a.text) ?? ''}`;
        const token = (a: ts.Expression, b: ts.Expression) => ts.isIdentifier(a) && (taken.has(a.text) || takenInFile.has(a.text)) && live(b, from(a));
        if (token(e.left, e.right) || token(e.right, e.left)) return e.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ? 'here' : 'gone';
      }
      return null;
    };
    if (oneAtATime(body.fn, sf)) continue;
    const writes = AW.ownNodes(body.fn, (m) => {
      if (!ts.isCallExpression(m)) return null;
      const t = m.expression.getText(sf);
      return (/^set[A-Z]\w*$/.test(t) && !NOT_STATE.test(t)) || t === 'set' || /\.(setQueryData|setQueriesData|setState)$/.test(t) || reducers.has(t) ? m : null;
    });
    const unasked = writes.filter((w) => {
      const since = AW.lastWaitBefore(body, w.getStart(), w);
      return since >= 0 && !AW.coveredAfter(body.fn, w, since, check) && !lowersOwnMark(body.fn, w, sf);
    });
    if (unasked.length) out.push(`${file}:${name || 'an effect'} (${unasked.map((w) => AW.lineOf(sf, w)).join(', ')})`);
  }
  return out;
}

/** Rule 2: each page asked by its count. */
export function pagesByCount(file: string, text: string): string[] {
  const sf = AW.parse(file, text);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'range' && n.arguments.length === 2) {
      out.push(`${file}:${AW.lineOf(sf, n)}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const keyOf = (hit: string) => hit.replace(/ \(.*\)$/, '');

describe('each rule says no to its planted shape', () => {
  it('1: a re-asked read that writes its answer with no check, or with a check that is no token', () => {
    expect(answersDrawnOverNewer('app/planted.tsx', `export function useP() {
      const mounted = useRef(true);
      const load = async (q) => { const rows = await ask(q); setRows(rows); };
      const search = async (q) => { const rows = await ask(q); if (mounted.current) setRows(rows); };
      useEffect(() => { ask(q).then((rows) => setRows(rows)); }, [q]);
      return load; }`)).toEqual(['app/planted.tsx:load (3)', 'app/planted.tsx:search (4)', 'app/planted.tsx:an effect (5)']);
  });

  it('1: and passes a token taken before the wait, a cleanup\'s flag, and a write before any wait', () => {
    expect(answersDrawnOverNewer('src/stores/planted.ts', `let generation = 0;
      const gen = useRef(0);
      export const s = {
        fetch: async () => { const mine = ++generation; set({ loading: true }); const r = await ask(); if (mine !== generation) return; set({ r }); },
        loadMore: async () => { const mine = gen.current; const r = await ask(); if (mine === gen.current) set({ r }); },
        readAll: async () => { const before = written(); const r = await ask(); if (written() !== before) return; set({ r }); },
      };
      useEffect(() => { let gone = false; ask(q).then((rows) => { if (!gone) setRows(rows); }); return () => { gone = true; }; }, [q]);`)).toEqual([]);
  });

  it('1: a reducer\'s dispatch is a write; a busy flag let down without its own mark is not let off', () => {
    expect(answersDrawnOverNewer('src/hooks/planted.ts', `export function useP() {
      const [state, dispatch] = useReducer(reduce, {});
      const loadRoom = async () => { const r = await ask(); dispatch({ type: 'PAGE', r }); };
      const loadMore = async () => { busy.current = true; try { await ask(); } finally { other.current = false; setLoadingMore(false); } };
      const fetchFile = async () => { const controller = new AbortController(); last.current = controller; const signal = controller.signal; const r = await ask(signal); if (signal.aborted) return; setRows(r); };
      return loadRoom; }`)).toEqual(['src/hooks/planted.ts:loadRoom (3)', 'src/hooks/planted.ts:loadMore (4)', 'src/hooks/planted.ts:fetchFile (5)']);
  });

  it('1: and passes a ref\'s entry for its key, a keeper\'s latest, and a busy flag let down with its own mark', () => {
    expect(answersDrawnOverNewer('src/hooks/planted.ts', `export function useP() {
      const loadTab = async (tab) => { const mine = (seq.current[tab] = (seq.current[tab] ?? 0) + 1); const r = await ask(); if (mine !== seq.current[tab]) return; setRows(r); };
      const refresh = async (id) => { const mine = reads.take(id); const r = await ask(); if (mine === reads.latest(id)) set({ r }); };
      const loadMore = async () => { more.current = true; try { await ask(); } finally { more.current = false; setLoadingMore(false); } };
      const readKind = async (k) => { if (k) { await ask(); } else { setBusy(true); } };
      const readOne = async (k) => { if (k) return note(await ask()); setBusy(true); };
      const fetchFile = async () => { last.current?.abort(); const controller = new AbortController(); last.current = controller; const signal = controller.signal; const r = await ask(signal); if (signal.aborted) return; setRows(r); };
      return loadTab; }`)).toEqual([]);
  });

  it('2: a page asked by its count', () => {
    expect(pagesByCount('src/services/planted.ts', `const { data } = await supabase.from('t').select('*').order('id').range(from, from + 99);`))
      .toEqual(['src/services/planted.ts:1']);
  });
});

describe('the whole app', () => {
  it('reads the app, not an empty sweep', () => {
    expect(SCREENS_AND_STORES.length).toBeGreaterThan(250);
    expect(SCREENS_AND_STORES.some((f) => /gen !== generation/.test(f.text))).toBe(true);
  });

  it('1: every re-asked read writes only what is still the read asked', () => {
    const hits = SCREENS_AND_STORES.flatMap((f) => answersDrawnOverNewer(f.file, f.text));
    expect(hits.filter((h) => !(keyOf(h) in CANNOT_BE_OVERTAKEN) && !STILL_TO_FIX.includes(keyOf(h)))).toEqual([]);
    // Each read named here is still one the rule finds: fixed, it leaves the list.
    for (const k of [...Object.keys(CANNOT_BE_OVERTAKEN), ...STILL_TO_FIX]) expect([k, hits.some((h) => keyOf(h) === k)]).toEqual([k, true]);
  });

  it('2: no page is asked by its count', () => {
    const hits = APP.flatMap((f) => pagesByCount(f.file, f.text));
    const fileOf = (h: string) => h.replace(/:\d+$/, '');
    expect(hits.filter((h) => !(fileOf(h) in PAGED_BY_COUNT) && !PAGES_STILL_TO_FIX.includes(fileOf(h)))).toEqual([]);
    for (const k of [...Object.keys(PAGED_BY_COUNT), ...PAGES_STILL_TO_FIX]) expect([k, hits.some((h) => h.startsWith(`${k}:`))]).toEqual([k, true]);
  });
});

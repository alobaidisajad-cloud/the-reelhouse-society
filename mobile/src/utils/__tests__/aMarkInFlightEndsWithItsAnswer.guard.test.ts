/**
 * aMarkInFlightEndsWithItsAnswer.guard.test.ts — a mark that something is on its way ends with its answer.
 * ─────────────────────────────────────────────────────────────────────────────
 * A request for a seat was kept as being made for good once the host declined it
 * (STATE-a-request-held-after-its-answer), and a message the house took was left 'sending' in the
 * words kept for a room the member had left (WRITE-a-sent-message-taken-off-the-screen). Each was
 * fixed where it was found; nothing asked it of the next mark.
 *
 * So the whole app is read for the marks a screen or a store raises while it waits:
 *   1. a kept flag named for something on its way (refreshing, sending, asking, pending, a read's
 *      state…), raised before the wait in the function that waits, must be lowered in a `finally`
 *      (or a promise's `.finally(`) there, so an answer that throws never leaves it raised; or it is
 *      named in HELD with the code that ends it on every answer (each piece must still be in its file);
 *   2. every message a store marks 'sending' is named in HELD with the code that marks its answer
 *      wherever the message stands (each piece must still be in its file).
 * A mark named nowhere fails, so the next one is judged the day it is written; a name gone fails too.
 */
import * as path from 'path';
import ts from 'typescript';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const MOBILE = path.join(__dirname, '..', '..', '..');
const rel = (f: string) => path.relative(MOBILE, f).split(path.sep).join('/');

/** A kept flag named for something on its way. */
const IN_FLIGHT = /ing[A-Z]?\w*$|Pending$|Loading$|Read$|Status$/;

/** A mark that outlives its function on purpose, with the code that ends it on every answer. */
type Held = { ends: string[]; why: string };

const HELD: Record<string, Held> = {
  'app/(modals)/list-modal.tsx#handleSave:setSaving': { ends: ['if (isMounted.current) setSaving(false);', 'nav.back();'], why: 'lowered by every failure; a stack saved leaves the sheet, which must not take a second tap on its way out' },
  'app/dispatch/compose.tsx#readFiled:setAmendRead': { ends: ["hydrate(edit).catch(() => 'unreachable' as const)", "setAmendRead('held')"], why: 'every answer of the read, a throw read as out of reach, sets where the essay is' },
  'app/film-reviews/[id].tsx#fetchLogs:setFetchingMore': { ends: ['showPage(isLoadMore, page)', 'return { data: null, error: thrown as Error, askedAt, size }'], why: 'the page read never throws; every answer is shown, which lowers it' },
  'app/film-reviews/[id].tsx#fetchLogs:setLoading': { ends: ['showPage(isLoadMore, page)', 'return { data: null, error: thrown as Error, askedAt, size }'], why: 'the page read never throws; every answer is shown, which lowers it' },
  'app/lounge/[id].tsx#handleRequest:setPending': { ends: ["if (result === 'error') { setPending(false);", 'if (asked > requestAnsweredAt.current) setPending(false);'], why: 'a request refused ends at once; one taken stands in until a roster asked after it is read, and then the roster alone says' },
  'src/components/admin/SecondKeyDoor.tsx#submit:setGiving': { ends: ['setGiving(false); }'], why: 'refused, lowered with the reason; given, the door is passed and the room behind it drawn' },
  'src/components/dispatch/ComposeDesks.tsx#readFiled:setAmendRead': { ends: ["hydrate(editId).catch(() => 'unreachable' as const)", "setAmendRead('held')"], why: 'every answer of the read, a throw read as out of reach, sets where the filing is' },
  'src/components/lounge/CreateLoungeSheet.tsx#handleCreate:setCreating': { ends: ['setCreating(false);', 'onClose();'], why: 'refused, lowered; founded, the sheet closes on its way to the room' },
  'src/hooks/useAuthFlow.ts#checkUsernameAvailability:setUsernameStatus': { ends: ['usernameCheckRequestId.current', "setUsernameStatus('idle');"], why: 'every answer of the newest check, a failure too, sets the status; an older check\'s answer is dropped' },
  'src/hooks/useLogFlow.ts#handleLog:setSubmitting': { ends: ['setSubmitting(false);'], why: 'lowered by every failure; a record sealed leaves the sheet, which must not take a second tap on its way out' },
  'src/hooks/useLogFlow.ts#handleDelete:setDeleting': { ends: ['setDeleting(false);'], why: 'lowered by every failure; a record deleted leaves the sheet' },
  'src/hooks/useProfileController.ts#toggleFollow:setFollowLoading': { ends: ['setFollowLoading(false);'], why: 'every await is inside its try and catch, and it is lowered after both' },
  'src/stores/lounge.ts#sendMessage:sending': { ends: ["inRoomWords(loungeId, (words) => words.map(m =>", "status: 'failed' as const"], why: 'its answer, sent or failed, is marked where the message stands: on screen, or in the words kept for a room left' },
  'src/stores/lounge.ts#retryMessage:sending': { ends: ["inRoomWords(msg.lounge_id, (words) => words.map(m =>", "status: 'failed' as const"], why: 'its answer, sent, queued again or failed, is marked where the message stands, as sendMessage does' },
};

const isFn = (n: ts.Node): n is ts.FunctionLikeDeclaration =>
  ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n);

/** A function's name: its own, its variable's (through useCallback), or its property's. */
function nameOf(fn: ts.Node): string {
  if ((ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) && fn.name) return fn.name.getText();
  let q: ts.Node = fn.parent;
  if (ts.isCallExpression(q) && /^use(Callback|Memo)$/.test(q.expression.getText())) q = q.parent;
  if (ts.isVariableDeclaration(q) || ts.isPropertyAssignment(q)) return q.name.getText();
  return '(anonymous)';
}

/** Each node of a function's own body, nested functions left out. */
function ownNodes(fn: ts.FunctionLikeDeclaration, visit: (n: ts.Node) => void): void {
  const walk = (n: ts.Node) => { visit(n); ts.forEachChild(n, (c) => { if (!isFn(c)) walk(c); }); };
  if (fn.body) walk(fn.body);
}

/**
 * Where a function first waits (an await, or a promise's then), or -1. A handler's wait may sit in
 * a callback it hands on (a timer's, a debounce's); a component's or a hook's body is drawn on every
 * render, so only its own waits count there, never those of the handlers it holds.
 */
function firstWait(fn: ts.FunctionLikeDeclaration): number {
  let at = -1;
  const note = (n: ts.Node) => {
    const waits = ts.isAwaitExpression(n) || (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'then');
    if (waits && (at < 0 || n.getStart() < at)) at = n.getStart();
  };
  if (/^(use[A-Z]|[A-Z])/.test(nameOf(fn))) ownNodes(fn, note);
  else { const all = (n: ts.Node) => { note(n); ts.forEachChild(n, all); }; if (fn.body) all(fn.body); }
  return at;
}

/** Whether a setter is called inside a finally block, or a `.finally(` callback, of this function (its own callbacks too). */
function loweredFinally(fn: ts.FunctionLikeDeclaration, setter: string): boolean {
  let lowered = false;
  const calls = (n: ts.Node) => n.getText().includes(`${setter}(`);
  const walk = (n: ts.Node) => {
    if (ts.isTryStatement(n) && n.finallyBlock && calls(n.finallyBlock)) lowered = true;
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'finally' && n.arguments.some(calls)) lowered = true;
    ts.forEachChild(n, walk);
  };
  if (fn.body) walk(fn.body);
  return lowered;
}

/** Every mark in flight in a file: `file#function:setter`, and `file#function:sending` for a message marked so. */
export function marksIn(file: string, code: string): string[] {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const setters = new Set<string>();
  const out = new Set<string>();
  const find = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isArrayBindingPattern(n.name) && n.initializer && ts.isCallExpression(n.initializer)
      && /(^|\.)useState$/.test(n.initializer.expression.getText())) {
      const s = n.name.elements[1];
      if (s && ts.isBindingElement(s) && IN_FLIGHT.test(s.name.getText())) setters.add(s.name.getText());
    }
    ts.forEachChild(n, find);
  };
  find(sf);
  const each = (n: ts.Node) => {
    if (isFn(n)) {
      const wait = firstWait(n);
      ownNodes(n, (m) => {
        if (wait >= 0 && ts.isCallExpression(m) && ts.isIdentifier(m.expression) && setters.has(m.expression.text) && m.arguments.length === 1
          && m.getStart() < wait) {
          const a = m.arguments[0]!;
          if ((a.kind === ts.SyntaxKind.TrueKeyword || ts.isStringLiteral(a)) && !loweredFinally(n, m.expression.text)) out.add(`${file}#${nameOf(n)}:${m.expression.text}`);
        }
        if (ts.isPropertyAssignment(m) && m.name.getText() === 'status' && /^'sending'/.test(m.initializer.getText())) {
          // Named by the store act it is written in, past the inner callbacks.
          let p: ts.Node = n;
          for (let q: ts.Node | undefined = n; q; q = q.parent) if (isFn(q) && ts.isPropertyAssignment(q.parent)) { p = q; break; }
          out.add(`${file}#${nameOf(p)}:sending`);
        }
      });
    }
    ts.forEachChild(n, each);
  };
  each(sf);
  return [...out];
}

/** Each fault: a mark named nowhere, a way it ends its file no longer holds, a name gone. */
export function markFaults(found: { key: string; code: string }[], held: Record<string, Held>): string[] {
  const faults: string[] = [];
  const keys = new Set(found.map((f) => f.key));
  for (const { key, code } of found) {
    const h = held[key];
    if (!h) { faults.push(`${key}: a mark raised while it waits, lowered in no finally, and no one has said what ends it`); continue; }
    for (const piece of h.ends) if (!code.includes(piece)) faults.push(`${key}: ended by ${piece}, which its file no longer holds`);
  }
  for (const k of Object.keys(held)) if (!keys.has(k)) faults.push(`${k}: named, but no such mark is in the app`);
  return faults;
}

const APP = universe('appCode', { ext: ['.ts', '.tsx'] }).flatMap((f) => {
  const file = rel(f);
  const code = readCode(f);
  return /useState|'sending'/.test(code) ? marksIn(file, code).map((key) => ({ key, code })) : [];
});

describe('the rule says no to its planted shapes', () => {
  const refresh = 'export function S() { const [refreshing, setRefreshing] = useState(false); const onRefresh = useCallback(async () => { setRefreshing(true); await read(); setRefreshing(false); }, []); }';
  const lowered = 'export function S() { const [refreshing, setRefreshing] = useState(false); const onRefresh = useCallback(async () => { setRefreshing(true); try { await read(); } finally { setRefreshing(false); } }, []); }';
  const store = "const useS = create((set) => ({ retryMessage: async (id) => { set((s) => ({ m: s.m.map((x) => (x.id === id ? { ...x, status: 'sending' as const } : x)) })); await send(); } }));";

  it('to a flag lowered in no finally, a message marked sending, each named nowhere; a way gone; a name gone', () => {
    const found = [
      ...marksIn('src/a.tsx', refresh).map((key) => ({ key, code: refresh })),
      ...marksIn('src/s.ts', store).map((key) => ({ key, code: store })),
    ];
    expect(found.map((f) => f.key)).toEqual(['src/a.tsx#onRefresh:setRefreshing', 'src/s.ts#retryMessage:sending']);
    expect(markFaults(found, {
      'src/s.ts#retryMessage:sending': { ends: ['inRoomWords('], why: 'planted' },
      'src/gone.ts#send:sending': { ends: [], why: 'planted' },
    })).toEqual([
      'src/a.tsx#onRefresh:setRefreshing: a mark raised while it waits, lowered in no finally, and no one has said what ends it',
      'src/s.ts#retryMessage:sending: ended by inRoomWords(, which its file no longer holds',
      'src/gone.ts#send:sending: named, but no such mark is in the app',
    ]);
  });

  it('and passes a flag lowered in a finally, or in a promise\'s finally, and one raised after its wait', () => {
    const viaPromise = 'export function S() { const [asking, setAsking] = useState(false); const ask = useCallback(() => { setAsking(true); void read().finally(() => setAsking(false)); }, []); }';
    const after = 'export function S() { const [sending, setSending] = useState(false); const go = async () => { await read(); setSending(true); }; }';
    expect([...marksIn('src/a.tsx', lowered), ...marksIn('src/b.tsx', viaPromise), ...marksIn('src/c.tsx', after)]).toEqual([]);
  });
});

describe('every mark in flight, in the whole app', () => {
  it('is read', () => {
    expect(APP.length).toBeGreaterThan(5);
    expect(APP.some((f) => f.key === 'src/stores/lounge.ts#sendMessage:sending')).toBe(true);
  });

  it('ends with its answer: lowered in a finally, or named with what ends it', () => {
    expect(markFaults(APP, HELD)).toEqual([]);
  });
});

/**
 * aFailureUndoesOnlyItsOwnAct.guard.test.ts — a write that failed takes back its own change, by
 * itself, and nothing more.
 * ─────────────────────────────────────────────────────────────────────────────
 * Two kinds of mistake of the review rounds, each found at its one store and fixed there:
 *   1. a rollback that undid another write: each refused write on the notices board wrote back the
 *      whole list as it stood before its own change, so two dismissed offline left the first off the
 *      board; a profile save refused put the whole earlier copy over changes made since;
 *   2. a failure put back only by a read: leaving or dissolving a salon with no signal "put back" the
 *      room by reading the corridor again, and that read failed too, so the room stayed drawn as left.
 * So the whole app is read, with TypeScript's parser (test-utils/afterAwait.js), for each shape:
 *   1. a value taken from live state before a wait (a store's `get().x`, `getState().x`, a query's
 *      `getQueryData`) written back whole after it: the copy holds every other change made meanwhile
 *      as it was, and undoes them;
 *   2. a function that changes the screen before its wait, and on failure (a catch, or a branch on
 *      the answer's error) only reads again, with no write of its own to take its change back.
 * Each rule is shown failing on planted code first, and on the instance it was found at, put back.
 */
import * as path from 'path';
import ts from 'typescript';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const AW = require('@/test-utils/afterAwait') as typeof import('@/test-utils/afterAwait');
const MOBILE = path.join(__dirname, '..', '..', '..');
const rel = (f: string) => path.relative(MOBILE, f).split(path.sep).join('/');
const APP = universe('appCode', { ext: ['.ts', '.tsx'] }).map((f) => ({ file: rel(f), text: readCode(f) }));

/** Taken from live state: a store's own or another's, or a query's cache. */
const LIVE = /^(?:get\(\)|\w+\.getState\(\)|\w+\.getQueryData(?:<[^>]*>)?\([^)]*\))(?:\.\w+)*$/;
/** A write: a store's set, a state setter, a query's data, a store's setState. */
const isWrite = (call: ts.CallExpression, sf: ts.SourceFile) => {
  const t = call.expression.getText(sf);
  return t === 'set' || (/^set[A-Z]\w*$/.test(t) && !/^set(?:Timeout|Interval|Immediate|Sensitive|Item|String|Params|Options|StringAsync)$/.test(t))
    || /\.(?:setQueryData|setQueriesData|setState)$/.test(t);
};
/** A read asked again: by name, or a query's own. */
const isRead = (call: ts.CallExpression, sf: ts.SourceFile) =>
  /^(?:(?:\w+\.)*(?:get\(\)|getState\(\))\.)?(?:fetch|load|refresh|reread|reload|refetch)\w*$/.test(call.expression.getText(sf))
  || /\.(?:invalidateQueries|refetchQueries|refetch)$/.test(call.expression.getText(sf));

const firstWait = (fn: ts.FunctionLikeDeclaration) =>
  Math.min(...AW.ownNodes(fn, (m) => (ts.isAwaitExpression(m) ? m.getStart() : null)), Infinity);

/** Rule 1: each whole copy of live state, taken before a wait, written back after it. */
export function wholeCopiesPutBack(file: string, text: string): string[] {
  const sf = AW.parse(file, text);
  // A screen's own state (`const [items, setItems] = useState(…)`): the value as the screen last drew it.
  const drawn = new Set<string>();
  const findState = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isArrayBindingPattern(n.name) && n.initializer && ts.isCallExpression(n.initializer)
      && /^(React\.)?useState$/.test(n.initializer.expression.getText(sf))) {
      const v = n.name.elements[0];
      if (v && ts.isBindingElement(v) && ts.isIdentifier(v.name)) drawn.add(v.name.text);
    }
    ts.forEachChild(n, findState);
  };
  findState(sf);
  const out: string[] = [];
  for (const body of AW.waitingBodies(sf)) {
    if (body.tail) continue;
    const wait = firstWait(body.fn);
    const copies = new Set(AW.ownNodes(body.fn, (m) => {
      if (!ts.isVariableDeclaration(m) || !ts.isIdentifier(m.name) || !m.initializer || m.getEnd() > wait) return null;
      const from = m.initializer.getText(sf).replace(/\s+/g, '');
      return LIVE.test(from) || drawn.has(from) ? m.name.text : null;
    }));
    if (copies.size === 0) continue;
    const whole = (e: ts.Expression) => ts.isIdentifier(AW.strip(e)) && copies.has((AW.strip(e) as ts.Identifier).text);
    const hits = AW.ownNodes(body.fn, (m) => {
      if (!ts.isCallExpression(m) || !isWrite(m, sf) || m.getStart() < wait) return null;
      const args = m.arguments;
      const put = args.some((a, i) => (i === args.length - 1 || args.length === 1) && whole(a))
        || args.some((a) => ts.isObjectLiteralExpression(a) && a.properties.some((p) => ts.isPropertyAssignment(p) && whole(p.initializer)));
      return put ? m : null;
    });
    if (hits.length) out.push(`${file}:${AW.namedOwner(hits[0]!)?.name ?? 'the file'} (${hits.map((h) => AW.lineOf(sf, h)).join(', ')})`);
  }
  return out;
}

/** Rule 2: each failure that only reads again, after a change made before the wait. */
export function failuresPutBackByARead(file: string, text: string): string[] {
  const sf = AW.parse(file, text);
  const out: string[] = [];
  for (const body of AW.waitingBodies(sf)) {
    if (body.tail) continue;
    const wait = firstWait(body.fn);
    const changedFirst = AW.ownNodes(body.fn, (m) => (ts.isCallExpression(m) && m.getEnd() <= wait && isWrite(m, sf) ? m : null)).length > 0;
    if (!changedFirst) continue;
    const failures = AW.ownNodes(body.fn, (m) => {
      if (m.getStart() < wait) return null;
      if (ts.isCatchClause(m)) return m.block;
      if (ts.isIfStatement(m) && /\b(?:error|err|failed|refused)\b|!\s*ok\b|=== 'failed'/.test(m.expression.getText(sf))) return m.thenStatement;
      return null;
    });
    const only = failures.filter((block) => {
      const calls: ts.CallExpression[] = [];
      const visit = (n: ts.Node) => { if (ts.isCallExpression(n)) calls.push(n); if (!AW.isFn(n) || n === block) ts.forEachChild(n, visit); };
      visit(block);
      return calls.some((c) => isRead(c, sf)) && !calls.some((c) => isWrite(c, sf));
    });
    if (only.length) out.push(`${file}:${AW.namedOwner(only[0]!)?.name ?? 'the file'} (${only.map((b) => AW.lineOf(sf, b)).join(', ')})`);
  }
  return out;
}

const keyOf = (hit: string) => hit.replace(/ \(.*\)$/, '');

/** A hit judged no defect, by file and function, with why. Each is still found: an entry no longer found fails. */
const JUDGED: Record<string, string> = {};

/** Found by this sweep and not yet fixed: each owned by stage C (kind LATE). The list only shrinks. */
const STILL_TO_FIX: string[] = [];

describe('each rule says no to its planted shape', () => {
  it('1: a whole copy of a store, a query or a store\'s field taken before the wait, written back after it', () => {
    expect(wholeCopiesPutBack('src/stores/planted.ts', `export const s = {
      dismiss: async (id) => { const before = get().notices; set({ notices: before.filter((n) => n.id !== id) }); try { await send(id); } catch { set({ notices: before }); } },
      save: async (v) => { const old = useAuthStore.getState().user; set({ user: { ...old, ...v } }); const { error } = await write(v); if (error) set({ user: old }); },
      card: async (id) => { const prev = queryClient.getQueryData(['card', id]); queryClient.setQueryData(['card', id], null); try { await send(id); } catch { queryClient.setQueryData(['card', id], prev); } },
      own: async (id) => { const was = get().notices.find((n) => n.id === id); set({ notices: [] }); try { await send(id); } catch { set((s) => ({ notices: s.notices.map((n) => (n.id === id ? was : n)) })); } },
    };
    function Door() { const [items, setItems] = useState([]);
      const clear = async () => { const snapshot = items; setItems([]); if ((await send()) < 0) setItems(snapshot); };
      return null; }`)).toEqual(['src/stores/planted.ts:dismiss (2)', 'src/stores/planted.ts:save (3)', 'src/stores/planted.ts:card (4)', 'src/stores/planted.ts:clear (8)']);
  });

  it('2: a change made before the wait, on failure only read again; never when the failure takes its own change back', () => {
    expect(failuresPutBackByARead('src/stores/planted.ts', `export const s = {
      leave: async (id) => { set({ seated: false }); const { error } = await send(id); if (error) { toast('no'); await get().fetchLounges(); } },
      drop: async (id) => { setRows([]); try { await send(id); } catch { void queryClient.invalidateQueries({ queryKey: ['rows'] }); } },
      fine: async (id) => { set({ seated: false }); const { error } = await send(id); if (error) { set({ seated: true }); await get().fetchLounges(); } },
      plain: async (id) => { const { error } = await send(id); if (error) await get().fetchLounges(); },
    };`)).toEqual(['src/stores/planted.ts:leave (2)', 'src/stores/planted.ts:drop (3)']);
  });

  it('finds the instances it was made for, put back', () => {
    expect(failuresPutBackByARead('src/stores/lounge.ts', `export const s = { leaveLounge: async (loungeId) => {
      set(s => ({ lounges: s.lounges.map(l => (l.id === loungeId ? leftBehind(l) : l)) }));
      const { data: removed, error } = await supabase.from('lounge_members').delete().eq('lounge_id', loungeId).select('id');
      if (error || !removed || removed.length === 0) { reelToast.error('Failed to leave.'); await get().fetchLounges(); return false; }
      return true; } };`)).toEqual(['src/stores/lounge.ts:leaveLounge (4)']);
    expect(wholeCopiesPutBack('src/stores/notificationStore.ts', `export const s = { dismiss: async (id) => {
      const previous = get().notifications; set({ notifications: previous.filter((n) => n.id !== id) });
      const { error } = await supabase.from('notifications').delete().eq('id', id); if (error) set({ notifications: previous }); } };`))
      .toEqual(['src/stores/notificationStore.ts:dismiss (3)']);
  });
});

describe('the whole app', () => {
  it('reads the app, not an empty sweep', () => {
    expect(APP.length).toBeGreaterThan(400);
    expect(APP.flatMap((f) => AW.waitingBodies(AW.parse(f.file, f.text))).length).toBeGreaterThan(500);
  });

  it('1: no failed write puts back a whole copy over changes made since', () => {
    const hits = APP.flatMap((f) => wholeCopiesPutBack(f.file, f.text));
    expect(hits.filter((h) => !(keyOf(h) in JUDGED) && !STILL_TO_FIX.includes(keyOf(h)))).toEqual([]);
  });

  it('2: no failure is put back only by a read', () => {
    const hits = APP.flatMap((f) => failuresPutBackByARead(f.file, f.text));
    expect(hits.filter((h) => !(keyOf(h) in JUDGED) && !STILL_TO_FIX.includes(keyOf(h)))).toEqual([]);
  });

  it('each name judged or still to fix is still found', () => {
    const hits = APP.flatMap((f) => [...wholeCopiesPutBack(f.file, f.text), ...failuresPutBackByARead(f.file, f.text)]).map(keyOf);
    const named = [...Object.keys(JUDGED), ...STILL_TO_FIX];
    expect(named.filter((k) => !hits.includes(k))).toEqual([]);
  });
});

/**
 * staleWriteGuard.test.ts — a sign-out is never undone by a late answer.
 * ──────────────────────────────────
 * Work begun for one member waits on the house, then writes. A member who signed out during
 * that wait (or out and in again as another) had the last one's data laid back into a store the
 * reset had already cleared, saved again to the phone, or queued to be sent in their name.
 *
 * This is an ENUMERATION over the whole app, read with TypeScript's parser
 * (test-utils/afterAwait.js): every function that waits (an async one, or a promise's tail),
 * each judged on its own, nested handlers included, and every write it makes after its wait (a
 * store's own `set(`, an act called on a store, a save to the phone, a write queued as the member)
 * must stand behind `stillSignedIn(id)` or `memberUnchanged(id)` made after its own last wait,
 * with the id taken before it. A new function of that shape fails this the day it is written.
 */
import * as path from 'path';
import ts from 'typescript';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const AW = require('@/test-utils/afterAwait') as typeof import('@/test-utils/afterAwait');
const ROOT = path.join(__dirname, '..', '..', '..');
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join('/');

const APP = universe('appCode', { ext: ['.ts', '.tsx'] }).map((f) => ({ file: rel(f), text: readCode(f) }));

/**
 * Functions that write after a wait and MUST NOT carry the check, by file and name.
 *
 * Signing in is the whole exception: `memberUnchanged(null)` asks "nobody then, nobody now", and a
 * successful sign-in makes that false by design. Checking these would throw away the session the
 * member just created. Named one at a time so the exemption cannot quietly widen.
 */
const ESTABLISHES_A_MEMBER = new Set([
  'src/stores/auth.ts:login', 'src/stores/auth.ts:signup', 'src/stores/auth.ts:restoreSession',
  'src/stores/auth.ts:logout', 'src/stores/auth.ts:deleteAccount', 'src/stores/auth.ts:adoptSession',
]);

/**
 * A store method that only reads, or starts its own operation for whoever is signed in now: the
 * session read again (`restoreSession`), a count read (`readTally`), a channel opened for the
 * member here now (`setupRealtime`).
 */
const READS = /^(?:is|has|get|can|fetch|load|hydrate|read|restore|setup)(?:[A-Z]|$)/;
/** The helpers that save to the phone, or queue an act to be sent as the member. */
const PERSISTS = /^(?:enqueueMutation|persistFollowingToCache|setSensitive)$/;

type Write = { line: number; text: string };
type Op = { file: string; name: string; line: number; writes: Write[]; unguarded: Write[] };

/** The name a function is known by: its own, or "<owner> (a handler)" for one passed along. */
function nameOf(fn: ts.Node): string {
  if (ts.isFunctionDeclaration(fn) && fn.name) return fn.name.text;
  const p = fn.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) return p.name.text;
  if (ts.isMethodDeclaration(fn) && ts.isIdentifier(fn.name)) return fn.name.text;
  if (p && ts.isCallExpression(p) && /^(React\.)?useCallback$/.test(p.expression.getText()) && ts.isVariableDeclaration(p.parent) && ts.isIdentifier(p.parent.name)) return p.parent.name.text;
  return `${AW.namedOwner(fn)?.name ?? 'the file'} (a handler)`;
}

/**
 * Each write a call makes, as its text, or null: a store's own `set(`; an act that is not a read,
 * called on `getState()`, on `get()`, or on a name holding `useXStore.getState()`; and the
 * persist helpers above. Seeing only bare `set(` left followUser's shape unseen:
 * `store.addFollowing(` after an await, then `persistFollowingToCache(` under the id it began with.
 */
function writeOf(call: ts.CallExpression, held: Set<string>, sf: ts.SourceFile): string | null {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) {
    if (callee.text === 'set') return 'set(';
    return PERSISTS.test(callee.text) ? `${callee.text}(` : null;
  }
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const act = callee.name.text;
  const on = callee.expression;
  if (ts.isIdentifier(on) && on.text === 'storage' && act === 'set') return 'storage.set(';
  if (READS.test(act)) return null;
  if (ts.isCallExpression(on) && on.arguments.length === 0) {
    const from = on.expression.getText(sf);
    if (from === 'get' || /(^|\.)getState$/.test(from)) return `${from === 'get' ? 'get' : 'getState'}().${act}(`;
  }
  if (ts.isIdentifier(on) && held.has(on.text)) return `${on.text}.${act}(`;
  return null;
}

/** `set({ loading: false })`: in-flight flags lowered to the reset's own value, nobody's data. */
const LOWERS_FLAGS = /^set\(\{(?:\s*\w+:\s*false\s*,?)+\s*\}\)$/;

/** The check: `stillSignedIn(id)` or `memberUnchanged(id)`, true when it is still the member. */
const check = (e: ts.Expression): 'here' | null =>
  ts.isCallExpression(e) && ts.isIdentifier(e.expression) && /^(?:stillSignedIn|memberUnchanged)$/.test(e.expression.text) ? 'here' : null;

/** Each function that waits in a file, with its writes after the wait and those no check covers. */
export function opsIn(file: string, text: string): Op[] {
  const sf = AW.parse(file, text);
  // Every name holding a store's live state (`const store = useSocialStore.getState();`).
  const held = new Set<string>();
  const findHeld = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer
      && /^use\w+Store\.getState\(\)$/.test(n.initializer.getText(sf))) held.add(n.name.text);
    ts.forEachChild(n, findHeld);
  };
  findHeld(sf);
  const out: Op[] = [];
  for (const body of AW.waitingBodies(sf)) {
    const name = nameOf(body.fn);
    // Exempt: a subscription (no caller; logout unsubscribes it, tested below), and signing in or out,
    // with every handler inside them.
    let exempt = false;
    for (let fn: ts.Node | null = body.fn; fn; fn = AW.ownerOf(fn)) {
      const own = nameOf(fn);
      if (/^subscribeTo\w+$/.test(own) || ESTABLISHES_A_MEMBER.has(`${file}:${own}`)) exempt = true;
    }
    if (exempt) continue;
    const writes = AW.ownNodes(body.fn, (m) => {
      if (!ts.isCallExpression(m)) return null;
      const t = writeOf(m, held, sf);
      return t ? { call: m, text: t } : null;
    }).filter((w) => AW.lastWaitBefore(body, w.call.getStart(), w.call) >= 0);
    if (writes.length === 0) continue;
    // Checked only by a check made after the write's OWN last wait, that covers it. A check
    // anywhere in the body passed followUser, whose writes after its first await were checked by nothing.
    const unguarded = writes.filter((w) => !LOWERS_FLAGS.test(w.call.getText(sf))
      && !AW.coveredAfter(body.fn, w.call, AW.lastWaitBefore(body, w.call.getStart(), w.call), check));
    const where = (w: { call: ts.CallExpression; text: string }) => ({ line: AW.lineOf(sf, w.call), text: w.text });
    out.push({ file, name, line: AW.lineOf(sf, body.fn), writes: writes.map(where), unguarded: unguarded.map(where) });
  }
  return out;
}

const opsOf = (file: string) => opsIn(file, readCode(path.join(ROOT, file)));
const listed = (ops: Op[]) => ops.flatMap((o) => o.unguarded.map((w) => `${o.file}:${w.line}  ${o.name}  ${w.text}`));

/**
 * A write after a wait judged to need no check, by file, name and write, with why. Each is still
 * found: an entry no longer found fails, so the list never outlives its code.
 */
const JUDGED: Record<string, string> = {
  'app/(tabs)/darkroom.tsx  fetchContent  storage.set(': 'the archive\'s sheet kept for these words or settings: the house\'s public films, no member\'s, kept the same for whoever is signed in',
  'src/lib/pushPrimer.ts  offerWord  storage.set(': 'when the phone last asked to send word: the phone\'s own question, asked once per phone, no member\'s data',
  'src/utils/requestReview.ts  maybeRequestReview  storage.set(': 'when the phone last asked for a store review, and how often: the phone\'s, as the store\'s own sheet is',
  'src/lib/authSessionStorage.ts  readItem  storage.set(': 'the session store supabase-js writes under its own lock: it is the sign-out\'s own record, moved from the keychain as read',
  'src/lib/authSessionStorage.ts  setItem  storage.set(': 'the session store supabase-js writes under its own lock: the session it hands over is the one signed in',
  'app/_layout.tsx  prepare (a handler)  getState().syncFromServer(': 'the member is read after the wait, from the session now held: the read is for whoever is signed in, and checks its own answer',
  'app/dispatch/series/[id].tsx  SeriesScreen (a handler)  getState().givenAgain(': 'takes away gone marks learned before the moment it asked at; a sign-out\'s reset raises that count, so after one it takes nothing',
  'src/hooks/useDispatchArchive.ts  page  getState().givenAgain(': 'takes away gone marks learned before the moment it asked at; a sign-out\'s reset raises that count, so after one it takes nothing',
  'src/hooks/useMemberRoom.ts  page  getState().givenAgain(': 'takes away gone marks learned before the moment it asked at; a sign-out\'s reset raises that count, so after one it takes nothing',
  'src/hooks/useEditProfile.ts  save  getState().syncGlobalAvatar(': 'lays the face the house now holds for this member on their own words wherever drawn: true for any reader, and after a reset there are none to lay it on',
  'src/stores/vaultStore.ts  loadForLog  getState().clear(': 'the cure itself: an answer for a member who has left empties the Vault, never fills it',
};

/** Stores known to write after a wait (the sweep's first twelve): each must still be seen to. */
const KNOWN_WRITERS = [
  'src/stores/domain/logSlice/helpers/logOperations.ts', 'src/stores/domain/watchlistSlice.ts',
  'src/stores/domain/listSlice.ts', 'src/stores/domain/archiveSlice.ts', 'src/stores/domain/interactionSlice.ts',
  'src/stores/domain/socialSlice.ts', 'src/stores/notificationStore.ts', 'src/stores/blockStore.ts',
  'src/stores/lounge.ts', 'src/stores/reportStore.ts', 'src/stores/dispatch.ts', 'src/stores/auth.ts',
];

describe('each shape says no on planted code', () => {
  it('a write after a wait with no check, a check before the wait, or a check in another handler', () => {
    expect(listed(opsIn('src/stores/planted.ts', `export const s = {
      plain: async () => { const id = me(); const r = await ask(); set({ r }); },
      early: async () => { const id = me(); if (!stillSignedIn(id)) return; const r = await ask(); set({ r }); },
    };
    export function Screen() {
      const one = async () => { const id = me(); await ask(); if (!stillSignedIn(id)) return; useX.getState().keep(1); };
      const two = async () => { await ask(); useX.getState().keep(2); storage.set('k', 'v'); };
      return null; }`))).toEqual([
      'src/stores/planted.ts:2  plain  set(',
      'src/stores/planted.ts:3  early  set(',
      'src/stores/planted.ts:7  two  getState().keep(',
      'src/stores/planted.ts:7  two  storage.set(',
    ]);
  });

  it('a handler passed along, a promise tail, a held store and the persist helpers are each judged on their own', () => {
    expect(listed(opsIn('src/hooks/planted.ts', `export function useP() {
      const store = useSocialStore.getState();
      useEffect(() => { ask().then((r) => { store.addFollowing(r); }); }, []);
      return { onPress: async () => { const id = me(); await ask(); if (memberUnchanged(id)) enqueueMutation('a'); setSensitive('k', 'v'); } };
    }`))).toEqual([
      'src/hooks/planted.ts:3  useP (a handler)  store.addFollowing(',
      'src/hooks/planted.ts:4  onPress  setSensitive(',
    ]);
  });

  it('a wait in an arm that leaves does not reach past it; one in a try whose finally holds the write does', () => {
    expect(listed(opsIn('src/components/planted.tsx', `export function Desk() {
      const onFile = async () => {
        if (editing) { try { await amend(); } finally { setSending(false); } return; }
        useD.getState().file(1);
      };
      const onSave = async () => {
        try { if (editing) { await amend(); return; } } finally { useD.getState().keep(2); }
      };
      return null; }`))).toEqual(['src/components/planted.tsx:7  onSave  getState().keep(']);
  });

  it('passes a check after the wait, a read, a write before any wait, flags let down, and signing in', () => {
    expect(listed(opsIn('src/stores/auth.ts', `export const s = {
      a: async () => { const id = me(); set({ busy: true }); const r = await ask(); if (!stillSignedIn(id)) return; set({ r }); },
      b: async () => { await ask(); get().fetchMore(); set({ loading: false, saving: false }); },
      c: async () => { const id = me(); await get().removeLog(1); },
      login: async () => { const r = await ask(); set({ user: r }); },
    };`))).toEqual([]);
  });
});

describe('a write that lands after a sign-out must not put the member back', () => {
  it('EVERY write after a wait, in the whole app, is checked after its own last wait — enumerated', () => {
    const hits = APP.flatMap((f) => listed(opsIn(f.file, f.text)));
    const keyOf = (h: string) => h.replace(/:\d+ {2}/, '  ');
    expect(hits.filter((h) => !(keyOf(h) in JUDGED))).toEqual([]);
    for (const k of Object.keys(JUDGED)) expect([k, hits.some((h) => keyOf(h) === k)]).toEqual([k, true]);
  });

  it('reads the app, not an empty sweep: each store known to write after a wait is seen to', () => {
    // A file whose writes the walker cannot see would read as clean, and pass.
    expect(APP.length).toBeGreaterThan(400);
    const blind = KNOWN_WRITERS.filter((f) => opsOf(f).every((o) => o.writes.length === 0));
    expect(blind).toEqual([]);
  });

  it("sees followUser's writes: through a held store, and through the persist helpers", () => {
    const follow = opsOf('src/stores/domain/socialSlice.ts').find((o) => o.name === 'followUser');
    const seen = new Set(follow?.writes.map((w) => w.text));
    expect([...seen]).toEqual(expect.arrayContaining([
      'store.addRequested(', 'persistFollowingToCache(', 'enqueueMutation(', 'getState().removeFollowing(',
    ]));
  });

  it('the exempted subscription is actually torn down on logout', () => {
    // The exemption above is only honest if this holds. Nulling a variable is not unsubscribing:
    // the reset leaves every open room through its close, which calls removeChannel.
    const lounge = readCode(path.join(ROOT, 'src/stores/lounge.ts'));
    const reset = lounge.slice(lounge.lastIndexOf('registerStoreReset('));
    expect(reset).toMatch(/for \(const leave of \[\.\.\._roomLeaves\]\)/);
    expect(reset).toMatch(/_salons\.clear\(\)/);
    expect(lounge).toMatch(/const close = openChannel\(`lounge-\$\{loungeId\}`/);
    // The reset leaves as the screen does: the channel closed, and its watch ended with it.
    expect(lounge).toMatch(/_roomLeaves\.add\(leave\);/);
    expect(lounge).toMatch(/const leave = \(\) => \{\s*watch\.end\(\);\s*close\(\);/);
    expect(readCode(path.join(ROOT, 'src/lib/openChannel.ts'))).toMatch(/supabase\.removeChannel\(channel\)/);
  });

  it('the check compares against a CAPTURED id, never the current one', () => {
    // `stillSignedIn(useAuthStore.getState().user?.id)` compares the current member to themselves
    // and is always true: a check that cannot fail. The id must be taken before the wait.
    const live = APP.filter((f) => /(?:stillSignedIn|memberUnchanged)\(\s*use\w+Store\.getState\(\)/.test(f.text)).map((f) => f.file);
    expect(live).toEqual([]);
  });
});

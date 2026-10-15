/**
 * staleWriteGuard.test.ts — batch 23
 * ──────────────────────────────────
 * Every async store operation reads the member at its start, awaits the network,
 * then writes. None re-checked in between, so a logout during that await let the
 * previous member's data land in a store the reset had already cleared — and a
 * store change triggers a disk write, so it also re-created the persisted copy
 * that #64 deletes.
 *
 * This is an ENUMERATION, not a list of the sites I happened to notice. It walks
 * the slices, finds every operation that writes after awaiting, and demands a
 * guard. A new operation of that shape fails this the day it is written.
 */
import * as path from 'path';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const ROOT = path.join(__dirname, '..', '..', '..');

const SLICES = [
  'src/stores/domain/logSlice/helpers/logOperations.ts',
  'src/stores/domain/watchlistSlice.ts',
  'src/stores/domain/listSlice.ts',
  'src/stores/domain/archiveSlice.ts',
  'src/stores/domain/interactionSlice.ts',
  'src/stores/domain/socialSlice.ts',
  // The film store was where #64 was filed, but the defect belongs to any store
  // a logout clears. notificationStore is the sharpest case outside it: it
  // PERSISTS, and its reset deletes that file to stop a documented "cross-user
  // notification leak" — so a late write rewrites the very key the defence
  // removes. The defence and the defect were in the same file.
  'src/stores/notificationStore.ts',
  // All eight stores that register a logout reset are now covered. These three
  // were pinned as a known gap for one round and then closed; the pin fired when
  // they were fixed, which is what promoted them here.
  'src/stores/blockStore.ts',
  'src/stores/lounge.ts',
  // The report store, which arrived here by the guard below firing. It had
  // never registered a logout reset AT ALL — the only store with member state
  // that did not — so it sat outside this rule entirely. `recentReports` is
  // what stops a second report on the same content, and left standing it told
  // the next member on the phone that they had already reported a filing they
  // had never seen: turned away from the moderation tools by somebody else's
  // history. Registering the reset put it in scope here, and its three writes
  // after an await needed the guard.
  'src/stores/reportStore.ts',
  // The Dispatch. It registers a logout reset like the rest, and it is the
  // sharpest case since content.ts: a feed, a per-viewer set of certified and
  // saved ids, and six acts that each await a write. This test found it the day
  // the file was written, which is the whole point of enumerating rather than
  // listing what somebody noticed.
  'src/stores/dispatch.ts',
  // The auth store itself, which was never listed — it owns the logout, so it
  // read as the one file that could not have this defect. It can. `updateUser`
  // awaits a profile write and, on failure, puts the PREVIOUS member's whole
  // user object back into the store and writes it to encrypted storage under
  // their id. A logout landing inside that window resurrected the member who
  // had just left, identity and cache together.
  //
  // Its sign-in paths are a different matter and are listed below: they
  // legitimately establish a member where there was none, and a
  // captured-member guard is meaningless for them.
  'src/stores/auth.ts',
];

/**
 * Operations that write after an await and MUST NOT carry the guard.
 *
 * Signing in is the whole exception: `memberUnchanged(null)` asks "nobody then,
 * nobody now", and a successful sign-in makes that false by design. Guarding
 * these would throw away the session the member just created. Named one at a
 * time so the exemption cannot quietly widen.
 */
const ESTABLISHES_A_MEMBER = new Set([
  'login', 'signup', 'restoreSession', 'logout', 'deleteAccount',
]);

type Write = { at: number; text: string };
type Op = {
  file: string;
  name: string;
  line: number;
  /** Writes that come after an await, guarded or not. */
  writes: { line: number; text: string }[];
  unguarded: { line: number; text: string }[];
};

/** The helpers that save to the phone, or queue an act to be sent as the member. */
const PERSISTS = /\b(?:enqueueMutation|persistFollowingToCache|setSensitive)\(|\bstorage\.set\(/g;
/** A store method that only reads, or starts its own operation for whoever is signed in now. */
const READS = /^(?:is|has|get|can|fetch|load|hydrate)(?:[A-Z]|$)/;

/**
 * Every write in a body: the store's own `set(`; a method that is not a read,
 * called on `getState()`, on `get()`, or on a variable holding
 * `useXStore.getState()`; and the persist helpers above. Seeing only bare
 * `set(` left followUser's shape unseen: `store.addFollowing(` after an await,
 * then `persistFollowingToCache(` under the id it began with.
 */
function writesIn(body: string): Write[] {
  const out: Write[] = [];
  for (const m of body.matchAll(/(^|[^.\w])set\(/g)) out.push({ at: m.index! + m[1].length, text: 'set(' });
  for (const m of body.matchAll(/\b(?:getState|get)\(\)\.(\w+)\(/g)) {
    if (!READS.test(m[1])) out.push({ at: m.index!, text: m[0] });
  }
  for (const held of body.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*use\w+Store\.getState\(\)\s*;/g)) {
    for (const m of body.matchAll(new RegExp(`\\b${held[1]}\\.(\\w+)\\(`, 'g'))) {
      if (!READS.test(m[1])) out.push({ at: m.index!, text: m[0] });
    }
  }
  for (const m of body.matchAll(PERSISTS)) out.push({ at: m.index!, text: m[0] });
  return out;
}

/** `set({ loading: false })`: in-flight flags lowered to the reset's own value, nobody's data. */
const LOWERS_FLAGS = /^set\(\{(?:\s*\w+:\s*false\s*,?)+\s*\}\)/;

/** `name: (…) => Type,` is a type (an interface member, a parameter), never a definition. */
const TYPE_ONLY = /^\s*\w+\??:\s*\(.*=>\s*[^\s(={][^(={]*$/;

/** The `{…}` block that closes just before `pos`, as [open, close]; null if none does. */
function blockBefore(body: string, pos: number): [number, number] | null {
  let close = pos - 1;
  while (close >= 0 && /\s/.test(body[close])) close--;
  if (body[close] !== '}') return null;
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (body[i] === '}') depth++;
    else if (body[i] === '{' && --depth === 0) return [i, close];
  }
  return null;
}

/**
 * The code a `catch` or `finally` at `pos` can be reached from: its `try`
 * block, and for a `finally` the `catch` before it too. A write in it follows
 * an await only if one of those holds an await.
 */
function reachedFrom(body: string, pos: number): string {
  const last = blockBefore(body, pos);
  if (!last) return '';
  const head = body.slice(0, last[0]);
  const isCatch = /(?<![.\w])catch\s*(?:\([^)]*\))?\s*$/.exec(head);
  const tryBlock = isCatch ? blockBefore(body, isCatch.index) : null;
  return body.slice(tryBlock ? tryBlock[0] : last[0], last[1] + 1);
}

/** The first `}` after `from` that closes a block opened before it. */
function blockEnd(body: string, from: number): number {
  let depth = 0;
  for (let i = from; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}' && depth-- === 0) return i;
  }
  return body.length;
}

/**
 * The code a check at `g` protects. `if (!stillSignedIn(id)) return;` protects
 * the rest of its block; `if (stillSignedIn(id)) set(…)`, its own line, or the
 * block its line opens. A check in any other shape protects nothing.
 */
function coverOf(body: string, g: number): [number, number] {
  const lineStart = body.lastIndexOf('\n', g) + 1;
  const lineEnd = body.indexOf('\n', g) < 0 ? body.length : body.indexOf('\n', g);
  const line = body.slice(lineStart, lineEnd);
  if (/!\s*$/.test(body.slice(lineStart, g))) {
    return /^\s*if\s*\(.*\)\s*(?:\{[^}]*)?\b(?:return|throw)\b/.test(line) ? [g, blockEnd(body, g)] : [g, g];
  }
  return /\{\s*$/.test(line) ? [g, blockEnd(body, lineEnd)] : [g, lineEnd];
}

const at = (body: string, re: RegExp) => [...body.matchAll(re)].map((m) => m.index!);

function opsIn(file: string): Op[] {
  const src = readCode(path.join(ROOT, file));
  const lines = src.split(/\r?\n/);

  // A boundary is a DEFINITION, never a bare call: a store member (`name: (`,
  // `name: async (`, `name = (`), a top-level `const name = (`, or a `function`
  // declaration. Read as a boundary, `set(` or `if (` would cut an operation in
  // two, and a check in one piece would be counted for writes in another.
  const starts: number[] = [];
  lines.forEach((l, i) => {
    if (TYPE_ONLY.test(l)) return;
    if (/^\s{0,6}(export const )?\w+\s*(?::|=)\s*(?:async\s*)?\(/.test(l)
      || /^(?:export\s+)?(?:const|let)\s+\w+\s*=\s*(?:async\s*)?\(/.test(l)
      || /^\s{0,4}(?:export\s+)?(?:async\s+)?function\s+\w+/.test(l)) starts.push(i);
  });

  const out: Op[] = [];
  for (let s = 0; s < starts.length; s++) {
    const start = starts[s];
    const end = s + 1 < starts.length ? starts[s + 1] : lines.length;
    const body = lines.slice(start, end).join('\n');
    const lineOf = (offset: number) => start + 1 + (body.slice(0, offset).match(/\n/g) ?? []).length;

    const name = (/^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/.exec(lines[start])
      ?? /^\s*(?:export\s+)?(?:const\s+|let\s+)?(\w+)\s*[:=]/.exec(lines[start]) ?? [])[1] ?? '';
    // Exempt: a subscription (no caller; logout unsubscribes it, tested below), and sign-in/out.
    if (/^subscribeTo\w+$/.test(name) || ESTABLISHES_A_MEMBER.has(name)) continue;

    const awaits = at(body, /\bawait\b/g);
    // `await get().removeLog(` — the call is made before its own await waits.
    const before = (w: Write) => awaits.filter((a) => a < w.at && !/^await[\s\w.$]*$/.test(body.slice(a, w.at)));
    const barriers = at(body, /(?<![.\w])(?:catch\s*[({]|finally\s*\{)/g)
      .filter((c) => /\bawait\b/.test(reachedFrom(body, c)));
    // Either primitive: `stillSignedIn` needs a member, `memberUnchanged` also
    // accepts nobody-then-nobody-now, for stores anonymous browsing reaches.
    const guards = at(body, /\b(?:stillSignedIn|memberUnchanged)\(/g);
    const after = writesIn(body).filter((w) => before(w).length > 0);
    if (after.length === 0) continue;

    // Guarded only by a check after the write's OWN last wait — or after the
    // `catch` it sits in, which any wait in the `try` can reach — and one that
    // covers it. A check anywhere in the body passed followUser, whose writes
    // after its first await were checked by nothing.
    const unguarded = after.filter((w) => {
      if (LOWERS_FLAGS.test(body.slice(w.at))) return false;
      const barrier = Math.max(...before(w), ...barriers.filter((b) => b < w.at));
      return !guards.some((g) => g > barrier && g < w.at && coverOf(body, g)[1] > w.at);
    });
    const where = (w: Write) => ({ line: lineOf(w.at), text: w.text });
    out.push({ file, name, line: start + 1, writes: after.map(where), unguarded: unguarded.map(where) });
  }
  return out;
}

describe('a write that lands after logout must not repopulate the store', () => {
  it('EVERY write after an await is checked after its own last await — enumerated', () => {
    const unguarded = SLICES.flatMap(opsIn)
      .flatMap((o) => o.unguarded.map((w) => `${o.file}:${w.line}  ${o.name}  ${w.text}`));
    expect(unguarded).toEqual([]);
  });

  it('EVERY swept file yields a write after an await — none is read as empty', () => {
    // A file whose writes the walker cannot see would read as clean, and pass.
    const empty = SLICES.filter((f) => opsIn(f).every((o) => o.writes.length === 0));
    expect(empty).toEqual([]);
  });

  it("sees followUser's writes: through a held store, and through the persist helpers", () => {
    const follow = opsIn('src/stores/domain/socialSlice.ts').find((o) => o.name === 'followUser');
    const seen = new Set(follow?.writes.map((w) => w.text));
    expect([...seen]).toEqual(expect.arrayContaining([
      'store.addRequested(', 'persistFollowingToCache(', 'enqueueMutation(', 'getState().removeFollowing(',
    ]));
  });

  it('EVERY store that registers a logout reset is covered — no store is exempt', () => {
    // The film store was where #64 was filed, and sweeping only its slices left
    // the identical defect in four other stores. This pins the LIST itself, so
    // adding a store with a reset handler and forgetting to sweep it fails here.
    // Wherever it lives: a store outside src/stores can register a reset too.
    // Read as code: a comment that names the call is not one.
    const resetting = new Set<string>();
    for (const full of universe('appCode')) {
      const src = readCode(full);
      if (/registerStoreReset\(/.test(src) && !/export function registerStoreReset/.test(src)) {
        resetting.add(path.relative(ROOT, full).replace(/\\/g, '/'));
      }
    }

    // A store with a reset must either be swept, or hold no unchecked write
    // after an await. Anything else is an unswept store.
    const unswept = [...resetting].filter(
      (f) => !SLICES.includes(f) && opsIn(f).some((o) => o.unguarded.length > 0)
    );
    expect(resetting.size).toBeGreaterThan(SLICES.length / 2);
    expect(unswept).toEqual([]);
  });

  it('the exempted subscription is actually torn down on logout', () => {
    // The exemption above is only honest if this holds. The lounge reset used to
    // set `_activeChannel = null` — forgetting the reference while leaving the
    // subscription LIVE — so a message arriving after logout still reached the
    // handler and wrote into the store the reset had just cleared. Nulling a
    // variable is not unsubscribing. notificationStore tears its channel down;
    // this one did not.
    const lounge = readCode(path.join(ROOT, 'src/stores/lounge.ts'));
    const reset = lounge.slice(lounge.lastIndexOf('registerStoreReset('));
    expect(reset).toMatch(/supabase\.removeChannel\(_activeChannel\)/);
    expect(reset).toMatch(/_activeChannel = null/);
  });

  it('the guard compares against a CAPTURED id, never the current one', () => {
    // `stillSignedIn(useAuthStore.getState().user?.id)` compares the current
    // member to themselves and is always true — a guard that cannot fail. I
    // wrote exactly that once while building this; the id must be captured
    // before the await.
    for (const file of SLICES) {
      const src = readCode(path.join(ROOT, file));
      expect(src).not.toMatch(/stillSignedIn\(\s*useAuthStore\.getState\(\)/);
    }
  });
});

/**
 * theRoomOnScreenDecidesTheGate.test.ts — one room's permissions in another's.
 * ─────────────────────────────────────────────────────────────────────────────
 * `app/lounge/[id].tsx` had two reads that answered to whichever room they were
 * STARTED for rather than the one on screen. expo-router reuses this screen when
 * only the `[id]` param changes, so opening room A and then room B leaves A's
 * requests in the air:
 *
 *   loadLounge          set `localLounge` to A's row while the member was in B.
 *                       That feeds isCreator, canPost and canRead — the GATE
 *                       was decided by the wrong room. A stale `setNotFound`
 *                       was worse: the transcript replaced by "not found" for a
 *                       room that is perfectly there.
 *
 *   refreshMembership   set `myStatus` from A's roster, which chooses between
 *                       the transcript, the request door, the pending notice
 *                       and the banned notice — and `members`, which is the
 *                       host's "At the Door" count.
 *
 * Same defect the store's fetchMessages had, one layer up in the screen.
 *
 * ── WHY THIS IS A SOURCE TEST ───────────────────────────────────────────────
 * Rendering this screen needs expo-router's param plumbing, a realtime channel,
 * a keyboard-aware list and the moderation sheet's gesture root. A render test
 * for it would be mostly mock, and the thing that must never regress is small
 * and exact: the two writes are conditional on the room still being the shown
 * one. That is what is pinned.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const SRC = fs.readFileSync(path.join(ROOT, 'app/lounge/[id].tsx'), 'utf8');

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** The body of a named function or arrow, by brace matching. */
const bodyOf = (needle: string): string => {
  const code = stripComments(SRC);
  const at = code.indexOf(needle);
  expect(at).toBeGreaterThan(-1);
  const brace = code.indexOf('{', at);
  let depth = 0;
  for (let i = brace; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') { depth -= 1; if (depth === 0) return code.slice(brace, i); }
  }
  throw new Error(`unbalanced braces after ${needle}`);
};

describe('the room on screen decides what the screen shows', () => {
  it('loadLounge abandons a response for a room the member has left', () => {
    const body = bodyOf('const loadLounge = async ()');
    // The await, then the bail — in that order. A flag declared and never
    // checked would read as protection and be none.
    expect(body).toMatch(/await[\s\S]*if \(cancelled\) return;/);
  });

  it('the effect that starts it actually SETS the flag on teardown', () => {
    // Half of this fix is the cleanup. Without it `cancelled` is permanently
    // false and the check above is decoration.
    expect(stripComments(SRC)).toMatch(/return \(\) => \{ cancelled = true; \};/);
  });

  it('refreshMembership compares the room it fetched FOR against the shown one', () => {
    const body = bodyOf('const refreshMembership = useCallback(async ()');
    expect(body).toMatch(/await fetchMembers\(id\)[\s\S]*if \(shownRoomRef\.current !== id\) return;/);
  });

  it('the ref tracking the shown room is kept current on every render', () => {
    // A ref set once at mount would answer with the first room for ever.
    expect(stripComments(SRC)).toMatch(/shownRoomRef\.current = id;/);
  });

  it('neither guard sits AFTER the state it is meant to protect', () => {
    // The order is the whole fix: a check below setMembers protects nothing.
    const membership = bodyOf('const refreshMembership = useCallback(async ()');
    expect(membership.indexOf('shownRoomRef.current !== id'))
      .toBeLessThan(membership.indexOf('setMembers('));

    const load = bodyOf('const loadLounge = async ()');
    expect(load.indexOf('if (cancelled) return;')).toBeLessThan(load.indexOf('setLocalLounge('));
    expect(load.indexOf('if (cancelled) return;')).toBeLessThan(load.indexOf('setNotFound('));
  });
});

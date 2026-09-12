/**
 * thePollRunsWhileWatched.test.ts — a query nobody could see the result of.
 * ─────────────────────────────────────────────────────────────────────────────
 * The corridor re-queried every salon every thirty seconds for as long as the
 * app was FOREGROUNDED — on any screen. A member on Reels, or reading a film,
 * or writing an essay, was refreshing unread badges nobody was looking at.
 *
 * Opening the Lounge to everyone made it worse rather than better: the poll had
 * been gated on `isArchivist` along with everything else, so it went from
 * Archivists-only to every signed-in member on the same day the wall came down.
 *
 * ── AND IT CANNOT SIMPLY BE DELETED ────────────────────────────────────────
 * That is the part worth pinning, because "kill the 30-second poll" is the
 * obvious call and it is wrong. Realtime covers exactly ONE room —
 * `_activeChannel` is a single channel for the salon you have open — so nothing
 * pushes changes for the rooms you are NOT in. `get_lounge_unread_counts` under
 * this query is the only thing feeding the corridor's badges. Deleting it
 * leaves every badge stale until a manual pull.
 *
 * So it runs while the screen is open, which is the only window in which its
 * result can be seen.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const RAW = readFileSync(join(ROOT, 'app/(tabs)/lounge.tsx'), 'utf8');
const CODE = RAW.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

const STORE = readFileSync(join(ROOT, 'src/stores/lounge.ts'), 'utf8');

describe('the poll runs while the screen is watched', () => {
  it('the scan can see the file — not passing on an empty read', () => {
    expect(CODE.length).toBeGreaterThan(4000);
    expect(CODE).toMatch(/fetchLounges/);
  });

  it('the interval is owned by the FOCUS of the screen, not by the app being open', () => {
    // The whole fix, in one assertion: the timer must live inside
    // useFocusEffect. Inside a plain useEffect it ticks for the life of the
    // mounted tab, which is the life of the session.
    const focus = CODE.slice(CODE.indexOf('useFocusEffect('));
    expect(focus).toMatch(/setInterval/);

    // And no interval is STARTED anywhere else. Counted as calls, not
    // mentions: `ReturnType<typeof setInterval>` is a type annotation and
    // starts no timer, so matching the bare name found two and claimed there
    // were two pollers.
    const started = (CODE.match(/setInterval\(/g) ?? []).length;
    expect(started).toBe(1);
  });

  it('it still exists — deleting it would strand every unread badge', () => {
    // Realtime is per-open-room, so this query is the only source of unread
    // counts for the rooms a member is NOT currently sitting in.
    expect(CODE).toMatch(/setInterval\(refresh, 30000\)/);
    expect(STORE).toMatch(/_activeChannel/);
  });

  it('arriving on the screen refreshes at once, rather than waiting out a tick', () => {
    const focus = CODE.slice(CODE.indexOf('useFocusEffect('));
    /**
     * Scoped to what happens BEFORE the AppState listener is registered.
     *
     * The arrival refresh and the return-from-background refresh are the same
     * two calls in the same order, so matching them anywhere in the effect was
     * satisfied by the listener's copy — a mutant that deleted the arrival
     * refresh entirely passed, which is precisely the regression this asserts
     * against.
     */
    const beforeListener = focus.slice(0, focus.indexOf('AppState.addEventListener'));
    expect(beforeListener.length).toBeGreaterThan(200);

    // A member coming back from a room must not see a stale badge for up to
    // thirty seconds.
    expect(beforeListener).toMatch(/void refresh\(\);\s*start\(\);/);
  });

  it('backgrounding stops it, and returning re-reads immediately', () => {
    const focus = CODE.slice(CODE.indexOf('useFocusEffect('));
    expect(focus).toMatch(/AppState\.addEventListener/);
    expect(focus).toMatch(/if \(next === 'active'\) \{ void refresh\(\); start\(\); \} else stop\(\);/);
  });

  it('leaving the screen clears the timer and removes the listener', () => {
    const focus = CODE.slice(CODE.indexOf('useFocusEffect('));
    // Without both, focusing the tab twice leaves two timers and two listeners
    // running for the rest of the session.
    expect(focus).toMatch(/return \(\) => \{[\s\S]{0,120}stop\(\);[\s\S]{0,120}sub\.remove\(\);/);
  });

  it('an in-flight query is never stacked behind itself', () => {
    const focus = CODE.slice(CODE.indexOf('useFocusEffect('));
    // A focus and a tick can land together, and fetchLounges is not instant.
    expect(focus).toMatch(/if \(isPollingRef\.current\) return;/);
    // Released in a finally, or one thrown query wedges the guard shut for the
    // rest of the session and the badges never move again.
    expect(focus).toMatch(/finally \{ isPollingRef\.current = false; \}/);
  });
});

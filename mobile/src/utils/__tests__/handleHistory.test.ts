/**
 * handleHistory.test.ts — #87, renaming strands you on "Member Not Found"
 * ──────────────────────────────────────────────────────────────────────
 * You rename your handle. The auth store moves ~750ms before Edit Profile pops, so
 * while you are still watching the sealing animation the screen underneath refetches
 * under a handle that no longer exists, and you are dropped back onto:
 *
 *     "Member Not Found — this member doesn't exist yet, or has been removed."
 *
 * about yourself. Nothing was lost, but the app's only feedback says otherwise.
 *
 * Two obvious detections do NOT work, and the tests below pin why the third does:
 *   • `isSelf` is false in exactly the case needing repair — that IS the bug
 *   • the loaded `targetUser` has already been wiped by RESET_STATE, and was never
 *     loaded at all when the screen is opened cold on a stale link
 *
 * So we remember that the handle used to be ours. The danger that creates — a freed
 * handle claimed by someone else, and us hijacking their profile — is the single most
 * important thing in this file, and has its own describe block.
 */

const mockStore = new Map<string, string>();
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    set: (k: string, v: string) => { mockStore.set(k, v); },
    getString: (k: string) => mockStore.get(k),
    delete: (k: string) => { mockStore.delete(k); },
  },
}));

// Deliberately after the mock — see the note in handleNotice.test.ts.
// eslint-disable-next-line import/first
import { clearHandleHistory, rememberPreviousHandle, shouldRepairHandleRoute, wasMyHandle } from '../handleHistory';

const KEY = 'reelhouse_handle_history';
beforeEach(() => mockStore.clear());

describe('remembering a handle we used to hold', () => {
  it('recognises the handle we just renamed away from', () => {
    rememberPreviousHandle('u1', 'sajjadsaleel_');
    expect(wasMyHandle('u1', 'sajjadsaleel_')).toBe(true);
  });

  it('is case-insensitive in both directions — the DB lowercases handles', () => {
    rememberPreviousHandle('u1', 'SajjadSaleel_');
    expect(wasMyHandle('u1', 'sajjadsaleel_')).toBe(true);
    expect(wasMyHandle('u1', 'SAJJADSALEEL_')).toBe(true);
  });

  it('keeps a chain of renames, not just the last one', () => {
    rememberPreviousHandle('u1', 'first');
    rememberPreviousHandle('u1', 'second');
    rememberPreviousHandle('u1', 'third');
    expect(wasMyHandle('u1', 'first')).toBe(true);
    expect(wasMyHandle('u1', 'second')).toBe(true);
    expect(wasMyHandle('u1', 'third')).toBe(true);
  });

  it('does not grow without bound, and keeps the most recent', () => {
    for (let i = 0; i < 25; i++) rememberPreviousHandle('u1', `h${i}`);
    const stored = JSON.parse(mockStore.get(KEY) as string);
    expect(stored.handles).toHaveLength(10);
    expect(wasMyHandle('u1', 'h24')).toBe(true);
    expect(wasMyHandle('u1', 'h0')).toBe(false);
  });

  it('never records the same handle twice', () => {
    rememberPreviousHandle('u1', 'same');
    rememberPreviousHandle('u1', 'same');
    rememberPreviousHandle('u1', 'SAME');
    expect(JSON.parse(mockStore.get(KEY) as string).handles).toEqual(['same']);
  });

  it('is keyed to the member — it can NEVER apply to whoever signs in next', () => {
    rememberPreviousHandle('u1', 'oldhandle');
    expect(wasMyHandle('u2', 'oldhandle')).toBe(false);
    expect(wasMyHandle('u1', 'oldhandle')).toBe(true);
  });

  it("a different member renaming replaces the record rather than merging into it", () => {
    rememberPreviousHandle('u1', 'mine');
    rememberPreviousHandle('u2', 'theirs');
    expect(wasMyHandle('u2', 'theirs')).toBe(true);
    expect(wasMyHandle('u2', 'mine')).toBe(false);
    expect(wasMyHandle('u1', 'mine')).toBe(false); // the record now belongs to u2
  });

  it('refuses junk input rather than recording it', () => {
    rememberPreviousHandle(null, 'x');
    rememberPreviousHandle('u1', null);
    rememberPreviousHandle('', '');
    expect(mockStore.has(KEY)).toBe(false);
    expect(wasMyHandle('u1', 'x')).toBe(false);
  });

  it('discards a corrupted record instead of throwing into a render', () => {
    mockStore.set(KEY, 'not json');
    expect(wasMyHandle('u1', 'x')).toBe(false);
    mockStore.set(KEY, JSON.stringify({ id: 'u1', handles: 'not an array' }));
    expect(wasMyHandle('u1', 'x')).toBe(false);
  });

  it('never throws if storage is unavailable — a rename already succeeded', () => {
    const mmkv = jest.requireMock('@/src/stores/mmkv-storage').storage as Record<string, unknown>;
    const real = { ...mmkv };
    mmkv.set = () => { throw new Error('mmkv unavailable'); };
    mmkv.getString = () => { throw new Error('mmkv unavailable'); };
    mmkv.delete = () => { throw new Error('mmkv unavailable'); };
    try {
      expect(() => rememberPreviousHandle('u1', 'x')).not.toThrow();
      expect(wasMyHandle('u1', 'x')).toBe(false);
      expect(() => clearHandleHistory()).not.toThrow();
    } finally {
      Object.assign(mmkv, real);
    }
  });
});

describe('shouldRepairHandleRoute — when to rewrite the route', () => {
  const stranded = {
    usernameOverride: undefined,
    routeUsername: 'sajjadsaleel_',
    liveUsername: 'sajjadobaidi',
    wasOurs: true,
    loading: false,
    hasTargetUser: false,
  };

  it('repairs the exact live case: our old handle, resolving to nobody', () => {
    expect(shouldRepairHandleRoute(stranded)).toBe(true);
  });

  it('NEVER touches the profile tab, which already passes a live handle', () => {
    expect(shouldRepairHandleRoute({ ...stranded, usernameOverride: 'sajjadobaidi' })).toBe(false);
  });

  it('NEVER touches a handle that was not ours', () => {
    expect(shouldRepairHandleRoute({ ...stranded, wasOurs: false })).toBe(false);
  });

  it('waits while the profile is still loading — every ordinary open passes through here', () => {
    expect(shouldRepairHandleRoute({ ...stranded, loading: true })).toBe(false);
  });

  it('stops once the repair has landed, so it cannot loop', () => {
    expect(shouldRepairHandleRoute({ ...stranded, routeUsername: 'sajjadobaidi' })).toBe(false);
    expect(shouldRepairHandleRoute({ ...stranded, routeUsername: 'SajjadObaidi' })).toBe(false);
  });

  it('does nothing without a live handle to repair towards', () => {
    expect(shouldRepairHandleRoute({ ...stranded, liveUsername: null })).toBe(false);
    expect(shouldRepairHandleRoute({ ...stranded, liveUsername: '' })).toBe(false);
    expect(shouldRepairHandleRoute({ ...stranded, routeUsername: null })).toBe(false);
  });
});

describe('THE HIJACK — someone else claims a handle we gave up', () => {
  /**
   * Renaming FREES the old handle. Another member can claim it. From then on
   * `/user/<oldHandle>` is THEIR profile, and "this was once mine" is still true.
   *
   * Recognition alone would redirect a visit to their profile onto ours — turning a
   * cosmetic bug into a wrong-profile bug. The second half of the predicate is what
   * prevents it: repair only when the handle resolves to NOBODY.
   */
  it('leaves their profile completely alone', () => {
    rememberPreviousHandle('u1', 'morpho');
    expect(wasMyHandle('u1', 'morpho')).toBe(true); // recognition is still true…

    const visitingTheirProfile = {
      usernameOverride: undefined,
      routeUsername: 'morpho',
      liveUsername: 'morpho_new',
      wasOurs: true,
      loading: false,
      hasTargetUser: true, // …but it resolves to a real member now
    };
    expect(shouldRepairHandleRoute(visitingTheirProfile)).toBe(false);
  });

  it('still repairs once that handle stops resolving again', () => {
    expect(shouldRepairHandleRoute({
      usernameOverride: undefined,
      routeUsername: 'morpho',
      liveUsername: 'morpho_new',
      wasOurs: true,
      loading: false,
      hasTargetUser: false,
    })).toBe(true);
  });
});

describe('end to end — the live sequence from the audit', () => {
  it('rename -> stranded -> repaired -> silent', () => {
    // the live account this actually happened to
    const id = 'admin-user-id';
    rememberPreviousHandle(id, 'sajjadsaleel_');

    // Edit Profile pops; the route still holds the old handle, which matches no row
    const step1 = shouldRepairHandleRoute({
      routeUsername: 'sajjadsaleel_', liveUsername: 'sajjadobaidi',
      wasOurs: wasMyHandle(id, 'sajjadsaleel_'), loading: false, hasTargetUser: false,
    });
    expect(step1).toBe(true);

    // the route is rewritten; the refetch under the new handle succeeds
    const step2 = shouldRepairHandleRoute({
      routeUsername: 'sajjadobaidi', liveUsername: 'sajjadobaidi',
      wasOurs: wasMyHandle(id, 'sajjadobaidi'), loading: false, hasTargetUser: true,
    });
    expect(step2).toBe(false);
  });

  it('a cold open on a stale link is repaired too — no loaded profile required', () => {
    rememberPreviousHandle('u1', 'oldhandle');
    // App killed, reopened from a copied link. Nothing is loaded, nothing to compare
    // against — only the local record knows this handle was ours.
    expect(shouldRepairHandleRoute({
      routeUsername: 'oldhandle', liveUsername: 'newhandle',
      wasOurs: wasMyHandle('u1', 'oldhandle'), loading: false, hasTargetUser: false,
    })).toBe(true);
  });

  it('an ordinary visit to a genuinely missing member is untouched', () => {
    expect(shouldRepairHandleRoute({
      routeUsername: 'nobody-ever', liveUsername: 'me',
      wasOurs: wasMyHandle('u1', 'nobody-ever'), loading: false, hasTargetUser: false,
    })).toBe(false);
  });
});

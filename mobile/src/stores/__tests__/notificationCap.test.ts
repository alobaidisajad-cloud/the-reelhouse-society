/**
 * notificationCap.test.ts — #51, one push destroyed up to 450 notifications
 * ────────────────────────────────────────────────────────────────────────
 * The fetch and load-more paths kept 500 notifications. The Realtime handler kept 50.
 * Two numbers for one policy, disagreeing by 450 — so a single arriving notification
 * threw away everything past the 50th, and wrote the truncated list straight back to
 * device storage.
 *
 * It broke three things at once:
 *   1. the rows
 *   2. the unread badge — the eviction arithmetic assumes AT MOST ONE row leaves, so
 *      evicting 450 subtracted 1 and left the badge counting rows that no longer exist
 *   3. recovery — load-more had already switched itself off at the 500 cap, so the list
 *      stayed at 50 until a cold refetch
 *
 * This logic lived inside a socket callback where no test could reach it, which is how a
 * cap that destroyed 450 rows AND a comment mis-stating the drift by a factor of 450
 * both survived review. It is a pure function now, and this is that test.
 */
import { applyIncomingNotification, type AppNotification } from '../notificationStore';

const CAP = 500;

const notif = (id: number, read = true): AppNotification => ({
  id: `n${id}`,
  user_id: 'me',
  type: 'endorse',
  message: `certified your log of Film ${id}.`,
  read,
  created_at: new Date(2026, 0, 1, 0, 0, id % 60).toISOString(),
});

/** A full list of `n` notifications, all read unless stated. */
const listOf = (n: number, read = true) => Array.from({ length: n }, (_, i) => notif(i, read));

describe('THE DEFECT — an arriving notification must not shrink the list', () => {
  it('a full list stays full: 500 in, 500 out (it used to become 50)', () => {
    const state = { notifications: listOf(CAP), _unreadCount: 0 };
    const next = applyIncomingNotification(state, notif(9999, false));

    expect(next.notifications).toHaveLength(CAP);
    // The old 50-cap would have left 50 here — 450 rows destroyed by one push.
    expect(next.notifications.length).toBeGreaterThan(50);
  });

  it('the newcomer is at the top and the oldest single row is the one that leaves', () => {
    const state = { notifications: listOf(CAP), _unreadCount: 0 };
    const next = applyIncomingNotification(state, notif(9999, false));

    expect(next.notifications[0].id).toBe('n9999');
    expect(next.notifications).toHaveLength(CAP);
    expect(next.notifications.some(n => n.id === `n${CAP - 1}`)).toBe(false); // the oldest went
    expect(next.notifications.some(n => n.id === `n${CAP - 2}`)).toBe(true);  // its neighbour did not
  });

  it('below the cap nothing is evicted at all', () => {
    const state = { notifications: listOf(120), _unreadCount: 0 };
    const next = applyIncomingNotification(state, notif(9999, false));
    expect(next.notifications).toHaveLength(121);
  });

  it('the list is always clamped to the cap, and the badge stays exact', () => {
    // The property the whole fix rests on: with ONE shared cap the Realtime path can
    // only ever remove a single row. The accounting derives what actually fell off
    // rather than assuming one, so the badge is right even from a list that somehow
    // exceeded the cap — a state neither writer can produce, and no longer one this
    // function depends on being impossible.
    for (const size of [CAP - 1, CAP, CAP + 1]) {
      const state = { notifications: listOf(size, false), _unreadCount: size };
      const next = applyIncomingNotification(state, notif(9999, false));

      expect(next.notifications.length).toBe(Math.min(size + 1, CAP));
      // the badge equals the unread rows actually held, at every size
      expect(next._unreadCount).toBe(next.notifications.filter(n => !n.read).length);
    }
  });
});

describe('THE BADGE — it must not count rows that no longer exist', () => {
  it('an unread arrival increments by one', () => {
    const state = { notifications: listOf(10), _unreadCount: 3 };
    expect(applyIncomingNotification(state, notif(9999, false))._unreadCount).toBe(4);
  });

  it('evicting an UNREAD row subtracts it, so the net is zero', () => {
    const state = { notifications: listOf(CAP, false), _unreadCount: CAP };
    const next = applyIncomingNotification(state, notif(9999, false));
    expect(next._unreadCount).toBe(CAP); // +1 arrived, −1 evicted
  });

  it('evicting a READ row subtracts nothing', () => {
    const state = { notifications: listOf(CAP, true), _unreadCount: 0 };
    expect(applyIncomingNotification(state, notif(9999, false))._unreadCount).toBe(1);
  });

  it('the count never exceeds the number of unread rows actually held', () => {
    // The precise corruption #51 caused: under the old cap this returned a count of
    // ~450 against a list of 50. Asserted as an invariant, so no future cap change can
    // reintroduce it quietly.
    let state: { notifications: AppNotification[]; _unreadCount: number } =
      { notifications: listOf(CAP, false), _unreadCount: CAP };

    for (let i = 0; i < 25; i++) {
      state = applyIncomingNotification(state, notif(10_000 + i, false));
      const actualUnread = state.notifications.filter(n => !n.read).length;
      expect(state._unreadCount).toBe(actualUnread);
    }
  });
});

describe('duplicates cost nothing', () => {
  it('a repeat delivery returns the SAME object, so no storage write happens', () => {
    // Zustand skips the update when the reference is unchanged — and every state change
    // in this store persists the whole list (~186KB at 500 rows).
    const state = { notifications: listOf(10), _unreadCount: 2 };
    const again = applyIncomingNotification(state, state.notifications[4]);
    expect(again).toBe(state);
  });

  it('a duplicate never inflates the badge', () => {
    const state = { notifications: listOf(10, false), _unreadCount: 10 };
    expect(applyIncomingNotification(state, state.notifications[0])._unreadCount).toBe(10);
  });
});

describe('the cap is shared, not per-path', () => {
  it('a smaller cap still evicts exactly one — the arithmetic is not tied to 500', () => {
    const state = { notifications: listOf(50, false), _unreadCount: 50 };
    const next = applyIncomingNotification(state, notif(9999, false), 50);
    expect(next.notifications).toHaveLength(50);
    expect(next._unreadCount).toBe(50);
  });

  it('REGRESSION: mismatched caps are what destroyed the rows', () => {
    // The bug, reproduced: a list filled to the FETCH cap, then one notification
    // arriving under the smaller REALTIME cap.
    const state = { notifications: listOf(CAP, false), _unreadCount: CAP };
    const mismatched = applyIncomingNotification(state, notif(9999, false), 50);
    expect(mismatched.notifications).toHaveLength(50);   // 450 rows destroyed

    // One shared cap is what prevents that.
    const shared = applyIncomingNotification(state, notif(9999, false), CAP);
    expect(shared.notifications).toHaveLength(CAP);

    // And the badge is now exact in BOTH cases — the hardening is independent of the
    // cap being shared, so neither fix alone can leave the count lying.
    expect(mismatched._unreadCount).toBe(mismatched.notifications.filter(n => !n.read).length);
    expect(shared._unreadCount).toBe(shared.notifications.filter(n => !n.read).length);
  });
});

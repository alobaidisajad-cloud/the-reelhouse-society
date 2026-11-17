/**
 * useInitiation — the triple-locked trigger for THE INITIATION.
 * ─────────────────────────────────────────────────────────────
 * The ceremony fires exactly once, for exactly the right person:
 *
 *   LOCK 1 — per-USER never-seen flag (keyed by user id, so two accounts on
 *            one phone each get their own single ceremony, and none gets two).
 *   LOCK 2 — the flag BURNS AT OPEN: the moment the modal is truly on screen
 *            (its onShow, `shown` below) the flag is set, so a crash/kill
 *            mid-beat never resurrects it. Not before: a showing the phone
 *            refused (iOS will not present a Modal over a sheet that is still
 *            presented) no longer spends it.
 *   LOCK 3 — the account must be NEWBORN (created within 48h). This is what
 *            guarantees an existing member signing in on a new device is never
 *            trapped in a tutorial: their account is weeks old, gate closed.
 *            48h (not minutes) because the app is browse-first — a member may
 *            wander long before signup, or confirm email hours later.
 *
 * Decided only while the Lobby is in front (`inFront`): a member who confirms their address from a
 * link opened over the sign-in sheet is signed in while that sheet is still presented, and the
 * ceremony waited for nothing, then was refused beneath it (round 11). It waits until the sheet
 * has gone, and a breath cut short by a sheet coming back is asked again when the Lobby returns.
 *
 * A ~600ms breath after the trigger conditions are met lets the Lobby paint
 * beneath the blur (and clears the boot aperture-blink on deep-link returns).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { houseNow } from '@/src/lib/houseClock';
import { useAuthStore } from '@/src/stores/auth';
import { storage } from '@/src/stores/mmkv-storage';
import { instantOf } from '@/src/utils/instant';

export const INITIATION_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours
const BREATH_MS = 600;

const flagKey = (userId: string) => `reelhouse_initiation_${userId}`;

/**
 * Pure trigger predicate — exported for unit tests.
 * True only for: a signed-in user, never initiated, whose account is newborn.
 */
export function shouldInitiate(params: {
  userId: string | null | undefined;
  createdAt: string | null | undefined;
  alreadySeen: boolean;
  now?: number;
}): boolean {
  const { userId, createdAt, alreadySeen } = params;
  if (!userId || alreadySeen) return false;
  if (!createdAt) return false;
  const created = instantOf(createdAt);
  if (isNaN(created)) return false;
  const now = params.now ?? houseNow();
  const age = now - created;
  return age >= 0 && age <= INITIATION_WINDOW_MS;
}

/** `inFront`: whether the Lobby is the screen in front, no sheet or page presented over it. */
export function useInitiation(inFront = true) {
  const user = useAuthStore((s) => s.user);
  const [visible, setVisible] = useState(false);
  // One decision per mounted session per user — prevents re-evaluation loops.
  const decidedFor = useRef<string | null>(null);
  // The member the ceremony was opened for: its onShow burns their flag, and only theirs.
  const openedFor = useRef<string | null>(null);
  // The breath, held apart from the decision. When it was the effect's own
  // cleanup, the profile replacing the sign-in's user (the same created_at,
  // written differently) inside the breath cancelled it. Only leaving, or the
  // Lobby going from the front, cancels it now.
  const breath = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether the Lobby is in front as the breath ends: a sheet raised inside it holds the ceremony.
  const front = useRef(inFront);
  useLayoutEffect(() => { front.current = inFront; });
  useEffect(() => () => { if (breath.current) clearTimeout(breath.current); }, []);

  // The Lobby gone from the front inside the breath: the breath is stopped and the decision undone,
  // so it is made again when the Lobby returns. Nothing was spent: the flag burns only on show.
  useEffect(() => {
    if (inFront || !breath.current) return;
    clearTimeout(breath.current);
    breath.current = null;
    decidedFor.current = null;
  }, [inFront]);

  useEffect(() => {
    // Decided only once the account's age is known: a user without it yet is
    // not a "no", and deciding then would never ask again. And only with the
    // Lobby in front: decided under a sheet, the ceremony was shown to no one.
    if (!inFront || !user?.id || !user.created_at || decidedFor.current === user.id) return;
    decidedFor.current = user.id;

    const seen = storage.getBoolean(flagKey(user.id)) === true;
    if (!shouldInitiate({ userId: user.id, createdAt: user.created_at, alreadySeen: seen })) return;

    const decided = user.id;
    breath.current = setTimeout(() => {
      breath.current = null;
      // Still the member it was decided for: a sign-out inside the breath shows nothing.
      if (useAuthStore.getState().user?.id !== decided) return;
      // A sheet raised as the breath ended: asked again when the Lobby returns.
      if (!front.current) { decidedFor.current = null; return; }
      openedFor.current = decided;
      setVisible(true);
    }, BREATH_MS);
  }, [inFront, user?.id, user?.created_at]);

  return {
    visible,
    username: user?.username ?? 'member',
    memberNo: user?.member_no ?? null,
    dismiss: () => setVisible(false),
    /** The ceremony is on screen (the Modal's onShow): LOCK 2 burns, for the member it opened for. */
    shown: () => {
      const id = openedFor.current;
      if (id && useAuthStore.getState().user?.id === id) storage.set(flagKey(id), true);
    },
  };
}

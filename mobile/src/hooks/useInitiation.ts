/**
 * useInitiation — the triple-locked trigger for THE INITIATION.
 * ─────────────────────────────────────────────────────────────
 * The ceremony fires exactly once, for exactly the right person:
 *
 *   LOCK 1 — per-USER never-seen flag (keyed by user id, so two accounts on
 *            one phone each get their own single ceremony, and none gets two).
 *   LOCK 2 — the flag BURNS AT OPEN: the moment the modal becomes visible the
 *            flag is set, so a crash/kill mid-beat never resurrects it.
 *   LOCK 3 — the account must be NEWBORN (created within 48h). This is what
 *            guarantees an existing member signing in on a new device is never
 *            trapped in a tutorial: their account is weeks old, gate closed.
 *            48h (not minutes) because the app is browse-first — a member may
 *            wander long before signup, or confirm email hours later.
 *
 * A ~600ms breath after the trigger conditions are met lets the Lobby paint
 * beneath the blur (and clears the boot aperture-blink on deep-link returns).
 */
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/src/stores/auth';
import { storage } from '@/src/stores/mmkv-storage';

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
  const created = Date.parse(createdAt);
  if (isNaN(created)) return false;
  const now = params.now ?? Date.now();
  const age = now - created;
  return age >= 0 && age <= INITIATION_WINDOW_MS;
}

export function useInitiation() {
  const user = useAuthStore((s) => s.user);
  const [visible, setVisible] = useState(false);
  // One decision per mounted session per user — prevents re-evaluation loops.
  const decidedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id || decidedFor.current === user.id) return;
    decidedFor.current = user.id;

    const seen = storage.getBoolean(flagKey(user.id)) === true;
    if (!shouldInitiate({ userId: user.id, createdAt: user.created_at, alreadySeen: seen })) return;

    // LOCK 2 — burn at open. Set BEFORE showing, so no interruption can
    // ever cause a second showing.
    storage.set(flagKey(user.id), true);

    const breath = setTimeout(() => setVisible(true), BREATH_MS);
    return () => clearTimeout(breath);
  }, [user?.id, user?.created_at]);

  return {
    visible,
    username: user?.username ?? 'member',
    memberNo: user?.member_no ?? null,
    dismiss: () => setVisible(false),
  };
}

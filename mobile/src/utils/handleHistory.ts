import { storage } from '@/src/stores/mmkv-storage';

const KEY = 'reelhouse_handle_history';

/** Ten renames is already a stranger number of renames. Newest first. */
const MAX_HANDLES = 10;

type HandleHistory = { id: string; handles: string[] };

/**
 * #87 — a rename strands you on "Member Not Found", about yourself.
 * ─────────────────────────────────────────────────────────────────
 * The route `/user/[username]` resolves its subject from the route param. Renaming
 * changes `user.username` in the auth store roughly 750ms before Edit Profile pops
 * (useEditProfile.ts), so while you are still looking at the sealing animation:
 *
 *   isSelf (auth handle vs route param) flips to false
 *     -> useProfileData's mount effect re-fires (fetchUserData's identity changed)
 *     -> RESET_STATE wipes the loaded profile
 *     -> it refetches under the STALE handle, which now matches no row
 *     -> SET_USER null, and the screen you are dropped back onto reads
 *        "Member Not Found — this member doesn't exist yet, or has been removed."
 *
 * The rename succeeded and nothing was lost, but the app's only feedback says the
 * opposite. It reads as "I just destroyed my account."
 *
 * ── WHY A LOCAL RECORD, RATHER THAN THE OBVIOUS CHECKS ──────────────────────────────
 * Two simpler ideas both fail, for reasons worth writing down:
 *
 *   • gate the repair on `isSelf` — circular. `isSelf` is false in exactly the case
 *     needing repair; that is what the bug IS
 *   • compare the loaded `targetUser.id` to `user.id` — RESET_STATE has already wiped
 *     targetUser by the time the fetch fails, and it is never loaded at all when the
 *     screen is opened cold on a stale link
 *
 * What survives both is the fact that this handle used to be ours. That is knowable
 * locally, needs no schema change, and is just as true on a cold start.
 *
 * ── THE HIJACK THIS MUST NOT CAUSE ──────────────────────────────────────────────────
 * A renamed handle is FREED, and someone else may claim it. "This was once mine" alone
 * would then redirect a visit to THEIR profile onto ours — turning a cosmetic bug into
 * a wrong-profile bug. So recognition is only half the predicate: the caller also
 * requires that the handle currently resolves to nobody. If it resolves to a real
 * member, it is theirs now and we leave it entirely alone.
 *
 * Keyed by user id, so nothing here can ever apply to a different member signing in on
 * the same device.
 */
export function rememberPreviousHandle(userId: string | null | undefined, oldHandle: string | null | undefined): void {
  const uid = (userId ?? '').trim();
  const old = (oldHandle ?? '').trim().toLowerCase();
  if (!uid || !old) return;
  try {
    const existing = read();
    const handles = existing && existing.id === uid ? existing.handles : [];
    const next = [old, ...handles.filter((h) => h !== old)].slice(0, MAX_HANDLES);
    storage.set(KEY, JSON.stringify({ id: uid, handles: next } satisfies HandleHistory));
  } catch { /* a convenience is never worth failing a rename that already succeeded */ }
}

/** Was this handle ours before a rename? Case-insensitive; the DB lowercases handles. */
export function wasMyHandle(userId: string | null | undefined, handle: string | null | undefined): boolean {
  const uid = (userId ?? '').trim();
  const candidate = (handle ?? '').trim().toLowerCase();
  if (!uid || !candidate) return false;
  const existing = read();
  if (!existing || existing.id !== uid) return false;
  return existing.handles.includes(candidate);
}

export function clearHandleHistory(): void {
  try { storage.delete(KEY); } catch { /* nothing to do */ }
}

/**
 * The whole repair decision, as one pure function — because every one of these clauses
 * is a hazard someone could remove without the app visibly breaking:
 *
 *   usernameOverride  the profile TAB passes a live handle, so it is already correct
 *                     and can never be stale. Rewriting a route from under it would be
 *                     pure risk for zero benefit
 *   wasOurs           without it we would rewrite routes belonging to other members
 *   loading           mid-fetch there is legitimately no targetUser yet; firing here
 *                     would race every ordinary profile open
 *   hasTargetUser     the handle resolved to a real member. A freed handle can be
 *                     re-claimed, and redirecting a visit to THEIR profile onto ours
 *                     would be a far worse bug than the one being fixed
 *   already equal     the repair has landed; without this it would re-fire forever
 */
export function shouldRepairHandleRoute(input: {
  usernameOverride?: string;
  routeUsername?: string | null;
  liveUsername?: string | null;
  wasOurs: boolean;
  loading: boolean;
  hasTargetUser: boolean;
}): boolean {
  if (input.usernameOverride) return false;
  if (!input.wasOurs) return false;
  if (input.loading) return false;
  if (input.hasTargetUser) return false;
  const route = (input.routeUsername ?? '').trim();
  const live = (input.liveUsername ?? '').trim();
  if (!route || !live) return false;
  return route.toLowerCase() !== live.toLowerCase();
}

function read(): HandleHistory | null {
  try {
    const raw = storage.getString(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HandleHistory>;
    if (typeof parsed?.id !== 'string' || !Array.isArray(parsed?.handles)) { clearHandleHistory(); return null; }
    return { id: parsed.id, handles: parsed.handles.filter((h): h is string => typeof h === 'string') };
  } catch {
    clearHandleHistory();
    return null;
  }
}

import { storage } from '@/src/stores/mmkv-storage';

const KEY = 'reelhouse_pending_handle';

/** A request kept past its usefulness is litter. Thirty days is longer than any
 *  believable gap between asking for a handle and confirming an email. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type PendingHandle = { id: string; requested: string; at: number };

/**
 * #50 — signup can hand you a different name than the one you chose, and say nothing.
 * ────────────────────────────────────────────────────────────────────────────────────
 * Three mechanisms combine, and none of them tells the member anything:
 *
 *   1. the availability check is debounced 500ms and the submit gate blocks only on the
 *      settled 'taken' state — submitting inside that window sails through
 *   2. the signup trigger was DELIBERATELY rewritten never to fail; it appends a suffix
 *      instead. That was the right call — an account is always created — but it silently
 *      turned the client's "that handle is taken" branch into dead code
 *   3. signup then tries to set the chosen handle and DISCARDED the result. The unique
 *      index rejects it, the rejection vanishes, the app reads back the suffixed name
 *
 * You ask for `morpho`, you become `morpho_4f8a21`, and nothing ever says so.
 *
 * The tempting fix is to tighten the submit gate. That is wrong and would be worse:
 * gate on 'checking' and a member whose availability check never settles — offline, or
 * one transient error — can NEVER REGISTER AT ALL. The race is not the root problem.
 * The root problem is that the system has no way to say "we gave you a different name".
 *
 * ── WHY THIS STORES THE REQUEST AND NOT A FINISHED MESSAGE ──────────────────────────
 * There are TWO signup paths, and only one of them can compare anything at signup time:
 *
 *   • confirmation disabled — a session exists, the profile is readable immediately,
 *     the mismatch is visible on the spot
 *   • confirmation required — there is NO session. The trigger has already created the
 *     profile (possibly suffixed), but the app cannot read it, cannot correct it, and
 *     will not see the real handle until the member confirms and logs in, which may be
 *     days later on a cold start
 *
 * So this stores the thing that is known at signup — what they ASKED for, and who they
 * are — and the comparison happens the moment a real handle resolves, whichever path
 * got them there. One writer at signup, one reader at boot, no duplicated display logic
 * and no path left uncovered.
 *
 * Keyed by user id, never by device: a stale request can therefore never nag a
 * different member who signs in on the same phone.
 */
export function rememberRequestedHandle(id: string | null | undefined, requested: string | null | undefined): void {
  const uid = (id ?? '').trim();
  const want = (requested ?? '').trim();
  if (!uid || !want) return;
  try {
    storage.set(KEY, JSON.stringify({ id: uid, requested: want, at: Date.now() } satisfies PendingHandle));
  } catch { /* a courtesy is never worth crashing signup */ }
}

/** Reads without consuming. Returns null for absent, unparseable, or expired. */
export function readRequestedHandle(): PendingHandle | null {
  try {
    const raw = storage.getString(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingHandle>;
    if (typeof parsed?.id !== 'string' || typeof parsed?.requested !== 'string') { clearRequestedHandle(); return null; }
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > MAX_AGE_MS) { clearRequestedHandle(); return null; }
    return { id: parsed.id, requested: parsed.requested, at: parsed.at };
  } catch {
    clearRequestedHandle();
    return null;
  }
}

export function clearRequestedHandle(): void {
  try { storage.delete(KEY); } catch { /* nothing to do and nothing worth throwing over */ }
}

/**
 * Comparison is case-insensitive because the trigger normalises every handle to
 * lowercase; asking for `Morpho` and receiving `morpho` is not a different identity and
 * must not nag. That is the ordinary path, so getting it wrong would nag almost everyone.
 */
export function describeHandleOutcome(requested: string | null | undefined, actual: string | null | undefined): string | null {
  const want = (requested ?? '').trim();
  const got = (actual ?? '').trim();
  if (!want || !got) return null;
  if (want.toLowerCase() === got.toLowerCase()) return null;
  return `The handle @${want} was already claimed, so your account was created as @${got}. You can change it any time from Edit Profile.`;
}

/**
 * The single reader. Called whenever an identity resolves — signup, login, or a restored
 * session on a cold start.
 *
 * Returns a notice only if this member has an outstanding request AND the handle they
 * hold differs from it. Either way the request is consumed the moment a real handle is
 * known, so the member is told exactly once and the happy path leaves nothing behind.
 *
 * A user whose username has not loaded yet is NOT a match — consuming the request there
 * would silently discard the one chance to say anything.
 */
export function resolveHandleNotice(user: { id?: string | null; username?: string | null } | null | undefined): string | null {
  const pending = readRequestedHandle();
  if (!pending) return null;
  const uid = (user?.id ?? '').trim();
  const handle = (user?.username ?? '').trim();
  if (!uid || uid !== pending.id) return null;
  if (!handle) return null;
  clearRequestedHandle();
  return describeHandleOutcome(pending.requested, handle);
}

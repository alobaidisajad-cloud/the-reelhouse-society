import { INVISIBLE_CHAR_CLASS } from './sanitizeInput';

/**
 * The longest handle this will send to the database.
 *
 * Not a policy limit — `validateUsername` caps NEW handles at 30 and the database
 * enforces that. This is a payload bound, so a pathological string never reaches a
 * network call. The longest handle that exists live is 25 characters
 * (`saleelsaleel555@gmail.com`), so 64 is generous headroom in both directions.
 */
const MAX_HANDLE_LENGTH = 64;

/**
 * Whitespace and control characters. Neither can appear in any real handle.
 *
 * Written with escapes rather than literal characters on purpose: control characters
 * pasted into source are invisible in review, which is the whole reason they are worth
 * rejecting. `\s` covers space, tab, newline, and the exotic Unicode spaces.
 */
const WHITESPACE_OR_CONTROL = new RegExp('[' + '\\s' + '\\u0000-\\u001F' + '\\u007F' + ']');

/** Built fresh and non-global: `.test()` on a /g regex advances lastIndex. */
const INVISIBLE = new RegExp(`[${INVISIBLE_CHAR_CLASS}]`);

/**
 * Is this string safe to look a member up by?
 *
 * ── #67 · WHY THIS REPLACED AN ALLOWLIST, AND WHY THAT DISTINCTION IS THE FIX ────────
 * `resolveUsernameToProfile` used to gate on `^[a-zA-Z0-9_]{1,30}$`, described as
 * "defense-in-depth — fail fast on malformed input". The mechanism was right. The
 * charset was the app's *intended* signup policy, not what `profiles.username` can
 * actually hold — and the database holds five handles that policy rejects:
 *
 *     sajad.s.alobaidi · saleel.house · saleel.sjs
 *     saleelsaleel555@gmail.com · ug.mb          → 5 of 32 live members
 *
 * Their profiles load (that lookup has no such guard), the Follow button renders, and
 * tapping it fails with a generic error that retrying never fixes. 15.6% of the member
 * base could not be followed at all.
 *
 * Those handles are PERMANENT by an explicit decision: batch 9 added a database-level
 * charset backstop for new handles and deliberately grandfathered the existing five —
 * "They keep their names." Renaming members without asking is the harm that batch
 * exists to prevent, so the lookup is what has to change.
 *
 * ── WHY NOT SIMPLY A WIDER ALLOWLIST ────────────────────────────────────────────────
 * Because the defect IS an allowlist that did not match reality, and a wider one only
 * moves the day it happens again. This guard therefore names what is genuinely unsafe
 * to put in a lookup — nothing else — and lets the database be the authority on what a
 * handle may contain. It cannot lock out a member it did not anticipate.
 *
 * What it rejects, and why each one is real rather than decorative:
 *   • empty / whitespace-only — there is no such member; skip the round trip
 *   • longer than 64 — payload bound, see above
 *   • whitespace or control characters — impossible in a handle, and they are how a
 *     lookup value gets smuggled across a boundary
 *   • zero-width and bidi characters — two visually identical handles resolving to
 *     different members is the homograph problem the sanitiser exists for
 */
export function isLookupSafeHandle(username: string | null | undefined): boolean {
  if (typeof username !== 'string') return false;
  if (username.length === 0 || username.length > MAX_HANDLE_LENGTH) return false;
  if (username.trim().length === 0) return false;
  if (WHITESPACE_OR_CONTROL.test(username)) return false;
  if (INVISIBLE.test(username)) return false;
  return true;
}

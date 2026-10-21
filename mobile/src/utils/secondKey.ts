/**
 * secondKey — the admin's second key at the Tribunal's door (WORKLIST P0.94, decision 5).
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin powers act on other members' words and accounts, so the Tribunal asks for a
 * second factor: a code from an authenticator app (TOTP), on top of the password.
 *
 * Where the door stands, from the session and the account's factors:
 *   - held:      this session already gave the second key (aal2);
 *   - challenge: a key is registered and this session has not given it;
 *   - enrol:     no key is registered yet. A key left half-registered (an enrolment
 *                never confirmed) is removed first, so a new one can take its place.
 */

/** The assurance level supabase-js reads from the session (getAuthenticatorAssuranceLevel). */
export type Level = 'aal1' | 'aal2' | null;
/** One factor as supabase-js lists it (mfa.listFactors's `all`). */
export interface Factor { id: string; factor_type: string; status: 'verified' | 'unverified' }

export type Door =
  | { stage: 'held' }
  | { stage: 'challenge'; factorId: string }
  | { stage: 'enrol'; stale: string[] };

/** Where the Tribunal's door stands for this session. */
export function doorOf(level: Level, factors: readonly Factor[]): Door {
  if (level === 'aal2') return { stage: 'held' };
  const totp = factors.filter((f) => f.factor_type === 'totp');
  const key = totp.find((f) => f.status === 'verified');
  if (key) return { stage: 'challenge', factorId: key.id };
  return { stage: 'enrol', stale: totp.filter((f) => f.status === 'unverified').map((f) => f.id) };
}

/** The digits an authenticator shows. */
export const KEY_DIGITS = 6;

/** A code as typed or pasted, kept to its digits; whole only at six. */
export const digitsOf = (typed: string): string => typed.replace(/[^0-9]/g, '').slice(0, KEY_DIGITS);
export const isWhole = (code: string): boolean => code.length === KEY_DIGITS;

/** The secret as an authenticator asks for it typed by hand: in groups of four. */
export const groupedSecret = (secret: string): string => (secret.match(/.{1,4}/g) ?? []).join(' ');

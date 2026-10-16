/**
 * refusedForStanding — the server's own two sentences for a write it refuses for the member's
 * standing (enforce_not_restricted, SQLSTATE 42501), and which of them ends. It imports nothing:
 * the offline queue and the standing reader both ask it, and neither may load the other.
 */

const SILENCED = /^Your account has been silenced by The Society\.$/;
const SUSPENDED = /^Your account is suspended until .+\.$/;

const said = (message: unknown, sentence: RegExp) => typeof message === 'string' && sentence.test(message.trim());

/** Is this the server refusing a write for the member's standing? */
export function isStandingRefusal(message: unknown): boolean {
  return said(message, SILENCED) || said(message, SUSPENDED);
}

/** Is it a suspension's refusal, which ends, so the write waits rather than being given up? */
export function isSuspensionRefusal(message: unknown): boolean {
  return said(message, SUSPENDED);
}

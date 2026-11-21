/**
 * saidOfARefusal — the sentence for a write the house refused (SQLSTATE 42501), told by who refused it.
 *
 * 42501 is the owner's rule (a policy: who may certify, who may annotate) and the member's own
 * standing alike (enforce_not_restricted: silenced, suspended). One sentence for both blamed the
 * other member for the reader's own suspension, and a certification the owner's rule kept was "Failed
 * to certify" (review round 9). The standing's refusal is said in the house's own words.
 */
import { isRateLimited } from './housePace';
import { isForbiddenError, isNetworkError, isTransientError } from './networkError';
import { isStandingRefusal } from './refusedForStanding';

/** The house's words for a standing; `ownersRule` for another 42501; `otherwise` for the rest. */
export function saidOfARefusal(e: unknown, ownersRule: string, otherwise: string): string {
  const message = (e as { message?: unknown } | null)?.message;
  if (isStandingRefusal(message)) return String(message).trim();
  return isForbiddenError(e) ? ownersRule : otherwise;
}

/**
 * What a member is told of an act that failed, by why it failed: the house's own words for their
 * standing; `refused` for another refusal the house made on purpose (its rule, a pace); the
 * connection, and a way to try again, only when it was the network; and the act alone otherwise,
 * a fault of the house's that trying again would not mend. A catch that said every failure one way
 * told a refusal as a lost signal (review rounds 10, 11, 13): every catch that says a member's act
 * failed says it here (aRefusalIsNeverToldAsTheConnection).
 */
export function saidOfAFailure(e: unknown, act: string, refused = `${act} The house did not allow it.`): string {
  const words = (e as { message?: unknown } | null)?.message;
  if (isStandingRefusal(words)) return String(words).trim();
  if (isNetworkError(e) || isTransientError(e)) return `${act} Check your connection and try again.`;
  if (isForbiddenError(e) || isRateLimited(e)) return refused;
  return act;
}

/** A refusal the house made on purpose (a rule or a standing), not a defect to report. */
export function isRefusedOnPurpose(e: unknown): boolean {
  return isForbiddenError(e);
}

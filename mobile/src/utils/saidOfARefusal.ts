/**
 * saidOfARefusal — the sentence for a write the house refused (SQLSTATE 42501), told by who refused it.
 *
 * 42501 is the owner's rule (a policy: who may certify, who may annotate) and the member's own
 * standing alike (enforce_not_restricted: silenced, suspended). One sentence for both blamed the
 * other member for the reader's own suspension, and a certification the owner's rule kept was "Failed
 * to certify" (review round 9). The standing's refusal is said in the house's own words.
 */
import { isForbiddenError } from './networkError';
import { isStandingRefusal } from './refusedForStanding';

/** The house's words for a standing; `ownersRule` for another 42501; `otherwise` for the rest. */
export function saidOfARefusal(e: unknown, ownersRule: string, otherwise: string): string {
  const message = (e as { message?: unknown } | null)?.message;
  if (isStandingRefusal(message)) return String(message).trim();
  return isForbiddenError(e) ? ownersRule : otherwise;
}

/** A refusal the house made on purpose (a rule or a standing), not a defect to report. */
export function isRefusedOnPurpose(e: unknown): boolean {
  return isForbiddenError(e);
}

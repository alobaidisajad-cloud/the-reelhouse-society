/**
 * tierRefusal — the server already writes the sentence; stop throwing it away.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every tier gate in the database raises SQLSTATE 42501 with a sentence written
 * for a person to read:
 *
 *     ERROR: The Lounge is an Archivist feature
 *     ERROR: The Vault is an Archivist feature
 *     ERROR: The Physical Archive is an Archivist feature
 *     ERROR: The Dispatch is an Auteur feature
 *
 * `isForbiddenError` has always classified 42501 correctly. Nothing has ever
 * read the message. So a member who hits a server-side refusal — a lapsed
 * Archivist trying to post, most likely — gets whatever generic copy the
 * calling screen happens to have for "that did not save", and no way forward.
 *
 * ── WHY THIS IS NOT JUST `isForbiddenError` ─────────────────────────────────
 * Because 42501 is ALSO what a privacy refusal looks like. A member whose
 * settings say only mutuals may certify their filings refuses a stranger with
 * the same code. Showing that stranger "✦ ASCEND THE RANKS" would be a lie:
 * no rank would help, the answer is no from a person rather than from a price.
 *
 * So a tier refusal is recognised by the SENTENCE, not by the code, and
 * anything else keeps its generic handling. `gates:check` asserts that every
 * message a live trigger can raise appears in the table below — so a new gate
 * with new wording cannot silently fall through to "something went wrong".
 */
import { isForbiddenError } from '@/src/utils/networkError';
import type { Rank } from '@/src/constants/gatedFeatures';

export interface TierRefusal {
  /** The feature id in `gatedFeatures.ts`, for `useClearance`. */
  featureId: string;
  rank: Rank;
  /** The server's own sentence, unedited. */
  said: string;
}

/**
 * The sentences the database can raise, and which feature each one is about.
 *
 * Keyed on the message because that is what crosses the wire. One feature may
 * appear more than once — the Lounge refuses at four separate tables — and the
 * same sentence therefore maps to the id that best explains it to a member.
 */
const SENTENCES: { match: RegExp; featureId: string; rank: Rank }[] = [
  { match: /^The Lounge is an Archivist feature$/, featureId: 'the-lounge', rank: 'archivist' },
  { match: /^The Vault is an Archivist feature$/, featureId: 'the-vault', rank: 'archivist' },
  { match: /^The Physical Archive is an Archivist feature$/, featureId: 'physical-archive', rank: 'archivist' },
  { match: /^The Dispatch is an Auteur feature$/, featureId: 'essays', rank: 'auteur' },
];

/** Every sentence this app knows how to turn into a door. */
export const KNOWN_TIER_SENTENCES = SENTENCES.map((s) => s.match);

const messageOf = (e: unknown): string => {
  if (typeof e !== 'object' || e === null) return '';
  const m = 'message' in e ? (e as { message?: unknown }).message : undefined;
  return typeof m === 'string' ? m.trim() : '';
};

/**
 * Is this the server saying "you do not hold the rank", as opposed to any other
 * kind of refusal? Returns what it was about, or null.
 */
export function asTierRefusal(e: unknown): TierRefusal | null {
  // The code first: a matching sentence without 42501 would mean somebody's
  // free text happened to read like one of ours.
  if (!isForbiddenError(e)) return null;
  const said = messageOf(e);
  if (!said) return null;
  for (const s of SENTENCES) {
    if (s.match.test(said)) return { featureId: s.featureId, rank: s.rank, said };
  }
  // 42501, but not about a rank — a privacy rule, or a row that is not theirs.
  // No rank would fix it, so it must not be dressed as something a price can.
  return null;
}

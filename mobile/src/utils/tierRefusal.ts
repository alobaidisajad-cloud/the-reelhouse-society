/**
 * tierRefusal — the server's own sentence, recognised when it is about a rank.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every tier gate in the database raises SQLSTATE 42501 with a sentence written
 * for a person to read:
 *
 *     ERROR: The Lounge is an Archivist feature
 *     ERROR: The Vault is an Archivist feature
 *     ERROR: The Physical Archive is an Archivist feature
 *     ERROR: The Dispatch is an Auteur feature
 *
 * Recognised by the SENTENCE, not the code alone: 42501 is also a privacy
 * refusal (only mutuals may certify), where no rank would help and "✦ ASCEND
 * THE RANKS" would be a lie. Anything else keeps its caller's own handling.
 * `gates:check` asserts every sentence a live trigger can raise is in the table
 * below, so a new gate's wording cannot fall through to "something went wrong".
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
  { match: /^A private screening room is an Auteur feature$/, featureId: 'private-rooms', rank: 'auteur' },
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
  // 42501 about something no rank can fix: a privacy rule, or a row not theirs.
  return null;
}

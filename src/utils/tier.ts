/**
 * tier.ts — a member's rank, decided the way the app decides it.
 *
 * ── WHY THIS FILE HAD TO EXIST ──────────────────────────────────────────────
 * The web decided a rank with `log.userRole === 'auteur'`, and `userRole` was
 * fed from `profiles.role` alone. That is a name-equality check against ONE of
 * the three columns that carry a member's standing, and it is wrong in three
 * ways a member can actually experience:
 *
 *   · a paid entitlement rides the separate `tier` column, so a member whose
 *     `role` still says `cinephile` showed as UNRANKED;
 *   · `is_founding` is a FLAG, not a role, so the house's most senior members
 *     showed as unranked;
 *   · an admin who pays has `role = 'admin'`, so they showed as unranked too —
 *     the case mobile's own tier notes call out by name.
 *
 * All three were marked correctly on mobile and blank here. Not a styling
 * difference: the thing they paid for, missing, on a client with live users.
 *
 * ── IT IS A COPY, AND A TEST HOLDS IT TO THE ORIGINAL ───────────────────────
 * `mobile/src/utils/tier.ts` is the original. The two packages share no build,
 * so this is a deliberate second copy — and `rankAgreesWithMobile.test.ts`
 * reads BOTH files and fails if the weights, the ladder or the words drift
 * apart. A copy nobody checks is how the badge got four dresses.
 */

/** The ladder. Identical to mobile's `TIER_WEIGHTS`, including the two zeroes. */
export const TIER_WEIGHTS: Record<string, number> = {
  free: 0,
  cinephile: 0,
  archivist: 1,
  auteur: 2,
  founding: 3,
};

export type TierInput =
  | string
  | { tier?: string | null; role?: string | null; is_founding?: boolean | null }
  | null
  | undefined;

/** Anything unrecognised is no paid rank. Never throws, never guesses upward. */
export function normalizeTier(value?: string | null): string {
  if (!value || value === 'free') return 'cinephile';
  const t = value.toLowerCase();
  return t === 'archivist' || t === 'auteur' || t === 'founding' ? t : 'cinephile';
}

export function getTierWeight(value?: string | null): number {
  return TIER_WEIGHTS[normalizeTier(value)] ?? 0;
}

/**
 * The Highest Watermark Rule: a member holds the best of what their tier, their
 * role and the founding flag say. Zero downgrades.
 */
export function resolveTier(input?: TierInput): string {
  if (!input) return 'cinephile';
  if (typeof input === 'string') return normalizeTier(input);

  const tWeight = getTierWeight(input.tier);
  const effectiveRole = input.is_founding ? 'founding' : input.role;
  const rWeight = getTierWeight(effectiveRole);

  return tWeight >= rWeight ? normalizeTier(input.tier) : normalizeTier(effectiveRole);
}

export function isArchivistPlusTier(input?: TierInput): boolean {
  return getTierWeight(resolveTier(input)) >= TIER_WEIGHTS.archivist;
}

export function isAuteurPlusTier(input?: TierInput): boolean {
  return getTierWeight(resolveTier(input)) >= TIER_WEIGHTS.auteur;
}

export type Rank = 'auteur' | 'archivist' | null;

/** The rank a row should draw. `founding` reads as an Auteur, as it does on mobile. */
export function rankOf(input?: TierInput): Rank {
  if (isAuteurPlusTier(input)) return 'auteur';
  if (isArchivistPlusTier(input)) return 'archivist';
  return null;
}

/** What a screen reader says. Sentence case: a word, not a heading. */
export function rankWord(rank: Rank): string | null {
  return rank === 'auteur' ? 'Auteur' : rank === 'archivist' ? 'Archivist' : null;
}

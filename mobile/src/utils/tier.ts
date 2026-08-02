import { ReelHouseTier } from '@/src/lib/revenueCat';
// logger.warn console-logs in dev and forwards to Sentry in production
// (logger.ts:42-53). Neither logger nor sentry imports this file, so no cycle.
import { logger } from '@/src/utils/logger';

// Mathematical weight mapping for tiers
export const TIER_WEIGHTS: Record<ReelHouseTier | 'free', number> = {
  free: 0,
  cinephile: 0,
  archivist: 1,
  auteur: 2,
  founding: 3,
};

/**
 * Values that legitimately resolve to no paid tier and must NEVER warn.
 *
 * normalizeTier is fed BOTH `profiles.tier` and `profiles.role` — resolveTier
 * passes the role through getTierWeight — so the permission roles belong here too.
 * 'admin' scoring 0 is documented design, not a defect (src/schemas/user.ts:54-57:
 * "it is a duty, not a rank").
 */
const EXPECTED_NON_TIER_VALUES = new Set([
  'free',        // legacy spelling of "no subscription"
  'cinephile',   // the free tier itself
  'admin',       // permission flag, never a tier
  'venue_owner', // permission flag written by handle_new_user
]);

/**
 * Each distinct unrecognised value is reported ONCE per app session.
 *
 * normalizeTier has 124 call sites and many run on every render, so warning on
 * each call would bury the one signal that matters under thousands of duplicates.
 */
const reportedUnknownValues = new Set<string>();

/**
 * Normalizes a tier string, falling back to 'cinephile'
 *
 * ⚠️ The fallback is deliberately LOUD for values nobody expects.
 *
 * #48: this used to swallow anything it did not recognise. The admin's row held
 * `tier = 'projectionist'` — a tier that was removed from the product — and the app
 * quietly reported cinephile. Harmless there, because that account is meant to be
 * free. NOT harmless for a paying member: a renamed plan, a typo written by a
 * payment webhook, or a tier introduced before the client knows about it would drop
 * them to free with no error, no log, and no way to notice except a complaint.
 *
 * The return value is unchanged — this only adds telemetry, so it cannot alter
 * behaviour. logger.warn forwards to Sentry in production (logger.ts:42-53).
 */
export function normalizeTier(tierStr?: string | null): ReelHouseTier {
  if (!tierStr || tierStr === 'free') return 'cinephile';
  const t = tierStr.toLowerCase();
  if (t === 'archivist' || t === 'auteur' || t === 'founding') {
    return t as ReelHouseTier;
  }

  if (!EXPECTED_NON_TIER_VALUES.has(t) && !reportedUnknownValues.has(t)) {
    reportedUnknownValues.add(t);
    logger.warn(
      `[tier] Unrecognised value "${tierStr}" treated as cinephile. ` +
      `If this belongs to a paying member they have been silently downgraded to free.`
    );
  }

  return 'cinephile';
}

/** Test seam — lets a suite assert the once-per-session rule from a clean slate. */
export function __resetTierWarningsForTest(): void {
  reportedUnknownValues.clear();
}

/**
 * Gets the mathematical weight of a given tier
 */
export function getTierWeight(tierStr?: string | null): number {
  const tier = normalizeTier(tierStr);
  return TIER_WEIGHTS[tier] ?? 0;
}

export type TierInput = string | { tier?: string | null, role?: string | null, is_founding?: boolean | null } | null;

/**
 * Resolves the true tier of a user by mathematically comparing their local RevenueCat cache,
 * their database role, and the hidden is_founding flag.
 * Enforces the Highest Watermark Rule globally.
 */
export function resolveTier(input?: TierInput): ReelHouseTier {
  if (!input) return 'cinephile';
  if (typeof input === 'string') return normalizeTier(input);
  
  const tWeight = getTierWeight(input.tier);
  const effectiveRole = input.is_founding ? 'founding' : input.role;
  const rWeight = getTierWeight(effectiveRole);
  
  // Enforce Highest Watermark globally. Zero downgrades allowed.
  return tWeight >= rWeight ? normalizeTier(input.tier) : normalizeTier(effectiveRole);
}

/**
 * Checks if a user meets or exceeds the Archivist tier
 */
export function isArchivistPlusTier(input?: TierInput): boolean {
  return getTierWeight(resolveTier(input)) >= TIER_WEIGHTS['archivist'];
}

/**
 * Checks if a user meets or exceeds the Auteur tier
 */
export function isAuteurPlusTier(input?: TierInput): boolean {
  return getTierWeight(resolveTier(input)) >= TIER_WEIGHTS['auteur'];
}

/**
 * Helper to get the display string for a given tier
 */
export function getDisplayTier(tierStr?: string | null): string {
  const tier = normalizeTier(tierStr);
  switch (tier) {
    case 'founding': return 'AUTEUR';
    case 'auteur': return 'AUTEUR';
    case 'archivist': return 'ARCHIVIST';
    case 'cinephile':
    default: return 'CINEPHILE';
  }
}

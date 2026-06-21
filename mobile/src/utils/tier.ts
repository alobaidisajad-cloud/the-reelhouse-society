import { ReelHouseTier } from '@/src/lib/revenueCat';

// Mathematical weight mapping for tiers
export const TIER_WEIGHTS: Record<ReelHouseTier | 'free', number> = {
  free: 0,
  cinephile: 0,
  archivist: 1,
  auteur: 2,
  founding: 3,
};

/**
 * Normalizes a tier string, falling back to 'cinephile'
 */
export function normalizeTier(tierStr?: string | null): ReelHouseTier {
  if (!tierStr || tierStr === 'free') return 'cinephile';
  const t = tierStr.toLowerCase();
  if (t === 'archivist' || t === 'auteur' || t === 'founding') {
    return t as ReelHouseTier;
  }
  return 'cinephile';
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

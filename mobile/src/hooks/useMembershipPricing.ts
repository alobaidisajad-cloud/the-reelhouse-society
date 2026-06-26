import { useEffect, useState } from 'react';
import { getTierPricing, type TierPricing } from '@/src/lib/revenueCat';

/**
 * useMembershipPricing — live store prices for the membership UI (CONST-3).
 *
 * Fetches per-tier localized prices from RevenueCat once on mount. Returns `{}`
 * until resolved (and stays `{}` if RC isn't configured or the lookup fails),
 * so callers must fall back to the static copy in `constants/membership.ts`.
 * Self-contained (no query provider needed) so it's safe in any screen.
 */
export function useMembershipPricing(): Record<string, TierPricing> {
  const [pricing, setPricing] = useState<Record<string, TierPricing>>({});

  useEffect(() => {
    let active = true;
    getTierPricing()
      .then((p) => { if (active) setPricing(p); })
      .catch(() => { /* keep the static fallback */ });
    return () => { active = false; };
  }, []);

  return pricing;
}

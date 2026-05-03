/**
 * useEntitlement — Gate premium features with a single hook.
 *
 * Wraps RevenueCat's entitlement check + local user.role fallback.
 * If RevenueCat isn't configured, falls back to Supabase profile role.
 *
 * Usage:
 *   const { hasAccess, loading, tier } = useEntitlement('archivist');
 *   if (!hasAccess) return <PaywallPrompt />;
 *
 * Tier hierarchy: founding > auteur > archivist > cinephile
 * A user with 'auteur' has access to 'archivist' features.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/src/stores/auth';
import {
  checkEntitlements,
  purchasePackage,
  getOfferings,
  type ReelHouseTier,
  type EntitlementInfo,
} from '@/src/lib/revenueCat';

const TIER_HIERARCHY: Record<ReelHouseTier, number> = {
  cinephile: 0,
  archivist: 1,
  auteur: 2,
  founding: 3,
};

interface UseEntitlementReturn {
  /** Whether the user has access to this tier level or higher */
  hasAccess: boolean;
  /** Whether the entitlement check is still loading */
  loading: boolean;
  /** The user's current active tier */
  tier: ReelHouseTier;
  /** Full entitlement details */
  entitlement: EntitlementInfo | null;
  /** Trigger a purchase flow */
  purchase: () => Promise<void>;
}

export function useEntitlement(
  requiredTier: ReelHouseTier = 'archivist'
): UseEntitlementReturn {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [entitlement, setEntitlement] = useState<EntitlementInfo | null>(null);

  // Determine tier from either RevenueCat or Supabase profile
  const tier: ReelHouseTier = entitlement?.tier
    ?? ((user?.role as ReelHouseTier) || 'cinephile');

  const hasAccess = TIER_HIERARCHY[tier] >= TIER_HIERARCHY[requiredTier];

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const info = await checkEntitlements();
        if (!cancelled) setEntitlement(info);
      } catch {
        // Fall back to user.role from Supabase
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    check();
    return () => { cancelled = true; };
  }, [user?.id]);

  const purchase = useCallback(async () => {
    const packages = await getOfferings();
    if (packages.length > 0) {
      // Find the package matching the required tier
      const target = packages.find(
        (pkg: any) => pkg.identifier?.toLowerCase().includes(requiredTier)
      );
      if (target) {
        const result = await purchasePackage(target);
        if (result) setEntitlement(result);
      }
    }
  }, [requiredTier]);

  return { hasAccess, loading, tier, entitlement, purchase };
}

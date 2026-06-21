/**
 * useEntitlement — Gate premium features with a single hook.
 *
 * Wraps RevenueCat's entitlement check + local resolveTier(user) fallback.
 * If RevenueCat isn't configured, falls back to Supabase profile role.
 *
 * Usage:
 *   const { hasAccess, loading, tier } = useEntitlement('archivist');
 *   if (!hasAccess) return <PaywallPrompt />;
 *
 * Tier hierarchy: founding > auteur > archivist > cinephile
 * A user with 'auteur' has access to 'archivist' features.
 */
import {
    checkEntitlements,
    purchaseTier,
    type EntitlementInfo,
    type ReelHouseTier,
} from '@/src/lib/revenueCat';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import reelToast from '@/src/utils/reelToast';
import { getTierWeight, resolveTier } from '@/src/utils/tier';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseEntitlementReturn {
  /** Whether the user has access to this tier level or higher */
  hasAccess: boolean;
  /** Whether the entitlement check is still loading */
  loading: boolean;
  /** Whether a purchase is currently in progress */
  isPurchasing: boolean;
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
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [entitlement, setEntitlement] = useState<EntitlementInfo | null>(null);
  const purchaseMutex = useRef(false);

  // Offline Resilience: The Highest Watermark Algorithm
  // If RevenueCat fails (e.g. offline) it returns 'cinephile'. We compare its
  // mathematical weight against our cached local role/tier and take the highest.
  // Only trust local tier as a fallback DURING loading. Once RevenueCat
  // responds (entitlement !== null), its value is canonical. This prevents MMKV
  // edits from granting permanent premium access.
  const rcTier = entitlement?.tier || 'cinephile';
  const localTier = resolveTier(user);
  const tier: ReelHouseTier = entitlement
    ? rcTier  // RevenueCat responded — trust it as the source of truth
    : (getTierWeight(rcTier) >= getTierWeight(localTier) ? rcTier : localTier); // Still loading — use highest watermark

  const userScore = getTierWeight(tier);
  const requiredScore = getTierWeight(requiredTier);
  const hasAccess = loading ? false : userScore >= requiredScore;

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const info = await checkEntitlements();
        if (!cancelled) setEntitlement(info);
      } catch {
        // Fall back to resolveTier(user) from Supabase
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    check();
    return () => { cancelled = true; };
  }, [user?.id]);

  const purchase = useCallback(async () => {
    if (purchaseMutex.current) return;
    purchaseMutex.current = true;
    setIsPurchasing(true);
    try {
      const result = await purchaseTier(requiredTier);
      if (result?.isActive) {
        setEntitlement(result);
        useAuthStore.getState().setLocalTierHint({ tier: result.tier });
        reelToast.success(`Welcome to the ${result.tier.toUpperCase()} rank!`);
        
        // Global Unlock Polling Architecture
        (async () => {
          try {
            const userId = useAuthStore.getState().user?.id;
            for (let i = 0; i < 4; i++) {
              await new Promise(r => setTimeout(r, 2500));
              if (!userId) break;
              const { data } = await supabase.from('profiles').select('tier, role, is_founding').eq('id', userId).single();
              if (data && getTierWeight(resolveTier(data)) >= getTierWeight(result.tier)) {
                await supabase.auth.refreshSession();
                await useAuthStore.getState().restoreSession?.();
                break;
              }
            }
          } catch {
            // ignore background errors
          }
        })();
      }
    } catch (err) {
      const msg = err instanceof Error && err.message.includes('No package found')
        ? 'Subscriptions are being set up. Please try again shortly.'
        : 'Checkout unavailable. Please check your App Store account.';
      reelToast.error(msg);
    } finally {
      setIsPurchasing(false);
      purchaseMutex.current = false;
    }
  }, [requiredTier]);

  return { hasAccess, loading, isPurchasing, tier, entitlement, purchase };
}

/**
 * useClearance — may I, and if not, what do I say and where do I send them?
 * ─────────────────────────────────────────────────────────────────────────────
 * Seventeen gates across twelve files each answered this separately, and the
 * answers disagreed: two threw up a full-screen wall, two deleted the feature
 * from the interface, one showed a toast and stopped, five did it properly, and
 * the rest silently returned empty arrays.
 *
 * This is the one answer. It reads `gatedFeatures.ts`, which is the same file
 * the Society page sells from and the same file `gates:check` verifies against
 * production — so a gate cannot drift from the promise, and the promise cannot
 * drift from the trigger.
 *
 * ── THE MODAL-OVER-MODAL LAW ────────────────────────────────────────────────
 * `(modals)/membership` is presented as a modal, and so are the desks and the
 * log. Pushing straight from one to the other is the iOS trap the Concierge
 * already fixed once: park the destination, dismiss, then travel. `open()`
 * does that, so no caller has to remember it.
 */
import { useCallback, useMemo } from 'react';
import { router } from 'expo-router';

import { useAuthStore } from '@/src/stores/auth';
import { getTierWeight, resolveTier } from '@/src/utils/tier';
import { GATED_FEATURES, RANK_WEIGHT, type Rank } from '@/src/constants/gatedFeatures';
import type { Standing } from '@/src/components/clearance/Clearance';
import TactileEngine from '@/src/utils/TactileEngine';

export interface Clearance {
  /** True when the member holds the rank this feature needs. */
  held: boolean;
  /** The rank that opens it — for the rope's ink and its name. */
  rank: Rank;
  /** Never held it, or held it and stopped. The rope says different things. */
  standing: Standing;
  /**
   * Opens the Society page, told WHY the member came and WHERE to put them
   * back. Dismisses the current modal first — see the law above.
   */
  open: () => void;
}

/**
 * @param featureId an id from `GATED_FEATURES`. Not free text: a typo would
 *        otherwise produce a gate that silently opens for everybody.
 * @param returnTo where to send the member after they upgrade. Omit for "back
 *        to where they were".
 */
export function useClearance(featureId: string, returnTo?: string): Clearance {
  const user = useAuthStore((s) => s.user);

  const feature = useMemo(() => {
    const f = GATED_FEATURES.find((x) => x.id === featureId);
    if (!f && __DEV__) {
      // Loud in development, because the failure mode is a gate that opens for
      // everyone — which looks exactly like a feature that was never gated.
      throw new Error(
        `useClearance: no feature "${featureId}" in gatedFeatures.ts. `
        + `A gate with no registry row is a locked door with no sign on it.`,
      );
    }
    return f;
  }, [featureId]);

  const rank: Rank = feature?.rank ?? 'archivist';

  const held = useMemo(() => {
    if (!user) return false;
    return getTierWeight(resolveTier(user)) >= RANK_WEIGHT[rank];
  }, [user, rank]);

  /**
   * `entitlement_source` is written only by `grant_entitlement`. A member
   * carrying one who no longer has the weight for it once paid and stopped —
   * which is the whole difference between "come in" and "come back".
   */
  const standing: Standing = useMemo(() => {
    const src = (user as { entitlement_source?: string | null } | null)?.entitlement_source;
    return src ? 'lapsed' : 'stranger';
  }, [user]);

  const open = useCallback(() => {
    TactileEngine.selection();
    const params = new URLSearchParams({ reason: featureId, rank });
    if (returnTo) params.set('returnTo', returnTo);
    const href = `/membership?${params.toString()}`;

    // Park, dismiss, then travel. Pushing a modal over a modal strands the
    // member on iOS with nothing to dismiss.
    if (router.canGoBack()) {
      router.back();
      requestAnimationFrame(() => (router.push as (h: string) => void)(href));
    } else {
      (router.push as (h: string) => void)(href);
    }
  }, [featureId, rank, returnTo]);

  return { held, rank, standing, open };
}

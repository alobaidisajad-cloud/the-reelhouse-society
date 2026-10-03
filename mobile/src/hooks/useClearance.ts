/**
 * useClearance — may I, and if not, what do I say and where do I send them?
 * ─────────────────────────────────────────────────────────────────────────────
 * The one answer for every rank gate. It reads `gatedFeatures.ts`, the file the
 * Society page sells from and `gates:check` verifies against production, so a
 * gate cannot drift from the promise, nor the promise from the trigger.
 *
 * ── THE MODAL-OVER-MODAL LAW ────────────────────────────────────────────────
 * `(modals)/membership` is presented as a modal, and so are the desks and the
 * log. Pushing straight from one to the other is the iOS trap the Concierge
 * already fixed once: park the destination, dismiss, then travel. `open()`
 * does that — but ONLY from a presented screen. From a pushed one (a salon,
 * the archive) it travels directly, because dismissing there closed the very
 * room the member was trying to enter. `openSociety` makes that call.
 *
 * A rope inside a React Native <Modal> sheet is the one case this cannot see:
 * the sheet must close itself and call `open()` once it is gone.
 */
import { useCallback, useMemo } from 'react';

import { useAuthStore } from '@/src/stores/auth';
import { getTierWeight, resolveTier } from '@/src/utils/tier';
import { GATED_FEATURES, RANK_WEIGHT, type Rank } from '@/src/constants/gatedFeatures';
import type { Standing } from '@/src/components/clearance/Clearance';
import TactileEngine from '@/src/utils/TactileEngine';
import { recordGateEvent } from '@/src/utils/gateTelemetry';
import { openSociety, societyHref } from '@/src/utils/openSociety';

export interface Clearance {
  /** True when the member holds the rank this feature needs. */
  held: boolean;
  /** The rank that opens it — for the rope's ink and its name. */
  rank: Rank;
  /** Never held it, or held it and stopped. The rope says different things. */
  standing: Standing;
  /** Opens the Society page, told why they came and where to return them (the law above). */
  open: () => void;
}

/**
 * @param featureId an id from `GATED_FEATURES`. Not free text: a typo would
 *        otherwise produce a gate that silently opens for everybody.
 * @param returnTo where to send the member after they upgrade. Omit for "back
 *        to where they were".
 */
export function useClearance(featureId: string, returnTo?: string): Clearance {
  // Two primitives, never the user: this runs in every feed card. -1, signed out, opens nothing.
  const weight = useAuthStore((s) => (s.user ? getTierWeight(resolveTier(s.user)) : -1));
  const onceHeldARank = useAuthStore((s) => !!s.user?.entitlement_source);

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

  const held = weight >= RANK_WEIGHT[rank];

  // Only `grant_entitlement` writes `entitlement_source`: one without the weight is "come back".
  const standing: Standing = onceHeldARank ? 'lapsed' : 'stranger';

  const open = useCallback(() => {
    TactileEngine.selection();
    // Every rope in the app reports here, the one way through.
    recordGateEvent('gate_tapped', { featureId, rank, standing });
    // openSociety dismisses only a PRESENTED screen: a pushed one (a salon) stays behind the page.
    openSociety(societyHref(featureId, rank, returnTo));
  }, [featureId, rank, returnTo, standing]);

  return { held, rank, standing, open };
}

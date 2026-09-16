/**
 * tierDoor — turning the server's refusal into the door it was written to be.
 * ─────────────────────────────────────────────────────────────────────────────
 * `tierRefusal.ts` has always known how to read a tier refusal. It was called
 * by nothing. So a member whose rank had ended tapped send in a salon, the
 * database answered — in a sentence composed for a person to read —
 *
 *     The Lounge is an Archivist feature
 *
 * and the app showed them "Failed to send message." with a retry that could
 * never succeed. The sales copy was written by the server, carried across the
 * wire intact, and thrown away one line before it reached the screen.
 *
 * This is the missing line. One function, so there is one answer to "what does
 * a server refusal look like", the same way `useClearance` is one answer to
 * "may I".
 *
 * ── WHY A TOAST AND NOT A SCREEN ────────────────────────────────────────────
 * The member is mid-act — halfway through a sentence in a salon, or filing an
 * essay. Throwing a full-screen page over that would lose what they were doing
 * to tell them why they cannot finish it. `reelToast` already carries a
 * tappable action, so the refusal reads as the house answering them and the way
 * forward sits on the same line.
 *
 * ── WHY IT COUNTS ITSELF ────────────────────────────────────────────────────
 * A server refusal means the CLIENT let them try. Every one is a rope that
 * should have been in front of the act and was not — so `gate_refused` is
 * recorded here and nowhere else, and any nonzero count in `gate_metrics`
 * names the feature whose door is missing. That is how this class of bug gets
 * found next time without anybody reading all of it.
 */
import reelToast from '@/src/utils/reelToast';
import { openSociety, societyHref } from '@/src/utils/openSociety';
import { asTierRefusal } from '@/src/utils/tierRefusal';
import { recordGateEvent } from '@/src/utils/gateTelemetry';
import { useAuthStore } from '@/src/stores/auth';
import TactileEngine from '@/src/utils/TactileEngine';

/**
 * Did the server refuse this on rank, and if so, show the door.
 *
 * @returns true when it WAS a tier refusal and has been handled — so a caller
 *          writes `if (showTierDoor(e)) return;` above its own generic error
 *          copy, and a refusal never reads as "something went wrong".
 */
export function showTierDoor(e: unknown, opts?: { returnTo?: string }): boolean {
  const refusal = asTierRefusal(e);
  if (!refusal) return false;

  /**
   * Never held it, or held it and stopped. Read the same way `useClearance`
   * reads it — `entitlement_source` is written only by `grant_entitlement`, so
   * a member carrying one who no longer has the weight for it once paid.
   *
   * This is the whole reason the sentence matters: a lapsed Archivist in a
   * salon they have been talking in for months should be met with "your dues
   * have lapsed", not with a stranger's pitch.
   */
  const user = useAuthStore.getState().user as { entitlement_source?: string | null } | null;
  const standing: 'stranger' | 'lapsed' = user?.entitlement_source ? 'lapsed' : 'stranger';

  recordGateEvent('gate_refused', {
    featureId: refusal.featureId,
    rank: refusal.rank,
    standing,
  });

  // The server's own sentence, unedited. It was written for this.
  reelToast.error(refusal.said, {
    label: standing === 'lapsed' ? '✦ RESUME YOUR STANDING' : '✦ ASCEND THE RANKS',
    onPress: () => {
      TactileEngine.selection();
      recordGateEvent('gate_tapped', {
        featureId: refusal.featureId,
        rank: refusal.rank,
        standing,
      });
      // The same traveller the ropes use, so a refusal met inside the log or the
      // writing desk dismisses first, and one met in a salon does not close it.
      openSociety(societyHref(refusal.featureId, refusal.rank, opts?.returnTo));
    },
  });

  return true;
}

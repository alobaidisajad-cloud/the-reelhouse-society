/**
 * tierDoor — turning the server's refusal into the door it was written to be.
 * ─────────────────────────────────────────────────────────────────────────────
 * When the database refuses an act on rank, it says so in a sentence written for
 * a person ("The Lounge is an Archivist feature"). This shows that sentence, with
 * the way in on the same line: the one answer to "what does a refusal look like",
 * as `useClearance` is the one answer to "may I".
 *
 * A toast, not a screen: the member is mid-act, and a page over it would lose
 * what they were doing. And it counts itself (`gate_refused`, recorded here
 * alone): a refusal means a rope was missing in front of the act, so any count
 * in `gate_metrics` names the feature whose door to add.
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
export function showTierDoor(
  e: unknown,
  opts?: {
    returnTo?: string;
    /** A second sentence, true at the call site, said after the house's ("your words are kept"). */
    also?: string;
  },
): boolean {
  const refusal = asTierRefusal(e);
  if (!refusal) return false;

  // As useClearance reads it: a lapsed member hears "your dues have lapsed", not a pitch.
  const user = useAuthStore.getState().user as { entitlement_source?: string | null } | null;
  const standing: 'stranger' | 'lapsed' = user?.entitlement_source ? 'lapsed' : 'stranger';

  recordGateEvent('gate_refused', {
    featureId: refusal.featureId,
    rank: refusal.rank,
    standing,
  });

  // The server's own sentence, unedited, said as INFO: a rank refusal is a rope, not a failure.
  const message = opts?.also ? `${refusal.said}. ${opts.also}` : refusal.said;
  reelToast.info(message, {
    label: standing === 'lapsed' ? '✦ RESUME YOUR STANDING' : '✦ ASCEND THE RANKS',
    onPress: () => {
      TactileEngine.selection();
      recordGateEvent('gate_tapped', {
        featureId: refusal.featureId,
        rank: refusal.rank,
        standing,
      });
      // As the ropes travel: a presented desk is dismissed first, a pushed salon stays.
      openSociety(societyHref(refusal.featureId, refusal.rank, opts?.returnTo));
    },
  });

  return true;
}

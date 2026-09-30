/**
 * pushPrimer — the house asks to send word when word would mean something.
 * ─────────────────────────────────────────────────────────────────────────────
 * iOS grants ONE permission prompt per install, and a "no" given to a cold
 * prompt at first launch is almost never taken back. So the app never asks
 * cold. It asks, in its own voice, at a moment a member would want word:
 *
 *   'seat'      they have asked to be seated in a private salon — the door
 *               promises to let them in "the moment you're admitted"
 *   'critique'  they have filed a critique others may certify or answer
 *
 * Only a yes to the house's question spends the system's one prompt. It is
 * asked only while the system's answer is still undecided (a member who
 * allowed or refused has answered), and "Not now" is not asked again for two
 * weeks. Settings keeps its own button for anyone who wants it sooner.
 */
import { Alert } from 'react-native';
import { storage } from '../stores/mmkv-storage';
import { getPushPermissionState, registerForPushNotifications, requestPushPermission } from './pushNotifications';

export type WordMoment = 'seat' | 'critique';

export const PRIMER_ASKED_KEY = 'push_primer_asked_at';
/** Two weeks between asking, after a "Not now". */
export const PRIMER_WAIT_MS = 14 * 24 * 60 * 60 * 1000;

export const PRIMER_TITLE = 'Shall the house send word?';
export const PRIMER_BODY: Record<WordMoment, string> = {
  seat: 'The host may admit you at any hour. Allow notices and the house will tell you the moment they do.',
  critique: 'When a member certifies or answers your critique, the house can tell you — even with the app closed.',
};

/** Asks, if this is a moment to; resolves once the question is on screen or has been passed over. */
export async function offerWord(moment: WordMoment, userId: string, now: number = Date.now()): Promise<void> {
  if ((await getPushPermissionState()) !== 'undetermined') return;
  const last = Number(storage.getString(PRIMER_ASKED_KEY) ?? 0);
  if (last && now - last < PRIMER_WAIT_MS) return;
  storage.set(PRIMER_ASKED_KEY, String(now));
  Alert.alert(PRIMER_TITLE, PRIMER_BODY[moment], [
    { text: 'Not now', style: 'cancel' },
    {
      text: 'Send word',
      onPress: () => {
        void requestPushPermission().then((state) => {
          if (state === 'granted') void registerForPushNotifications(userId);
        });
      },
    },
  ]);
}

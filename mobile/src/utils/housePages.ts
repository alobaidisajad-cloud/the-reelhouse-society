/**
 * housePages — opening the house's own web pages, and writing to its desk.
 * ─────────────────────────────────────────────────────────────────────────────
 * The Terms, the Privacy Policy and the help page are the house's own pages on
 * thereelhousesociety.com. They open INSIDE the app, in the system's in-app
 * browser, dressed in the house's colours — a member reading the Terms has not
 * left the Society. If that browser cannot open, the address opens in the
 * member's own browser instead, so the link never does nothing.
 *
 * Writing to the desk opens the member's mail app with a letter already
 * addressed and the account details filled in. A phone with no mail app
 * (Mail deleted, no account set up) is told so, and offered the two things it
 * CAN do: copy the address, or read the help page. It is never left with a
 * button that silently does nothing.
 */
import { Alert, Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';

import { colors } from '@/src/theme/theme';
import { safeOpenURL } from '@/src/utils/linking';
import reelToast from '@/src/utils/reelToast';
import { SUPPORT_EMAIL, SUPPORT_URL, frontDeskLetter } from '@/src/constants/support';

/** Open one of the house's own pages, inside the app. */
export async function openHousePage(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, {
      controlsColor: colors.sepia,
      toolbarColor: colors.ink,
      dismissButtonStyle: 'close',
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    });
  } catch {
    await safeOpenURL(url);
  }
}

/** Put the desk's address on the clipboard, and say so. */
export async function copySupportAddress(): Promise<void> {
  try {
    await Clipboard.setStringAsync(SUPPORT_EMAIL);
    reelToast.success('Address copied.');
  } catch {
    reelToast.error(`Couldn't copy it. The address is ${SUPPORT_EMAIL}.`);
  }
}

/** "iOS 18.2" · "Android 15 (API 35)" — what the desk needs to know about the phone. */
export function devicePlatform(): string {
  if (Platform.OS === 'ios') return `iOS ${Platform.Version}`;
  if (Platform.OS === 'android') {
    const release = (Platform as unknown as { constants?: { Release?: string } }).constants?.Release;
    return release ? `Android ${release} (API ${Platform.Version})` : `Android (API ${Platform.Version})`;
  }
  return String(Platform.OS);
}

export type LetterOutcome = 'opened' | 'no-mail-app';

/**
 * Open a letter to the front desk.
 *
 * `openURL` is asked directly rather than guarded by `canOpenURL`: on iOS the
 * latter needs `mailto` declared in LSApplicationQueriesSchemes and answers
 * false without it — which would send every member to the fallback even with
 * Mail installed. `openURL` itself rejects when nothing can take the letter,
 * which is the one case the fallback is for.
 */
export async function writeToFrontDesk(memberId: string | null): Promise<LetterOutcome> {
  const letter = frontDeskLetter({
    appVersion: Constants.expoConfig?.version ?? '',
    platform: devicePlatform(),
    memberId,
  });
  try {
    await Linking.openURL(letter);
    return 'opened';
  } catch {
    Alert.alert(
      'No mail app on this phone',
      `Write to us from any email address at ${SUPPORT_EMAIL}.`,
      [
        { text: 'Copy address', onPress: () => { void copySupportAddress(); } },
        { text: 'Help & answers', onPress: () => { void openHousePage(SUPPORT_URL); } },
        { text: 'Close', style: 'cancel' },
      ],
    );
    return 'no-mail-app';
  }
}

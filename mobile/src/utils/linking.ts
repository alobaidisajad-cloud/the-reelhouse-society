import { Linking, Alert } from 'react-native';
import { logger } from './logger';
import { isSafeDeepLinkUrl } from '@/src/constants/deepLinks';

/**
 * Safely opens a URL, catching potential Unhandled Promise Rejections
 * that occur if the device lacks an application to handle the scheme.
 *
 * The URL is first validated against the scheme allowlist (https / http /
 * reelhouse) so injection vectors like javascript:, data:, intent:, tel: and
 * sms: are rejected before ever reaching the OS — this is the single
 * choke-point every externally-sourced link must pass through.
 *
 * @param url The URL to open (e.g., 'https://...', 'reelhouse://...')
 * @param fallbackMessage Optional custom alert message if the link fails.
 */
export async function safeOpenURL(url: string, fallbackMessage?: string): Promise<boolean> {
  if (!isSafeDeepLinkUrl(url)) {
    logger.warn('Refused to open URL with disallowed scheme', { url });
    Alert.alert(
      'Link Unavailable',
      fallbackMessage || 'This link uses an unsupported or unsafe address and cannot be opened.',
      [{ text: 'OK' }]
    );
    return false;
  }
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      return true;
    } else {
      logger.warn(`Device cannot open URL: ${url}`);
      Alert.alert(
        'Link Unavailable',
        fallbackMessage || 'Your device does not have an app installed that can open this link.',
        [{ text: 'OK' }]
      );
      return false;
    }
  } catch (error) {
    logger.error('Failed to open URL', { url, error });
    Alert.alert(
      'Error',
      'An unexpected error occurred while trying to open this link.',
      [{ text: 'OK' }]
    );
    return false;
  }
}

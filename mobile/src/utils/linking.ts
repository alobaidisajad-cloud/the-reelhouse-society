import { Linking, Alert } from 'react-native';
import { logger } from './logger';

/**
 * Safely opens a URL, catching potential Unhandled Promise Rejections
 * that occur if the device lacks an application to handle the scheme.
 * 
 * @param url The URL to open (e.g., 'https://...', 'mailto:...', 'app-scheme://...')
 * @param fallbackMessage Optional custom alert message if the link fails.
 */
export async function safeOpenURL(url: string, fallbackMessage?: string): Promise<boolean> {
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

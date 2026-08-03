import { Linking, Alert } from 'react-native';
import { logger } from './logger';
import { isSafeDeepLinkUrl } from '@/src/constants/deepLinks';

/**
 * Resolve a member-entered social link to the URL that will actually be opened,
 * or null if that URL would not survive the scheme allowlist.
 *
 * ── WHY NORMALISE BEFORE VALIDATING ──────────────────────────────────────────
 * Social links are stored as members type them, which is usually a BARE DOMAIN —
 * "instagram.com/name", not "https://instagram.com/name". The opener has always
 * prefixed `https://` when the value does not start with `http`, so validating the
 * raw stored string would reject the ordinary case and strip everyone's links.
 *
 * That prefix is also why this was never exploitable: a stored `javascript:alert(1)`
 * does not start with "http", so it becomes `https://javascript:alert(1)` — an https
 * URL to a nonsense host, which does nothing. Only an `http…`-prefixed value passes
 * through unchanged, and those are protocol-checked. This function therefore closes a
 * data-hygiene gap, not a live vulnerability, and the comment says so rather than
 * inflating it.
 *
 * Exported so the OPENER and the WRITE-TIME validator share one rule and cannot drift
 * — the failure mode where a value is accepted on save and rejected on tap, or worse,
 * the reverse.
 */
export function normalizeSocialUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const candidate = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  return isSafeDeepLinkUrl(candidate) ? candidate : null;
}

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

/**
 * deepLinks.ts — Deep Link Validation (T1-04 HARDENING)
 * ─────────────────────────────────────────────────────────
 * Allowlist of valid screen names for push notification deep links.
 * Prevents arbitrary route injection from malicious/malformed payloads.
 *
 * When adding a new deep-linkable screen, add it here first.
 */

const VALID_DEEP_LINK_SCREENS = [
  'film',
  'user',
  'lounge',
  'notifications',
  'log',
  'search',
  'list-modal',
  'membership',
  'vault',
  'oracle',
  'social',
  // Added missing routable screens to prevent
  // push notification deep links from being silently rejected.
  'dispatch',
  'reels',
  'darkroom',
  'dossier',
  'stacks',
  'person',
  'film-reviews',
  'tribunal',
  'year-in-cinema',
  'settings',
] as const;

export type ValidDeepLinkScreen = typeof VALID_DEEP_LINK_SCREENS[number];

/**
 * Type guard: Returns true only if the screen name is in the allowlist.
 * Use before `nav.push()` on any externally-sourced deep link.
 */
export function isValidDeepLink(screen: unknown): screen is ValidDeepLinkScreen {
  return typeof screen === 'string' &&
    (VALID_DEEP_LINK_SCREENS as readonly string[]).includes(screen);
}

/**
 * URL scheme allowlist for push notification URLs.
 * Blocks `tel:`, `sms:`, `intent:`, `market:` and other injection vectors.
 */
const ALLOWED_URL_SCHEMES = ['https:', 'http:', 'reelhouse:'] as const;

/**
 * Validates that a URL uses an allowed scheme before passing to Linking.openURL().
 * Returns false for `tel:`, `sms:`, `intent:`, `javascript:`, etc.
 */
export function isSafeDeepLinkUrl(url: unknown): boolean {
  if (typeof url !== 'string' || url.length === 0) return false;
  try {
    const parsed = new URL(url);
    return (ALLOWED_URL_SCHEMES as readonly string[]).includes(parsed.protocol);
  } catch {
    return false;
  }
}

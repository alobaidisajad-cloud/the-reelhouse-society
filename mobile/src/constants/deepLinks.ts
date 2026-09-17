/**
 * deepLinks.ts — Deep Link Validation (T1-04 HARDENING)
 * ─────────────────────────────────────────────────────────
 * URL scheme allowlist for anything the app opens from outside itself.
 *
 * There used to be a second allowlist here, of screen NAMES a push could open
 * with `data.screen`. Nothing ever sent one — notify-push sends the notice's id
 * (see openNoticeFromPush) — and the list could not have worked if something
 * had: it pushed `/${screen}` with its params beside the path, so `film` went
 * to `/film` (no such route; the route is `/film/[id]`), and `vault` named a
 * screen that no longer exists. A tap is now opened by the notice it announces.
 */

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

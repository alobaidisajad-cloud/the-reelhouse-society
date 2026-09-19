/**
 * support.ts — the front desk's address, said once.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every place in the app that tells a member where to write reads from here.
 * The old address (support@reelhouse.app) was printed in three places and
 * reached nobody: the domain had no mail records at all. One constant, and a
 * guard (`theFrontDeskHasOneAddress`) that fails if the address is typed
 * anywhere else, so it cannot happen twice.
 *
 * Mail to this address is routed by Cloudflare Email Routing to the Society's
 * own inbox; replies go out as this address through Resend (2026-09-19).
 */
export const SUPPORT_EMAIL = 'support@thereelhousesociety.com';

/** The help page — the same one the App Store and Google Play list as the Support URL. */
export const SUPPORT_URL = 'https://www.thereelhousesociety.com/support';

/**
 * The house's two legal pages. Settings and the Society page both open these —
 * from here, so the two can never point at different addresses.
 */
export const TERMS_URL = 'https://www.thereelhousesociety.com/terms';
export const PRIVACY_URL = 'https://www.thereelhousesociety.com/privacy';

export interface LetterContext {
  /** The app's version, e.g. "1.4.0". */
  appVersion: string;
  /** "iOS 18.2", "Android 15". */
  platform: string;
  /**
   * The member's internal id — enough for the desk to find the account, and
   * nothing else. Never the email address, never anything they have written.
   */
  memberId: string | null;
}

/** The line the desk looks for. Everything under it is for finding the account. */
export const LETTER_RULE = '— Please keep the lines below. They help us find your account. —';

/**
 * A letter to the front desk, as a mailto: address. Written out so the member
 * only has to say what is wrong; the desk already knows which app, which phone
 * and which account without asking.
 */
export function frontDeskLetter(ctx: LetterContext): string {
  const subject = 'A letter to the front desk';
  const body = [
    '',
    '',
    '',
    LETTER_RULE,
    `App: The ReelHouse Society ${ctx.appVersion || 'unknown version'}`,
    `Device: ${ctx.platform}`,
    `Member: ${ctx.memberId ?? 'not signed in'}`,
  ].join('\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

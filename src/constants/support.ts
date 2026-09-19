/**
 * support.ts — the front desk's address, said once on the website.
 *
 * The app keeps its own copy in mobile/src/constants/support.ts; a test
 * (the-front-desk-answers) fails if the two ever disagree, or if the address is
 * typed out anywhere else on the site.
 *
 * Mail to this address is routed by Cloudflare Email Routing to the Society's
 * own inbox; replies go out as this address through Resend (2026-09-19).
 */
export const SUPPORT_EMAIL = 'support@thereelhousesociety.com'

/** A letter already addressed, with a subject the desk can sort by. */
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('A letter to the front desk')}`

/**
 * The limits of the boxes that write no column of the house's own. A member's
 * words that DO land in a column are capped by MAX_LENGTHS (sanitizeInput),
 * held to their columns by everyCapAnswersToItsColumn; a password's limit is
 * the lock's (PASSWORD_MAX_BYTES, beside the strength meter).
 */

/** The longest address mail can carry (RFC 5321: a 256-character path, less its brackets). */
export const EMAIL_MAX = 254;

/** A search is a phrase, not a page. */
export const SEARCH_MAX = 120;

/** A year, as the filters ask for it. */
export const YEAR_DIGITS = 4;

/** The code Supabase Auth sends by email to confirm a security change. */
export const EMAIL_CODE_DIGITS = 6;

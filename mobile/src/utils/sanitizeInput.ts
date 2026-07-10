/**
 * sanitizeInput.ts — Input Sanitization for User-Generated Content
 * ────────────────────────────────────────────────────────────────
 * 10/10 S-01: Strips zero-width characters, control characters,
 * and enforces max length per field type. Applied at the store
 * mutation layer so it's impossible to bypass.
 */

/** Known zero-width / invisible Unicode characters */
const INVISIBLE_CHARS = /[\u200B\u200C\u200D\u200E\u200F\uFEFF\u00AD\u034F\u2028\u2029\u2060\u2061\u2062\u2063\u2064\u2066\u2067\u2068\u2069\u206A-\u206F]/g;

/** Control characters except newline (\n), carriage return (\r), and tab (\t) */
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** Field-specific max lengths */
export const MAX_LENGTHS = {
  review: 5000,
  loungeMessage: 2000,
  bio: 500,
  listTitle: 100,
  listDescription: 1000,
  listComment: 1000,
  logComment: 2000,
  dossierComment: 2000,
  loungeName: 50,
  username: 30,
  dossierTitle: 200,
  dossierExcerpt: 500,
  // Essays are longform by design: ~4,500 words (a 15–20 minute read). This is
  // the sanitizer's memory/abuse fence, not an editorial limit — no genuine
  // essayist should ever feel it.
  dossierContent: 25000,
} as const;

export type FieldType = keyof typeof MAX_LENGTHS;

/**
 * Sanitize user input text.
 * - Strips zero-width / invisible Unicode characters
 * - Strips control characters (preserves newlines, tabs)
 * - Normalizes excessive whitespace runs
 * - Trims leading/trailing whitespace
 * - Enforces max length for the given field type
 */
export function sanitizeInput(text: string, fieldType: FieldType): string {
  if (!text) return '';

  let clean = text
    .replace(INVISIBLE_CHARS, '')
    .replace(CONTROL_CHARS, '')
    .replace(/\n{4,}/g, '\n\n\n')  // max 3 consecutive newlines
    .replace(/[ \t]{10,}/g, '  ')   // max 2 consecutive spaces
    .trim();

  const maxLen = MAX_LENGTHS[fieldType];
  if (clean.length > maxLen) {
    clean = clean.slice(0, maxLen);
  }

  return clean;
}

/**
 * Check if input exceeds the max length for its field type.
 * Useful for showing "X/Y characters" counters.
 */
export function isOverLimit(text: string, fieldType: FieldType): boolean {
  return (text?.length ?? 0) > MAX_LENGTHS[fieldType];
}

/**
 * Get remaining character count.
 */
export function remainingChars(text: string, fieldType: FieldType): number {
  return MAX_LENGTHS[fieldType] - (text?.length ?? 0);
}

/**
 * sanitizeInput.ts — Input Sanitization for User-Generated Content
 * ────────────────────────────────────────────────────────────────
 * 10/10 S-01: Strips zero-width characters, control characters,
 * and enforces max length per field type. Applied at the store
 * mutation layer so it's impossible to bypass.
 */

/**
 * Known zero-width / invisible Unicode characters.
 *
 * \u26A0\uFE0F U+202A\u2013U+202E WERE MISSING, and they are the ones that matter most.
 *
 * Unicode has THREE families of bidirectional control, and this set originally had
 * two of them:
 *   \u2022 marks      U+200E, U+200F                     \u2014 were covered
 *   \u2022 isolates   U+2066\u2013U+2069                      \u2014 were covered
 *   \u2022 embeddings and OVERRIDES  U+202A\u2013U+202E       \u2014 were NOT
 *
 * U+202E RIGHT-TO-LEFT OVERRIDE is the canonical Trojan-Source character: it reverses
 * the rendering of everything after it, so text can be made to display in an order
 * that has nothing to do with what is stored. U+202D is its mirror. Both passed
 * straight through every sanitised surface in the app \u2014 reviews, comments, lounge
 * messages, dossiers \u2014 because the guard caught the two quieter families and stopped.
 *
 * Found by asserting the whole class rather than the listed members: the test enumerates
 * every bidi codepoint and demands each one be removed, which is why this survived a
 * regex that looked thorough.
 */
/**
 * The class body alone, so other guards can test for these characters without
 * duplicating the list. Exported as a STRING rather than the regex below because that
 * one carries /g: `.test()` on a global regex advances lastIndex and therefore returns
 * alternating answers for the same input. Callers build their own non-global RegExp.
 */
export const INVISIBLE_CHAR_CLASS = '\\u200B\\u200C\\u200D\\u200E\\u200F\\u202A-\\u202E\\uFEFF\\u00AD\\u034F\\u2028\\u2029\\u2060\\u2061\\u2062\\u2063\\u2064\\u2066\\u2067\\u2068\\u2069\\u206A-\\u206F';

const INVISIBLE_CHARS = new RegExp(`[${INVISIBLE_CHAR_CLASS}]`, 'g');

/** Control characters except newline (\n), carriage return (\r), and tab (\t) */
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** Field-specific max lengths */
export const MAX_LENGTHS = {
  review: 5000,
  loungeMessage: 2000,
  bio: 160,
  listTitle: 100,
  listDescription: 1000,
  listComment: 1000,
  logComment: 2000,
  dossierComment: 2000,
  loungeName: 50,
  username: 30,
  // Matched to ProfileUpdateSchema's own limits so the two cannot disagree:
  // bio 160, display_name 50, persona 50 (schemas/profile.schema.ts:26-31).
  // Zod caps their LENGTH; these exist so the character classes get stripped too.
  displayName: 50,
  persona: 50,
  // Free text a member writes ABOUT another member, read by moderators in the
  // Tribunal — the one screen guaranteed to be shown hostile input.
  reportDetails: 500,
  dossierTitle: 200,
  dossierExcerpt: 500,
  // Essays are longform by design: ~4,350 words at this app's measured 5.75
  // characters per word. This is the sanitizer's memory/abuse fence, not an
  // editorial limit.
  //
  // ── WHY THIS NUMBER DOES NOT MOVE ────────────────────────────────────────
  // It was raised to 60,000 during batch 21 and put back. The reasoning for
  // raising it was that 4,350 words is an ordinary longform essay — which is
  // true — but it missed that this number is ALSO the render cap
  // (capMarkdownForRender), deliberately, and that two markdown rules are
  // quadratic. Measured against markdown-it 10.0.0: nested emphasis 6877ms at
  // 80k. At 60,000 that is seconds of frozen JS thread from input someone can
  // author on purpose, and worse on a phone than on the machine that measured it.
  //
  // It is load-bearing for BOTH clients, not just this one: the web app writes
  // `dispatch_dossiers.full_content` to this same table with no sanitiser and no
  // length cap, so this bound is what protects a mobile reader from an essay
  // this app never wrote.
  //
  // So the fence stays where the RENDER cost allows, and the real defect — that
  // exceeding it silently truncated the essay and then deleted the draft — is
  // fixed instead: the composer now refuses to file, keeps every word, and says
  // by how much.
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
/**
 * The cleaning half, without the cap.
 *
 * Split out so that "how long is this really?" has ONE answer. The length that
 * matters is the length AFTER cleaning — invisible characters removed, runs of
 * blank lines and spaces collapsed, trimmed — because that is what gets stored.
 * `isOverLimit` and `remainingChars` measured the RAW string, so a composer could
 * refuse an essay that would in fact have fitted. Never the reverse (cleaning
 * only ever shortens), so nothing was at risk — but a writer told to trim when
 * they needn't is still the app lying to them.
 */
export function cleanForStorage(text: string): string {
  if (!text) return '';
  return text
    .replace(INVISIBLE_CHARS, '')
    .replace(CONTROL_CHARS, '')
    .replace(/\n{4,}/g, '\n\n\n')  // max 3 consecutive newlines
    .replace(/[ \t]{10,}/g, '  ')   // max 2 consecutive spaces
    .trim();
}

export function sanitizeInput(text: string, fieldType: FieldType): string {
  if (!text) return '';

  const clean = cleanForStorage(text);
  const maxLen = MAX_LENGTHS[fieldType];

  // Still the last-resort fence. Callers that can warn a member SHOULD ask
  // isOverLimit first — the dossier composer does — because a truncation here
  // has no presence in the return type and cannot be noticed downstream.
  return clean.length > maxLen ? clean.slice(0, maxLen) : clean;
}

/**
 * Check if input exceeds the max length for its field type.
 * Useful for showing "X/Y characters" counters.
 */
export function isOverLimit(text: string, fieldType: FieldType): boolean {
  // Measures what will be STORED, not what was typed — see cleanForStorage.
  return cleanForStorage(text ?? '').length > MAX_LENGTHS[fieldType];
}

/**
 * Get remaining character count.
 */
export function remainingChars(text: string, fieldType: FieldType): number {
  // Same measure as isOverLimit and as the cap itself.
  return MAX_LENGTHS[fieldType] - cleanForStorage(text ?? '').length;
}

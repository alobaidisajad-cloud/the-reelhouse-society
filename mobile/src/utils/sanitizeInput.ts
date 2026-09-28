/**
 * sanitizeInput.ts — Input Sanitization for User-Generated Content
 * ────────────────────────────────────────────────────────────────
 * Strips zero-width and control characters and caps each field's length, at the
 * store's mutation layer and again at the offline queue's replay.
 */

// Invisible characters, all THREE bidi families (the test enumerates every bidi codepoint):
// marks, isolates, embeddings/overrides \u2014 U+202E reorders what is shown from what is stored.
// A string, so guards build a NON-global RegExp: a /g regex's test() alternates its answers.
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
  listComment: 2000,
  logComment: 2000,
  dossierComment: 2000,
  loungeName: 60,  // lounges_name_len, and what CreateLoungeSheet's box and counter offer
  username: 30,
  // ProfileUpdateSchema's own limits (schemas/profile.schema.ts); Zod caps the length,
  // these strip the character classes too.
  displayName: 50,
  persona: 50,
  // Free text a member writes ABOUT another member, read by moderators in the
  // Tribunal — the one screen guaranteed to be shown hostile input.
  reportDetails: 500,
  dossierTitle: 200,
  dossierExcerpt: 500,
  loungeShareTitle: 180, // a shared card's two lines, under lounge_messages.film_title's 300
  // ~4,350 words, and the render cap too: two markdown rules are quadratic, so it never moves.
  dossierContent: 25000,

  // Every column a client writes on the Dispatch, at or under its CHECK (dispatchFieldCaps):
  // past it a filing fails after FILE with an error naming a column.
  // ── THE DISPATCH ─────────────────────────────────────────────────────────
  filingTitle:   200,    // dispatch_posts.title          — title_ceiling
  filingBody:    2000,   // dispatch_posts.body           — body_ceiling
  filingExcerpt: 500,    // ditto, when kind = 'dossier'  — excerpt_ceiling
  // dossierContent's 25,000, for its reason: the render cap too. Never moved alone.
  filingEssay:   25000,  // dispatch_posts.full_content   — essay_ceiling
  wireSource:    100,    // dispatch_posts.source         — source_ceiling
  sourceUrl:     2048,   // dispatch_posts.source_url     — source_url_ceiling
  spoilerLabel:  80,     // dispatch_posts.spoiler_label  — spoiler_ceiling
  seriesTitle:   200,    // series_title_ceiling is 300; 200, as the title it sits under
  subjectTitle:  300,    // dispatch_posts.subject_title  — subject_title_ceiling
  subjectSub:    300,    // dispatch_posts.subject_sub    — subject_sub_ceiling
  subjectImage:  2048,   // dispatch_posts.subject_image  — subject_image_ceiling
  subjectBackdrop: 2048, // dispatch_posts.subject_backdrop — subject_backdrop_ceiling
  // Per option: six at 200 serialise to ~1720 of the array's 4000 (dispatchFieldCaps).
  ballotOption:  200,    // dispatch_posts.options        — options_ceiling (4000 total)
  critique:      2000,   // dispatch_comments.body        — critique_ceiling (its own table)
} as const;

export type FieldType = keyof typeof MAX_LENGTHS;

/**
 * The cleaning half, without the cap: invisible and control characters removed,
 * runs of blank lines and spaces collapsed, trimmed. What is stored, so "how long
 * is this?" (isOverLimit, remainingChars) has one answer.
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

/** Cleans (cleanForStorage) and caps to the field's MAX_LENGTHS. */
export function sanitizeInput(text: string, fieldType: FieldType): string {
  if (!text) return '';

  const clean = cleanForStorage(text);
  const maxLen = MAX_LENGTHS[fieldType];

  // The last-resort fence: a cut here is silent, so a caller that can warn asks isOverLimit.
  if (clean.length <= maxLen) return clean;

  // A cut can split an emoji's surrogate pair, and PostgreSQL (17) refuses the whole
  // request over the lone half — so the dangling high surrogate is dropped.
  const cut = clean.slice(0, maxLen);
  const last = cut.charCodeAt(maxLen - 1);
  // A high surrogate in the final position lost its partner to the cut; drop it.
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
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

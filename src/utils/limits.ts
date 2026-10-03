/**
 * limits.ts — how long a member's writing is allowed to be, on the web.
 * ─────────────────────────────────────────────────────────────────────
 * These mirror MAX_LENGTHS in the mobile app (mobile/src/utils/sanitizeInput.ts),
 * and the-two-apps-keep-one-limit.test holds each shared number equal to it.
 * Both clients write to ONE database, so a number that exists in only one of
 * them is not a limit — it is a suggestion the other app ignores.
 *
 * The database now enforces its own ceiling on these same columns. That ceiling
 * is set at or above whichever client allows more, so nothing typed here can be
 * refused. These values exist so a member is told "that's too long" while they
 * are still writing, instead of losing the text to an error afterwards.
 *
 * ⚠️ Raising any number here without raising the database ceiling will start
 * rejecting writes. The ceiling lives in
 * mobile/supabase/migrations/20260809_04_text_length_ceilings.sql.
 */
export const LIMITS = {
  /** A critique on someone's log. */
  logComment: 2000,
  /** A comment on a stack. */
  listComment: 2000,
  /** A critique on a dossier. */
  dossierComment: 2000,
  /** A message in a lounge. */
  loungeMessage: 2000,
  /** Free text attached to a report — read by moderators. */
  reportDetails: 500,
  /** A film review. */
  review: 5000,
  /** A stack's name and blurb. */
  listTitle: 100,
  listDescription: 1000,
  /** A dossier: headline, blurb, and the essay itself. */
  dossierTitle: 200,
  dossierExcerpt: 500,
  /**
   * The essay. This is a rendering limit as much as a storage one: two markdown
   * rules are quadratic, so a long enough essay freezes the reading device for
   * seconds. Measured in the mobile app, which renders the same text.
   */
  dossierContent: 25000,
  /** A lounge's name and blurb. */
  loungeName: 60,
  loungeDescription: 300,
  /** A log's other words: the Vault note, the pull quote, who it was watched with. */
  privateNotes: 1000,
  pullQuote: 120,
  watchedWith: 60,
  /** Profile fields. The box said 30 for a name the app, the form and the column all take at 50. */
  bio: 160,
  displayName: 50,
  username: 30,
  linkTitle: 40,
  linkUrl: 300,
  /** A shelf entry's notes. */
  physicalNotes: 2000,
} as const;

export type LimitField = keyof typeof LIMITS;

/** The code Supabase Auth sends by email to confirm a security change (as the app's inputLimits). */
export const EMAIL_CODE_DIGITS = 6;

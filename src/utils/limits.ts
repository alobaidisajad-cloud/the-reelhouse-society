/**
 * limits.ts — how long a member's writing is allowed to be, on the web.
 * ─────────────────────────────────────────────────────────────────────
 * These mirror MAX_LENGTHS in the mobile app (mobile/src/utils/sanitizeInput.ts).
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
  /**
   * A lounge's name and blurb.
   *
   * ⚠️ `loungeName` is 60 here and 50 in the mobile app — a real disagreement,
   * not an oversight. The database ceiling is set to 60, the MORE GENEROUS of
   * the two, because a ceiling at 50 would reject names this app already lets
   * people type. Lower this to 50 to match mobile if you want them identical;
   * do NOT raise the ceiling's twin below it.
   */
  loungeName: 60,
  loungeDescription: 300,
  /** Profile fields. */
  bio: 160,
  displayName: 30,
} as const;

export type LimitField = keyof typeof LIMITS;

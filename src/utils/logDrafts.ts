/**
 * Where an unfinished log waits.
 *
 * A draft holds the member's review AND their private note, so it is theirs in
 * the strictest sense. It used to live under `reelhouse_draft_<film>` — no
 * member in the key — and nothing cleared it on sign-out, so the next person on
 * the same browser opened the log form on that film and read the first
 * member's private note, with SAVE live. The mobile app closed exactly this
 * hole earlier (its drafts carry the member and are swept on sign-out); this is
 * the web catching up.
 *
 * The prefix is shared by the old keys and the new ones on purpose, so the
 * sign-out sweep in stores/auth.ts removes both.
 */
export const LOG_DRAFT_PREFIX = 'reelhouse_draft_'

export const logDraftKey = (memberId: string, filmId: number | string): string =>
    `${LOG_DRAFT_PREFIX}${memberId}_${filmId}`

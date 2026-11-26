/**
 * When a film is read from TMDB again, decided each time it is read.
 *
 * A film is noted the moment a member keeps it (a log, a watchlist, a stack, the
 * Vault), often while it is only announced: TMDB has its title, but its cast,
 * director and genres come later. Read once and never again, such a film stayed
 * blank for good, and every member's Taste DNA left it out while saying it was
 * whole. So each read says when the next one is due (`reread_after`, null: never):
 *
 *   · not settled: TMDB gives no release date, calls it anything but Released
 *     (Rumored, Planned, In Production, Post Production), or it is not yet
 *     SETTLE_DAYS past its release. Read again when it settles, and at least
 *     every UNSETTLED_DAYS, so a date that moves, or one given at last, is
 *     seen. These reads are not counted: a film two years from release is
 *     never given up on. A film TMDB calls Canceled will never come: settled.
 *   · settled, with its genres, director and cast: done.
 *   · settled and still missing some: read again in RECHECK_DAYS, until it has
 *     been read MAX_READS times settled. A film TMDB will never fill (a
 *     documentary with no cast) is taken as TMDB has it.
 *
 * `sync_reads` counts the settled reads; set on every read, so a film read before
 * the house counted (null) is known from one read since. A film counts towards a
 * member's taste once it has one settled read (get_taste_profile).
 *
 * Kept as plain JavaScript with no imports so the mobile Jest suite can load it
 * (aFilmReadEarlyIsReadAgain.test.ts), as tmdb-proxy/paths.js is.
 */

export const SETTLE_DAYS = 30;
export const UNSETTLED_DAYS = 90;
export const RECHECK_DAYS = 14;
export const MAX_READS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The midnight (UTC, ms) of a day written 'YYYY-MM-DD', read field by field, or NaN when no calendar
 * shows it: never the engine's own reading, which takes a 31st of February for the 3rd of March.
 */
export function dayOf(raw) {
  // Plain slices, no destructuring: the app's tests load this file through Babel, which would
  // otherwise ask for a helper from a folder that holds none.
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return NaN;
  const y = Number(raw.slice(0, 4));
  const m = Number(raw.slice(5, 7)) - 1;
  const d = Number(raw.slice(8, 10));
  const at = Date.UTC(y, m, d);
  const back = new Date(at);
  return back.getUTCFullYear() === y && back.getUTCMonth() === m && back.getUTCDate() === d ? at : NaN;
}

/** TMDB's release date when it is a real one ('YYYY-MM-DD'), else null. */
export function releaseDateOf(raw) {
  if (!Number.isFinite(dayOf(raw))) return null;
  const year = Number(raw.slice(0, 4));
  return year >= 1870 && year <= 2100 ? raw : null;
}

/** Whether a film as written has what a taste is drawn from: genres, a director, a cast. */
export function hasDetails(film) {
  return (film.genres?.length ?? 0) > 0 && film.director_id != null && (film.cast_ids?.length ?? 0) > 0;
}

/**
 * The read's bookkeeping: `{ release_date, sync_reads, reread_after }` for a film
 * just read as `film` (the shaped row), released on `release` with TMDB's
 * `status` (its text, as TMDB answered them), read `reads` settled times before
 * (null: never counted), at `now` (ms).
 *
 * @param {{ film: { genres?: string[], director_id?: number | null, cast_ids?: number[] }, release?: string | null, status?: string, reads?: number | null, now: number }} read
 */
export function nextRead({ film, release, status, reads, now }) {
  const release_date = releaseDateOf(release);
  const before = typeof reads === 'number' && reads > 0 ? reads : 0;
  const canceled = status === 'Canceled';
  const out = !canceled && typeof status === 'string' && status !== '' && status !== 'Released';
  const settlesAt = release_date ? dayOf(release_date) + SETTLE_DAYS * DAY_MS : null;
  const unsettled = !canceled && (out || settlesAt === null || now < settlesAt);
  if (unsettled) {
    const slow = now + UNSETTLED_DAYS * DAY_MS;
    const next = settlesAt !== null && settlesAt > now ? Math.min(settlesAt, slow) : slow;
    return { release_date, sync_reads: before, reread_after: new Date(next).toISOString() };
  }
  const sync_reads = before + 1;
  if (hasDetails(film) || sync_reads >= MAX_READS) return { release_date, sync_reads, reread_after: null };
  return { release_date, sync_reads, reread_after: new Date(now + RECHECK_DAYS * DAY_MS).toISOString() };
}

/**
 * YearInCinemaService — the data behind the annual retrospective.
 *
 * The screen must show REAL numbers, so it can't read the paginated
 * `useLogStore.logs`. This fetches every viewing the member made in the year,
 * each with its film, its mark and its day, and computes the stats with a pure,
 * unit-tested function.
 *
 * A viewing, not a record: a film is one record per member, and a rewatch moves
 * the record to the rewatch's day, keeping the viewing before it in the record's
 * history with the day it was made. Read by the record's day, a film seen in March
 * and again the next January left March's year altogether.
 */
import { houseNow } from '@/src/lib/houseClock';
import { supabase } from '@/src/lib/supabase';
import { dateParts } from '@/src/utils/timeAgo';

/**
 * One viewing the stats count — DomainLog is structurally assignable (a record's own viewing).
 * `id` is its record's; `viewingId` names the viewing itself when the house gave it.
 */
export interface YearLogInput {
  id: number | string;
  viewingId?: string | null;
  filmId?: number | null;
  title?: string | null;
  poster?: string | null;
  rating?: number | null;
  watchedDate?: string | null;
  createdAt?: string | null;
}

export interface YearTopFilm {
  id: number | string;
  filmId?: number | null;
  title: string;
  poster: string | null;
  rating: number;
}

export interface YearStats {
  year: number;
  /** Films seen in the year: a film seen twice is one film. */
  total: number;
  ratedCount: number;
  /** Average mark on the app's native 0–5 scale, or null when nothing is rated. */
  avgRating: number | null;
  /** Films per month, divided by months ELAPSED (not always 12) — an honest pace. */
  perMonth: number;
  /** The months most films were seen in: a film counts in each month it was seen in, once. */
  topMonths: { month: string; count: number }[];
  topFilms: YearTopFilm[];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The effective date a viewing counts under — watched date first, then created. */
function effectiveDate(l: YearLogInput): string | null {
  return l.watchedDate || l.createdAt || null;
}

/** Which film a viewing is of: its film, or its own record when no film is named. */
const filmKey = (l: YearLogInput): string => (l.filmId != null ? `film:${l.filmId}` : `log:${String(l.id)}`);

/**
 * The year the story tells first, by the day: through January the year just ended, when a member
 * looks back on it, and the year under way after. The year under way stood alone, so on the 2nd
 * of January a member's whole past year had no door (WORKLIST P4.32).
 */
export function yearToTell(now: Date): number {
  return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
}

/**
 * Pure stats over a set of viewings — deterministic, no I/O, fully unit-tested.
 * `now` is injectable so the "months elapsed" pace is testable.
 *
 * A film seen more than once in the year is one film: counted once in the total, once in
 * each month it was seen in, and marked by its latest marked viewing of the year (the mark it
 * held then, never one given in another year).
 */
export function computeYearStats(
  logs: YearLogInput[],
  year: number,
  now: Date = new Date(houseNow()),
): YearStats {
  // Each viewing of the year with its day. dateParts, not new Date(...).getFullYear(): a day is a
  // calendar date, so "2026-01-01" parses as midnight UTC and reads back as 2025 west of UTC —
  // filing a New Year's Day film into the previous year's retrospective for all of the Americas.
  const seen: { l: YearLogInput; day: string; month: number }[] = [];
  for (const l of logs) {
    const d = effectiveDate(l);
    const p = d ? dateParts(d) : null;
    if (!d || !p || p.year !== year) continue;
    seen.push({ l, day: d, month: p.month });
  }

  // Each film once, by its viewings of the year, newest first.
  const films = new Map<string, { l: YearLogInput; day: string }[]>();
  for (const v of seen) {
    const key = filmKey(v.l);
    const of = films.get(key);
    if (of) of.push(v); else films.set(key, [v]);
  }

  const total = films.size;

  // A film's mark: its latest viewing of the year that was marked.
  const marked: { l: YearLogInput; rating: number }[] = [];
  for (const viewings of films.values()) {
    const latest = [...viewings]
      .filter((v) => typeof v.l.rating === 'number' && (v.l.rating as number) > 0)
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))[0];
    if (latest) marked.push({ l: latest.l, rating: latest.l.rating as number });
  }
  const ratedCount = marked.length;
  const avgRating =
    ratedCount > 0
      ? marked.reduce((acc, m) => acc + m.rating, 0) / ratedCount
      : null;

  // Honest pace: for the current year divide by months so far, else by 12.
  const monthsElapsed = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  const perMonth = total / Math.max(monthsElapsed, 1);

  // Same reason: "2026-05-01" counted as APRIL west of UTC, so May showed one film short.
  const monthsMap = new Map<number, Set<string>>();
  for (const v of seen) {
    const inMonth = monthsMap.get(v.month) ?? new Set<string>();
    inMonth.add(filmKey(v.l));
    monthsMap.set(v.month, inMonth);
  }
  const topMonths = [...monthsMap.entries()]
    .map(([m, inMonth]) => ({ month: MONTH_NAMES[m] ?? '', count: inMonth.size }))
    .filter((m) => m.month)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const topFilms: YearTopFilm[] = [...marked]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3)
    .map(({ l, rating }) => ({
      id: l.id,
      filmId: l.filmId ?? null,
      title: l.title ?? 'Untitled',
      poster: l.poster ?? null,
      rating,
    }));

  return { year, total, ratedCount, avgRating, perMonth, topMonths, topFilms };
}

/**
 * What the house gives of each viewing of the year (year_viewings): its record, its own identity,
 * its film, its mark and its day. Never its words, its autopsy or its notes, which a log page
 * reads and a year of thousands of viewings would carry for nothing.
 */
type YearRow = {
  log_id: string; viewing_id: string | null; film_id: number | null; film_title: string | null;
  poster_path: string | null; rating: number | string | null; day: string | null;
};

/** Rows a page; a year past it is read a page at a time, to the last. */
export const YEAR_PAGE = 1000;

/**
 * Fetch every viewing a member made in one year — every page, since an import can file
 * thousands into one year — newest first. Each page goes on from the last row of the one
 * before it, by its day and its viewing, so a page is never read twice nor a row skipped.
 * Throws on error so the screen can show an honest retry state (never wrong numbers).
 */
export async function fetchYearLogs(userId: string, year: number): Promise<YearLogInput[]> {
  const rows: YearRow[] = [];
  const seen = new Set<string>();
  let after: { day: string; viewing: string } | null = null;
  for (;;) {
    const { data, error } = await supabase.rpc('year_viewings', {
      p_user_id: userId,
      p_year: year,
      p_before_day: after?.day ?? null,
      p_before_viewing: after?.viewing ?? null,
    });
    if (error) throw error;
    const page = (data ?? []) as YearRow[];
    for (const r of page) {
      const key = `${r.log_id}/${r.viewing_id ?? ''}/${r.day ?? ''}`;
      if (!seen.has(key)) { seen.add(key); rows.push(r); }
    }
    if (page.length < YEAR_PAGE) break;
    const last = page[page.length - 1];
    // A page that cannot be gone on from is a year not read whole: said, never counted short.
    if (!last?.day || !last.viewing_id) throw new Error('A page of the year could not be read on from.');
    after = { day: last.day, viewing: last.viewing_id };
  }
  return rows.map((r) => ({
    id: r.log_id, viewingId: r.viewing_id, filmId: r.film_id, title: r.film_title, poster: r.poster_path ?? null,
    rating: r.rating == null ? null : Number(r.rating), watchedDate: r.day, createdAt: null,
  }));
}

/**
 * YearInCinemaService — the data behind the annual retrospective.
 *
 * The screen must show REAL numbers, so it can't read the paginated
 * `useLogStore.logs`. This fetches the complete set of the member's logs for
 * the year directly, each by the seven columns a year draws, and computes the
 * stats with a pure, unit-tested function.
 */
import { houseNow } from '@/src/lib/houseClock';
import { supabase } from '@/src/lib/supabase';
import { dateParts } from '@/src/utils/timeAgo';

/** Minimal log shape the stats need — DomainLog is structurally assignable. */
export interface YearLogInput {
  id: number | string;
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
  total: number;
  ratedCount: number;
  /** Average mark on the app's native 0–5 scale, or null when nothing is rated. */
  avgRating: number | null;
  /** Films per month, divided by months ELAPSED (not always 12) — an honest pace. */
  perMonth: number;
  topMonths: { month: string; count: number }[];
  topFilms: YearTopFilm[];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The effective date a log counts under — watched date first, then created. */
function effectiveDate(l: YearLogInput): string | null {
  return l.watchedDate || l.createdAt || null;
}

/**
 * The year the story tells first, by the day: through January the year just ended, when a member
 * looks back on it, and the year under way after. The year under way stood alone, so on the 2nd
 * of January a member's whole past year had no door (WORKLIST P4.32).
 */
export function yearToTell(now: Date): number {
  return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
}

/**
 * Pure stats over a set of logs — deterministic, no I/O, fully unit-tested.
 * `now` is injectable so the "months elapsed" pace is testable.
 */
export function computeYearStats(
  logs: YearLogInput[],
  year: number,
  now: Date = new Date(houseNow()),
): YearStats {
  const yearLogs = logs.filter((l) => {
    const d = effectiveDate(l);
    // dateParts, not new Date(...).getFullYear(): watched_date is a `date` column, so
    // "2026-01-01" parses as midnight UTC and reads back as 2025 west of UTC — filing a
    // New Year's Day film into the previous year's retrospective for all of the Americas.
    const p = d ? dateParts(d) : null;
    return !!p && p.year === year;
  });

  const total = yearLogs.length;

  const rated = yearLogs.filter(
    (l) => typeof l.rating === 'number' && (l.rating as number) > 0,
  );
  const ratedCount = rated.length;
  const avgRating =
    ratedCount > 0
      ? rated.reduce((acc, l) => acc + (l.rating as number), 0) / ratedCount
      : null;

  // Honest pace: for the current year divide by months so far, else by 12.
  const monthsElapsed = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  const perMonth = total / Math.max(monthsElapsed, 1);

  const monthsMap: Record<string, number> = {};
  for (const l of yearLogs) {
    const d = effectiveDate(l);
    if (!d) continue;
    // Same reason: "2026-05-01" counted as APRIL west of UTC, so May showed one film short.
    const parts = dateParts(d);
    if (!parts) continue;
    const m = MONTH_NAMES[parts.month];
    monthsMap[m] = (monthsMap[m] || 0) + 1;
  }
  const topMonths = Object.entries(monthsMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([month, count]) => ({ month, count }));

  const topFilms: YearTopFilm[] = [...rated]
    .sort((a, b) => (b.rating as number) - (a.rating as number))
    .slice(0, 3)
    .map((l) => ({
      id: l.id,
      filmId: l.filmId ?? null,
      title: l.title ?? 'Untitled',
      poster: l.poster ?? null,
      rating: l.rating as number,
    }));

  return { year, total, ratedCount, avgRating, perMonth, topMonths, topFilms };
}

/**
 * What a year draws of each log: its film, its mark and its day. Never its words, its autopsy or
 * its past viewings, which a log page reads and a year of thousands of rows would carry for nothing.
 */
export const YEAR_COLUMNS = 'id, film_id, film_title, poster_path, rating, watched_date, created_at';

type YearRow = {
  id: string; film_id: number | null; film_title: string | null; poster_path: string | null;
  rating: number | null; watched_date: string | null; created_at: string | null;
};

/** Rows a page; a year past it is read a page at a time, to the last. */
export const YEAR_PAGE = 1000;

/**
 * Fetch the complete set of a member's logs for one year — every page, since an
 * import can file thousands into one year. `watched_date` is a DATE column, so
 * a plain date range is exact. Throws on error so the screen can show an honest
 * retry state (never wrong numbers).
 */
export async function fetchYearLogs(userId: string, year: number): Promise<YearLogInput[]> {
  const rows: YearRow[] = [];
  const seen = new Set<unknown>();
  for (let from = 0; ; from += YEAR_PAGE) {
    const { data, error } = await supabase
      .from('logs')
      .select(YEAR_COLUMNS)
      .eq('user_id', userId)
      .gte('watched_date', `${year}-01-01`)
      .lte('watched_date', `${year}-12-31`)
      .order('watched_date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + YEAR_PAGE - 1);
    if (error) throw error;
    for (const r of (data ?? []) as YearRow[]) {
      if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); }
    }
    if (!data || data.length < YEAR_PAGE) break;
  }
  return rows.map((r) => ({
    id: r.id, filmId: r.film_id, title: r.film_title, poster: r.poster_path ?? null,
    rating: r.rating, watchedDate: r.watched_date, createdAt: r.created_at,
  }));
}

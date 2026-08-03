/**
 * YearInCinemaService — the data behind the annual retrospective.
 *
 * The screen must show REAL numbers, so it can't read the paginated
 * `useLogStore.logs` (capped at 50). This fetches the complete set of the
 * member's logs for the year directly, reusing the app's own tested query
 * columns and row mapper, and computes the stats with a pure, unit-tested
 * function.
 */
import { supabase } from '@/src/lib/supabase';
import { LOG_SELECT_COLUMNS, mapLogRow } from '@/src/utils/mappers';
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
 * Pure stats over a set of logs — deterministic, no I/O, fully unit-tested.
 * `now` is injectable so the "months elapsed" pace is testable.
 */
export function computeYearStats(
  logs: YearLogInput[],
  year: number,
  now: Date = new Date(),
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
 * Fetch the complete set of a member's logs for one year. `watched_date` is a
 * DATE column, so a plain date range is exact. Rows map through the app's
 * shared `mapLogRow`, so the shape can never drift from the rest of the app.
 * Throws on error so the screen can show an honest retry state (never wrong
 * numbers).
 */
export async function fetchYearLogs(userId: string, year: number): Promise<YearLogInput[]> {
  const { data, error } = await supabase
    .from('logs')
    .select(LOG_SELECT_COLUMNS)
    .eq('user_id', userId)
    .gte('watched_date', `${year}-01-01`)
    .lte('watched_date', `${year}-12-31`)
    .order('watched_date', { ascending: false })
    .limit(1000);

  if (error) throw error;
  return (data ?? []).map(mapLogRow) as unknown as YearLogInput[];
}

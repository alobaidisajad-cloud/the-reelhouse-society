/**
 * The date on the film page's stub: `JAN 1` for a viewing this year, `2025` for one of another year.
 *
 * A watched date is a calendar date ("2026-01-01"), with no time and no zone. Its year is read from
 * its own parts (dateParts), never from a Date: a bare day read as a Date is midnight UTC, which
 * west of UTC is the evening before, so a viewing on 1 January printed the year before (round 14).
 */
import { dateParts, formatDateMonthDay } from '@/src/utils/timeAgo';

export function watchedLabel(watchedDate: string | null | undefined, thisYear: number): string | null {
  const parts = dateParts(watchedDate);
  if (!parts) return null;
  // Watched this year, the DAY is what a member is placing. Watched years ago, the YEAR is the
  // whole point and the day is noise.
  return parts.year === thisYear ? formatDateMonthDay(watchedDate).toUpperCase() : String(parts.year);
}

/**
 * dayBoundaries — the days and moments where a day read in the wrong zone shows, for every test of a
 * day (npm run test:tz runs each in six zones, from UTC-11 to UTC+14).
 *
 * A fixture in the middle of a day passes in every zone, whatever the code does: a calendar date read
 * as midnight UTC is still the same day at noon in most places. These sit on the edges: the first and
 * last day of a year, a leap day, and moments on the member's own clock just after midnight and late in
 * the evening, which are another day in UTC for half the world.
 */

/** Calendar dates as the house writes them (`date` columns), each with the year, month (1-12) and day it names. */
export const BOUNDARY_DAYS = [
  { day: '2026-01-01', year: 2026, month: 1, date: 1 },
  { day: '2025-12-31', year: 2025, month: 12, date: 31 },
  { day: '2028-02-29', year: 2028, month: 2, date: 29 },
  { day: '2026-03-01', year: 2026, month: 3, date: 1 },
] as const;

/**
 * Moments on the member's own clock, made in whatever zone the test runs in: just after midnight on
 * 1 January (still 31 December in UTC for a member east of it), late on 31 December and in the evening
 * of 1 January (already the next day in UTC for a member west of it), and the last minute of a leap day.
 * Each names the member's own day.
 */
export function boundaryMoments(): { at: Date; year: number; month: number; date: number }[] {
  return [
    { at: new Date(2026, 0, 1, 0, 30), year: 2026, month: 1, date: 1 },
    { at: new Date(2025, 11, 31, 23, 30), year: 2025, month: 12, date: 31 },
    { at: new Date(2026, 0, 1, 20, 0), year: 2026, month: 1, date: 1 },
    { at: new Date(2028, 1, 29, 23, 59), year: 2028, month: 2, date: 29 },
  ];
}

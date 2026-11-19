/**
 * A salon's day divider says the year of a day of another year (round 14).
 *
 * A salon scrolled back to last November printed "NOVEMBER 12" over its messages, read as this
 * year's. The day keeps its form this year and carries its year in any other, read on the
 * member's own clock (formatDateMonthDayInYear, asked in calendarDates.test.ts). No Intl. Run in
 * six zones by `npm run test:tz`.
 */
import { formatDay } from '@/app/lounge/[id]';

/** Noon on a day of the member's own calendar: the same day in every zone. */
const localNoon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const NOW = localNoon(2026, 11, 19);
const iso = (y: number, m: number, d: number) => new Date(localNoon(y, m, d)).toISOString();

it('scrolled back to last November, the divider says the year', () => {
  expect(formatDay(iso(2025, 11, 12), NOW)).toBe('NOVEMBER 12, 2025');
});

it('this year’s days, today and yesterday, as they were', () => {
  expect(formatDay(iso(2026, 11, 12), NOW)).toBe('NOVEMBER 12');
  expect(formatDay(iso(2026, 11, 19), NOW)).toBe('TODAY');
  expect(formatDay(iso(2026, 11, 18), NOW)).toBe('YESTERDAY');
});

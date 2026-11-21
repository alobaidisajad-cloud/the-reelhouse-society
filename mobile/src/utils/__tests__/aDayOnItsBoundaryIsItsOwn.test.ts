/**
 * Every helper that says or keys a day says the member's own day on the edges of a day and a year, in
 * whatever zone the suite runs (npm run test:tz: six zones, UTC-11 to UTC+14). The fixtures are
 * test-utils/dayBoundaries: a calendar date read as midnight UTC, or a moment's day taken in UTC, says
 * another day here in at least one of the zones.
 */
import { BOUNDARY_DAYS, boundaryMoments } from '@/test-utils/dayBoundaries';
import { dayKey, dayLabel, MONTHS } from '@/src/components/dispatch/dayLabel';
import { watchedLabel } from '@/src/components/film/watchedLabel';
import { calendarDateString, dateParts, formatDate, formatDateMonthDayInYear, formatTMDBDate, localCalendarDate } from '@/src/utils/timeAgo';

const SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const key = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

describe('a calendar date on a boundary is its own day', () => {
  it.each(BOUNDARY_DAYS)('$day', ({ day, year, month, date }) => {
    expect(dateParts(day)).toEqual({ year, month: month - 1, day: date });
    expect(calendarDateString(day)).toBe(day);
    expect(formatDate(day)).toBe(`${SHORT[month - 1]} ${date}, ${year}`);
    expect(formatTMDBDate(day)).toBe(`${SHORT[month - 1]} ${date}, ${year}`);
    expect(formatDateMonthDayInYear(day, new Date(year, 5, 15).getTime())).toBe(`${SHORT[month - 1]} ${date}`);
    expect(formatDateMonthDayInYear(day, new Date(year + 1, 5, 15).getTime())).toBe(`${SHORT[month - 1]} ${date}, ${year}`);
    expect(watchedLabel(day, year)).toBe(`${SHORT[month - 1]} ${date}`);
    expect(watchedLabel(day, year + 1)).toBe(String(year));
  });
});

describe("a moment on a boundary is the member's own day", () => {
  it.each(boundaryMoments().map((m) => ({ ...m, name: `${m.year}-${m.month}-${m.date} ${m.at.getHours()}:${m.at.getMinutes()}` })))('$name', ({ at, year, month, date }) => {
    const iso = at.toISOString();
    expect(dateParts(iso)).toEqual({ year, month: month - 1, day: date });
    expect(calendarDateString(iso)).toBe(key(year, month, date));
    expect(localCalendarDate(0, at.getTime())).toBe(key(year, month, date));
    expect(dayKey(iso)).toBe(key(year, month, date));
    expect(dayLabel(iso, year)).toContain(`${MONTHS[month - 1]} ${date}`);
    expect(dayLabel(iso, year)).not.toContain(String(year));
    expect(dayLabel(iso, year + 1)).toContain(`, ${year}`);
    expect(formatDateMonthDayInYear(iso, at.getTime())).toBe(`${SHORT[month - 1]} ${date}`);
  });
});

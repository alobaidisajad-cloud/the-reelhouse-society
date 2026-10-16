/**
 * aDateIsSaidInTheHouseVoice.test.ts — utils/timeAgo.ts, every function at every edge: a calendar
 * date keeps its own day and speaks in days; an instant is the reader's and speaks in minutes, hours,
 * days and weeks; each bucket turns at its own moment; what cannot be read is said as it came, never
 * "NaN". Built from local dates and the reader's clock, so it holds in every time zone the suite
 * runs in.
 */
import {
  calendarDateString, dateParts, formatClockTime, formatDate, formatDateMonthDay, formatDateMonthYear,
  formatLongCalendarDate, formatTMDBDate, localCalendarDate, parseCalendarDate, timeAgo, timeUntil,
} from '../timeAgo';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** The reader's clock: 5 March 2026, 10:00 local. */
const NOW = new Date(2026, 2, 5, 10, 0, 0, 0);
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ahead = (ms: number) => new Date(NOW.getTime() + ms);

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterEach(() => jest.useRealTimers());

describe('the member\'s calendar', () => {
  it('names today, and a day either side, as the member\'s own calendar does, every part two digits', () => {
    expect(localCalendarDate()).toBe('2026-03-05');
    expect(localCalendarDate(1)).toBe('2026-03-06');
    expect(localCalendarDate(-5)).toBe('2026-02-28');
    expect(localCalendarDate(300)).toBe('2026-12-30');
  });

  it('reads a calendar date\'s parts from the string alone, and nothing else as one', () => {
    expect(parseCalendarDate('2026-07-25')).toEqual({ year: 2026, month: 6, day: 25 });
    expect(parseCalendarDate('2026-01-01')).toEqual({ year: 2026, month: 0, day: 1 });
    expect(parseCalendarDate('2026-12-31')).toEqual({ year: 2026, month: 11, day: 31 });
    for (const not of ['2026-7-25', ' 2026-07-25', '2026-07-25T00:00:00Z', '2026-00-10', '2026-13-10', '2026-05-00', '2026-05-32', '']) {
      expect([not, parseCalendarDate(not)]).toEqual([not, null]);
    }
  });

  it('says which day any value falls on: a calendar date its own, an instant the reader\'s', () => {
    expect(dateParts('2026-07-25')).toEqual({ year: 2026, month: 6, day: 25 });
    expect(dateParts(new Date(2026, 6, 25, 23, 59))).toEqual({ year: 2026, month: 6, day: 25 });
    expect(dateParts(new Date(2026, 6, 25, 0, 1).toISOString())).toEqual({ year: 2026, month: 6, day: 25 });
    expect([null, undefined, '', 'not a date', new Date(Number.NaN)].map((v) => dateParts(v as never))).toEqual([null, null, null, null, null]);
    expect(calendarDateString('2026-07-25')).toBe('2026-07-25');
    expect(calendarDateString(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
    expect(calendarDateString(null)).toBeNull();
    expect(calendarDateString('nonsense')).toBeNull();
  });
});

describe('how long ago', () => {
  it('says a calendar date in days and weeks, the future as today, a month back as its date', () => {
    const day = (offset: number) => localCalendarDate(-offset);
    expect([0, -3, 1, 2, 6, 7, 13, 14, 29].map((d) => timeAgo(day(d)))).toEqual([
      'TODAY', 'TODAY', 'YESTERDAY', '2 DAYS AGO', '6 DAYS AGO', '1 WEEK AGO', '1 WEEK AGO', '2 WEEKS AGO', '4 WEEKS AGO',
    ]);
    expect(timeAgo(day(30))).toBe(formatDate(day(30)));
    expect(timeAgo(day(30))).toBe('FEB 3, 2026');
  });

  it('says an instant in minutes, hours, days and weeks, each turning at its own moment', () => {
    const said = [0, 59_999, MIN, 2 * MIN, 59 * MIN + 59_999, HOUR, 2 * HOUR, 24 * HOUR - 1, DAY, 2 * DAY, 7 * DAY - 1, 7 * DAY, 14 * DAY, 30 * DAY - 1]
      .map((ms) => timeAgo(ago(ms)));
    expect(said).toEqual([
      'MOMENTS AGO', 'MOMENTS AGO', '1 MIN. AGO', '2 MIN. AGO', '59 MIN. AGO', '1 HR. AGO', '2 HRS. AGO', '23 HRS. AGO',
      '1 DAY AGO', '2 DAYS AGO', '6 DAYS AGO', '1 WEEK AGO', '2 WEEKS AGO', '4 WEEKS AGO',
    ]);
    expect(timeAgo(ago(30 * DAY))).toBe(formatDate(ago(30 * DAY)));
    expect(timeAgo(ago(2 * HOUR).toISOString())).toBe('2 HRS. AGO');
  });

  it('never says a future instant is a negative age', () => {
    expect(timeAgo(ahead(5 * HOUR))).toBe('MOMENTS AGO');
  });

  it('says nothing for nothing, and what cannot be read as it came, its time cut off', () => {
    expect(timeAgo(null)).toBe('');
    expect(timeAgo('')).toBe('');
    expect(timeAgo('soon-ish')).toBe('soon-ish');
    expect(timeAgo('2026-99-99T10:00')).toBe('2026-99-99');
    expect(timeAgo(new Date(Number.NaN))).toBe('');
  });
});

describe('how long until', () => {
  it('says an instant ahead in minutes, hours and days, each turning at its own moment, and nothing once passed', () => {
    const said = [-1, 0, 1, 59_999, MIN, 59 * MIN, HOUR, 23 * HOUR, 24 * HOUR - 1, DAY, 3 * DAY].map((ms) => timeUntil(ahead(ms)));
    expect(said).toEqual(['', '', 'IN MOMENTS', 'IN MOMENTS', 'IN 1 MIN.', 'IN 59 MIN.', 'IN 1 HR.', 'IN 23 HRS.', 'IN 23 HRS.', 'IN 1 DAY', 'IN 3 DAYS']);
  });

  it('measures a calendar date from its own noon', () => {
    expect(timeUntil(localCalendarDate())).toBe('IN 2 HRS.');
    expect(timeUntil(localCalendarDate(2))).toBe('IN 2 DAYS');
  });

  it('says nothing for nothing or what cannot be read', () => {
    expect([null, undefined, '', 'not a date', new Date(Number.NaN)].map((v) => timeUntil(v as never))).toEqual(['', '', '', '', '']);
  });
});

describe('a date in words', () => {
  it('writes a date short or long, a calendar date its own day, an instant the reader\'s', () => {
    expect(formatDate('2026-07-25')).toBe('JUL 25, 2026');
    expect(formatDate('2026-07-25', 'long')).toBe('JULY 25, 2026');
    expect(formatDate(new Date(2026, 11, 31, 23, 59))).toBe('DEC 31, 2026');
    expect(formatDate(new Date(2026, 0, 1, 0, 1), 'long')).toBe('JANUARY 1, 2026');
    expect(formatDate(null)).toBe('');
    expect(formatDate('when the leaves fall')).toBe('when the leaves fall');
  });

  it('writes a calendar day out in full, its weekday its own', () => {
    expect(formatLongCalendarDate('2026-08-16')).toBe('Sun, August 16, 2026');
    expect(formatLongCalendarDate('2026-01-03')).toBe('Sat, January 3, 2026');
    expect(formatLongCalendarDate('2026-08-16T12:00:00Z')).toBe('');
    expect(formatLongCalendarDate(null)).toBe('');
  });

  it('writes the month and day alone, short or long', () => {
    expect(formatDateMonthDay('2026-08-05')).toBe('AUG 5');
    expect(formatDateMonthDay('2026-08-05', 'long')).toBe('AUGUST 5');
    expect(formatDateMonthDay(new Date(2026, 1, 9, 8))).toBe('FEB 9');
    expect(formatDateMonthDay(undefined)).toBe('');
    expect(formatDateMonthDay('2026-08-55T00:00')).toBe('2026-08-55');
  });

  it('writes the time on the reader\'s clock, for an instant only', () => {
    const at = (h: number, m: number) => formatClockTime(new Date(2026, 2, 5, h, m));
    expect([at(0, 5), at(11, 59), at(12, 0), at(13, 7), at(23, 30)]).toEqual(['12:05 AM', '11:59 AM', '12:00 PM', '01:07 PM', '11:30 PM']);
    expect(formatClockTime(new Date(2026, 2, 5, 9, 4).toISOString())).toBe('09:04 AM');
    expect([formatClockTime('2026-03-05'), formatClockTime(null), formatClockTime('later')]).toEqual(['', '', '']);
  });

  it('writes the month and year alone', () => {
    expect(formatDateMonthYear('2026-07-25')).toBe('JULY 2026');
    expect(formatDateMonthYear(new Date(2025, 10, 2, 12))).toBe('NOVEMBER 2025');
    expect(formatDateMonthYear(null)).toBe('');
    expect(formatDateMonthYear('long ago')).toBe('long ago');
  });

  it('writes a release date, or a bare year as it came, or nothing', () => {
    expect(formatTMDBDate('1942-11-26')).toBe('NOV 26, 1942');
    expect(formatTMDBDate('1942-11-26', 'long')).toBe('NOVEMBER 26, 1942');
    expect(formatTMDBDate('1942')).toBe('1942');
    expect(formatTMDBDate(null)).toBeUndefined();
    expect(formatTMDBDate('')).toBeUndefined();
  });
});

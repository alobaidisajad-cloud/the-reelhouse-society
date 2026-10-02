/**
 * theIssueIsTheCalendarDay.test.ts — the Dispatch's issue number is the day
 * of the year on the phone's calendar, at every hour of every day.
 * ─────────────────────────────────────────────────────────────────────────────
 * It used to be the hours since the last 31 December, divided by 24. Under
 * summer time a local day is an hour short of that midnight's, so from
 * midnight to one, every night from March to November, the masthead printed
 * yesterday's number beside today's date. In a zone without summer time the
 * two counts agree, which is why only a DST zone can see it: CI runs this in
 * Los Angeles, and `npm run test:tz` in New York too.
 */
import { issueOf, folioOf } from '../paper/paperMetrics';

const MONTH_DAYS = (y: number) => [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Every day of the year, numbered by counting, not by the clock. */
const everyDay = (y: number) => {
  const out: { m: number; d: number; n: number }[] = [];
  let n = 0;
  MONTH_DAYS(y).forEach((len, m) => {
    for (let d = 1; d <= len; d++) out.push({ m, d, n: ++n });
  });
  return out;
};

describe('the issue is the calendar day', () => {
  it.each([2026, 2028])('every hour of every day of %i carries that day’s number', (y) => {
    const wrong: string[] = [];
    for (const { m, d, n } of everyDay(y)) {
      for (const h of [0, 1, 12, 23]) {
        const at = new Date(y, m, d, h, 30);
        if (issueOf(at) !== n) wrong.push(`${y}-${m + 1}-${d} ${h}:30 → ${issueOf(at)}, not ${n}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('28 August is No. 240, and 31 December closes a leap year at 366; 1924 is volume one', () => {
    expect(issueOf(new Date(2026, 7, 28, 0, 30))).toBe(240);
    expect(issueOf(new Date(2028, 11, 31, 23, 59))).toBe(366);
    expect(folioOf(new Date(2026, 0, 1, 0, 0))).toBe('VOL. 103 · No. 1');
  });
});

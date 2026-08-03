/**
 * calendarDates.test.ts — the timezone contract, encoded as assertions.
 * ─────────────────────────────────────────────────────────────────────
 * Batch 13's own instruction: encode the timezone table BEFORE touching anything.
 *
 * ── HOW TO RUN THIS HONESTLY (read before editing) ───────────────────────────
 * These assertions only mean something when the suite runs under more than one
 * timezone, and there is exactly one way to do that here:
 *
 *   ✅  $env:TZ='America/Los_Angeles'; npx jest src/utils/__tests__/calendarDates.test.ts
 *   ❌  setting process.env.TZ INSIDE a test — verified inert under the jest-expo
 *       environment: Los Angeles and Tokyo both returned "Jul 25, 2026". The obvious
 *       harness passes while proving nothing.
 *
 * `npm run test:tz` runs the whole matrix. A green run in one zone is not evidence.
 *
 * ── THE TWO KINDS OF DATE (verified against the live database) ───────────────
 *   logs.watched_date   -> `date`                     "2026-07-25"
 *   *.created_at        -> `timestamp with time zone` "2026-07-25T18:30:00+00:00"
 *
 * A CALENDAR DATE has no time and no zone. July 25th is July 25th in Lagos and in
 * Lima. It must render as the day it says, everywhere.
 *
 * A TIMESTAMP is one instant on the world's clock. It must render in the reader's
 * local time, or "3 HRS. AGO" is a lie.
 *
 * Rendering either one the other way is the whole bug.
 */
import { formatDate, formatDateMonthYear, timeAgo } from '../timeAgo';

/** The zone the suite is currently running under — reported so a green run is auditable. */
const TZ = process.env.TZ ?? '(system default)';

describe(`calendar dates render as the day they say [TZ=${TZ}]`, () => {
  // A member in Los Angeles who logs a film on the 25th must see the 25th. Before
  // the fix this returns JUL 24 for every zone west of UTC — the entire Americas.
  it('formatDate keeps the calendar day', () => {
    expect(formatDate('2026-07-25')).toBe('JUL 25, 2026');
  });

  it('formatDate keeps the calendar day in long form too', () => {
    expect(formatDate('2026-07-25', 'long')).toBe('JULY 25, 2026');
  });

  // Year boundaries are where an off-by-one stops being cosmetic: the log lands in
  // the wrong year, and the Year in Cinema retrospective inherits the mistake.
  it.each([
    ['2026-01-01', 'JAN 1, 2026'],
    ['2025-12-31', 'DEC 31, 2025'],
    ['2026-03-08', 'MAR 8, 2026'],   // US DST spring-forward
    ['2026-11-01', 'NOV 1, 2026'],   // US DST fall-back
    ['2024-02-29', 'FEB 29, 2024'],  // leap day
  ])('formatDate(%s) -> %s', (input, expected) => {
    expect(formatDate(input)).toBe(expected);
  });

  it('formatDateMonthYear keeps the calendar month', () => {
    // Latent today (every current caller passes a timestamp) but one date-only
    // caller away from being the same bug.
    expect(formatDateMonthYear('2026-01-01')).toBe('JANUARY 2026');
  });

  it('an old calendar date keeps its day in timeAgo’s date branch', () => {
    // Past the relative buckets, timeAgo falls through to a formatted date — the
    // same trap, on the profile poster card.
    expect(timeAgo('2020-01-01')).toContain('JAN 1');
    expect(timeAgo('2020-01-01')).toContain('2020');
  });

  // A calendar date has no time on it. Saying "8 HRS. AGO" invents precision the
  // member never gave, and makes the same card read differently at lunchtime than at
  // bedtime for a film they simply watched today.
  describe('a calendar date speaks in days, not hours', () => {
    const dayOffset = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    it.each([
      [0, 'TODAY'],
      [-1, 'YESTERDAY'],
      [-3, '3 DAYS AGO'],
      [-7, '1 WEEK AGO'],
      [-14, '2 WEEKS AGO'],
    ])('%i days from today -> %s', (offset, expected) => {
      expect(timeAgo(dayOffset(offset))).toBe(expected);
    });

    it('never reads as a negative age if the date is ahead of the device clock', () => {
      expect(timeAgo(dayOffset(1))).toBe('TODAY');
    });

    it('is stable regardless of the hour it is read at', () => {
      // The whole point: two reads of the same card must agree.
      expect(timeAgo(dayOffset(0))).toBe(timeAgo(dayOffset(0)));
      expect(timeAgo(dayOffset(0))).not.toMatch(/HRS?\./);
    });
  });
});

describe(`timestamps still render in local time [TZ=${TZ}]`, () => {
  // The other half of the contract. A fix that made everything UTC would break
  // these, and they are the majority of call sites.
  it('a timestamp keeps its relative buckets', () => {
    const now = Date.now();
    expect(timeAgo(new Date(now - 30 * 1000).toISOString())).toBe('MOMENTS AGO');
    expect(timeAgo(new Date(now - 5 * 60 * 1000).toISOString())).toBe('5 MIN. AGO');
    expect(timeAgo(new Date(now - 2 * 3600 * 1000).toISOString())).toBe('2 HRS. AGO');
    expect(timeAgo(new Date(now - 3 * 86400 * 1000).toISOString())).toBe('3 DAYS AGO');
  });

  it('singular units read as singular', () => {
    const now = Date.now();
    expect(timeAgo(new Date(now - 60 * 1000).toISOString())).toBe('1 MIN. AGO');
    expect(timeAgo(new Date(now - 3600 * 1000).toISOString())).toBe('1 HR. AGO');
    expect(timeAgo(new Date(now - 86400 * 1000).toISOString())).toBe('1 DAY AGO');
  });

  it('has a weeks bucket between days and dates', () => {
    // Two of the four duplicate implementations skip this, so a fortnight-old entry
    // jumps straight to a bare date.
    expect(timeAgo(new Date(Date.now() - 14 * 86400 * 1000).toISOString())).toBe('2 WEEKS AGO');
  });

  it('disambiguates a prior year', () => {
    expect(timeAgo('2019-06-15T12:00:00Z')).toContain('2019');
  });

  it('never renders a future timestamp as a negative age', () => {
    expect(timeAgo(new Date(Date.now() + 60_000).toISOString())).toBe('MOMENTS AGO');
  });
});

describe(`malformed input is survivable [TZ=${TZ}]`, () => {
  it.each([undefined, null, ''])('%p yields an empty string', (v) => {
    expect(formatDate(v as string | null | undefined)).toBe('');
    expect(timeAgo(v as string | null | undefined)).toBe('');
  });

  it('an unparseable string is echoed rather than shown as NaN', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
    expect(timeAgo('not-a-date')).toBe('not-a-date');
  });
});

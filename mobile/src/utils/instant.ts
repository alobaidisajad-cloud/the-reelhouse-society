/**
 * instant.ts — an instant written as text, read one way on every engine (WORKLIST P4.52).
 * ─────────────────────────────────────────────────────────────────────────────
 * What Date.parse makes of a text is partly the engine's own choice, and the phone's engine is
 * not Node's: given `2026-13-45T99:00:00Z`, Node names no instant and Hermes rolls it over into
 * a later month, so a broken stamp was drawn on the phone as a real date. So no text is handed
 * to the engine. The forms the house writes are read here, field by field, each field held to
 * its range:
 *   · an instant as Postgres writes it, `2026-11-06T10:00:00.123456+00:00` (six places after
 *     the second, cut to the three a Date holds; an offset of `+00`, `+0300` or `+03:00`; a
 *     space for the T), and as toISOString writes it; with no offset, the reader's own clock,
 *     as the spec reads it;
 *   · a day alone, `2026-08-05`: its midnight, UTC, as the spec reads it;
 *   · an answer's HTTP `Date` header, the form toUTCString writes.
 * Any other text names no instant.
 *
 * The tests run on Hermes as well (scripts/hermes-suites.cjs).
 */
const HOUSE_FORM = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/i;
const DAY_FORM = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HTTP_FORM = /^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/;

/** The days in a month (1 to 12) of a year. */
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Whether each field is one a clock and a calendar can show. */
const inRange = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0) =>
  month >= 1 && month <= 12 && day >= 1 && day <= daysIn(year, month) && hour <= 23 && minute <= 59 && second <= 59;

/** A matched field as a number; a field the form left out is 0. */
const field = (m: RegExpExecArray, i: number) => Number(m[i] ?? 0);

/** The milliseconds since 1970 the text names, or NaN when it names none. */
export function instantOf(text: string | null | undefined): number {
  if (!text) return NaN;
  const trimmed = text.trim();

  const house = HOUSE_FORM.exec(trimmed);
  if (house) {
    const [y, mo, d, h, mi, s] = [1, 2, 3, 4, 5, 6].map((i) => field(house, i)) as [number, number, number, number, number, number];
    if (!inRange(y, mo, d, h, mi, s)) return NaN;
    const ms = Number((house[7] ?? '').slice(0, 3).padEnd(3, '0'));
    const zone = house[8];
    if (!zone) return new Date(y, mo - 1, d, h, mi, s, ms).getTime();
    const utc = Date.UTC(y, mo - 1, d, h, mi, s, ms);
    if (zone.toUpperCase() === 'Z') return utc;
    const hours = Number(zone.slice(1, 3));
    const minutes = Number(zone.slice(3).replace(':', '') || 0);
    if (hours > 23 || minutes > 59) return NaN;
    return utc - (zone[0] === '-' ? -1 : 1) * (hours * 60 + minutes) * 60_000;
  }

  const day = DAY_FORM.exec(trimmed);
  if (day) {
    const [y, mo, d] = [1, 2, 3].map((i) => field(day, i)) as [number, number, number];
    return inRange(y, mo, d) ? Date.UTC(y, mo - 1, d) : NaN;
  }

  const http = HTTP_FORM.exec(trimmed);
  if (http) {
    const [d, y, h, mi, s] = [1, 3, 4, 5, 6].map((i) => field(http, i)) as [number, number, number, number, number];
    const mo = MONTHS.indexOf(http[2] ?? '') + 1;
    return inRange(y, mo, d, h, mi, s) ? Date.UTC(y, mo - 1, d, h, mi, s) : NaN;
  }

  return NaN;
}

/**
 * The Date a text names, read by instantOf, so every engine reads it one way (an Invalid Date
 * when it names none); a Date is copied, and a number of milliseconds is that instant. `new Date(text)` hands the text to the
 * engine's own reading, which the guard anInstantIsReadByTheHouse refuses.
 */
export function dateOf(value: string | number | Date | null | undefined): Date {
  if (value instanceof Date) return new Date(value.getTime());
  return new Date(typeof value === 'number' ? value : instantOf(value));
}

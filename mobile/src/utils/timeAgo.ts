/**
 * timeAgo — the one place ReelHouse turns a date into words.
 *
 * ── THE TWO KINDS OF DATE (verified against the live database) ───────────────
 *   logs.watched_date   `date`                     -> "2026-07-25"
 *   *.created_at        `timestamp with time zone` -> "2026-07-25T18:30:00+00:00"
 *
 * A CALENDAR DATE has no time and no zone. July 25th is July 25th in Lagos and in
 * Lima. It must render as the day it says, everywhere.
 *
 * A TIMESTAMP is one instant on the world's clock. It must render in the reader's
 * local time, or "3 HRS. AGO" is a lie.
 *
 * Rendering either one the other way was the whole of finding #74: `new Date("2026-07-25")`
 * is defined to mean midnight UTC, so `toLocaleDateString` rendered it as JUL 24 for
 * every member west of UTC — the entire Americas, on the film diary, which is the
 * product. Proven by execution, not by reading: see calendarDates.test.ts.
 *
 * ── WHY THERE IS NO Intl IN THIS FILE ────────────────────────────────────────
 * The obvious fix is `timeZone: 'UTC'`, which is what formatTMDBDate used to do. But
 * this app runs on HERMES with no Intl polyfill (expo 54 / RN 0.81, no jsEngine
 * override), and whether Hermes honours the `timeZone` option cannot be verified from
 * a development machine — there is no device to test on. Building the fix on it would
 * make correctness depend on an assumption.
 *
 * So no date here is ever rendered through Intl. Months come from a table and days
 * come from integers. What the tests prove in Node is therefore true on the phone by
 * construction rather than by hope.
 *
 * This is the pattern profileComputed.ts already uses for the streak counter, and its
 * comment says why: "Locks the streak explicitly to the true YYYY-MM-DD stored in the
 * DB without V8 Date engine timezone shifts." That file was right; this one now agrees.
 */

const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;
const MONTHS_LONG = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
] as const;

/** A bare `YYYY-MM-DD` — a calendar date, with no time and no zone. */
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Today on the MEMBER's calendar, as `YYYY-MM-DD`.
 *
 * #40 — the log form defaulted to `new Date().toISOString().slice(0,10)`, which is UTC
 * by definition. West of UTC after late afternoon that is already TOMORROW, so a
 * freshly-opened form pre-filled the wrong day AND the TODAY chip rendered unselected,
 * because the chip compared against a correctly-local string. East of UTC before
 * morning it pre-filled yesterday. Either way the entry was filed under the wrong day
 * unless the member noticed.
 *
 * Lives here, not in useLogFlow, so the store layer can use it without importing a
 * hook — same reason it takes no dependency on Intl.
 */
export function localCalendarDate(offsetDays = 0): string {
  const d = new Date();
  if (offsetDays !== 0) d.setDate(d.getDate() + offsetDays);
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${da}`;
}

/** The parts of a date, however it arrived, with no timezone left in them. */
type DateParts = { year: number; month: number; day: number };

/**
 * Read a calendar date's parts straight out of the string.
 * No Date object is constructed, so no timezone can shift it.
 */
export function parseCalendarDate(value: string): DateParts | null {
  const m = CALENDAR_DATE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month: month - 1, day };
}

/** Local parts of a real instant — correct for a timestamp, which belongs to the reader's clock. */
function localParts(d: Date): DateParts {
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
}

function renderParts(p: DateParts, format: 'short' | 'long'): string {
  const month = format === 'long' ? MONTHS_LONG[p.month] : MONTHS_SHORT[p.month];
  return `${month} ${p.day}, ${p.year}`;
}

/**
 * The year, month and day a member would say a value falls on.
 *
 * Exported because rendering is not the only thing that has to get this right:
 * YearInCinemaService decides which YEAR a film belongs to and which MONTH it counts
 * toward, and was doing it with `new Date(watchedDate).getFullYear()`. West of UTC that
 * reads "2026-01-01" as 2025, so a film watched on New Year's Day landed in the
 * previous year's retrospective — and "2026-05-01" counted as April. Anything asking
 * "which day is this?" must ask here, so there is one answer.
 *
 * Month is 0-indexed, matching Date.getMonth().
 */
export function dateParts(value: string | Date | undefined | null): DateParts | null {
  if (!value) return null;
  return toParts(value)?.parts ?? null;
}

/**
 * The `YYYY-MM-DD` a member would call this value — ready to store in a `date` column.
 *
 * A calendar date is returned unchanged. A timestamp is resolved to the reader's LOCAL
 * day, which is the day they mean. The importer was doing this with
 * `parsed.toISOString().slice(0,10)`, which takes the UTC day instead: importing
 * "Jul 25, 2026" from Tokyo stored 2026-07-24.
 */
export function calendarDateString(value: string | Date | undefined | null): string | null {
  const p = dateParts(value);
  if (!p) return null;
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * Resolve any accepted input to parts, saying which kind it was.
 * `calendar` inputs keep their own day; `instant` inputs are the reader's local day.
 */
function toParts(value: string | Date): { parts: DateParts; kind: 'calendar' | 'instant' } | null {
  if (typeof value !== 'string') {
    return isNaN(value.getTime()) ? null : { parts: localParts(value), kind: 'instant' };
  }
  const calendar = parseCalendarDate(value);
  if (calendar) return { parts: calendar, kind: 'calendar' };
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : { parts: localParts(d), kind: 'instant' };
}

/**
 * The instant a value should be measured from for relative phrasing.
 *
 * A calendar date has no time, so it is anchored to LOCAL NOON of that day: far enough
 * from both midnights that no timezone or daylight-saving shift can move it to the
 * neighbouring date, which is the trap this whole file exists to avoid.
 */
function toInstant(value: string | Date): number | null {
  if (typeof value !== 'string') return isNaN(value.getTime()) ? null : value.getTime();
  const calendar = parseCalendarDate(value);
  if (calendar) return new Date(calendar.year, calendar.month, calendar.day, 12, 0, 0, 0).getTime();
  const t = new Date(value).getTime();
  return isNaN(t) ? null : t;
}

/** What an unreadable value falls back to: the original text, never "NaN" or "Invalid Date". */
function echo(value: string | Date | undefined | null): string {
  return typeof value === 'string' ? value.split('T')[0] : '';
}

/**
 * Relative time in the house voice.
 *
 * The wording is deliberate: "5 MIN. AGO", not "5m AGO". This app says ranks, the
 * Society, and dossiers — the terse form saves four characters and costs the thing
 * that makes the product sound like itself. Three near-copies of this function each
 * had their own phrasing (#75); this is the one that remains.
 */
export function timeAgo(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return '';
  const then = toInstant(dateStr);
  if (then === null) return echo(dateStr);

  // Clamped at zero: a clock skew or a future date must never read as a negative age.
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'MOMENTS AGO';
  if (mins < 60) return mins === 1 ? '1 MIN. AGO' : `${mins} MIN. AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs === 1 ? '1 HR. AGO' : `${hrs} HRS. AGO`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return days === 1 ? '1 DAY AGO' : `${days} DAYS AGO`;
  if (days < 30) {
    // Two of the four duplicate implementations had no weeks bucket at all, so a
    // fortnight-old entry jumped straight to a bare date.
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 WEEK AGO' : `${weeks} WEEKS AGO`;
  }
  return formatDate(dateStr);
}

/**
 * A date in words. Calendar dates keep their own day; timestamps take the reader's.
 */
export function formatDate(dateStr: string | Date | undefined | null, format: 'short' | 'long' = 'short'): string {
  if (!dateStr) return '';
  const resolved = toParts(dateStr);
  if (!resolved) return echo(dateStr);
  return renderParts(resolved.parts, format);
}

/**
 * Month and year only (e.g. "MEMBER SINCE").
 *
 * Every caller today passes a `created_at` timestamp, so the calendar branch is
 * currently unused — but it is one date-only caller away from being the same bug, and
 * costs nothing to be right about now.
 */
export function formatDateMonthYear(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return '';
  const resolved = toParts(dateStr);
  if (!resolved) return echo(dateStr);
  return `${MONTHS_LONG[resolved.parts.month]} ${resolved.parts.year}`;
}

/**
 * TMDB release dates: `YYYY-MM-DD`, or a bare `YYYY` when the exact day is unknown.
 *
 * Previously built `Date.UTC(...)` and rendered with `timeZone: 'UTC'` — correct in
 * intent, but resting on Hermes honouring that option. Same output, no assumption.
 */
export function formatTMDBDate(dateStr: string | undefined | null, format: 'short' | 'long' = 'short'): string | undefined {
  if (!dateStr) return undefined;
  const calendar = parseCalendarDate(dateStr);
  if (calendar) return renderParts(calendar, format);
  // TMDB returns a bare year when it doesn't know the day.
  if (/^\d{4}$/.test(dateStr)) return dateStr;
  return dateStr;
}

/**
 * The day a filing was filed, in the paper's own hand.
 * ─────────────────────────────────────────────────────────────────────────────
 * `WEDNESDAY, AUGUST 28` — the divider that gives an endless feed a shape, and
 * the line the running head prints beside the issue number.
 *
 * ── WHY NOT toLocaleDateString ──────────────────────────────────────────────
 * The app uses no `Intl`: Hermes on the phone ships no polyfill, so its answer
 * is whatever the engine chooses, while every test in Node gets the right one.
 * Every date is built from the app's own tables, as `timeAgo.ts` does. Those
 * carry short weekdays (`Wed`); the paper sets full caps and full weekdays, so
 * the long forms live here, beside the app's.
 *
 * ── THE DEVICE'S CLOCK, NOT UTC ─────────────────────────────────────────────
 * A filing made at 11pm belongs to the day the member made it, where they made
 * it: `new Date(iso)` gives the device's local time.
 */
/** Exported for the writing room, which names the day a draft was last written. */
export const WEEKDAYS = [
  'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY',
] as const;

/** Exported for the Lobby's honour, which names the day a piece hung ("30 SEPTEMBER"). */
export const MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
] as const;

/** `2026-08-28` — the key two filings share when they were filed on one day. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `WEDNESDAY, AUGUST 28`. Empty for a date that cannot be read, never `Invalid Date`. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * `2026-08` — the key two filings share when they were filed in one month.
 *
 * A member's room is not a feed. It runs back through everything they have ever
 * filed, so a DAY divider would print `MONDAY, MARCH 3` in 2025 and again in
 * 2026 with nothing to tell them apart — the feed never notices this because
 * nobody scrolls it that far, and a room is read that way on purpose.
 */
export function monthKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** `AUGUST 2026` — the divider a room is indexed by, year and all. */
export function monthLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * `28`, for the margin of a room: a full date cannot fit its 38pt, and under a
 * month divider a bare day is complete. Empty for an unreadable date (the
 * caller prints the margin's dash), never `NaN`.
 */
export function dayOfMonth(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return String(d.getDate());
}

/**
 * `21:40`, what the margin prints under LATEST. Always 24-hour: the margin has
 * 38pt of room, `21:40` is 27.4pt and `10:40 PM` 43.8, at normal text size.
 */
export function hourLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

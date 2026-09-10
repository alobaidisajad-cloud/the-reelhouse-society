/**
 * The day a filing was filed, in the paper's own hand.
 * ─────────────────────────────────────────────────────────────────────────────
 * `WEDNESDAY, AUGUST 28` — the divider that gives an endless feed a shape, and
 * the line the running head prints beside the issue number.
 *
 * ── WHY THIS EXISTS RATHER THAN A ONE-LINE toLocaleDateString ───────────────
 * `Intl` is not in Hermes and this app ships no polyfill, so every date the app
 * formats is built from its own tables — `timeAgo.ts` has done it that way from
 * the start. A `toLocaleDateString('en-US', { weekday: 'long' })` here would
 * throw on device and work perfectly in every test, which is the worst possible
 * combination.
 *
 * The app's own tables carry SHORT weekdays (`Wed`) and title-case months. The
 * paper sets its dividers in full caps and full weekdays, so the long forms live
 * here — beside the app's, not instead of them.
 *
 * ── AND WHY THE DEVICE'S CLOCK, NOT UTC ────────────────────────────────────
 * A filing made at 11pm belongs to the day the member made it, in the room they
 * made it in. `new Date(iso)` gives local time on the device, and the divider is
 * a human's idea of a day rather than an astronomer's.
 */
/**
 * Exported because the writing room names the day a draft was last written, and
 * a second copy of seven strings is a second thing to keep in step. `Intl` is
 * not an option — see the note above.
 */
export const WEEKDAYS = [
  'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY',
] as const;

const MONTHS = [
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
 * `28` — the day of the month, for the margin of a room.
 *
 * The margin is 44pt and never scales, so it holds about six fixed characters.
 * A full date does not fit and a date with a year fits even less; under a month
 * divider a bare day is complete, which is how an archive index has always been
 * set. Empty rather than `NaN` for a date that cannot be read — the margin
 * prints a dash for that, as it does for every other missing ordering value.
 */
export function dayOfMonth(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return String(d.getDate());
}

/** `21:40` — the ordering value the margin prints under LATEST. */
export function hourLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

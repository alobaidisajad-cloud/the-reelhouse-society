/**
 * logRecord.ts — how a record states its own facts.
 *
 * Small rules that were being answered differently in different corners of
 * the same page, which is how a page stops reading as one document.
 */
import { dateParts, formatDate } from '@/src/utils/timeAgo';

/* ── WHY THERE IS NO DATE FORMATTER HERE ──────────────────────────────────────
 *
 * There is no date formatter in this file. Use `formatDate` from
 * `@/src/utils/timeAgo`, which already prints AUG 5, 2026 and is the only
 * implementation allowed to answer "which day is this?".
 *
 * A `formatFiledDate` briefly lived here and was wrong in two ways at once:
 *
 *  1. It went through `new Date(...).toLocaleDateString('en-US', { timeZone:
 *     'UTC', … })`. This app runs on Hermes with no Intl polyfill, so whether
 *     that `timeZone` option is honoured cannot be verified without a device —
 *     and `new Date("2026-08-05")` is midnight UTC by definition, so if it is
 *     ignored the whole of the Americas reads AUG 4. `timeAgo.ts` formats from
 *     a month table for exactly this reason.
 *  2. It forced UTC onto BOTH kinds of date. `watched_date` is a calendar day
 *     and must render as the day it says; every `created_at` is an instant and
 *     must render on the READER's clock. Putting one shape on both is how a
 *     critique filed at 8pm in Los Angeles got dated tomorrow.
 *
 * `formatDate` distinguishes them. This note is here so the shortcut is not
 * reinvented the next time two dates on one screen look different.
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Whether a physical format is a fact worth printing.
 *
 * `None` is a selectable option in the composer (PHYSICAL_OPTIONS[0]) and is
 * stored as that literal string. It is truthy, so a record used to announce
 * `FORMAT: NONE` — a field reporting its own absence. The save path drops it,
 * but the offline mapping did not, so the same log said different things
 * depending on where it was read from.
 *
 * Matched case-insensitively and with the empty string, because legacy rows and
 * the web client are not obliged to agree on casing.
 */
export function hasPhysicalFormat(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v !== '' && v !== 'none';
}

export interface FilingMarkEntry {
  key: 'date' | 'with' | 'format';
  value: string;
  accent?: boolean;
}

/**
 * What the filing mark actually has to say.
 *
 * A pure function rather than logic inside the hero, because the interesting
 * cases are the empty ones — a log with no date, an unparseable date, a format
 * of 'None' — and an empty caption in a ruled band is exactly the kind of
 * defect that renders fine and reads wrong. An entry is included only when it
 * has a printable value, so the band is either facts or nothing at all.
 */
export function buildFilingMark(log: {
  watched_date?: string | null;
  watched_with?: string | null;
  physical_media?: string | null;
}): FilingMarkEntry[] {
  const out: FilingMarkEntry[] = [];

  // `dateParts` decides whether this is a date at all; `formatDate` renders it.
  // Both are needed because formatDate ECHOES what it cannot parse, and an
  // echoed "whenever" in a ruled band is worse than no band.
  if (dateParts(log.watched_date)) {
    out.push({ key: 'date', value: formatDate(log.watched_date) });
  }

  const withWhom = log.watched_with?.trim();
  if (withWhom) out.push({ key: 'with', value: `WITH ${withWhom.toUpperCase()}`, accent: true });

  if (hasPhysicalFormat(log.physical_media)) {
    out.push({ key: 'format', value: log.physical_media!.trim().toUpperCase() });
  }

  return out;
}

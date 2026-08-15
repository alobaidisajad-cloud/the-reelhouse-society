/**
 * logRecord.ts — how a record states its own facts.
 *
 * Two small rules that were being answered differently in different corners of
 * the same page, which is how a page stops reading as one document.
 */

/**
 * A date as the archive writes it: AUG 5, 2026.
 *
 * The hero already spoke this way; the critiques list did not — it called bare
 * `toLocaleDateString()` and printed the device's short form, so `8/5/2026`
 * sat directly beneath `AUG 5, 2026` on the same screen. Three date shapes on
 * one page is two too many.
 *
 * UTC is deliberate and unchanged from the shipped behaviour: a watched-date is
 * a calendar day, not an instant, and reading it in the device's zone would
 * shift it a day either side of midnight.
 */
export function formatFiledDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d
    .toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase();
}

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

  const date = formatFiledDate(log.watched_date);
  if (date) out.push({ key: 'date', value: date });

  const withWhom = log.watched_with?.trim();
  if (withWhom) out.push({ key: 'with', value: `WITH ${withWhom.toUpperCase()}`, accent: true });

  if (hasPhysicalFormat(log.physical_media)) {
    out.push({ key: 'format', value: log.physical_media!.trim().toUpperCase() });
  }

  return out;
}

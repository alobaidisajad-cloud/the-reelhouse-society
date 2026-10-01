/**
 * deviceRegion — the member's country as the phone states it: ISO 3166-1
 * alpha-2 ("GB"), or null when it does not say one.
 *
 * Whose streaming services and whose age rating a film page shows. Null is an
 * answer: a caller that falls back to another country's list must say which
 * country it is showing, never pass it off as the member's own.
 */
let known: string | null | undefined;

/** The region subtag of a BCP 47 locale ("zh-Hans-CN" → "CN"), or null. */
export function regionOf(locale: string): string | null {
  const parts = locale.split(/[-_]/);
  for (let i = 1; i < parts.length; i++) {
    // A single letter opens an extension ("-u-nu-latn"); the region comes before it.
    if (parts[i].length === 1) break;
    if (/^[A-Za-z]{2}$/.test(parts[i])) return parts[i].toUpperCase();
  }
  return null;
}

export function deviceRegion(): string | null {
  if (known !== undefined) return known;
  try {
    // Not a date: only the locale's region is read. Where Hermes has no Intl
    // this throws, and the region is unknown.
    // eslint-disable-next-line no-restricted-syntax
    known = regionOf(Intl.DateTimeFormat().resolvedOptions().locale || '');
  } catch {
    known = null;
  }
  return known;
}

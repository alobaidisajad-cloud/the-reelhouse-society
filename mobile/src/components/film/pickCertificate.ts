/**
 * pickCertificate — whose age rating is yours?
 *
 * TMDB returns a certificate PER REGION, and a film page that prints one
 * without saying which country it belongs to is quietly telling a member in
 * Manchester that an American rating applies to them. So the region travels
 * with the value, always.
 *
 * The order is deliberate:
 *   1. the member's own region, if the device tells us one
 *   2. the film's own country of origin — the rating its makers were given
 *   3. GB, then US, as the two the app's copy is written for
 *   4. anything at all, rather than nothing
 *
 * This used to live in a whole section of its own — a rail of international
 * release dates — which is a lot of page for one fact most members want once.
 */

export interface ReleaseDateEntry {
  iso_3166_1?: string;
  release_dates?: { certification?: string | null }[];
}

export interface ReleaseDates {
  results?: ReleaseDateEntry[];
}

export interface PickedCertificate {
  value: string;
  region: string;
}

/** The first non-empty certificate a region offers. */
function certificateFor(entry: ReleaseDateEntry | undefined): string | null {
  for (const r of entry?.release_dates ?? []) {
    const c = (r?.certification ?? '').trim();
    if (c) return c;
  }
  return null;
}

export function pickCertificate(
  releaseDates: ReleaseDates | null | undefined,
  originCountry?: string | null,
  deviceRegion?: string | null,
): PickedCertificate | null {
  const results = releaseDates?.results;
  if (!Array.isArray(results) || results.length === 0) return null;

  const byRegion = new Map<string, string>();
  for (const entry of results) {
    const region = (entry?.iso_3166_1 ?? '').toUpperCase();
    if (!region) continue;
    const value = certificateFor(entry);
    // A region present but blank is not a candidate — several always are.
    if (value && !byRegion.has(region)) byRegion.set(region, value);
  }
  if (byRegion.size === 0) return null;

  const preferences = [
    (deviceRegion ?? '').toUpperCase(),
    (originCountry ?? '').toUpperCase(),
    'GB',
    'US',
  ].filter(Boolean);

  for (const region of preferences) {
    const value = byRegion.get(region);
    if (value) return { value, region };
  }

  // Deterministic rather than "whatever TMDB happened to order first", so the
  // same film never shows two different certificates on two runs.
  const [region, value] = [...byRegion.entries()].sort(([a], [b]) => a.localeCompare(b))[0];
  return { value, region };
}

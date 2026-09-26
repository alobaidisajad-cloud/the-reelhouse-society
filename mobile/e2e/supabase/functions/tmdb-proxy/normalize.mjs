/**
 * One spelling for a TMDB request, so a recorded answer is found again.
 *
 * The apps send { path: "/search/multi?query=The%20Godfather&page=1&include_adult=false" }.
 * The same request can be spelled with its query in any order, or with
 * `%20` or `+`; this resolves the path the way the real proxy does (against
 * /3, so `..` is settled) and sorts the query. Shared by the E2E stand-in
 * (Deno) and the recorder (Node), so both name a request the same way.
 */
export function normalizeTmdbPath(callerPath) {
  if (typeof callerPath !== 'string' || !callerPath.startsWith('/')) return null;
  let url;
  try {
    url = new URL(`/3${callerPath}`, 'https://api.themoviedb.org');
  } catch {
    return null;
  }
  const params = [...url.searchParams.entries()]
    .filter(([k]) => k !== 'api_key')
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
  const query = new URLSearchParams(params).toString();
  return url.pathname.replace(/^\/3/, '') + (query ? `?${query}` : '');
}

/** The fixture file for a normalised path: readable, and safe on every filesystem. */
export function fixtureName(normalized) {
  const readable = normalized.replace(/^\//, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
  let h = 2166136261;
  for (let i = 0; i < normalized.length; i++) h = Math.imul(h ^ normalized.charCodeAt(i), 16777619) >>> 0;
  return `${readable}.${h.toString(16).padStart(8, '0')}.json`;
}

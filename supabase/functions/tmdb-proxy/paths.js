/**
 * The TMDB paths this proxy will fetch — the ones the apps ask for, and no others.
 *
 * The proxy spends a key only it knows. Without this list it would fetch any
 * TMDB v3 path for anyone holding the public anon key, and `..` in a path
 * climbs out of /3 altogether. So the check is made on the path AFTER the URL
 * has resolved it, never on the text the caller sent.
 *
 * Kept as plain JavaScript with no imports so the mobile Jest suite can load
 * it: tmdbProxyAllowsEveryPath.test.ts asks it about every path the mobile
 * app, the web app and the web importer build, and fails when a client asks
 * for one this list would refuse.
 */

const ID = '\\d+';

/** Path patterns under /3, matched against the whole resolved path. */
export const ALLOWED_PATHS = [
  `/movie/${ID}`,
  `/movie/${ID}/(similar|watch/providers|release_dates|credits|images)`,
  '/movie/(top_rated|now_playing|upcoming)',
  `/person/${ID}`,
  `/person/${ID}/movie_credits`,
  '/search/(multi|movie|keyword|company)',
  '/discover/movie',
  '/trending/movie/(day|week)',
].map((p) => new RegExp(`^/3${p}$`));

const TMDB_ORIGIN = 'https://api.themoviedb.org';

/**
 * The URL to fetch for a caller's path ("/movie/550?append_to_response=credits"),
 * or null when the proxy must refuse it. The caller's own api_key, if it sent
 * one, is dropped: the proxy's key is added by the caller of this function.
 */
export function resolveTmdbUrl(callerPath) {
  if (typeof callerPath !== 'string' || !callerPath.startsWith('/')) return null;
  // Always a path on TMDB's origin: "/3…" resolves against it and cannot name another host.
  let url;
  try {
    url = new URL(`/3${callerPath}`, TMDB_ORIGIN);
  } catch {
    return null;
  }
  if (!ALLOWED_PATHS.some((re) => re.test(url.pathname))) return null;
  url.searchParams.delete('api_key');
  url.hash = '';
  return url;
}

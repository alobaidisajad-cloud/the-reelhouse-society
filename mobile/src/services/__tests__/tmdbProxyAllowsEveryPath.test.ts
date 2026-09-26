/**
 * The TMDB proxy fetches only the paths the apps use — and every one they use.
 * ─────────────────────────────────────────────────────────────────────────────
 * supabase/functions/tmdb-proxy/paths.js is the list. Too loose, and anyone
 * holding the anon key (it ships in the app) can spend the proxy's TMDB key on
 * any endpoint. Too tight, and a screen quietly shows nothing: the clients
 * treat a refusal like an empty answer.
 *
 * So every path the three callers build — the mobile app, the web app, and the
 * web's Letterboxd importer — is taken from their source and asked of the list.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ALLOWED_PATHS, resolveTmdbUrl } from '../../../../supabase/functions/tmdb-proxy/paths.js';

const REPO = join(__dirname, '..', '..', '..', '..');
const CALLERS = ['mobile/src/lib/tmdb.ts', 'src/tmdb.ts', 'src/utils/archiveImport.ts'];

/**
 * Every string or template literal in a file that is a TMDB path it requests —
 * not one it only tests a path against (`path.includes('/search/')`).
 */
const pathsIn = (src: string) =>
  [...src.matchAll(/[`'](\/(?:movie|search|discover|trending|person|tv|genre|collection|configuration|find|account|list|keyword|company|review|network)\b[^`'\s]*)[`']/g)]
    .filter((m) => !/\.(?:includes|startsWith|endsWith)\(\s*$/.test(src.slice(Math.max(0, m.index! - 14), m.index)))
    .map((m) => m[1]);

/** A template's `${…}` filled with a value of the kind that goes there. */
const fill = (template: string) =>
  template.replace(/(\/?)\$\{([^}]*)\}/g, (_m, slash: string, expr: string) => {
    if (/timeWindow/.test(expr)) return `${slash}week`;
    if (slash) return `${slash}550`; // an id in a path segment
    if (/yearParam/.test(expr)) return '&year=1994';
    return 'x';
  });

describe.each(CALLERS)('%s', (file) => {
  const found = pathsIn(readFileSync(join(REPO, file), 'utf8'));

  it('builds paths — the scan is not passing on nothing', () => {
    expect(found.length).toBeGreaterThan(file.includes('archiveImport') ? 0 : 8);
  });

  it('asks only for paths the proxy will fetch', () => {
    const refused = found.filter((t) => !resolveTmdbUrl(fill(t))).map((t) => `${t}  →  ${fill(t)}`);
    expect(refused).toEqual([]);
  });
});

describe('the proxy refuses what no app asks for', () => {
  it.each([
    '/account',
    '/authentication/token/new',
    '/movie/550/account_states',
    '/tv/1399',
    '/movie/550/../../account', // climbs out of /movie
    '/../4/list/1', // climbs out of /3 altogether
    '/movie/%2e%2e/%2e%2e/account', // the same climb, percent-encoded
    '/movie/550\\..\\..\\account', // backslashes count as slashes in a URL
    '//evil.example/3/movie/550', // a second slash cannot change the host
    'movie/550', // not a path
    '',
  ])('%s', (path) => {
    expect(resolveTmdbUrl(path)).toBeNull();
  });

  it('drops a caller-sent api_key, keeps the rest of the query, and stays on api.themoviedb.org/3', () => {
    const url = resolveTmdbUrl('/movie/550?append_to_response=credits&api_key=stolen')!;
    expect(url.origin).toBe('https://api.themoviedb.org');
    expect(url.pathname).toBe('/3/movie/550');
    expect(url.searchParams.get('api_key')).toBeNull();
    expect(url.searchParams.get('append_to_response')).toBe('credits');
  });

  it('every rule is anchored at both ends, under /3', () => {
    // A RegExp's source escapes its slashes: ^\/3\/movie…
    const loose = ALLOWED_PATHS.filter((re: RegExp) => !re.source.split('\\/').join('/').startsWith('^/3/') || !re.source.endsWith('$'));
    expect(loose).toEqual([]);
    expect(ALLOWED_PATHS.length).toBeGreaterThan(5);
  });
});

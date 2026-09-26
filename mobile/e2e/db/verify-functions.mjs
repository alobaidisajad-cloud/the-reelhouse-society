#!/usr/bin/env node
/**
 * verify-functions.mjs — the local functions answer the way the app needs.
 *
 *   · tmdb-proxy (the stand-in) answers a recorded path from its recording,
 *     answers an unrecorded one as TMDB answers "nothing", and refuses a
 *     path production refuses to parse
 *   · sign-in-with-username (production's own code) signs the seeded member
 *     in by username, and refuses a wrong password
 *
 * Needs API_URL and ANON_KEY (from `supabase status -o env`) and the seeded
 * member's E2E_MEMBER_USERNAME / E2E_MEMBER_PASSWORD.
 */
const API = process.env.API_URL;
const ANON = process.env.ANON_KEY;
const USER = process.env.E2E_MEMBER_USERNAME;
const PASS = process.env.E2E_MEMBER_PASSWORD;
if (!API || !ANON || !USER || !PASS) {
  console.error('API_URL, ANON_KEY, E2E_MEMBER_USERNAME and E2E_MEMBER_PASSWORD are needed.');
  process.exit(2);
}

let bad = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
  if (!ok) { bad++; console.log(`::error title=E2E functions::${what} ${detail}`); }
};
const post = async (fn, body) => {
  const res = await fetch(`${API}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json };
};

const hit = await post('tmdb-proxy', { path: '/trending/movie/week' });
check(hit.status === 200 && Array.isArray(hit.json?.results) && hit.json.results.length > 0,
  'tmdb-proxy answers a recorded path from its recording', `HTTP ${hit.status}, ${hit.json?.results?.length ?? 0} results`);

const film = await post('tmdb-proxy', { path: '/movie/238?append_to_response=credits,videos,recommendations,similar,watch/providers,release_dates' });
check(film.status === 200 && film.json?.id === 238,
  'tmdb-proxy finds a recording whatever order or spelling the query arrives in', `HTTP ${film.status}, id ${film.json?.id}`);

const miss = await post('tmdb-proxy', { path: '/search/multi?query=e2e-never-recorded&page=1&include_adult=false' });
check(miss.status === 200 && Array.isArray(miss.json?.results) && miss.json.results.length === 0,
  'tmdb-proxy answers an unrecorded search with an empty list', `HTTP ${miss.status}`);

const missFilm = await post('tmdb-proxy', { path: '/movie/999999999' });
check(missFilm.status === 404, 'tmdb-proxy answers an unrecorded film with a 404, as TMDB does', `HTTP ${missFilm.status}`);

const junk = await post('tmdb-proxy', { path: 'not-a-path' });
check(junk.status === 403, 'tmdb-proxy refuses what is not a path', `HTTP ${junk.status}`);

const signIn = await post('sign-in-with-username', { username: USER, password: PASS });
check(signIn.status === 200 && !!(signIn.json?.access_token || signIn.json?.session?.access_token),
  'sign-in-with-username signs the member in by username', `HTTP ${signIn.status}`);

const wrong = await post('sign-in-with-username', { username: USER, password: `${PASS}-wrong` });
check(wrong.status === 401, 'sign-in-with-username refuses a wrong password', `HTTP ${wrong.status}`);

process.exit(bad ? 1 : 0);

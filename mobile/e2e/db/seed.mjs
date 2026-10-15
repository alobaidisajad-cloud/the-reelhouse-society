#!/usr/bin/env node
/**
 * seed.mjs — the people who live in the sealed E2E world.
 *
 * Made through the local auth server's admin API, exactly as a sign-up would
 * make them, so production's own trigger (on_auth_user_created) makes each
 * profile — the seed never makes a profile row itself (it only dates one back,
 * below). Then each one is proved: signs in with the password, and reads its own
 * profile through RLS.
 *
 * Passwords are made fresh for every run and handed to the flows through
 * $GITHUB_ENV (masked in the log). The addresses use the reserved .test
 * domain, which can never be a real inbox; check:backend refuses any account
 * at it in production.
 *
 * Needs API_URL and SERVICE_ROLE_KEY / ANON_KEY from `supabase status -o env`.
 */
import { appendFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';

const API = process.env.API_URL;
const SERVICE = process.env.SERVICE_ROLE_KEY;
const ANON = process.env.ANON_KEY;
if (!API || !SERVICE || !ANON) {
  console.error('API_URL, SERVICE_ROLE_KEY and ANON_KEY are needed (from `supabase status -o env`).');
  process.exit(2);
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
  console.error(`Refusing to seed ${API}: the seed only ever runs against a local stack.`);
  process.exit(2);
}

/** The E2E domain. Reserved by RFC 2606 — no real person can ever own an address here. */
export const E2E_DOMAIN = 'e2e.test';

const PEOPLE = [
  // A member with no rank: the ordinary path through the app. Able to file.
  { env: 'E2E_MEMBER', username: 'e2e_member', files: true },
];

/**
 * The seeded member's five films, from the recorded TMDB answers (e2e/tmdb). None
 * is a film a flow logs or names (The Godfather and its sequel, Blade Runner, The
 * Matrix, Casablanca): a flow's film must be new to the member, and verify-writes
 * matches the flows' films by title.
 */
const SEED_FILMS = [
  { id: 278, title: 'The Shawshank Redemption', year: '1994', poster: '/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg', review: 'E2E seed: hope is a good thing.' },
  { id: 389, title: '12 Angry Men', year: '1957', poster: '/zhG3vKWyDRaZYoaww1UVAi29T9h.jpg', review: 'E2E seed: one room, twelve minds.' },
  { id: 424, title: "Schindler's List", year: '1993', poster: '/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg', review: 'E2E seed: the list is life.' },
  { id: 155, title: 'The Dark Knight', year: '2008', poster: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg', review: 'E2E seed: why so serious.' },
  { id: 129, title: 'Spirited Away', year: '2001', poster: '/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg', review: 'E2E seed: a name is never forgotten.' },
];
/** The member's one take: a Dispatch filing, not a ballot or an essay. */
const SEED_TAKE = 'E2E seed: the first take on the wire, filed the way any member files one.';
const SEED_STACK = 'E2E seed stack';

/**
 * A seed step that did not hold: said, then thrown, and the run ends with exit 1
 * (below). Not process.exit(): exiting with a request's socket still open
 * crashes Node on Windows (0xC0000409), and the run never sees exit 1.
 */
class SeedFailed extends Error {}
const fail = (who, detail) => {
  console.log(`::error title=E2E seed — ${who}::${detail}`);
  throw new SeedFailed(detail);
};
const call = async (path, { key, token, ...init } = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${token ?? key}`, ...init.headers },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};

try {
  for (const p of PEOPLE) await seedPerson(p);
} catch (e) {
  if (!(e instanceof SeedFailed)) throw e;
  process.exitCode = 1;
}

async function seedPerson(p) {
  const email = `${p.username}@${E2E_DOMAIN}`;
  const password = randomBytes(18).toString('base64url');

  const made = await call('/auth/v1/admin/users', {
    key: SERVICE, method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { username: p.username } }),
  });
  if (made.status !== 200) fail(p.username, `could not be made: HTTP ${made.status} ${JSON.stringify(made.body).slice(0, 200)}`);

  const session = await call('/auth/v1/token?grant_type=password', { key: ANON, method: 'POST', body: JSON.stringify({ email, password }) });
  if (session.status !== 200 || !session.body.access_token) fail(p.username, `cannot sign in: HTTP ${session.status}`);

  const profile = await call(`/rest/v1/profiles?id=eq.${made.body.id}&select=username`, { key: ANON, token: session.body.access_token });
  if (profile.status !== 200 || profile.body?.[0]?.username !== p.username) {
    fail(p.username, `the profile trigger did not give them a readable profile: HTTP ${profile.status} ${JSON.stringify(profile.body).slice(0, 200)}`);
  }

  if (p.files) await becomeAbleToFile(p.username, made.body.id, session.body.access_token);

  if (process.env.GITHUB_ENV) {
    console.log(`::add-mask::${password}`);
    appendFileSync(process.env.GITHUB_ENV, `${p.env}_EMAIL=${email}\n${p.env}_PASSWORD=${password}\n${p.env}_USERNAME=${p.username}\n`);
  }
  console.log(`✓ ${p.username}: made, signs in, reads their own profile${p.files ? ', files, and is read back' : ''}`);
}

/**
 * The member becomes able to file the way a real one does, and leaves on each
 * tab what a flow asks for there (.maestro: the Dispatch's filing, the Reel's
 * log and stack). The filing's door (public.may_file(), the posts_door policy)
 * lets in only an account at least 2 days old with 5 distinct films logged.
 *
 * Only the age is set-up, by the service role, on the profile the trigger made:
 * nothing else can make a new account old. Everything after is the member's own
 * act through the API, as the app does it, with RLS on: 5 films logged, one take
 * filed, one stack made. Each is read back, so a door that refuses fails here,
 * by name, and never as a Dispatch flow that found nothing.
 */
async function becomeAbleToFile(username, id, token) {
  const as = { key: ANON, token };
  const said = (r) => `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`;

  // Two days and a minute back: the door's "at least two days" holds from the start.
  const born = new Date(Date.now() - (2 * 86400 + 60) * 1000).toISOString();
  const aged = await call(`/rest/v1/profiles?id=eq.${id}&select=created_at`, {
    key: SERVICE, method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ created_at: born }),
  });
  if (aged.status !== 200 || Date.parse(aged.body?.[0]?.created_at) > Date.now() - 2 * 86400 * 1000) {
    fail(username, `their profile could not be dated two days back: ${said(aged)}`);
  }

  for (const f of SEED_FILMS) {
    const logged = await call('/rest/v1/logs', {
      ...as, method: 'POST',
      body: JSON.stringify({
        user_id: id, film_id: f.id, film_title: f.title, poster_path: f.poster, year: f.year,
        rating: 4, review: f.review, status: 'watched', watched_date: new Date().toISOString().slice(0, 10),
      }),
    });
    if (logged.status !== 201) fail(username, `could not log ${f.title} as themself: ${said(logged)}`);
  }
  const logs = await call(`/rest/v1/logs?user_id=eq.${id}&select=film_id`, as);
  const films = new Set((Array.isArray(logs.body) ? logs.body : []).map((l) => l.film_id));
  if (logs.status !== 200 || films.size !== SEED_FILMS.length) {
    fail(username, `${SEED_FILMS.length} films logged, ${films.size} read back: ${said(logs)}`);
  }

  // The door, as the app asks it: the member's own numbers, and its answer.
  const door = await call('/rest/v1/rpc/dispatch_door', { ...as, method: 'POST', body: '{}' });
  const d = Array.isArray(door.body) ? door.body[0] : door.body;
  if (door.status !== 200 || d?.may_file !== true) {
    fail(username, `the filing's door (may_file) refuses them: films ${d?.films}/${d?.films_needed}, days ${d?.days}/${d?.days_needed} — ${said(door)}`);
  }

  const filed = await call('/rest/v1/dispatch_posts?select=id', {
    ...as, method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ kind: 'take', user_id: id, author_username: '', body: SEED_TAKE }),
  });
  const filingId = filed.body?.[0]?.id;
  if (filed.status !== 201 || !filingId) fail(username, `the filing's door refused their take: ${said(filed)}`);
  // Read back as a guest too: error_recovery opens the Dispatch signed out.
  for (const [who, key] of [['the member', as], ['a guest', { key: ANON }]]) {
    const read = await call(`/rest/v1/dispatch_posts?id=eq.${filingId}&select=kind,body,is_published`, key);
    if (read.status !== 200 || read.body?.[0]?.kind !== 'take' || read.body[0].is_published !== true) {
      fail(username, `their take is not read back by ${who}: ${said(read)}`);
    }
  }

  // A stack and its film in one call, as the app saves one (save_stack).
  const stackId = randomUUID();
  const made = await call('/rest/v1/rpc/save_stack', {
    ...as, method: 'POST',
    body: JSON.stringify({
      p_id: stackId, p_title: SEED_STACK, p_description: '', p_is_private: false, p_is_ranked: false, p_create: true,
      p_films: [{ film_id: SEED_FILMS[0].id, film_title: SEED_FILMS[0].title, poster_path: SEED_FILMS[0].poster, rank_position: 0 }],
    }),
  });
  if (made.status !== 200 || made.body?.id !== stackId) fail(username, `could not make a stack: ${said(made)}`);

  // What the Reel reads, through the same calls the app makes.
  const reel = await call('/rest/v1/rpc/get_community_feed_auth_cursor', { ...as, method: 'POST', body: JSON.stringify({ p_limit: 40 }) });
  if (reel.status !== 200 || !(Array.isArray(reel.body) && reel.body.some((l) => l.user_id === id))) {
    fail(username, `the Reel does not read back their logs: ${said(reel)}`);
  }
  const stacks = await call('/rest/v1/rpc/get_filtered_stacks_auth_cursor_v2', {
    ...as, method: 'POST', body: JSON.stringify({ p_search: '', p_filter_following: false, p_limit: 60 }),
  });
  if (stacks.status !== 200 || !(Array.isArray(stacks.body) && stacks.body.some((s) => s.id === stackId))) {
    fail(username, `the Reel's stacks do not read back their stack: ${said(stacks)}`);
  }
}

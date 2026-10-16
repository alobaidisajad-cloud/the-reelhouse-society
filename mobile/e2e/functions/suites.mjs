#!/usr/bin/env node
/**
 * suites.mjs — every deployed edge function, asked as its callers ask it.
 *
 * Run in the functions world (place.mjs, stand-ins.mjs; db-integration.yml job
 * "functions"): production's own code for each function, on production's shape
 * with every pending migration, its outside services answered by the stand-ins.
 * For each function: the call that must work, and what it must leave behind;
 * each refusal; a wrong secret or token; what an outside service failing must
 * turn into. Every request a function sent out is read back from the stand-ins,
 * and one to anywhere they do not stand in for fails the run.
 *
 * Needs API_URL, ANON_KEY, SERVICE_ROLE_KEY (`supabase status -o env`), the
 * FN_* secrets place.mjs wrote, psql, and the stand-ins on 127.0.0.1:54990.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';

const API = process.env.API_URL;
const ANON = process.env.ANON_KEY;
const SERVICE = process.env.SERVICE_ROLE_KEY;
const DB = process.env.FN_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const STAND = process.env.STAND_INS_URL ?? 'http://127.0.0.1:54990';
/** The API gateway as the database's container reaches it (pg_net calls from there). */
const GATEWAY_FROM_DB = process.env.FN_GATEWAY_FROM_DB ?? 'http://supabase_kong_reelhouse-e2e:8000';
const SECRET = {
  shared: process.env.FN_FUNCTION_SHARED_SECRET,
  webhook: process.env.FN_REVENUECAT_WEBHOOK_SECRET,
  store: process.env.FN_REVENUECAT_SECRET_KEY,
  tmdb: process.env.FN_TMDB_API_KEY,
};
if (!API || !ANON || !SERVICE || Object.values(SECRET).some((v) => !v)) {
  console.error('API_URL, ANON_KEY, SERVICE_ROLE_KEY and the FN_* secrets (place.mjs) are needed.');
  process.exit(2);
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
  console.error(`Refusing to run against ${API}: the functions world is local only.`);
  process.exit(2);
}

// ── the means ────────────────────────────────────────────────────────────────

let bad = 0;
let good = 0;
const check = (ok, what, detail = '') => {
  if (ok) { good++; console.log(`✓ ${what}`); return; }
  bad++;
  console.log(`✗ ${what}${detail ? ` — ${detail}` : ''}`);
  console.log(`::error title=Functions world::${what}${detail ? ` — ${detail}` : ''}`);
};
const section = (name) => console.log(`\n── ${name} ──`);

/** One statement as the house (postgres), its rows as text. */
const sql = (text) => {
  const r = spawnSync('psql', [DB, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', text], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`psql: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.replace(/\r/g, '').trim();
};
const literal = (v) => `'${String(v).replace(/'/g, "''")}'`;

/** A call to a function. `auth` is the bearer (null: none at all); the anon key is the apikey unless `apikey` is null. */
const fn = async (name, { body, method = 'POST', auth = ANON, apikey = ANON, headers = {}, raw } = {}) => {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (apikey) h.apikey = apikey;
  if (auth) h.Authorization = `Bearer ${auth}`;
  const began = Date.now();
  const res = await fetch(`${API}/functions/v1/${name}`, {
    method, headers: h, body: method === 'GET' ? undefined : (raw ?? JSON.stringify(body ?? {})),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: Object.fromEntries(res.headers), ms: Date.now() - began };
};
const said = (r) => `HTTP ${r.status} ${r.text.slice(0, 200)}`;

const standIns = async (path, body) => {
  const res = await fetch(`${STAND}${path}`, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
  return res.json();
};
/** Every request the stand-ins took since the last reset, kept for the final count, and forgotten there. */
const everything = [];
const drain = async () => {
  const seen = await standIns('/__seen');
  everything.push(...seen);
  await standIns('/__reset', {});
  return seen;
};
const scriptStandIns = (s) => standIns('/__script', s);

/** A member, made as a sign-up makes one, signed in. */
const member = async (username) => {
  const email = `${username}@e2e.test`;
  const password = randomBytes(18).toString('base64url');
  const made = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { username } }),
  });
  const user = await made.json();
  if (made.status !== 200) throw new Error(`${username} could not be made: HTTP ${made.status} ${JSON.stringify(user).slice(0, 200)}`);
  const signed = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify({ email, password }),
  });
  const session = await signed.json();
  if (!session.access_token) throw new Error(`${username} cannot sign in: HTTP ${signed.status}`);
  return { id: user.id, username, email, password, token: session.access_token };
};

const AHEAD = new Date(Date.now() + 30 * 86400_000).toISOString();
const tierOf = (id) => sql(`SELECT tier FROM public.profiles WHERE id = ${literal(id)}`);

// ── the run ──────────────────────────────────────────────────────────────────

await drain();
const one = await member('fn_member_one');
const two = await member('fn_member_two');
const three = await member('fn_member_three');
const four = await member('fn_member_four');

section('tmdb-proxy — the apps\' only road to TMDB, its key never handed back');
{
  const film = await fn('tmdb-proxy', { body: { path: '/movie/603?append_to_response=credits' } });
  let seen = await drain();
  check(film.status === 200 && film.json?.id === 603, 'an allowed path is fetched and answered', said(film));
  check(seen.length === 1 && seen[0].path === '/3/movie/603' && seen[0].query.api_key === SECRET.tmdb && seen[0].query.append_to_response === 'credits',
    'TMDB is asked that path, with the proxy\'s key and the caller\'s query', JSON.stringify(seen.map((r) => [r.path, Object.keys(r.query)])));
  check(!film.text.includes(SECRET.tmdb) && !Object.values(film.headers).some((v) => v.includes(SECRET.tmdb)),
    'the key is in neither the answer nor its headers');

  const again = await fn('tmdb-proxy', { body: { path: '/movie/603?append_to_response=credits' } });
  seen = await drain();
  check(again.status === 200 && again.headers['x-cache'] === 'HIT' && seen.length === 0, 'the same path again is answered from the cache, TMDB not asked', said(again));

  const theirs = await fn('tmdb-proxy', { body: { path: '/movie/604?api_key=the-callers-own' } });
  seen = await drain();
  check(theirs.status === 200 && seen[0]?.query.api_key === SECRET.tmdb, 'a key the caller sends is dropped for the proxy\'s', JSON.stringify(seen[0]?.query));

  for (const path of ['/account', '/movie/603/../../account', '/../3/account/1/favorite', 'movie/603', '/movie/abc']) {
    const refused = await fn('tmdb-proxy', { body: { path } });
    check(refused.status === 403, `a path the apps never ask for is refused: ${path}`, said(refused));
  }
  seen = await drain();
  check(seen.length === 0, 'and TMDB is never asked for any of them', JSON.stringify(seen.map((r) => r.path)));

  await scriptStandIns({ tmdb: { '/3/movie/605': { status: 502, text: '<html><body>Bad gateway</body></html>' } } });
  const outage = await fn('tmdb-proxy', { body: { path: '/movie/605' } });
  check(outage.status === 502 && outage.json?.error, 'TMDB answering with a page, not JSON, is 502 (the apps try again)', said(outage));

  await scriptStandIns({ tmdb: { '/3/movie/606': { delayMs: 12_000, body: { id: 606 } } } });
  const slow = await fn('tmdb-proxy', { body: { path: '/movie/606' } });
  check(slow.status === 504 && slow.ms < 12_000, 'TMDB slower than its limit is 504, within the limit', `${said(slow)} after ${slow.ms} ms`);

  const missing = await fn('tmdb-proxy', { body: { path: '/movie/999999999' } });
  check(missing.status === 404, 'a film TMDB does not have is its 404', said(missing));

  const open = await fn('tmdb-proxy', { body: { path: '/movie/607' }, auth: null });
  check(open.status === 200, 'open without a session, as deployed (installed apps call it signed out)', said(open));
  await drain();
}

section('sign-in-with-username — a handle and a password, the address never shown');
{
  const right = await fn('sign-in-with-username', { body: { username: one.username, password: one.password }, auth: null });
  check(right.status === 200 && typeof right.json?.access_token === 'string' && typeof right.json?.refresh_token === 'string',
    'the right handle and password give a session', said(right));
  check(!right.text.includes(one.email), 'the answer never holds the address');
  if (right.json?.access_token) {
    const user = await fetch(`${API}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${right.json.access_token}` } }).then((r) => r.json());
    check(user?.id === one.id, 'and the session is the member\'s own', JSON.stringify(user).slice(0, 120));
  }

  const spelled = await fn('sign-in-with-username', { body: { username: '  FN_Member_One ', password: one.password }, auth: null });
  check(spelled.status === 200, 'the handle is found whatever its case, and with spaces around it', said(spelled));

  const wrong = await fn('sign-in-with-username', { body: { username: one.username, password: `${one.password}-not` }, auth: null });
  const nobody = await fn('sign-in-with-username', { body: { username: 'fn_nobody_by_this_name', password: one.password }, auth: null });
  check(wrong.status === 401, 'a wrong password is refused', said(wrong));
  check(nobody.status === 401 && nobody.text === wrong.text, 'a handle no one has gets the very same refusal', `${said(nobody)} / ${said(wrong)}`);

  for (const [what, call] of [
    ['no password', { body: { username: one.username } }],
    ['a body that is not JSON', { raw: 'username=fn_member_one' }],
  ]) {
    const r = await fn('sign-in-with-username', { ...call, auth: null });
    check(r.status === 401, `${what} is refused like a wrong password`, said(r));
  }
  const get = await fn('sign-in-with-username', { method: 'GET', auth: null });
  check(get.status === 405, 'only POST', said(get));

  // The house cannot look the handle up: its failure, never "wrong password".
  sql('REVOKE EXECUTE ON FUNCTION public.get_email_by_username(text) FROM service_role');
  let down;
  try {
    down = await fn('sign-in-with-username', { body: { username: one.username, password: one.password }, auth: null });
  } finally {
    sql('GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO service_role');
  }
  check(down.status === 503, 'a lookup that failed is 503 (the apps say "unavailable"), not a wrong password', said(down));
  await drain();
}

section('sync-films — reads the films nobody has read, and never blames a film for the key');
{
  const noJwt = await fn('sync-films', { auth: null });
  check(noJwt.status === 401, 'refused without a JWT, as deployed', said(noJwt));

  sql(`DELETE FROM public.films WHERE id BETWEEN 900001 AND 900099;
       INSERT INTO public.films (id) VALUES (900001), (900002), (900003);`);
  await scriptStandIns({ tmdb: { '/3/movie/900002': { status: 404, body: { status_code: 34 } } } });
  const run = await fn('sync-films');
  let seen = await drain();
  check(run.status === 200 && run.json?.synced === 2 && run.json?.failed === 1, 'a batch: two read, one TMDB does not have', said(run));
  check(seen.length === 3 && seen.every((r) => r.query.api_key === SECRET.tmdb && r.query.append_to_response === 'credits'),
    'each film asked once, with the key and its credits', JSON.stringify(seen.map((r) => r.path)));
  const read = sql(`SELECT title, year, runtime, director, array_to_string(cast_names, '|'), array_to_string(genres, '|'), popularity, synced_at IS NOT NULL, sync_claimed_at IS NULL
                      FROM public.films WHERE id = 900001`);
  check(read === 'Stand-in film 900001|1999|136|The Director|First Billed|Second Billed|Action|Science Fiction|42.5|t|t',
    'a film read is kept whole: title, year, runtime, director, billed cast, genres, popularity', read);
  check(sql('SELECT sync_failed || \'|\' || (sync_claimed_at IS NULL) FROM public.films WHERE id = 900002') === '1|true',
    'the film TMDB does not have takes one strike, its claim let go');

  sql('INSERT INTO public.films (id) VALUES (900004), (900005);');
  await scriptStandIns({ tmdbKeyRefused: true });
  const refused = await fn('sync-films');
  await drain();
  check(refused.status === 503 && refused.json?.need === 'TMDB_API_KEY', 'TMDB refusing the key is 503, naming the secret', said(refused));
  check(sql(`SELECT string_agg(id || ':' || sync_failed || ':' || (sync_claimed_at IS NULL) || ':' || (synced_at IS NULL), ',' ORDER BY id)
               FROM public.films WHERE id IN (900002, 900004, 900005)`) === '900002:1:true:true,900004:0:true:true,900005:0:true:true',
    'and no film is struck for it: every claim let go, every strike as it was');

  await scriptStandIns({ tmdbKeyRefused: false, tmdb: { '/3/movie/900002': { status: 404, body: { status_code: 34 } } } });
  const mended = await fn('sync-films');
  await drain();
  check(mended.status === 200 && sql('SELECT count(*) FROM public.films WHERE id IN (900004, 900005) AND synced_at IS NOT NULL') === '2',
    'with the key mended, the next call reads them', said(mended));
  sql('DELETE FROM public.films WHERE id BETWEEN 900001 AND 900099;');
}

section('notify-push — the database\'s push sender, behind its own secret');
{
  sql(`INSERT INTO public.push_tokens (user_id, token, platform) VALUES
         (${literal(two.id)}, 'ExponentPushToken[fn-live-1]', 'ios'),
         (${literal(two.id)}, 'ExpoPushToken[fn-Dead-2]', 'android'),
         (${literal(two.id)}, 'not-an-expo-token', 'web');`);
  const record = { id: randomUUID(), user_id: two.id, type: 'follow', from_username: one.username, message: 'is following you.' };

  const bare = await fn('notify-push', { body: { record }, auth: null });
  const wrong = await fn('notify-push', { body: { record }, auth: null, headers: { 'x-function-secret': `${SECRET.shared.slice(0, -1)}x` } });
  check(bare.status === 401 && wrong.status === 401, 'refused without its secret, and with a wrong one of the same length', `${said(bare)} / ${said(wrong)}`);
  check((await drain()).length === 0, 'and Expo is never asked');

  const sent = await fn('notify-push', { body: { type: 'INSERT', table: 'notifications', record }, auth: null, headers: { 'x-function-secret': SECRET.shared } });
  const seen = await drain();
  const messages = seen[0] ? JSON.parse(seen[0].body) : [];
  check(sent.status === 200 && sent.json?.delivered === 1 && sent.json?.pruned === 1, 'one delivered, the dead token pruned', said(sent));
  check(seen.length === 1 && messages.length === 2 && messages.every((m) => m.title === 'A New Follower' && m.body === `@${one.username} is following you.` && m.data?.notificationId === record.id),
    'Expo is sent one message per Expo token (never the other), titled by kind, the sender named', JSON.stringify(messages).slice(0, 300));
  check(sql(`SELECT string_agg(token, ',' ORDER BY token) FROM public.push_tokens WHERE user_id = ${literal(two.id)}`) === 'ExponentPushToken[fn-live-1],not-an-expo-token',
    'the token Expo called dead is gone, the others kept');

  await scriptStandIns({ expo: { status: 500 } });
  const down = await fn('notify-push', { body: { record }, auth: null, headers: { 'x-function-secret': SECRET.shared } });
  await drain();
  check(down.status === 500, 'Expo failing is a failure, never "delivered"', said(down));

  const lonely = await fn('notify-push', { body: { record: { ...record, user_id: three.id } }, auth: null, headers: { 'x-function-secret': SECRET.shared } });
  check(lonely.status === 200 && lonely.json?.delivered === 0, 'a member with no device is no error', said(lonely));
  await drain();

  // The database's own call: its trigger, through pg_net, to this function, to Expo.
  sql(`DO $do$ DECLARE d text; BEGIN
         d := pg_get_functiondef('public.tg_notify_push()'::regprocedure);
         IF d !~ 'https://[a-z0-9]+[.]supabase[.]co/functions/v1/notify-push' THEN RAISE EXCEPTION 'tg_notify_push no longer names the push sender'; END IF;
         EXECUTE regexp_replace(d, 'https://[a-z0-9]+[.]supabase[.]co', ${literal(GATEWAY_FROM_DB)});
       END $do$;
       DO $do$ BEGIN
         IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'notify_push_secret') THEN
           PERFORM vault.update_secret((SELECT id FROM vault.secrets WHERE name = 'notify_push_secret'), ${literal(SECRET.shared)});
         ELSE PERFORM vault.create_secret(${literal(SECRET.shared)}, 'notify_push_secret'); END IF;
       END $do$;`);
  const notice = `A notice from the house, ${randomUUID().slice(0, 8)}.`;
  sql(`INSERT INTO public.notifications (user_id, type, message) VALUES (${literal(two.id)}, 'system', ${literal(notice)})`);
  let pushed = [];
  for (let i = 0; i < 30 && pushed.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 500));
    pushed = (await standIns('/__seen')).filter((r) => r.body.includes(notice));
  }
  check(pushed.length === 1 && JSON.parse(pushed[0].body)[0]?.title === 'The ReelHouse Society',
    'a notice the house writes reaches Expo: trigger, pg_net, this function, its secret from the Vault', `${pushed.length} push(es)`);
  await drain();

  sql(`UPDATE public.profiles SET preferences = coalesce(preferences, '{}'::jsonb) || '{"notif_system": "false"}' WHERE id = ${literal(two.id)}`);
  const quiet = `A notice they turned off, ${randomUUID().slice(0, 8)}.`;
  sql(`INSERT INTO public.notifications (user_id, type, message) VALUES (${literal(two.id)}, 'system', ${literal(quiet)})`);
  await new Promise((r) => setTimeout(r, 5000));
  check((await drain()).every((r) => !r.body.includes(quiet)), 'a kind of notice the member turned off is never pushed');
}

section('sync-entitlement — a member\'s rank, read from the store, never from the member');
{
  const noJwt = await fn('sync-entitlement', { auth: null });
  check(noJwt.status === 401, 'refused without a JWT, as deployed', said(noJwt));
  const anon = await fn('sync-entitlement');
  check(anon.status === 401, 'refused for a visitor (the anon key is no member)', said(anon));
  check((await drain()).length === 0, 'and the store is never asked');

  await scriptStandIns({ revenuecat: { [three.id]: { body: { subscriber: { entitlements: { auteur: { expires_date: AHEAD, product_identifier: 'auteur_annual' } } } } } } });
  const bought = await fn('sync-entitlement', { auth: three.token, body: { tier: 'founding' } });
  let seen = await drain();
  check(bought.status === 200 && bought.json?.tier === 'auteur' && bought.json?.storeTier === 'auteur', 'the rank the store holds is granted, whatever the member claims', said(bought));
  check(seen.length === 1 && seen[0].path === `/v1/subscribers/${three.id}` && seen[0].headers.authorization === `Bearer ${SECRET.store}`,
    'the store is asked for the caller\'s own record, with the store\'s key', JSON.stringify(seen.map((r) => r.path)));
  check(tierOf(three.id) === 'auteur', 'and the house holds it', tierOf(three.id));

  await scriptStandIns({ revenuecat: { [three.id]: { status: 500, body: {} } } });
  const down = await fn('sync-entitlement', { auth: three.token });
  await drain();
  check(down.status === 502 && tierOf(three.id) === 'auteur', 'a store that could not be read is 502, and the rank stays', `${said(down)}; ${tierOf(three.id)}`);

  await scriptStandIns({ revenuecat: { [three.id]: { body: { subscriber: { entitlements: { auteur: { expires_date: '2020-01-01T00:00:00Z' } } } } } } });
  const lapsed = await fn('sync-entitlement', { auth: three.token });
  await drain();
  check(lapsed.status === 200 && lapsed.json?.storeTier === 'cinephile' && tierOf(three.id) === 'cinephile', 'a subscription that ended takes the store\'s rank away', `${said(lapsed)}; ${tierOf(three.id)}`);
}

section('revenuecat-webhook — the store says something changed');
{
  const event = (e) => ({ api_version: '1.0', event: { id: randomUUID(), ...e } });
  const bare = await fn('revenuecat-webhook', { body: event({ type: 'INITIAL_PURCHASE', app_user_id: four.id }), auth: null, apikey: null });
  const wrong = await fn('revenuecat-webhook', { body: event({ type: 'INITIAL_PURCHASE', app_user_id: four.id }), auth: null, apikey: null, headers: { Authorization: `${SECRET.webhook.slice(0, -1)}x` } });
  check(bare.status === 401 && wrong.status === 401, 'refused without the webhook\'s secret, and with a wrong one', `${said(bare)} / ${said(wrong)}`);
  const get = await fn('revenuecat-webhook', { method: 'GET', auth: null, apikey: null, headers: { Authorization: SECRET.webhook } });
  check(get.status === 405, 'only POST', said(get));
  check((await drain()).length === 0, 'and the store is never asked');

  const as = (body, raw) => fn('revenuecat-webhook', { body, raw, auth: null, apikey: null, headers: { Authorization: SECRET.webhook } });
  const junk = await as(undefined, '{not json');
  check(junk.status === 200 && junk.json?.ignored === 'unparseable', 'a body that is not JSON is acknowledged (no retry mends it)', said(junk));
  const test = await as(event({ type: 'TEST', app_user_id: four.id }));
  check(test.status === 200 && test.json?.ignored === 'no account', 'the dashboard\'s TEST event concerns nobody', said(test));
  check((await drain()).length === 0, 'neither asks the store');

  await scriptStandIns({ revenuecat: { [four.id]: { body: { subscriber: { entitlements: { archivist: { expires_date: AHEAD } } } } } } });
  const bought = await as(event({ type: 'INITIAL_PURCHASE', app_user_id: four.id, product_id: 'auteur_annual' }));
  await drain();
  check(bought.status === 200 && bought.json?.results?.[0]?.tier === 'archivist' && tierOf(four.id) === 'archivist',
    'the member\'s whole record is read and granted, never the event\'s own product', `${said(bought)}; ${tierOf(four.id)}`);

  const stranger = randomUUID();
  const nobody = await as(event({ type: 'RENEWAL', app_user_id: stranger }));
  await drain();
  check(nobody.status === 200 && nobody.json?.results?.[0]?.ignored === 'no such member', 'an account the house does not have is acknowledged, loudly', said(nobody));

  await scriptStandIns({ revenuecat: { [four.id]: { status: 503, body: {} } } });
  const down = await as(event({ type: 'RENEWAL', app_user_id: four.id }));
  await drain();
  check(down.status === 500 && tierOf(four.id) === 'archivist', 'a store that could not be read is 500, so RevenueCat sends it again; the rank stays', `${said(down)}; ${tierOf(four.id)}`);
}

section('fetch-rss — an allowed feed, read for the builds already installed');
{
  const feed = await fn('fetch-rss', { body: { url: 'https://www.theguardian.com/film/rss' }, auth: null });
  const seen = await drain();
  const item = feed.json?.items?.[0];
  check(feed.status === 200 && feed.json?.items?.length === 2 && item?.title === 'A & B: the first notice' && item?.thumbnail === 'https://i.guim.co.uk/large.jpg',
    'an allowed feed is read: titles decoded, the largest picture kept', said(feed));
  check(seen.length === 1 && seen[0].path === '/film/rss' && /thereelhousesociety\.com/.test(seen[0].headers['user-agent'] ?? ''),
    'the feed is asked once, the house named as it is', JSON.stringify(seen.map((r) => [r.path, r.headers['user-agent']])));

  for (const [what, url] of [['another host', 'https://example.com/film/rss'], ['not https', 'http://www.theguardian.com/film/rss'], ['a host inside a name', 'https://www.theguardian.com.example.com/film/rss']]) {
    const r = await fn('fetch-rss', { body: { url }, auth: null });
    check(r.status === 403, `${what} is refused`, said(r));
  }
  const none = await fn('fetch-rss', { body: {}, auth: null });
  check(none.status === 400, 'no url is refused', said(none));
  const get = await fn('fetch-rss', { method: 'GET', auth: null });
  check(get.status === 405, 'only POST', said(get));
  check((await drain()).length === 0, 'and nothing refused is ever fetched');
}

section('nowhere else');
{
  await drain();
  const KNOWN = [/^\/--\/api\/v2\/push\/send$/, /^\/v1\/subscribers\/[^/]+$/, /^\/3\//, /\/rss$/];
  const stray = everything.filter((r) => !KNOWN.some((re) => re.test(r.path)));
  check(everything.length > 0 && stray.length === 0, `every one of the ${everything.length} requests the functions sent went to a service they are meant to call`,
    JSON.stringify(stray.map((r) => `${r.method} ${r.path}`)));
}

console.log(`\n${good} held, ${bad} did not.`);
process.exitCode = bad ? 1 : 0;

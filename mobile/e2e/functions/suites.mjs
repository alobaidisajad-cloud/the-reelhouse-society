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
 * What it needs, and its means, are world.mjs's.
 */
import { randomUUID } from 'node:crypto';
import {
  API, ANON, GATEWAY_FROM_DB, SECRET, SERVICE, STAND, authBack, check, container, drain, everything, fn, literal, member,
  said, scriptStandIns, section, sql, standIns, tierOf, verdict,
} from './world.mjs';

const AHEAD = new Date(Date.now() + 30 * 86400_000).toISOString();

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

  // TMDB pacing the house: its own 429 reaches the apps with its own word on how long to wait.
  await scriptStandIns({ tmdb: { '/3/movie/607': { status: 429, headers: { 'Retry-After': '7' }, body: { status_code: 25 } } } });
  const tmdbBusy = await fn('tmdb-proxy', { body: { path: '/movie/607' } });
  check(tmdbBusy.status === 429 && tmdbBusy.headers['retry-after'] === '7', 'TMDB\'s own 429 is passed on with its Retry-After', `${said(tmdbBusy)} ${JSON.stringify(tmdbBusy.headers)}`);
  await drain();

  // One address asking TMDB without end: held at its pail (1,200 at once, then 20 a second), told
  // when to ask again, the website let read it; what the cache holds is still answered. The address
  // is the one the platform vouches for (Cloudflare's CF-Connecting-IP here); each call also writes
  // an X-Forwarded-For of its own, a new address each time, as a script would, and is held all the same.
  {
    const address = { 'cf-connecting-ip': '203.0.113.77' };
    const written = (round, i) => ({ ...address, 'x-forwarded-for': `198.18.${round}.${i + 1}` });
    let refused = null;
    let cachedPath = null;
    let asked = 0;
    for (let round = 0; round < 120 && !refused; round++) {
      const paths = Array.from({ length: 25 }, (_, i) => `/movie/${910000 + round * 25 + i}`);
      const answers = await Promise.all(paths.map((path, i) => fn('tmdb-proxy', { body: { path }, headers: written(round, i) })));
      asked += answers.length;
      refused = answers.find((a) => a.status === 429) ?? null;
      // One answered in this round: kept in the cache, the newest there.
      const kept = answers.findIndex((a) => a.status === 200);
      if (kept >= 0) cachedPath = paths[kept];
      await drain();
    }
    check(!!refused && asked > 1200 && asked <= 3000, 'one address asking without end is refused past its pail', `after ${asked} asked: ${refused ? said(refused) : 'none refused'}`);
    check(!!refused && Number(refused.headers['retry-after']) >= 1 && /retry-after/i.test(refused.headers['access-control-expose-headers'] ?? ''),
      'and told when to ask again, a header the website may read', JSON.stringify(refused?.headers ?? {}));
    const hit = await fn('tmdb-proxy', { body: { path: cachedPath ?? '/movie/603' }, headers: address });
    check(hit.status === 200 && hit.headers['x-cache'] === 'HIT', 'what the cache holds is still answered to that address, never counted', said(hit));
    // Sixty more at once, each with a new address of its own written in X-Forwarded-For: the pail
    // refills 20 a second, so a few may pass; keyed on what the caller wrote, every one would.
    const renamed = await Promise.all(Array.from({ length: 60 }, (_, i) =>
      fn('tmdb-proxy', { body: { path: `/movie/${919000 + i}` }, headers: { ...address, 'x-forwarded-for': `192.0.2.${i + 1}` } })));
    const stillHeld = renamed.filter((r) => r.status === 429).length;
    check(stillHeld >= 30, 'a new address written in X-Forwarded-For is still that caller, still held', `${stillHeld} of 60 held`);
    await drain();
  }

  await scriptStandIns({ tmdb: { '/3/movie/999999999': { status: 404, body: { status_code: 34, status_message: 'The resource you requested could not be found.', success: false } } } });
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

  // A guesser rests only their own door; many doors at once are slowed together; the member's own
  // phone, holding the key the house handed it, is never held by the doors elsewhere (round 14). The
  // platform's address is CF-Connecting-IP here; each call also writes an X-Forwarded-For of its own.
  {
    const at = (n) => ({ 'cf-connecting-ip': `203.0.113.${n}`, 'x-forwarded-for': `198.51.100.${n}` });
    const tryAs = (password, n, device) =>
      fn('sign-in-with-username', { body: { username: four.username, password, ...(device ? { device } : {}) }, auth: null, headers: at(n) });
    const pail = () => sql(`SELECT round(tokens) FROM public.sign_in_handles WHERE user_id = ${literal(four.id)}`);

    const tries = [];
    for (let i = 0; i < 5; i++) tries.push(await tryAs(`${four.password}-guess-${i}`, 10));
    check(tries.every((t) => t.status === 401), 'five wrong passwords from one door are each refused as wrong', tries.map(said).join(' / '));
    check(tries.every((t) => t.headers['x-rh-caller-source'] === 'cf'), 'each answer names where its address was read from, and never the address',
      JSON.stringify(tries.map((t) => t.headers['x-rh-caller-source'])));
    const rested = await tryAs(`${four.password}-guess-5`, 10);
    check(rested.status === 429 && rested.json?.paused === 'handle' && rested.json?.from === 'here' && rested.json?.retry_after >= 1
      && rested.headers['retry-after'] === String(rested.json?.retry_after),
      'the sixth from that door is told its door rests, and for how long', `${said(rested)} ${JSON.stringify(rested.headers)}`);
    check(/retry-after/i.test(rested.headers['access-control-expose-headers'] ?? '') && /x-rh-caller-source/i.test(rested.headers['access-control-expose-headers'] ?? ''),
      'headers the website may read', JSON.stringify(rested.headers));
    const rightWhileResting = await tryAs(four.password, 10);
    check(rightWhileResting.status === 429 && rightWhileResting.json?.from === 'here',
      'the right password from the resting door is not tried: a rest never says which guess was right', said(rightWhileResting));
    check(sql(`SELECT misses FROM public.sign_in_doors WHERE user_id = ${literal(four.id)} AND door = '203.0.113.10'`) === '5',
      'only the five tried were counted at that door');

    const member = await tryAs(four.password, 11);
    check(member.status === 200 && typeof member.json?.access_token === 'string' && /^[0-9a-f]{64}$/.test(member.json?.device ?? ''),
      'the member, from another door, is not held by the guesser\'s rest, and the phone is handed its key', said(member));
    const key = member.json?.device;
    check(pail() === '15', 'the pail every unknown door shares spent the five wrong ones, the member\'s own given back', pail());

    // Many doors at once spend the pail: a door not yet tried is slowed, said as from elsewhere.
    sql(`UPDATE public.sign_in_handles SET tokens = 0, refilled_at = now() WHERE user_id = ${literal(four.id)}`);
    const slowed = await tryAs(`${four.password}-guess-6`, 12);
    check(slowed.status === 429 && slowed.json?.from === 'elsewhere' && slowed.json?.retry_after >= 1,
      'the pail spent, a new door is told the handle is slowed from elsewhere', said(slowed));
    const newPhone = await tryAs(four.password, 13);
    check(newPhone.status === 429 && newPhone.json?.from === 'elsewhere', 'the right password from a phone with no key waits as well: never tried', said(newPhone));
    const ownPhone = await tryAs(four.password, 14, key);
    check(ownPhone.status === 200 && ownPhone.json?.device === key, 'the member\'s own phone, with its key, is let in, its key kept', said(ownPhone));
    const othersKey = await fn('sign-in-with-username', { body: { username: three.username, password: `${three.password}-not`, device: key }, auth: null, headers: at(15) });
    check(othersKey.status === 401 && sql(`SELECT round(tokens) FROM public.sign_in_handles WHERE user_id = ${literal(three.id)}`) === '19',
      'a key is its member\'s alone: sent with another\'s handle it is no key', said(othersKey));

    // An attempt the house could not answer is never counted.
    sql(`UPDATE public.sign_in_handles SET tokens = 20, refilled_at = now() WHERE user_id = ${literal(four.id)}`);
    sql('REVOKE EXECUTE ON FUNCTION public.get_email_by_username(text) FROM service_role');
    let unanswered;
    try {
      unanswered = await tryAs(four.password, 16);
    } finally {
      sql('GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO service_role');
    }
    check(unanswered.status === 503 && pail() === '20'
      && sql(`SELECT coalesce((SELECT misses FROM public.sign_in_doors WHERE user_id = ${literal(four.id)} AND door = '203.0.113.16'), 0)`) === '0',
      'an attempt the house could not answer is given back: neither door nor pail counts it', `${said(unanswered)} pail ${pail()}`);

    // A handle no one holds leaves no row anywhere.
    const nobody = await fn('sign-in-with-username', { body: { username: `fn_nobody_${Date.now()}`, password: 'guess' }, auth: null, headers: at(17) });
    check(nobody.status === 401 && sql("SELECT count(*) FROM public.sign_in_doors WHERE door = '203.0.113.17'") === '0',
      'a handle no one holds is refused as wrong and grows no table', said(nobody));

    // One platform address, a new X-Forwarded-For written on each call: still one caller, held at its
    // pace (20 a minute). With no platform address, no pace by address at all, never one all share.
    // No password, so each is refused before the house or Auth is asked.
    const paced = [];
    const unvouched = [];
    for (let i = 0; i < 21; i++) {
      paced.push(await fn('sign-in-with-username', { body: { username: `fn_paced_${i}`, password: '' }, auth: null,
        headers: { 'cf-connecting-ip': '203.0.113.200', 'x-forwarded-for': `192.0.2.${i + 1}` } }));
      unvouched.push(await fn('sign-in-with-username', { body: { username: `fn_paced_${i}`, password: '' }, auth: null,
        headers: { 'x-forwarded-for': '192.0.2.250' } }));
    }
    check(paced.slice(0, 20).every((t) => t.status === 401) && paced[20].status === 429 && paced[20].json?.paused === undefined,
      'one caller writing a new X-Forwarded-For each call is still held at its pace', paced.map((t) => t.status).join(','));
    check(unvouched.every((t) => t.status === 401 && t.headers['x-rh-caller-source'] === 'xff'),
      'with no address the platform vouches for, no caller is paced as everyone, and the answer says so', unvouched.map((t) => `${t.status}:${t.headers['x-rh-caller-source']}`).join(','));
    // This world's counts, none kept for the sections after.
    sql('DELETE FROM public.sign_in_doors; DELETE FROM public.sign_in_handles; DELETE FROM public.sign_in_devices');
  }

  // Deployed before round 14's train, as production is until it runs: the house has none of the
  // count's functions, so PostgREST answers PGRST202, and the sign-in paces by the vouched address
  // alone (20 a minute, as before) and signs in as before. The three are renamed away here, and back.
  {
    const COUNT = [['sign_in_attempt', 'text, text, text'], ['sign_in_unasked', 'text, text, boolean'], ['sign_in_cleared', 'text, text, boolean, text']];
    const rename = (from, to) => sql(`${COUNT.map(([f, args]) => `ALTER FUNCTION public.${f}${from}(${args}) RENAME TO ${f}${to};`).join(' ')} NOTIFY pgrst, 'reload schema';`);
    // The API's own answer for sign_in_attempt, as the function's key asks it (a handle no one holds: no row).
    const apiSays = async () => {
      const r = await fetch(`${API}/rest/v1/rpc/sign_in_attempt`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
        body: JSON.stringify({ p_handle: `fn_nobody_${Date.now()}`, p_door: null, p_device: null }),
      });
      return { status: r.status, code: (await r.json().catch(() => null))?.code ?? null };
    };
    const until = async (done) => {
      for (let i = 0; i < 60; i++) {
        const answer = await apiSays();
        if (done(answer)) return answer;
        await new Promise((r) => setTimeout(r, 250));
      }
      return apiSays();
    };
    const asTwo = (password, headers) => fn('sign-in-with-username', { body: { username: two.username, password }, auth: null, headers });

    rename('', '_not_yet');
    try {
      const gone = await until((s) => s.code === 'PGRST202');
      check(gone.status === 404 && gone.code === 'PGRST202', 'the house before the train answers the count as missing: 404, PGRST202', JSON.stringify(gone));

      const tries = [];
      for (let i = 0; i < 21; i++) tries.push(await asTwo(`${two.password}-guess-${i}`, { 'cf-connecting-ip': '203.0.113.220', 'x-forwarded-for': `192.0.2.${i + 1}` }));
      check(tries.slice(0, 20).every((t) => t.status === 401) && tries[20].status === 429 && tries[20].json?.paused === undefined,
        'before the train, a caller writing a new X-Forwarded-For each call is still held by its vouched address, 20 a minute', tries.map((t) => t.status).join(','));
      check(tries.every((t) => t.headers['x-rh-caller-source'] === 'cf'), 'and each answer names where its address was read from',
        JSON.stringify(tries.map((t) => t.headers['x-rh-caller-source'])));

      const right = await asTwo(two.password, { 'cf-connecting-ip': '203.0.113.221', 'x-forwarded-for': '192.0.2.99' });
      check(right.status === 200 && typeof right.json?.access_token === 'string' && right.json?.device === undefined && right.headers['x-rh-caller-source'] === 'cf',
        'before the train, the right password signs in as before, no key handed', said(right));

      // No vouched address: no pace by address (the section above holds that), and a guess is still answered as one.
      const unvouched = await asTwo(`${two.password}-guess`, { 'x-forwarded-for': '192.0.2.251' });
      check(unvouched.status === 401 && unvouched.headers['x-rh-caller-source'] === 'xff',
        'before the train, a caller no address is vouched for is answered, its guess refused as wrong', said(unvouched));
    } finally {
      rename('_not_yet', '');
    }
    const back = await until((s) => s.status === 200);
    check(back.status === 200, 'the count is found again once it is built', JSON.stringify(back));
    const counted = await asTwo(two.password, { 'cf-connecting-ip': '203.0.113.222' });
    check(counted.status === 200 && /^[0-9a-f]{64}$/.test(counted.json?.device ?? ''), 'after the train, the sign-in counts again and hands the phone its key', said(counted));
    sql('DELETE FROM public.sign_in_doors; DELETE FROM public.sign_in_handles; DELETE FROM public.sign_in_devices');
  }

  // The house cannot look the handle up: its failure, never "wrong password".
  sql('REVOKE EXECUTE ON FUNCTION public.get_email_by_username(text) FROM service_role');
  let down;
  try {
    down = await fn('sign-in-with-username', { body: { username: one.username, password: one.password }, auth: null });
  } finally {
    sql('GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO service_role');
  }
  check(down.status === 503, 'a lookup that failed is 503 (the apps say "unavailable"), not a wrong password', said(down));

  // Auth itself down: the house's failure, the same for a handle someone has and one no one has.
  container('stop', 'auth');
  let knownDown;
  let unknownDown;
  try {
    knownDown = await fn('sign-in-with-username', { body: { username: one.username, password: one.password }, auth: null });
    unknownDown = await fn('sign-in-with-username', { body: { username: 'fn_nobody_by_this_name', password: one.password }, auth: null });
  } finally {
    container('start', 'auth');
  }
  check(knownDown.status === 503 && unknownDown.status === 503 && knownDown.text === unknownDown.text,
    'Auth down is 503, the very same for a known handle and an unknown one', `${said(knownDown)} / ${said(unknownDown)}`);
  check(await authBack(), 'and Auth answers again once it is back');
  const again = await fn('sign-in-with-username', { body: { username: one.username, password: one.password }, auth: null });
  check(again.status === 200, 'a member signs in again once Auth is back', said(again));
  await drain();
}

section('sync-films — reads the films nobody has read, and never blames a film for the key');
{
  // As production's gateway answers (probed 2026-10-16): nothing at all is refused; the
  // public key alone reaches the function, which drains what is outstanding.
  const bare = await fn('sync-films', { auth: null, apikey: null });
  check(bare.status === 401, 'refused with no key and no JWT, as deployed', said(bare));
  const keyOnly = await fn('sync-films', { auth: null });
  check(keyOnly.status === 200, 'the public key alone reaches it, as in production', said(keyOnly));

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

  // Each read says when the next is due: a film TMDB has not released is looked at again (its
  // settled reads unspent), a castless one released is read again a few times, a whole one never.
  sql('INSERT INTO public.films (id) VALUES (900011), (900012);');
  await scriptStandIns({ tmdb: {
    '/3/movie/900011': { body: { id: 900011, title: 'Announced', release_date: '', status: 'Planned', genres: [], credits: { cast: [], crew: [] } } },
    '/3/movie/900012': { body: { id: 900012, title: 'Castless', release_date: '1999-03-31', status: 'Released',
      genres: [{ id: 99, name: 'Documentary' }], credits: { cast: [], crew: [{ id: 9, name: 'A Director', job: 'Director' }] } } },
  } });
  const kept = await fn('sync-films');
  await drain();
  const books = sql(`SELECT string_agg(id || ':' || coalesce(release_date::text, 'none') || ':' || coalesce(sync_reads::text, 'none') || ':' || (reread_after IS NOT NULL), ',' ORDER BY id)
                      FROM public.films WHERE id IN (900001, 900011, 900012)`);
  check(kept.status === 200 && books === '900001:1999-03-31:1:false,900011:none:0:true,900012:1999-03-31:1:true',
    'each read writes its release date, its settled reads and when it is read again', `${said(kept)} ${books}`);
  sql('DELETE FROM public.films WHERE id BETWEEN 900001 AND 900099;');
}

section('notify-push — the database\'s push sender, behind its own secret');
{
  // The member's phones register their tokens as the app does: signed in, under their session
  // (register_push_token keeps it, round 13); notify-push sends only to a token whose session stands.
  const register = async (token, p_token, p_platform) => {
    const r = await fetch(`${API}/rest/v1/rpc/register_push_token`, {
      method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token, p_platform }),
    });
    check(r.ok, `the member registers ${p_token} as the app does`, `HTTP ${r.status}`);
  };
  for (const [tok, platform] of [['ExponentPushToken[fn-live-1]', 'ios'], ['ExpoPushToken[fn-Dead-2]', 'android'], ['not-an-expo-token', 'web']]) {
    await register(two.token, tok, platform);
  }
  // A phone the member signed out of: signed in there, registered, then its session ended (as
  // "Sign out of every other device" ends it, or a refused refresh) without the phone's own sign-out.
  const elsewhere = await (await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: two.email, password: two.password }),
  })).json();
  await register(elsewhere.access_token, 'ExponentPushToken[fn-signed-out-3]', 'android');
  const ended = await fetch(`${API}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${elsewhere.access_token}` } });
  check(ended.status === 204, 'that phone\'s session ends', `HTTP ${ended.status}`);
  // A phone registered before round 13 (no session kept), whose every possible session is another
  // phone's now: it is signed out, and is not pushed (push_tokens_of).
  sql(`INSERT INTO public.push_tokens (user_id, token, platform) VALUES (${literal(two.id)}, 'ExponentPushToken[fn-before-4]', 'ios');`);
  // A notice as the house writes it (its trigger's own call goes to production's address here, which
  // the seal blocks): notify-push is named its id, and reads the rest from the house.
  const write = (userId, { ago = '0 seconds', message = 'is following you.' } = {}) => {
    const id = randomUUID();
    sql(`INSERT INTO public.notifications (id, user_id, type, from_username, from_user_id, message, created_at)
           VALUES (${literal(id)}, ${literal(userId)}, 'follow', ${literal(one.username)}, ${literal(one.id)}, ${literal(message)}, now() - interval ${literal(ago)})`);
    return id;
  };
  const push = (body, secret = SECRET.shared) => fn('notify-push', { body, auth: null, headers: secret ? { 'x-function-secret': secret } : {} });
  const record = { id: write(two.id), user_id: two.id, type: 'follow', from_username: one.username, message: 'is following you.' };

  const bare = await fn('notify-push', { body: { record }, auth: null });
  const wrong = await push({ record }, `${SECRET.shared.slice(0, -1)}x`);
  check(bare.status === 401 && wrong.status === 401, 'refused without its secret, and with a wrong one of the same length', `${said(bare)} / ${said(wrong)}`);
  check((await drain()).length === 0, 'and Expo is never asked');

  await scriptStandIns({ expo: { status: 500 } });
  const down = await push({ type: 'INSERT', table: 'notifications', record });
  await drain();
  check(down.status === 500, 'Expo failing is a failure, never "delivered"', said(down));
  check(sql(`SELECT coalesce(pushed_at::text, 'waiting') FROM public.notifications WHERE id = ${literal(record.id)}`) === 'waiting',
    'and the notice is let go, to be pushed by a later call');
  // Expo answers again: a script merges, so its failure is taken back by name.
  await scriptStandIns({ expo: {} });

  // The caller's words are never pushed: the house's are, to the member the house wrote to.
  const forged = { ...record, user_id: three.id, from_username: 'the_house', message: 'Your account is locked: sign in at reelhouse.example.' };
  const sent = await push({ type: 'INSERT', table: 'notifications', record: forged });
  const seen = await drain();
  const messages = seen[0] ? JSON.parse(seen[0].body) : [];
  check(sent.status === 200 && sent.json?.delivered === 1 && sent.json?.pruned === 1, 'one delivered, the dead token pruned', said(sent));
  check(seen[0]?.headers.authorization === `Bearer ${SECRET.expo}`, 'Expo is sent its access token, as push security asks');
  const tokenless = await fetch(`${STAND}/--/api/v2/push/send`, { method: 'POST', body: '[]' });
  await drain();
  check(tokenless.status === 401, 'and the Expo stand-in refuses a push without it, as Expo does', `HTTP ${tokenless.status}`);
  check(seen.length === 1 && messages.length === 2 && messages.every((m) => m.title === 'A New Follower' && m.body === `@${one.username} is following you.` && m.data?.notificationId === record.id),
    'Expo is sent one message per Expo token (never the other), titled by kind, in the house\'s words, never the caller\'s', JSON.stringify(messages).slice(0, 300));
  check(!messages.some((m) => m.to === 'ExponentPushToken[fn-signed-out-3]' || m.to === 'ExponentPushToken[fn-before-4]'),
    'a phone signed out is never pushed: neither the one whose session ended nor the one from before round 13 with no session left to it', JSON.stringify(messages.map((m) => m.to)));
  check(sql(`SELECT string_agg(token, ',' ORDER BY token) FROM public.push_tokens WHERE user_id = ${literal(two.id)}`) === 'ExponentPushToken[fn-live-1],not-an-expo-token',
    'the token Expo called dead is gone, and the signed-out phones\' with it; the others kept');

  const again = await push({ record });
  check(again.status === 200 && again.json?.skipped && (await drain()).length === 0, 'a notice is pushed once: asked again, Expo is not', said(again));
  const unknown = await push({ record: { ...record, id: randomUUID() } });
  check(unknown.status === 200 && unknown.json?.skipped && (await drain()).length === 0, 'a notice the house never wrote is pushed nothing', said(unknown));
  const stale = await push({ record: { ...record, id: write(two.id, { ago: '1 hour' }) } });
  check(stale.status === 200 && stale.json?.skipped && (await drain()).length === 0, 'nor one written an hour ago: a late call is no delivery', said(stale));

  const lonely = await push({ record: { ...record, id: write(three.id), user_id: three.id } });
  check(lonely.status === 200 && lonely.json?.delivered === 0, 'a member with no device is no error', said(lonely));
  await drain();

  // A critique taken as the answer is titled as what it is, never "A New Critique" (round 12).
  const answerId = randomUUID();
  sql(`INSERT INTO public.notifications (id, user_id, type, from_username, from_user_id, message, metadata)
         VALUES (${literal(answerId)}, ${literal(two.id)}, 'comment', ${literal(one.username)}, ${literal(one.id)},
                 'took your critique as the answer.', '{"answer": true}'::jsonb)`);
  const answered = await push({ record: { id: answerId } });
  const answerSeen = await drain();
  const answerMessages = answerSeen[0] ? JSON.parse(answerSeen[0].body) : [];
  check(answered.status === 200 && answerMessages.length > 0
      && answerMessages.every((m) => m.title === 'Taken as the Answer' && m.channelId === 'critiques'),
    'a critique taken as the answer is titled as one, in the critiques\' channel', JSON.stringify(answerMessages).slice(0, 300));

  // The database's own call: its trigger, through pg_net, to this function, to Expo.
  const before = sql("SELECT pg_get_functiondef('public.tg_notify_push()'::regprocedure)");
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
  const after = sql("SELECT pg_get_functiondef('public.tg_notify_push()'::regprocedure)");
  const production = /https:\/\/[a-z0-9]+[.]supabase[.]co/.exec(before)?.[0] ?? '';
  check(production !== '' && after !== before && after.split(GATEWAY_FROM_DB).join(production) === before,
    'the push trigger is changed in its address alone, to the local push sender');
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
  const noJwt = await fn('sync-entitlement', { auth: null, apikey: null });
  check(noJwt.status === 401, 'refused with no key and no JWT, as deployed', said(noJwt));
  const keyOnly = await fn('sync-entitlement', { auth: null });
  check(keyOnly.status === 401 && keyOnly.json?.error === 'Missing authorization header', 'refused by its own code behind the public key alone, as in production', said(keyOnly));
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

section('send-email — the house\'s mail, behind its own secret (written, not yet deployed)');
{
  const as = (body, headers = { 'x-function-secret': SECRET.shared }) => fn('send-email', { body, auth: null, apikey: null, headers });
  const bare = await as({ type: 'welcome', userId: one.id }, {});
  const wrong = await as({ type: 'welcome', userId: one.id }, { 'x-function-secret': `${SECRET.shared.slice(0, -1)}x` });
  check(bare.status === 401 && wrong.status === 401, 'refused without its secret, and with a wrong one', `${said(bare)} / ${said(wrong)}`);
  const get = await fn('send-email', { method: 'GET', auth: null, apikey: null });
  check(get.status === 405, 'only POST', said(get));
  check((await drain()).length === 0, 'and no mail is sent');

  const welcome = await as({ type: 'welcome', userId: one.id });
  let seen = await drain();
  const mail = seen[0] ? JSON.parse(seen[0].body) : {};
  check(welcome.status === 200 && !welcome.text.includes(one.email), 'a welcome is sent, and the answer never holds the address', said(welcome));
  check(seen.length === 1 && seen[0].path === '/emails' && seen[0].headers.authorization === `Bearer ${SECRET.resend}`
    && mail.to === one.email && mail.subject === 'Welcome to The ReelHouse Society' && String(mail.html).includes(one.username),
    'Resend is sent one mail, to the member\'s own address, with the key', JSON.stringify({ path: seen[0]?.path, to: mail.to === one.email, subject: mail.subject }));
  const twice = await as({ type: 'welcome', userId: one.id });
  check(twice.status === 429 && (await drain()).length === 0, 'a second welcome the same day is refused, and not sent', said(twice));

  await scriptStandIns({ resend: { status: 500 } });
  const down = await as({ type: 'digest', userId: one.id });
  await drain();
  check(down.status === 502, 'Resend failing is a failure, never "sent"', said(down));
  const mended = await as({ type: 'digest', userId: one.id });
  await drain();
  check(mended.status === 200, 'and the mail it failed is sent once Resend answers', said(mended));

  const unknown = await as({ type: 'gossip', userId: two.id });
  const nobody = await as({ type: 'welcome', userId: randomUUID() });
  check(unknown.status === 400 && nobody.status === 404 && (await drain()).length === 0, 'an unknown kind and an unknown member are refused, and nothing is sent', `${said(unknown)} / ${said(nobody)}`);
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
  const KNOWN = [/^\/--\/api\/v2\/push\/send$/, /^\/v1\/subscribers\/[^/]+$/, /^\/3\//, /\/rss$/, /^\/emails$/];
  const stray = everything.filter((r) => !KNOWN.some((re) => re.test(r.path)));
  check(everything.length > 0 && stray.length === 0, `every one of the ${everything.length} requests the functions sent went to a service they are meant to call`,
    JSON.stringify(stray.map((r) => `${r.method} ${r.path}`)));
}

verdict();

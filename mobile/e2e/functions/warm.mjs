#!/usr/bin/env node
/**
 * warm.mjs — every function in the functions world loaded, before the seal.
 *
 * The runtime fetches a function's remote imports (deno.land, the esm CDN) on
 * its first call, and those sit on Cloudflare as production does, so each function
 * is called once while the network is whole (see e2e.yml's own warm step). The
 * database is not yet production's shape, so each is asked something it answers
 * itself, without the house: an answer only its own code gives proves it loaded,
 * imports and all. And one call proves a function reaches the stand-ins.
 *
 * Needs API_URL and ANON_KEY, and stand-ins.mjs on 127.0.0.1:54990.
 */
const API = process.env.API_URL;
const ANON = process.env.ANON_KEY;
const STAND = process.env.STAND_INS_URL ?? 'http://127.0.0.1:54990';
if (!API || !ANON) { console.error('API_URL and ANON_KEY are needed.'); process.exit(2); }

/** Each function, a call only it answers so, and that answer. */
const CALLS = [
  ['tmdb-proxy', { body: { path: 'not-a-path' } }, (s, j) => s === 403 && j?.error === 'Path not allowed'],
  ['sign-in-with-username', { method: 'GET' }, (s, j) => s === 405 && j?.error === 'Method not allowed'],
  ['sync-films', { body: {} }, (s, j) => s === 500 && (j?.error === 'claim failed' || j?.error === 'missing secret')],
  ['fetch-rss', { method: 'GET' }, (s, j) => s === 405 && j?.error === 'Method not allowed'],
  ['notify-push', { body: {} , bare: true }, (s, j) => s === 401 && j?.error === 'Unauthorized'],
  ['sync-entitlement', { body: {} }, (s, j) => s === 401 && j?.error === 'Invalid or expired token'],
  ['revenuecat-webhook', { method: 'GET', bare: true }, (s, j) => s === 405 && j?.error === 'Method not allowed'],
  ['send-email', { body: {}, bare: true }, (s, j) => s === 401 && j?.error === 'Unauthorized'],
];

const call = async (name, { method = 'POST', body, bare } = {}) => {
  const headers = bare ? {} : { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` };
  try {
    const res = await fetch(`${API}/functions/v1/${name}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  } catch (e) {
    return { status: 0, json: null, text: String(e) };
  }
};

let bad = 0;
for (const [name, how, answers] of CALLS) {
  let last;
  for (let i = 0; i < 60; i++) {
    last = await call(name, how);
    if (answers(last.status, last.json)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const ok = answers(last.status, last.json);
  console.log(`${ok ? '✓' : '✗'} ${name} loaded${ok ? '' : ` — HTTP ${last.status} ${last.text.slice(0, 300)}`}`);
  if (!ok) { bad++; console.log(`::error title=Functions world::${name} never loaded — HTTP ${last.status} ${last.text.slice(0, 200)}`); }
}

// A function reaches the stand-ins: the one road every outside call takes.
await fetch(`${STAND}/__reset`, { method: 'POST' });
const film = await call('tmdb-proxy', { body: { path: '/movie/603' } });
const seen = await fetch(`${STAND}/__seen`).then((r) => r.json());
await fetch(`${STAND}/__reset`, { method: 'POST' });
const reached = film.status === 200 && film.json?.id === 603 && seen.length === 1 && seen[0].path === '/3/movie/603';
console.log(`${reached ? '✓' : '✗'} a function reaches the stand-ins${reached ? '' : ` — HTTP ${film.status} ${film.text.slice(0, 200)}; the stand-ins saw ${seen.length}`}`);
if (!reached) { bad++; console.log('::error title=Functions world::the functions cannot reach the stand-ins (host.docker.internal:54990)'); }

process.exitCode = bad ? 1 : 0;

/**
 * world.mjs — the means the functions world's checks share (suites.mjs,
 * payments.mjs): a call to a function as its callers make it, a statement as
 * the house, the stand-ins steered and read back, a member made as a sign-up
 * makes one, and each check said, the run's verdict at the end.
 *
 * Needs API_URL, ANON_KEY, SERVICE_ROLE_KEY (`supabase status -o env`), the
 * FN_* secrets place.mjs wrote and STAND_INS_EXPO_TOKEN, psql, and the stand-ins
 * on 127.0.0.1:54990. Refuses any API but a local one.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

export const API = process.env.API_URL;
export const ANON = process.env.ANON_KEY;
export const SERVICE = process.env.SERVICE_ROLE_KEY;
const DB = process.env.FN_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
export const STAND = process.env.STAND_INS_URL ?? 'http://127.0.0.1:54990';
/** The API gateway as the database's container reaches it (pg_net calls from there). */
export const GATEWAY_FROM_DB = process.env.FN_GATEWAY_FROM_DB ?? 'http://supabase_kong_reelhouse-e2e:8000';
export const SECRET = {
  shared: process.env.FN_FUNCTION_SHARED_SECRET,
  webhook: process.env.FN_REVENUECAT_WEBHOOK_SECRET,
  store: process.env.FN_REVENUECAT_SECRET_KEY,
  tmdb: process.env.FN_TMDB_API_KEY,
  resend: process.env.FN_RESEND_API_KEY,
  expo: process.env.STAND_INS_EXPO_TOKEN,
};
if (!API || !ANON || !SERVICE || Object.values(SECRET).some((v) => !v)) {
  console.error('API_URL, ANON_KEY, SERVICE_ROLE_KEY, the FN_* secrets and STAND_INS_EXPO_TOKEN (place.mjs) are needed.');
  process.exit(2);
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
  console.error(`Refusing to run against ${API}: the functions world is local only.`);
  process.exit(2);
}

let bad = 0;
let good = 0;
/** One check, said; a miss is an error annotation too. */
export const check = (ok, what, detail = '') => {
  if (ok) { good++; console.log(`✓ ${what}`); return; }
  bad++;
  console.log(`✗ ${what}${detail ? ` — ${detail}` : ''}`);
  console.log(`::error title=Functions world::${what}${detail ? ` — ${detail}` : ''}`);
};
export const section = (name) => console.log(`\n── ${name} ──`);
/** The run's verdict: every check held, or exit 1. */
export const verdict = () => {
  console.log(`\n${good} held, ${bad} did not.`);
  process.exitCode = bad ? 1 : 0;
};

/** One statement as the house (postgres), its rows as text. */
export const sql = (text) => {
  const r = spawnSync('psql', [DB, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', text], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`psql: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.replace(/\r/g, '').trim();
};
export const literal = (v) => `'${String(v).replace(/'/g, "''")}'`;

/** A call to a function. `auth` is the bearer (null: none at all); the anon key is the apikey unless `apikey` is null. */
export const fn = async (name, { body, method = 'POST', auth = ANON, apikey = ANON, headers = {}, raw } = {}) => {
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
export const said = (r) => `HTTP ${r.status} ${r.text.slice(0, 200)}`;

export const standIns = async (path, body) => {
  const res = await fetch(`${STAND}${path}`, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
  return res.json();
};
/** Every request the stand-ins took, kept across resets for a run's last word on where the functions called. */
export const everything = [];
/** The requests since the last reset; the stand-ins then forget them, and their script. */
export const drain = async () => {
  const seen = await standIns('/__seen');
  everything.push(...seen);
  await standIns('/__reset', {});
  return seen;
};
export const scriptStandIns = (s) => standIns('/__script', s);

/** A member, made as a sign-up makes one, signed in. */
export const member = async (username) => {
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

/** Stops, or starts again, one of the stack's containers (auth, rest, ...). */
export const container = (verb, service) => {
  const name = `supabase_${service}_reelhouse-e2e`;
  const r = spawnSync('docker', [verb, name], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`docker ${verb} ${name}: ${r.stderr.trim()}`);
};
/** Waits until Auth answers its health check again, up to a minute. */
export const authBack = async () => {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${API}/auth/v1/health`, { headers: { apikey: ANON } })).ok) return true; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};

export const tierOf = (id) => sql(`SELECT tier FROM public.profiles WHERE id = ${literal(id)}`);

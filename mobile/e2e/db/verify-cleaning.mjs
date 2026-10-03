#!/usr/bin/env node
/**
 * verify-cleaning.mjs — the database cleans a member's words as the app does.
 *
 *   · public.clean_member_text answers every case in member-text.corpus.json
 *     with the app's own answer (theDatabaseCleansAsTheAppDoes keeps the corpus
 *     equal to cleanForStorage), in a database built from production's snapshot
 *   · a member writing through the API has their words kept cleaned
 *   · no one can call the cleaning through the API
 *
 * Needs API_URL and ANON_KEY (from `supabase status -o env`) and the seeded
 * member's E2E_MEMBER_USERNAME / E2E_MEMBER_PASSWORD.
 */
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DB = 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres';
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
  if (!ok) { bad++; console.log(`::error title=E2E cleaning::${what} ${detail}`); }
};

// The corpus is printable ASCII (its test says so), so it travels inside a
// dollar-quoted literal as it is.
const corpus = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'member-text.corpus.json'), 'utf8');
const answer = execFileSync('psql', [DB, '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
  encoding: 'utf8',
  input: `SELECT count(*) || '|' || coalesce(string_agg(e ->> 'case', '; '), '')
            FROM jsonb_array_elements($corpus$${corpus}$corpus$::jsonb) e
           WHERE public.clean_member_text(e ->> 'input') IS DISTINCT FROM e ->> 'output';
          SELECT jsonb_array_length($corpus$${corpus}$corpus$::jsonb);`,
}).trim().split('\n');
const [disagree, cases] = answer[0].split('|');
check(disagree === '0' && Number(answer[1]) > 0,
  'the database answers every case in the corpus as the app does', `${answer[1]} cases, ${disagree} disagree${cases ? `: ${cases}` : ''}`);

const signIn = await fetch(`${API}/functions/v1/sign-in-with-username`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
  body: JSON.stringify({ username: USER, password: PASS }),
}).then((r) => r.json());
const token = signIn?.access_token;
// The function answers with the tokens alone; the member is the token's subject.
const member = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub : undefined;
check(!!token && !!member, 'the seeded member signs in');

if (token && member) {
  const rest = (path, init = {}) => fetch(`${API}/rest/v1/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}`, Prefer: 'return=representation', ...init.headers },
  });
  const [{ bio: kept } = {}] = await rest(`profiles?id=eq.${member}&select=bio`).then((r) => r.json());
  // A no-break space, a right-to-left override, a zero-width space and a line separator.
  const typed = `${String.fromCharCode(0xa0)}Seen${String.fromCharCode(0x202e)} twice${String.fromCharCode(0x200b)}.${String.fromCharCode(0x2028)}`;
  const written = await rest(`profiles?id=eq.${member}&select=bio`, { method: 'PATCH', body: JSON.stringify({ bio: typed }) });
  const [{ bio } = {}] = written.ok ? await written.json() : [];
  check(bio === 'Seen twice.', 'a member\'s bio is kept cleaned', `HTTP ${written.status}, kept ${JSON.stringify(bio)}`);
  await rest(`profiles?id=eq.${member}`, { method: 'PATCH', body: JSON.stringify({ bio: kept ?? null }) });

  const call = await rest('rpc/clean_member_text', { method: 'POST', body: JSON.stringify({ words: 'x' }) });
  check(!call.ok, 'a member cannot call the cleaning', `HTTP ${call.status}`);
}

process.exit(bad ? 1 : 0);

#!/usr/bin/env node
/**
 * bootstrap.mjs — build the sealed E2E world's database from the production snapshot.
 *
 * Run on the CI runner after `supabase start` (e2e.yml). The local stack comes
 * up with Supabase's own schemas (auth, storage, realtime, …) and an empty
 * `public`; this lays production's shape over it from the three committed
 * files, in their order:
 *
 *   1. live-extensions.sql       as supabase_admin (extensions need it)
 *   2. live-schema.sql           as postgres, so every object is owned by
 *                                postgres, as in production — minus the two
 *                                kinds of statement postgres may not run, which
 *                                run as supabase_admin in step 3
 *   3. those statements          as supabase_admin
 *   4. live-outside-public.sql   as postgres, which owns those objects in production
 *   5. a stand-in for each vault secret the snapshot names
 *
 * Then it proves the world is SEALED: the database's one outbound call (the push
 * sender, which names production's host) must fail to connect, because
 * e2e.yml has blackholed that host before this runs.
 *
 * Every step says what it is doing, and a failure names the step and stops.
 * The fidelity check — the copy produces the same three files as production —
 * is `schema-snapshot.mjs --check` against this database, run by e2e.yml next.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = join(HERE, '..', '..', 'supabase', 'schema');
const HOST = process.env.E2E_DB_HOST ?? '127.0.0.1';
const PORT = process.env.E2E_DB_PORT ?? '54322';
// The local stack's fixed development passwords — this database exists only on the runner.
const AS_POSTGRES = `postgresql://postgres:postgres@${HOST}:${PORT}/postgres`;
const AS_ADMIN = `postgresql://supabase_admin:postgres@${HOST}:${PORT}/postgres`;
const scratch = mkdtempSync(join(tmpdir(), 'e2e-bootstrap-'));

const fail = (step, detail) => {
  console.log(`::error title=E2E bootstrap — ${step}::${String(detail).split('\n').slice(0, 6).join(' ⏎ ')}`);
  console.error(`\n✗ ${step}\n${detail}`);
  process.exit(1);
};

/** Run SQL (a file's text) as a role, in one transaction, stopping at the first error. */
const runSql = (step, url, sql) => {
  const file = join(scratch, `${step.replace(/\W+/g, '-')}.sql`);
  writeFileSync(file, sql);
  console.log(`→ ${step}`);
  try {
    execFileSync('psql', [url, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    fail(step, (e.stderr || e.message).trim());
  }
};
const query = (url, sql) => execFileSync('psql', [url, '-X', '-q', '-tA', '-c', sql], { encoding: 'utf8' }).trim();
const read = (f) => readFileSync(join(SCHEMA, f), 'utf8');

// ── 0. an empty public, owned as production's is ─────────────────────────────
// The GRANT is Postgres's own default for a new database's public schema
// (initdb makes it); a schema made by hand lacks it, and the fidelity check
// showed the copy with a REVOKE production does not have.
runSql('0. clear public', AS_ADMIN, `
  DROP SCHEMA IF EXISTS public CASCADE;
  CREATE SCHEMA public AUTHORIZATION pg_database_owner;
  GRANT USAGE ON SCHEMA public TO PUBLIC;`);

// ── 1. extensions ─────────────────────────────────────────────────────────────
const extFile = read('live-extensions.sql');
runSql('1. extensions (live-extensions.sql)', AS_ADMIN, extFile);
// The local stack installs extensions production does not have (pg_graphql —
// GraphQL is off in production). Anything the snapshot does not list goes.
const wanted = new Set([...extFile.matchAll(/^CREATE EXTENSION IF NOT EXISTS "?([\w-]+)"?/gm)].map((m) => m[1]).concat('plpgsql'));
const extra = query(AS_ADMIN, 'SELECT extname FROM pg_extension ORDER BY 1').split('\n').filter((e) => e && !wanted.has(e));
if (extra.length) runSql(`1b. remove ${extra.join(', ')} (not in production)`, AS_ADMIN, extra.map((e) => `DROP EXTENSION "${e}" CASCADE;`).join('\n'));

// ── 2 & 3. public ─────────────────────────────────────────────────────────────
// Two kinds of statement in the dump need more than postgres: creating the
// schema (it exists — step 0 made it) and default privileges FOR ROLE
// supabase_admin. Each is matched exactly and counted, so a new kind of
// statement is never dropped silently.
const dump = read('live-schema.sql');
const lines = dump.split('\n');
const isCreatePublic = (l) => l === 'CREATE SCHEMA public;';
const isAdminDefault = (l) => l.startsWith('ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ');
const created = lines.filter(isCreatePublic).length;
if (created !== 1) fail('2. public (live-schema.sql)', `expected one "CREATE SCHEMA public;", found ${created}`);
const adminLines = lines.filter(isAdminDefault);
runSql('2. public (live-schema.sql), as postgres', AS_POSTGRES, lines.filter((l) => !isCreatePublic(l) && !isAdminDefault(l)).join('\n'));
runSql(`3. ${adminLines.length} default-privilege rules for supabase_admin`, AS_ADMIN, adminLines.join('\n'));

// ── 2b. the carriage returns production's function bodies hold ──────────────
// 118 functions were saved with CRLF, and the CR is part of their stored text.
// psql drops a CR at the end of every line it reads from a file, so step 2
// made them without it. Each is made again as one query passed whole (psql -c
// sends it as it is), so its bytes arrive intact. Found by the fidelity check.
const functionStatements = (text) => {
  const out = [];
  const starts = /^CREATE FUNCTION /gm;
  let m;
  while ((m = starts.exec(text))) {
    const open = /\bAS (\$[A-Za-z_]*\$)/g;
    open.lastIndex = m.index;
    const o = open.exec(text);
    if (!o) fail('2b. function bodies', `no dollar quote after the function at offset ${m.index}`);
    // pg_dump picks a tag that never appears in the body, so its next use closes it.
    const close = text.indexOf(o[1], o.index + o[0].length);
    const end = close < 0 ? -1 : text.indexOf(';', close + o[1].length);
    if (end < 0) fail('2b. function bodies', `the function at offset ${m.index} never closes`);
    out.push(text.slice(m.index, end + 1));
    starts.lastIndex = end + 1;
  }
  return out;
};
const withCr = functionStatements(dump).filter((s) => s.includes('\r'));
const crTotal = dump.split('\r').length - 1;
const crCovered = withCr.reduce((n, s) => n + s.split('\r').length - 1, 0);
if (crCovered !== crTotal) fail('2b. function bodies', `${crTotal} CRs in the dump but ${crCovered} inside functions — something else holds one`);
console.log(`→ 2b. ${withCr.length} function bodies again, with their ${crTotal} carriage returns`);
for (const stmt of withCr) {
  try {
    execFileSync('psql', [AS_POSTGRES, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', stmt.replace(/^CREATE FUNCTION /, 'CREATE OR REPLACE FUNCTION ')], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      // As in the dump's own preamble: names are qualified, and bodies are not checked at creation.
      env: { ...process.env, PGOPTIONS: '-c search_path= -c check_function_bodies=off' },
    });
  } catch (e) {
    fail('2b. function bodies', `${stmt.slice(16, 80)}…: ${(e.stderr || e.message).trim()}`);
  }
}
// Measured, not assumed: the stored text must now hold them.
const holding = Number(query(AS_ADMIN, "SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND strpos(prosrc, chr(13)) > 0"));
const crsStored = Number(query(AS_ADMIN, "SELECT coalesce(sum(length(prosrc) - length(replace(prosrc, chr(13), ''))), 0) FROM pg_proc WHERE pronamespace = 'public'::regnamespace"));
if (holding !== withCr.length || crsStored !== crTotal) {
  fail('2b. function bodies', `after re-making them, ${holding} functions hold ${crsStored} CRs; production's ${withCr.length} hold ${crTotal}`);
}
console.log(`   stored: ${holding} functions hold ${crsStored} carriage returns, as in production`);

// ── 4. everything outside public ─────────────────────────────────────────────
// As postgres: in production postgres owns the event trigger and the realtime
// publication (Supabase refuses a superuser-owned event trigger that runs a
// postgres-owned function, which is how this was found). Except the scheduled
// jobs: pg_cron lets only the superuser create a job in another role's name,
// and each job records the role it runs as — postgres — exactly as production.
const outside = read('live-outside-public.sql');
const sections = outside.split(/^(?=-- ── )/m);
const isJobs = (s) => s.startsWith('-- ── scheduled jobs');
if (sections.filter(isJobs).length !== 1) fail('4. outside public', 'expected exactly one "scheduled jobs" section in live-outside-public.sql');
runSql('4a. outside public (live-outside-public.sql), as postgres', AS_POSTGRES, sections.filter((s) => !isJobs(s)).join(''));
runSql('4b. scheduled jobs, as supabase_admin (each runs as the role it names)', AS_ADMIN, sections.find(isJobs));

// ── 5. vault stand-ins ────────────────────────────────────────────────────────
// Production's secrets never leave production. Each name the snapshot records
// gets a value that is obviously not a secret.
const secretNames = [...read('live-outside-public.sql').matchAll(/^-- ── vault secrets[^\n]*\n((?:-- [^\n]+\n)+)/gm)]
  .flatMap((m) => m[1].split('\n').map((l) => l.replace(/^-- /, '').trim()).filter((n) => n && n !== '(none)'));
runSql(`5. ${secretNames.length} vault stand-in(s)`, AS_ADMIN,
  secretNames.map((n) => `SELECT vault.create_secret('e2e-stand-in-not-a-secret', '${n.replace(/'/g, "''")}');`).join('\n'));

// ── 6. the migration ledger, as production has it ────────────────────────────
// Production has the ledger table with no rows (nothing is applied through it);
// the snapshot records that count, so the copy has the same empty table.
runSql('6. the empty migration ledger', AS_ADMIN, `
  CREATE SCHEMA IF NOT EXISTS supabase_migrations;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text);`);

// ── 7. sealed? ────────────────────────────────────────────────────────────────
// The push sender posts to production's notify-push. The call must not leave
// the runner: e2e.yml points production's host at 0.0.0.0 on the runner and
// inside every container. Fire one and read how pg_net says it ended.
const pushUrl = /url\s*:=\s*'(https:\/\/[^']+)'/.exec(dump)?.[1];
if (!pushUrl) fail('7. sealed', 'could not find the push sender\'s URL in live-schema.sql — has it moved?');

/** Fire one request from inside the database; return how pg_net says it ended. */
const probe = (url) => {
  const id = Number(query(AS_ADMIN, `SELECT net.http_post(url := '${url}', body := '{"e2e":"seal check"}'::jsonb)`));
  for (let i = 0; i < 60; i++) {
    execFileSync('sleep', ['0.5']);
    const row = query(AS_ADMIN, `SELECT coalesce(status_code::text, '') || '|' || coalesce(error_msg, '') FROM net._http_response WHERE id = ${id}`);
    if (row) { const [status, error] = row.split('|'); return { status, error }; }
  }
  return null;
};
const sealedAgainst = (label, url) => {
  const r = probe(url);
  if (!r) fail('7. sealed', `pg_net never answered ${label} — cannot tell whether it reached production`);
  if (r.status) fail('7. sealed', `the database reached ${label} (HTTP ${r.status}). The world is NOT sealed.`);
  console.log(`→ 7. sealed against ${label}: ${r.error.slice(0, 70)}`);
};
// By name — the call the push sender really makes.
sealedAgainst(new URL(pushUrl).host, pushUrl);
// By address — the firewall, for a container that ignores the hosts file.
// Plain http on purpose: a connection that got through is answered with a
// status by Cloudflare, where https to a bare address would fail on the
// certificate and look blocked.
const ips = (process.env.E2E_PROD_IPS ?? '').split(',').filter(Boolean);
if (!ips.length) fail('7. sealed', 'E2E_PROD_IPS is empty — e2e.yml must seal the addresses before bootstrap runs');
for (const ip of ips) sealedAgainst(`${ip} (an address of ${new URL(pushUrl).host})`, `http://${ip}/`);

console.log('\n✓ The E2E database is production\'s shape, and it cannot reach production.');

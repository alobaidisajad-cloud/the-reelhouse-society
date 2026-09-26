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
runSql('0. clear public', AS_ADMIN, `
  DROP SCHEMA IF EXISTS public CASCADE;
  CREATE SCHEMA public AUTHORIZATION pg_database_owner;`);

// ── 1. extensions ─────────────────────────────────────────────────────────────
runSql('1. extensions (live-extensions.sql)', AS_ADMIN, read('live-extensions.sql'));

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

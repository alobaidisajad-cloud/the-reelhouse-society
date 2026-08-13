#!/usr/bin/env node
/**
 * check-backend-live.mjs — verify the live backend matches the contract.
 * ──────────────────────────────────────────────────────────────────────
 * Companion to __tests__/backendContract.test.ts. The Jest test guards the
 * CODE side (what the app calls); this script guards the DEPLOY side (what
 * actually exists in production), catching the exact drift found on 2026-06-26:
 * an RPC/edge function the app needs that isn't deployed.
 *
 * It also verifies SECURITY POSTURE — live facts no test can derive from this
 * repo. Added 2026-08-10 after the schema snapshot misled three times in two
 * days: it showed a column-unrestricted profiles UPDATE policy (live is locked
 * to 7 columns), two conflicting role whitelists (live has one, permitting
 * 'admin' — acting on the snapshot would have locked out the moderators), and a
 * world-readable email column (live denies it). A lockdown written in a
 * migration is not a lockdown that is ON. Only the database can say.
 *
 * Run this before/after a deploy:
 *   SUPABASE_PROJECT_REF=xxxx SUPABASE_DB_URL=postgres://... node scripts/check-backend-live.mjs
 *
 * Config (env):
 *   SUPABASE_PROJECT_REF  project ref for `supabase functions list` (edge fns)
 *   SUPABASE_DB_URL       postgres connection string, for RPC signatures +
 *                         column grants, trigger enablement, RLS, ceiling count
 *   (the anon-visibility half needs NO config — the anon key is public by
 *    design and is read from .env, so that half always runs)
 *
 * Each check is skipped (with a warning) if its config / tool is unavailable,
 * and a SKIPPED CHECK COUNTS AS A FAILURE. An unrun check is not a pass; this
 * script once printed "Verified present in production: nothing." and exited 0.
 */
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(readFileSync(join(__dirname, 'backend-contract.json'), 'utf8'));

/**
 * Reading a value out of a KEY=value file, tolerating CRLF.
 */
function fromEnvFile(file, key) {
  try {
    for (const line of readFileSync(join(__dirname, '..', file), 'utf8').split('\n')) {
      const i = line.indexOf('=');
      if (i < 0) continue;
      if (line.slice(0, i).trim() === key) return line.slice(i + 1).trim();
    }
  } catch {
    /* no such file */
  }
  return '';
}

// A connection string that still carries its placeholder is not a connection
// string. Left unhandled it reaches psql, fails on authentication, and prints
// the failed command as a wall of text that reads like a bug in this script.
const PLACEHOLDERS = ['YOURPASSWORD', 'YOUR-PASSWORD', 'YOUR_PASSWORD', '[YOUR', 'PASTE', 'XXXX'];
const looksUnfinished = (s) => PLACEHOLDERS.some((p) => s.toUpperCase().includes(p));

let PROJECT_REF = process.env.SUPABASE_PROJECT_REF || fromEnvFile('.env.local', 'SUPABASE_PROJECT_REF');
let DB_URL = process.env.SUPABASE_DB_URL || fromEnvFile('.env.local', 'SUPABASE_DB_URL');

if (DB_URL && looksUnfinished(DB_URL)) {
  console.warn(
    '⚠ The saved connection string still has [YOUR-PASSWORD] in it, so it cannot connect.\n' +
      '  You will be asked for it again below.',
  );
  DB_URL = '';
}

// ASK, rather than making someone assemble shell variables by hand.
//
// This used to require exporting SUPABASE_DB_URL yourself before running. That
// is a two-step dance in PowerShell, the variable then persists for the life of
// the window, and a wrong value silently poisons every later run — which is
// exactly what happened. A tool that needs a value should ask for it.
// Only when attached to a terminal, so CI never hangs waiting on a human.
if (!DB_URL && process.stdin.isTTY) {
  const { createInterface } = await import('readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(
    '\nThe deeper checks (column permissions, trigger state, RLS, length ceilings)\n' +
      'need your database connection string. Supabase dashboard → Connect → Direct.\n' +
      'Remember to swap [YOUR-PASSWORD] for your real database password.\n' +
      'Press Enter alone to skip — the rest of the checks still run.\n',
  );
  const answer = (await rl.question('Connection string: ')).trim();
  if (answer && looksUnfinished(answer)) {
    console.warn(
      '\n⚠ That still contains [YOUR-PASSWORD]. Replace it with your actual database\n' +
        '  password (Project Settings → Database → Database password) and run again.',
    );
  } else if (answer) {
    DB_URL = answer;
    const save = (await rl.question('Save it so you are not asked again? (y/N) ')).trim().toLowerCase();
    if (save === 'y' || save === 'yes') {
      // .env.local is gitignored (mobile/.gitignore: `.env*.local`), so the
      // password cannot be committed by accident.
      const path = join(__dirname, '..', '.env.local');
      let existing = '';
      try {
        existing = readFileSync(path, 'utf8');
      } catch {
        /* first time */
      }
      const kept = existing
        .split('\n')
        .filter((l) => !l.startsWith('SUPABASE_DB_URL=') && !l.startsWith('SUPABASE_PROJECT_REF='))
        .join('\n')
        .replace(/\n+$/, '');
      writeFileSync(
        path,
        `${kept ? `${kept}\n` : ''}SUPABASE_DB_URL=${DB_URL}\nSUPABASE_PROJECT_REF=${PROJECT_REF || 'wihyqkpoymwcvbprslyz'}\n`,
      );
      console.log('  Saved to mobile/.env.local (gitignored).');
    }
  }
  rl.close();
}

// The project ref is public — it is the subdomain of the API URL the app ships,
// so there is no reason to make anyone type it. Derived below, once the app's
// own URL has been read from .env.

// The anon key is public by design (it ships in the app bundle). Reading it from
// .env means the security-posture half needs no secret and therefore actually runs.
let SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
let ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
if (!SUPABASE_URL || !ANON_KEY) {
  try {
    const env = readFileSync(join(__dirname, '..', '.env'), 'utf8');
    for (const line of env.split('\n')) {
      const i = line.indexOf('=');
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (k === 'EXPO_PUBLIC_SUPABASE_URL' && !SUPABASE_URL) SUPABASE_URL = v;
      if (k === 'EXPO_PUBLIC_SUPABASE_ANON_KEY' && !ANON_KEY) ANON_KEY = v;
    }
  } catch {
    /* no .env — the check reports itself skipped, which is a failure */
  }
}

// Derive the project ref from the app's own API URL rather than asking for it.
// It is the subdomain, it ships inside the app bundle, and it is not a secret.
if (!PROJECT_REF && SUPABASE_URL) {
  const m = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./);
  if (m) PROJECT_REF = m[1];
}

const missing = { rpcs: [], edgeFunctions: [] };
/** Declared signature no longer matches production — the #24 failure mode. */
const signatureDrift = [];
/** Entries still checked by name alone, so still blind to that failure mode. */
const unsignedRpcs = [];
let checkedEdges = false;
let checkedRpcs = false;

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

/**
 * Strip credentials before anything is printed.
 *
 * execSync's `e.message` is "Command failed: psql <the whole command>", and the
 * command carries the connection string — user, host AND password. On a terminal
 * that is untidy; in a CI log it is a leaked database password. Every path that
 * can surface a raw message goes through here.
 */
function redact(s) {
  return String(s ?? '').replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://<redacted>');
}

/**
 * The REASON psql failed, not the fact that it did.
 *
 * `e.message` is only "Command failed: psql <the entire query>" — it echoes back
 * a wall of SQL and says nothing about the cause, so "network unreachable" and
 * "password authentication failed" look identical and neither is actionable.
 * The cause is on stderr. This surfaces it, and recognises the one that is not
 * a mistake anyone can see: Supabase's direct host is IPv6-only, so on an IPv4
 * network the connection never reaches the point of checking a password.
 */
function why(e) {
  const err =
    (e.stderr?.toString() || '').trim().split('\n')[0] || redact(e.message).split('\n')[0];
  if (/unreachable|Cannot assign requested address|could not translate host|timeout expired/i.test(err)) {
    return (
      `${err}\n` +
      '    → the DIRECT host (db.<ref>.supabase.co) is IPv6-only. On an IPv4 network it\n' +
      '      is unreachable. Use the SESSION POOLER string instead (Connect → Session\n' +
      '      pooler); it looks like postgres.<ref>@aws-N-<region>.pooler.supabase.com.'
    );
  }
  return err;
}

// ── Edge functions (via supabase CLI) ──
if (PROJECT_REF) {
  try {
    const out = sh(`supabase functions list --project-ref ${PROJECT_REF} -o json`);
    const live = new Set(JSON.parse(out).map((f) => f.slug));
    for (const fn of contract.edgeFunctions) {
      if (!live.has(fn)) missing.edgeFunctions.push(fn);
    }
    checkedEdges = true;
  } catch (e) {
    console.warn(`⚠ edge-function check skipped (supabase CLI failed): ${e.message.split('\n')[0]}`);
  }
} else {
  console.warn('⚠ edge-function check skipped (set SUPABASE_PROJECT_REF).');
}

// ── RPCs (via psql against the live DB) ──
if (DB_URL) {
  try {
    // SIGNATURES, not names.
    //
    // This selected `proname` alone, which is exactly how #24 stayed invisible:
    // `get_priority_reports` existed under a name the app knew and a signature it
    // could not call, so this reported it healthy while every call 404'd. A name
    // says a function exists; only the signature says the app can reach it.
    const out = sh(
      `psql "${DB_URL}" -tAc "SELECT proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'"`,
    );
    const liveSignatures = new Set(out.split('\n').map((s) => s.trim()).filter(Boolean));
    const liveNames = new Set([...liveSignatures].map((s) => s.slice(0, s.indexOf('('))));

    for (const entry of contract.rpcs) {
      // An entry is either a bare name (legacy — existence only) or
      // { name, signature } which is checked exactly.
      const name = typeof entry === 'string' ? entry : entry.name;
      const signature = typeof entry === 'string' ? null : entry.signature;

      if (!liveNames.has(name)) {
        missing.rpcs.push(name);
        continue;
      }
      if (signature && !liveSignatures.has(signature)) {
        const actual = [...liveSignatures].filter((s) => s.startsWith(`${name}(`));
        signatureDrift.push(
          `${name}\n      declared: ${signature}\n      live:     ${actual.join(' | ') || '(none)'}`,
        );
      }
      if (!signature) unsignedRpcs.push(name);
    }
    checkedRpcs = true;
  } catch (e) {
    console.warn(`⚠ RPC check skipped — psql could not connect:\n    ${why(e)}`);
  }
} else {
  console.warn('⚠ RPC check skipped (set SUPABASE_DB_URL).');
}

// ── Security posture ──────────────────────────────────────────────────────
// Facts about the live database that this repo cannot derive. The schema
// snapshot misled three times in two days — it showed a column-unrestricted
// profiles UPDATE policy, two conflicting role whitelists, and a world-readable
// email column, and live was different (stricter) every time. Reading a
// migration proves someone WROTE a lockdown; only the database says it is on.
const sec = contract.security || {};
const posture = [];
let checkedAnon = false;
let checkedGrants = false;
// How many violations each half found — a section that RAN is not a section that PASSED.
let anonViolations = 0;
let grantViolations = 0;

// Tier A — anon probes. No secrets: the anon key is public by design and lives
// in .env, so this half runs anywhere, including a laptop with no DB access.
if (SUPABASE_URL && ANON_KEY) {
  try {
    const probe = async (table, column) => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${column}&limit=0`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      });
      return { status: r.status, body: r.status === 200 ? '' : await r.text() };
    };

    // The CONTROL first. If the API is unreachable or the key is wrong, every
    // "must not read" probe below fails-closed and the whole check passes while
    // verifying nothing — the exact green-tick-for-looking-at-nothing this
    // script was already fixed for once.
    const postureBeforeAnon = posture.length;
    let controlOk = true;
    for (const { table, column } of sec.anonMustRead || []) {
      const { status } = await probe(table, column);
      if (status !== 200) {
        controlOk = false;
        posture.push(
          `CONTROL FAILED: anon cannot read ${table}.${column} (HTTP ${status}). ` +
            `Every "hidden column" result below is therefore meaningless — not a pass.`,
        );
      }
    }

    if (controlOk) {
      for (const { table, column, why } of sec.anonMustNotRead || []) {
        const { status, body } = await probe(table, column);
        const denied = /42501|permission denied/.test(body);
        if (status === 200 || !denied) {
          posture.push(`anon CAN read ${table}.${column} — ${why}`);
        }
      }
      anonViolations = posture.length - postureBeforeAnon;
      checkedAnon = true;
    }
  } catch (e) {
    console.warn(`⚠ anon posture check skipped (fetch failed): ${e.message.split('\n')[0]}`);
  }
} else {
  console.warn('⚠ anon posture check skipped (set EXPO_PUBLIC_SUPABASE_URL + _ANON_KEY).');
}

// Tier B — grants, triggers, RLS, ceilings. Needs real DB access.
if (DB_URL) {
  try {
    const postureBeforeGrants = posture.length;
    const q = (sql) => sh(`psql "${DB_URL}" -tAc "${sql.replace(/"/g, '\\"')}"`).trim();

    // 1. Exactly which columns may an ordinary member write to their own row.
    //    Too many is self-elevation; too few silently breaks profile editing.
    const grants = q(
      `SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.column_privileges ` +
        `WHERE table_schema='public' AND table_name='profiles' AND privilege_type='UPDATE' AND grantee='authenticated'`,
    );
    const expected = [...(sec.profilesUpdatableColumns || [])].sort().join(',');
    if (grants !== expected) {
      posture.push(
        `profiles UPDATE grant drift for 'authenticated'\n      expected: ${expected || '(none)'}\n      live:     ${grants || '(none — profile editing is broken)'}`,
      );
    }
    // A blanket table-level grant makes the column list above cosmetic.
    const blanket = q(
      `SELECT count(*) FROM information_schema.role_table_grants ` +
        `WHERE table_schema='public' AND table_name='profiles' AND privilege_type='UPDATE' AND grantee IN ('anon','authenticated')`,
    );
    if (blanket !== '0') {
      posture.push(
        `profiles has a TABLE-level UPDATE grant (${blanket}) — that overrides the column list and re-opens self-elevation`,
      );
    }

    // 2. Triggers must exist AND be enabled. 'D' is disabled; it looks identical
    //    to a working trigger in every migration file.
    for (const { table, trigger, why } of sec.mustBeEnabledTriggers || []) {
      const state = q(
        `SELECT t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid ` +
          `JOIN pg_namespace n ON n.oid=c.relnamespace ` +
          `WHERE n.nspname='public' AND c.relname='${table}' AND t.tgname='${trigger}' AND NOT t.tgisinternal`,
      );
      if (!state) posture.push(`trigger MISSING: ${table}.${trigger} — ${why}`);
      else if (state !== 'O') posture.push(`trigger DISABLED (tgenabled=${state}): ${table}.${trigger} — ${why}`);
    }

    // 3. RLS on every public table.
    if (sec.rlsRequiredOnEveryPublicTable) {
      const off = q(
        `SELECT string_agg(c.relname, ', ' ORDER BY c.relname) FROM pg_class c ` +
          `JOIN pg_namespace n ON n.oid=c.relnamespace ` +
          `WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity`,
      );
      if (off) posture.push(`RLS is OFF on: ${off}`);
    }

    // 4. The length ceilings are still there. Dropping one is silent otherwise.
    if (sec.minLengthCeilings) {
      const n = Number(
        q(`SELECT count(*) FROM pg_constraint WHERE contype='c' AND conname LIKE '%\\_len'`),
      );
      if (!(n >= sec.minLengthCeilings)) {
        posture.push(`length ceilings dropped: ${n} live, expected at least ${sec.minLengthCeilings}`);
      }
    }
    // 5. Every function in public demotes pg_temp.
    //    `SET search_path = public` is a VACUOUS pin: PostgreSQL searches pg_temp
    //    FIRST — before pg_catalog — for relation names unless pg_temp is named
    //    explicitly, so a temp table shadows the real one. Both anon and
    //    authenticated hold TEMP privilege here.
    //    Proven on production 2026-08-10: with a decoy `logs` table planted,
    //    get_profile_counts reported logs_count 0 / ledger_count 0 instead of
    //    145 / 93. After pinning `public, pg_temp` the same attack returned the
    //    true numbers. This check exists because the repo cannot see proconfig —
    //    a function added straight through the SQL editor would never appear in
    //    a migration file, and only the live DB knows.
    if (sec.everyFunctionDemotesPgTemp) {
      const bad = q(
        `SELECT string_agg(p.proname, ', ' ORDER BY p.proname) FROM pg_proc p ` +
          `JOIN pg_namespace n ON n.oid=p.pronamespace ` +
          `WHERE n.nspname='public' AND p.prokind='f' AND NOT COALESCE(` +
          `(SELECT cfg FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%') LIKE '%pg_temp%', false)`,
      );
      if (bad) posture.push(`search_path is not pg_temp-safe on: ${bad}`);
    }

    // 9. No column is invisible to every client.
    //    profiles is protected by COLUMN-level grants, and PostgreSQL does not
    //    extend those to columns created later. So the next ALTER TABLE ADD
    //    COLUMN produces a column no client can read — and the error names the
    //    TABLE, not the column: "permission denied for table profiles". The
    //    cause looks nothing like the symptom.
    //    Reproduced live: adding a column left it unreadable by anon AND
    //    authenticated, while existing named-column queries kept working, so
    //    nothing fails until someone selects the new column.
    //    Private-by-default is the RIGHT posture — it is the same whitelist
    //    logic the email-harvest fix chose deliberately. What was missing is
    //    noticing. Exactly two columns are meant to be invisible to both roles;
    //    a third means someone added a column and forgot the grant.
    if (sec.columnsInvisibleToEveryClient) {
      const expected = [...sec.columnsInvisibleToEveryClient].sort().join(', ');
      const live = q(
        `SELECT COALESCE(string_agg(x, ', ' ORDER BY x), '') FROM (` +
          `SELECT c.table_name||'.'||c.column_name AS x ` +
          `FROM information_schema.columns c ` +
          `JOIN information_schema.tables t ON t.table_name=c.table_name AND t.table_schema=c.table_schema ` +
          `WHERE c.table_schema='public' AND t.table_type='BASE TABLE' ` +
          `AND NOT has_column_privilege('anon','public.'||quote_ident(c.table_name),c.column_name,'SELECT') ` +
          `AND NOT has_column_privilege('authenticated','public.'||quote_ident(c.table_name),c.column_name,'SELECT')) s`,
      );
      if (live !== expected) {
        posture.push(
          `columns invisible to every client changed\n      expected: ${expected}\n      live:     ${live || '(none)'}` +
            `\n    A new one means a column was added without extending the column-level grant;` +
            `\n    reads of it will fail with "permission denied for table <name>".`,
        );
      }
    }

    // 8. Index hygiene: no redundant indexes, and no unindexed foreign keys.
    //    Both are invisible to the repo — an index added through the SQL editor,
    //    or a new FK created without one, appears in no migration file.
    //    Redundant means STRUCTURALLY covered by another index (identical, or a
    //    wider index starting with the same column), never "looks unused":
    //    proven on this database that a 32-row table ignores a good index while a
    //    54-row table uses one, so scan counts say nothing about worth.
    //    An unindexed FK makes every parent delete scan the whole child table —
    //    measured at 143x on 200k rows, and account deletion crosses ~12 of them.
    if (sec.indexHygiene) {
      // Coverage is compared at ANY width, not just single-column. The first
      // version of this check only looked at indnkeyatts=1, and two multi-column
      // duplicates survived the batch because of it — idx_logs_composite_user_film
      // (user_id, film_id) sat beside both a UNIQUE index on exactly those columns
      // and a wider one starting with them, on the hottest write table in the app.
      const dup = q(
        `SELECT string_agg(x, ', ') FROM (SELECT DISTINCT ic.relname AS x FROM pg_index i ` +
          `JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_class c ON c.oid=i.indrelid ` +
          `JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public' ` +
          `WHERE i.indnatts=i.indnkeyatts AND NOT i.indisunique AND i.indpred IS NULL ` +
          `AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid=i.indexrelid) ` +
          `AND EXISTS (SELECT 1 FROM pg_index o WHERE o.indrelid=i.indrelid AND o.indexrelid<>i.indexrelid ` +
          `AND o.indpred IS NULL AND o.indkey[0:i.indnkeyatts-1]=i.indkey[0:i.indnkeyatts-1] ` +
          `AND (o.indnkeyatts>i.indnkeyatts OR (o.indisunique AND o.indnkeyatts=i.indnkeyatts)))) s`,
      );
      if (dup) posture.push(`redundant index(es) — already covered by another: ${dup}`);

      const maxFk = Number(sec.maxUnindexedForeignKeys ?? 0);
      const fk = Number(
        q(
          `SELECT count(*) FROM pg_constraint con ` +
            `JOIN pg_namespace n ON n.oid=con.connamespace AND n.nspname='public' ` +
            `JOIN LATERAL unnest(con.conkey) k(attnum) ON true ` +
            `WHERE con.contype='f' AND array_length(con.conkey,1)=1 ` +
            `AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=con.conrelid AND i.indkey[0]=k.attnum)`,
        ),
      );
      if (fk > maxFk) {
        posture.push(
          `${fk} unindexed foreign key(s), expected at most ${maxFk} — every parent delete scans the child table`,
        );
      }
    }

    // 6. Actually RUN the admin read RPCs, as an admin, inside a rolled-back
    //    transaction.
    //    Existence is not health. get_priority_reports existed, was granted, and
    //    had the right signature — and raised on every single call for days,
    //    because it declared `content_id uuid` while reports.content_id is text.
    //    PostgreSQL validates a RETURNS TABLE descriptor at execution, so no
    //    static check could see it; only calling it could. The Tribunal docket
    //    was unopenable and every name-and-signature check reported healthy.
    //    The jwt claim is built with json_build_object so this SQL carries no
    //    double quotes to survive shell escaping.
    // 7. anon/authenticated hold no TRUNCATE, REFERENCES or TRIGGER.
    //    TRUNCATE is the one write RLS cannot defend: a DELETE with the anon key
    //    returns 204 and removes nothing because the policies filter the rows,
    //    but TRUNCATE has no rows to filter. Nothing needs it — PostgREST answers
    //    the verb with 501 and no function contains it — so it is simply gone.
    //    This also catches a NEW table arriving with Supabase's default GRANT ALL,
    //    which is the way this drifts back.
    if (sec.noWipePrivileges) {
      const bad = q(
        `SELECT string_agg(DISTINCT c.relname, ', ') FROM pg_class c ` +
          `JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public' ` +
          `CROSS JOIN (VALUES ('anon'),('authenticated')) AS rr(role) ` +
          `CROSS JOIN (VALUES ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) AS pp(priv) ` +
          `WHERE c.relkind IN ('r','p','m') AND has_table_privilege(rr.role, c.oid, pp.priv)`,
      );
      if (bad) posture.push(`anon/authenticated still hold TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on: ${bad}`);

      // A materialized view cannot carry RLS — PostgreSQL has no policy to apply —
      // so a SELECT grant on one is unconditional access to every row it holds.
      // global_feed_materialized served 263 rows of usernames and review text to
      // `anon` over HTTP 200, and sealing a member changed nothing. Any matview
      // readable by these roles is that same leak.
      const mv = q(
        `SELECT string_agg(DISTINCT c.relname, ', ') FROM pg_class c ` +
          `JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public' ` +
          `CROSS JOIN (VALUES ('anon'),('authenticated')) AS rr(role) ` +
          `WHERE c.relkind='m' AND has_table_privilege(rr.role, c.oid, 'SELECT')`,
      );
      if (mv) posture.push(`materialized view readable by anon/authenticated (RLS cannot protect it): ${mv}`);
    }

    //    Guarded on an admin existing: with no admin row, set_config would write a
    //    null subject and every one of these RPCs would raise "Not authenticated",
    //    reporting the whole admin surface broken when nothing is. A guard that
    //    cries wolf is a guard someone eventually deletes.
    const adminId =
      (sec.smokeExecuteAsAdmin || []).length > 0
        ? q(`SELECT id FROM public.profiles WHERE role='admin' LIMIT 1`)
        : '';
    if ((sec.smokeExecuteAsAdmin || []).length > 0 && !adminId) {
      console.warn('⚠ admin RPC smoke test skipped — no profile with role=admin exists.');
    }
    for (const call of adminId ? sec.smokeExecuteAsAdmin : []) {
      try {
        q(
          `BEGIN; ` +
            `SELECT set_config('request.jwt.claims', json_build_object(` +
            `'sub',(SELECT id FROM public.profiles WHERE role='admin' LIMIT 1),` +
            `'role','authenticated')::text, true); ` +
            `SELECT count(*) FROM ${call}; ` +
            `ROLLBACK;`,
        );
      } catch (e) {
        posture.push(`admin RPC raises when called: ${call} — ${why(e)}`);
      }
    }

    grantViolations = posture.length - postureBeforeGrants;
    checkedGrants = true;
  } catch (e) {
    console.warn(`⚠ grant/trigger/RLS check skipped — psql could not connect:\n    ${why(e)}`);
  }
} else {
  console.warn('⚠ grant/trigger/RLS check skipped (set SUPABASE_DB_URL).');
}

// ── Report ──
const skipped = [
  !checkedEdges && 'edge functions',
  !checkedRpcs && 'RPCs',
  !checkedAnon && 'anon column visibility',
  !checkedGrants && 'grants/triggers/RLS',
].filter(Boolean);

// A check that verifies NOTHING must not report success.
//
// This printed "✓ Verified present in production: nothing." and exited 0 when
// both halves were skipped — a green tick for having looked at nothing, which
// reads identically to a pass in any log or CI summary. Whether it ran is now
// part of the result.
const failed =
  missing.rpcs.length > 0 ||
  missing.edgeFunctions.length > 0 ||
  signatureDrift.length > 0 ||
  posture.length > 0 ||
  skipped.length > 0;

if (missing.rpcs.length || missing.edgeFunctions.length) {
  console.error('\n✗ Backend contract entries MISSING from production:');
  if (missing.rpcs.length) console.error('  RPCs:', missing.rpcs.join(', '));
  if (missing.edgeFunctions.length) console.error('  Edge functions:', missing.edgeFunctions.join(', '));
  console.error('\nDeploy the missing functions before shipping the app build.');
}

if (signatureDrift.length) {
  console.error('\n✗ Backend contract SIGNATURE DRIFT — the function exists but the app cannot call it:');
  for (const d of signatureDrift) console.error(`    ${d}`);
  console.error('\nThis is the #24 failure mode: a name that resolves and a signature that does not.');
}

if (posture.length) {
  console.error('\n✗ SECURITY POSTURE has drifted from the contract:');
  for (const p of posture) console.error(`    ${p}`);
  console.error(
    '\nThese are live facts, not repo facts. The schema snapshot has been wrong about\n' +
      'all three of these before — a lockdown written in a migration is not a lockdown\n' +
      'that is on. Fix production, then update scripts/backend-contract.json.',
  );
}

if (skipped.length) {
  console.error(`\n✗ Not checked: ${skipped.join(' + ')}.`);
  console.error('  Set SUPABASE_DB_URL / SUPABASE_PROJECT_REF. An unrun check is not a pass.');
}

// Say what DID pass, even when something else was skipped.
//
// Without this the run is all warnings and one error: a member reads it as
// "everything is broken" when in fact the security posture was checked against
// production and was clean. Reporting only failures is the same defect as
// reporting only successes — the reader cannot tell verified-good from
// not-looked-at, which is the distinction this whole script exists to make.
// A section only counts as passed if it RAN and produced no violations.
// `checkedAnon` alone is not enough: it means "the probes completed", not "they
// were clean", so a run that FOUND drift would print the violation and a green
// tick for the very same check directly underneath it.
const passed = [
  checkedEdges && !missing.edgeFunctions.length && 'edge functions',
  checkedRpcs && !missing.rpcs.length && !signatureDrift.length && 'RPC signatures',
  checkedAnon && anonViolations === 0 && 'anon column visibility',
  checkedGrants && grantViolations === 0 && 'profile grants + triggers + RLS + length ceilings',
].filter(Boolean);

if (passed.length && failed) {
  console.log(`\n✓ Checked against production and CLEAN: ${passed.join(', ')}.`);
  if (checkedAnon) {
    const n = (sec.anonMustNotRead || []).length;
    console.log(`  ${n} column(s) confirmed still hidden from anonymous readers.`);
  }
}

if (!failed) {
  console.log(`✓ Verified against production: ${passed.join(', ')}.`);
  if (unsignedRpcs.length) {
    // Named-only entries still cannot catch signature drift. Reported every run
    // so the remaining blind spot is a number someone can watch shrink, rather
    // than a silence.
    console.log(`  ${unsignedRpcs.length} RPC(s) checked by NAME only — still blind to signature drift:`);
    console.log(`    ${unsignedRpcs.join(', ')}`);
  }
}

process.exit(failed ? 1 : 0);

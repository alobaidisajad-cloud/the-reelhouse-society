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
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(readFileSync(join(__dirname, 'backend-contract.json'), 'utf8'));

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || '';
const DB_URL = process.env.SUPABASE_DB_URL || '';

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
    console.warn(`⚠ RPC check skipped (psql failed): ${e.message.split('\n')[0]}`);
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
    checkedGrants = true;
  } catch (e) {
    console.warn(`⚠ grant/trigger/RLS check skipped (psql failed): ${e.message.split('\n')[0]}`);
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

if (!failed) {
  console.log('✓ Verified against production: edge functions + RPCs.');
  if (unsignedRpcs.length) {
    // Named-only entries still cannot catch signature drift. Reported every run
    // so the remaining blind spot is a number someone can watch shrink, rather
    // than a silence.
    console.log(`  ${unsignedRpcs.length} RPC(s) checked by NAME only — still blind to signature drift:`);
    console.log(`    ${unsignedRpcs.join(', ')}`);
  }
}

process.exit(failed ? 1 : 0);

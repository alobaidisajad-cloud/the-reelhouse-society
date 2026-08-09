#!/usr/bin/env node
/**
 * check-backend-live.mjs — verify the live backend matches the contract.
 * ──────────────────────────────────────────────────────────────────────
 * Companion to __tests__/backendContract.test.ts. The Jest test guards the
 * CODE side (what the app calls); this script guards the DEPLOY side (what
 * actually exists in production), catching the exact drift found on 2026-06-26:
 * an RPC/edge function the app needs that isn't deployed.
 *
 * Run this before/after a deploy:
 *   SUPABASE_PROJECT_REF=xxxx SUPABASE_DB_URL=postgres://... node scripts/check-backend-live.mjs
 *
 * Config (env):
 *   SUPABASE_PROJECT_REF  project ref for `supabase functions list` (edge fns)
 *   SUPABASE_DB_URL       postgres connection string for the RPC check (uses psql)
 * Each check is skipped (with a warning) if its config / tool is unavailable.
 * Exits non-zero if any contract entry is missing live.
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(readFileSync(join(__dirname, 'backend-contract.json'), 'utf8'));

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || '';
const DB_URL = process.env.SUPABASE_DB_URL || '';

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

// ── Report ──
const skipped = [!checkedEdges && 'edge functions', !checkedRpcs && 'RPCs'].filter(Boolean);

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

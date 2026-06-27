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
    const out = sh(
      `psql "${DB_URL}" -tAc "SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'"`,
    );
    const live = new Set(out.split('\n').map((s) => s.trim()).filter(Boolean));
    for (const rpc of contract.rpcs) {
      if (!live.has(rpc)) missing.rpcs.push(rpc);
    }
    checkedRpcs = true;
  } catch (e) {
    console.warn(`⚠ RPC check skipped (psql failed): ${e.message.split('\n')[0]}`);
  }
} else {
  console.warn('⚠ RPC check skipped (set SUPABASE_DB_URL).');
}

// ── Report ──
const failed = missing.rpcs.length > 0 || missing.edgeFunctions.length > 0;
if (failed) {
  console.error('\n✗ Backend contract entries MISSING from production:');
  if (missing.rpcs.length) console.error('  RPCs:', missing.rpcs.join(', '));
  if (missing.edgeFunctions.length) console.error('  Edge functions:', missing.edgeFunctions.join(', '));
  console.error('\nDeploy the missing functions before shipping the app build.');
} else {
  const ran = [checkedEdges && 'edge functions', checkedRpcs && 'RPCs'].filter(Boolean);
  const skipped = [!checkedEdges && 'edge functions', !checkedRpcs && 'RPCs'].filter(Boolean);
  console.log(`✓ Verified present in production: ${ran.length ? ran.join(' + ') : 'nothing'}.`);
  if (skipped.length) console.log(`  (not checked: ${skipped.join(' + ')} — provide the config above to include them.)`);
}

process.exit(failed ? 1 : 0);

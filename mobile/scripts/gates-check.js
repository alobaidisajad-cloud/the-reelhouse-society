#!/usr/bin/env node
/**
 * gates:check — does the LIVE database enforce what we sell?
 *
 * `aRankIsSoldEnforcedAndExplained` compares the promise, the door and our
 * WRITTEN CLAIM about the server. It cannot compare the claim to production —
 * a test that needs the network is a test that fails on a plane.
 *
 * So this does, and it is the half that matters: this project has two supabase
 * trees pointed at one database, and a migration file has never been proof of
 * what is actually running.
 *
 *   npm run gates:check
 *
 * Needs SUPABASE_DB_URL in mobile/.env.local.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MOBILE = path.join(__dirname, '..');

// ── the claim ───────────────────────────────────────────────────────────────
// Read from the TypeScript source rather than imported, so this script needs no
// build step and cannot be fooled by a stale one.
const src = fs.readFileSync(path.join(MOBILE, 'src/constants/gatedFeatures.ts'), 'utf8');

const claimedTriggers = [...src.matchAll(/kind: 'refuses', table: '([a-z_]+)', trigger: '([a-z_]+)'/g)]
  .map((m) => ({ table: m[1], trigger: m[2] }));
const claimedStrips = [...src.matchAll(/kind: 'strips', table: '([a-z_]+)', fields: \[([^\]]+)\]/g)]
  .flatMap((m) => m[2].split(',').map((f) => ({ table: m[1], field: f.trim().replace(/'/g, '') })));

if (!claimedTriggers.length || !claimedStrips.length) {
  console.error('gates:check — could not read the claims out of gatedFeatures.ts.');
  console.error('That is a parse failure, not a clean result. Refusing to report success.');
  process.exit(1);
}

// ── the database ────────────────────────────────────────────────────────────
const envFile = path.join(MOBILE, '.env.local');
const dbUrl = (fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '')
  .split(/\r?\n/)
  .map((l) => /^\s*SUPABASE_DB_URL\s*=\s*(.*)$/.exec(l))
  .filter(Boolean)
  .map((m) => m[1].trim().replace(/^["']|["']$/g, ''))[0];

if (!dbUrl) {
  console.error('gates:check — no SUPABASE_DB_URL in mobile/.env.local; cannot verify anything.');
  process.exit(1);
}

/**
 * Split on the line ending, not on '\n' after a single trim().
 *
 * psql on Windows ends every row with CR. Trimming the whole output strips it
 * from the LAST row only, so exactly one row compared equal and the other five
 * reported as BOTH "missing from production" and "withheld unsold" — the
 * signature of a broken comparison, since a real disagreement cannot be both.
 */
const q = (sql) =>
  execFileSync('psql', [dbUrl, '-t', '-A', '-F', '\t', '-c', sql], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((l) => l.replace(/\r$/, '').trim())
    .filter(Boolean)
    .map((r) => r.split('\t').map((c) => c.trim()));

const liveTriggers = q(`
  SELECT c.relname, t.tgname
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE n.nspname='public' AND NOT t.tgisinternal AND p.proname='enforce_tier_gate'`);

const stripSrc = q(`SELECT prosrc FROM pg_proc WHERE proname='enforce_log_tier_fields'`)
  .map((r) => r[0]).join('\n');

const liveStripped = new Set(
  [...stripSrc.matchAll(/NEW\.([a-z_]+)\s*:=/g)].map((m) => m[1]),
);

// ── compare ─────────────────────────────────────────────────────────────────
const problems = [];

for (const c of claimedTriggers) {
  if (!liveTriggers.some(([tbl, trg]) => tbl === c.table && trg === c.trigger)) {
    problems.push(`we claim ${c.table}.${c.trigger} guards a paid feature — PRODUCTION HAS NO SUCH TRIGGER`);
  }
}
for (const [tbl, trg] of liveTriggers) {
  if (!claimedTriggers.some((c) => c.table === tbl && c.trigger === trg)) {
    problems.push(`${tbl}.${trg} withholds something in production that no promise covers`);
  }
}
for (const c of claimedStrips) {
  if (!liveStripped.has(c.field)) {
    problems.push(`we sell ${c.table}.${c.field} as a paid field — production does NOT withhold it`);
  }
}
for (const f of liveStripped) {
  if (!claimedStrips.some((c) => c.field === f)) {
    problems.push(`production silently blanks logs.${f} and nothing sells it`);
  }
}

// ── the hole this whole study found: gated at the door, open in the room ────
const unguarded = q(`
  SELECT 'lounge_messages', count(*)::text FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE c.relname='lounge_messages' AND p.proname='enforce_tier_gate' AND NOT t.tgisinternal
  UNION ALL
  SELECT 'free members inside a salon', count(*)::text
    FROM public.lounge_members lm JOIN public.profiles pr ON pr.id=lm.user_id
    WHERE lm.status='approved'
      AND public.profile_tier_weight(pr.tier, pr.role, pr.is_founding) = 0`);

const postingTriggers = Number(unguarded.find((r) => r[0] === 'lounge_messages')?.[1] ?? '0');
const freeInside = Number(unguarded.find((r) => r[0] === 'free members inside a salon')?.[1] ?? '0');

console.log(`triggers claimed: ${claimedTriggers.length}   live: ${liveTriggers.length}`);
console.log(`stripped fields claimed: ${claimedStrips.length}   live: ${liveStripped.size}`);
console.log(`posting into a salon: ${postingTriggers} tier trigger(s); ${freeInside} free member(s) currently inside`);

if (postingTriggers === 0 && freeInside > 0) {
  console.log('\nNOTE: the Lounge is gated at the door and open inside the room.');
  console.log('      Deliberate grandfathering or an unmade decision — but it is not enforced.');
}

if (problems.length) {
  console.error('\n' + problems.map((p) => '  ✗ ' + p).join('\n'));
  console.error(`\ngates:check FAILED — ${problems.length} disagreement(s) between what we sell and what we enforce.`);
  process.exit(1);
}
console.log('\ngates:check passed — every paid feature is enforced in production, and nothing is withheld unsold.');

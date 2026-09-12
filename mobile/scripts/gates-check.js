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

/**
 * The tables the Cinephile list rests on. Gating one of these is a single line
 * of SQL, and nobody re-reads the free list afterwards — so production is asked
 * directly whether any of them has grown a tier trigger.
 */
const mustStayFree = [...src.matchAll(/tables: \[([^\]]*)\]/g)]
  .flatMap((m) => m[1].split(',').map((t) => t.trim().replace(/'/g, '')))
  .filter(Boolean);

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

// ── the other direction: is what we advertise as FREE still free? ───────────
if (mustStayFree.length) {
  const gatedFree = q(`
    SELECT c.relname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname='public' AND NOT t.tgisinternal AND p.proname LIKE '%tier%'
      AND c.relname = ANY(ARRAY[${mustStayFree.map((t) => `'${t}'`).join(',')}])`);
  for (const [tbl] of gatedFree) {
    problems.push(`${tbl} is advertised as FREE on the Cinephile list and production now tier-gates it`);
  }
}

/**
 * The Dispatch trigger is the one gate with a WHEN clause, and that clause is
 * load-bearing: it is the only thing making takes, seekings and wires free.
 * Widen it to every kind and three free promises silently become paid.
 */
const dispatchWhen = q(`
  SELECT pg_get_triggerdef(t.oid)
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  WHERE c.relname='dispatch_posts' AND t.tgname='tr_tier_gate_dispatch' AND NOT t.tgisinternal`)
  .map((r) => r[0]).join(' ');

if (dispatchWhen && !/WHEN .*kind = ANY .*ballot.*dossier/s.test(dispatchWhen)) {
  problems.push(
    'tr_tier_gate_dispatch no longer fires only for ballots and essays — '
    + 'takes, seekings and wires are advertised as free and this is what keeps them free',
  );
}

// ── can the app turn every refusal into a door? ─────────────────────────────
//
// Each trigger raises a sentence written for a person to read. `tierRefusal.ts`
// is what turns one into a clearance gate — and a trigger whose wording it does
// not recognise falls through to whatever generic "that did not save" copy the
// calling screen happens to have, with no way forward. So the sentences the
// database can raise and the sentences the app can read must be the same set.
const refusalSrc = fs.readFileSync(path.join(MOBILE, 'src/utils/tierRefusal.ts'), 'utf8');
const knownSentences = [...refusalSrc.matchAll(/match: \/\^([^$]+)\$\//g)].map((m) => m[1]);

if (!knownSentences.length) {
  console.error('gates:check — could not read any sentences out of tierRefusal.ts.');
  console.error('That is a parse failure, not a clean result.');
  process.exit(1);
}

const liveMessages = q(`
  SELECT DISTINCT (regexp_match(pg_get_triggerdef(t.oid), ''', ''([^'']+)''\\)'))[1]
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE n.nspname='public' AND NOT t.tgisinternal AND p.proname='enforce_tier_gate'`)
  .map((r) => r[0]).filter(Boolean);

for (const msg of liveMessages) {
  if (!knownSentences.some((k) => new RegExp(`^${k}$`).test(msg))) {
    problems.push(`production can refuse with "${msg}" and tierRefusal.ts cannot read it — `
      + 'the member would get a generic failure and no way forward');
  }
}
for (const k of knownSentences) {
  if (!liveMessages.some((m) => new RegExp(`^${k}$`).test(m))) {
    problems.push(`tierRefusal.ts expects "${k}" but no live trigger raises it`);
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

// ── and can the funnel actually RECORD what the registry names? ─────────────
//
// The quiet failure. `record_gate_event` folds anything failing a shape check
// into 'other' — by design, because anon may call it and the table must stay
// bounded. But that means a feature id with an underscore or a capital would
// have every one of its taps disappear into 'other' for ever, with no error
// anywhere, and the funnel for that door would read a confident zero.
//
// Checked against the LIVE function's own regexes rather than a copy of them,
// so tightening the rule in a migration cannot leave this agreeing with a
// version of itself.
const fnSrc = q(
  `SELECT prosrc FROM pg_proc WHERE oid='public.record_gate_event(text,text,text,text)'::regprocedure`,
)
  .map((r) => r[0])
  .join('\n');

if (!fnSrc.trim()) {
  problems.push('record_gate_event is not deployed — every gate tap is recorded nowhere');
} else {
  const featureRule = /v_feature !~ '(\^[^']+\$)'/.exec(fnSrc);
  const vocabulary = /p_event NOT IN \(([^)]*)\)/.exec(fnSrc);
  if (!featureRule || !vocabulary) {
    // Without this the loop below would pass over an empty rule set, which
    // reads exactly like "every id is fine".
    problems.push("could not read record_gate_event's own rules — the vocabulary check would be vacuous");
  } else {
    const shape = new RegExp(featureRule[1]);
    // The tripwire: prove the rule rejects something before trusting it to
    // accept our ids.
    if (shape.test('The_Archive')) {
      problems.push(`the live feature-id rule ${featureRule[1]} filters nothing`);
    }
    const featureIds = [...src.matchAll(/^\s*id:\s*'([^']+)'/gm)].map((m) => m[1]);
    if (featureIds.length < 5) {
      problems.push('the registry scan found almost no feature ids — it is not reading the file');
    }
    for (const id of featureIds) {
      if (!shape.test(id)) {
        problems.push(`feature id '${id}' fails the live shape rule — its taps would vanish into 'other'`);
      }
    }

    const sqlEvents = [...vocabulary[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
    const seam = fs.readFileSync(path.join(MOBILE, 'src/utils/gateTelemetry.ts'), 'utf8');
    const tsEvents = [...seam.matchAll(/^\s*\|\s*'(\w+)'/gm)].map((m) => m[1]);
    for (const e of tsEvents) {
      if (!sqlEvents.includes(e)) {
        problems.push(`the app sends '${e}' and the server drops it on the floor`);
      }
    }
    for (const e of sqlEvents) {
      if (!tsEvents.includes(e)) {
        problems.push(`the server accepts '${e}' and nothing sends it`);
      }
    }
    console.log(`funnel vocabulary: ${featureIds.length} feature id(s), ${tsEvents.length} event(s) — all recordable`);
  }
}

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

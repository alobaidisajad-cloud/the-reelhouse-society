#!/usr/bin/env node
/**
 * train-locks.mjs — the pending train run on a house of 100,000 members, every lock it takes timed (P0.6).
 *
 * Runs on the CI runner's own copy of production's shape, after e2e/load/seed.sql, before
 * probe.mjs. It takes the train's own plan (supabase/diagnostics/train.cjs: the pending
 * migrations, each with its one rehearsal, production's lock wait and statement limits) and runs
 * it twice, as production will:
 *   A. each rehearsal as the train rehearses it: the cars before it applied first, its own
 *      migration, its cases, all in one transaction that is rolled back;
 *   B. each migration applied file by file, one transaction each, as apply.cjs applies it.
 * Meanwhile a second connection reads pg_locks every SAMPLE_MS. A lock is timed from the first
 * sample that sees it granted to the last (a lock is held to the end of the transaction that took
 * it, so in A a migration's lock is held through every case after it), and blamed on the
 * statement that was running when it appeared.
 *
 * It fails when a lock that blocks a member's reads or writes (Share, Share Row Exclusive,
 * Exclusive, Access Exclusive) on a relation the app reads or writes (anything in public, and
 * storage.objects) is held for over HELD_MS, in either run; and when a migration does not apply.
 * A rehearsal that fails on the load house is said, not failed on: its cases are P0.7's to make
 * house-agnostic. The report goes to the step summary and lock-report.txt.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = join(HERE, '..', '..');

export const SAMPLE_MS = 100;
export const HELD_MS = 1000;
/** The modes that stop a member's reads or writes on the relation. */
export const BLOCKING = new Set(['ShareLock', 'ShareRowExclusiveLock', 'ExclusiveLock', 'AccessExclusiveLock']);
const APP = 'train-locks';
const LIMITS = '-c lock_timeout=2s -c statement_timeout=30s';

const DB = process.env.LOAD_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** A relation the app reads or writes. */
export const clientRelation = (schema, name) => schema === 'public' || `${schema}.${name}` === 'storage.objects';

/**
 * From samples ({t, relation, schema, mode, granted, query, pid}, with ticks), each lock's hold:
 * its first and last granted sight, the statement that took it, and whether it is a fault.
 */
export function holds(samples) {
  const seen = new Map();
  for (const s of samples) {
    if (!s.granted || !s.relation) continue;
    const key = `${s.pid}|${s.relation}|${s.mode}`;
    const h = seen.get(key);
    if (h) h.last = s.t;
    else seen.set(key, { relation: s.relation, schema: s.schema, mode: s.mode, first: s.t, last: s.t, query: s.query });
  }
  return [...seen.values()].map((h) => {
    const ms = Math.round(h.last - h.first + SAMPLE_MS);
    const fault = BLOCKING.has(h.mode) && clientRelation(h.schema, h.relation.replace(/^.*\./, '')) && ms > HELD_MS;
    return { ...h, ms, fault };
  }).sort((a, b) => b.ms - a.ms);
}

/** The sampling query: no semicolon, so psql's watch command repeats it. */
const SAMPLE = `SELECT extract(epoch FROM clock_timestamp()) * 1000, coalesce(n.nspname || '.' || c.relname, ''),
  coalesce(n.nspname, ''), l.mode, l.granted, left(regexp_replace(a.query, '\\s+', ' ', 'g'), 200), l.pid
FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
LEFT JOIN pg_class c ON c.oid = l.relation LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE a.application_name = '${APP}' AND l.locktype = 'relation'`;

/** A sampler's lines, as samples. */
export const samplesIn = (text) => text.split('\n').flatMap((line) => {
  const [t, relation, schema, mode, granted, query, pid] = line.split('\t');
  return t && mode && Number.isFinite(+t) ? [{ t: +t, relation, schema, mode, granted: granted === 't', query, pid }] : [];
});

/**
 * One run, measured: a bash child starts psql's own sampler (its watch command) in the background, runs the
 * step as the train would (named, so the sampler sees only it, under production's limits), then
 * stops the sampler and waits for it. Node waits for the bash child: nothing outlives the run.
 */
function measure(label, args, dir, n) {
  const files = { sample: join(dir, `sample-${n}.sql`), samples: join(dir, `samples-${n}.tsv`), out: join(dir, `out-${n}.txt`) };
  writeFileSync(files.sample, `${SAMPLE}\n\\watch ${SAMPLE_MS / 1000}\n`);
  const began = Date.now();
  const r = spawnSync('bash', ['-c', [
    'psql "$DB" -X -q -t -A -F "$TAB" -f "$SAMPLE_SQL" > "$SAMPLES" 2>/dev/null &',
    'S=$!',
    'sleep 0.3',
    'PGOPTIONS="$LIMITS" PGAPPNAME="$APP" psql "$DB" "$@" > "$OUT" 2>&1',
    'RC=$?',
    'kill "$S" 2>/dev/null; wait "$S" 2>/dev/null',
    'exit $RC',
  ].join('\n'), 'measure', ...args], {
    env: { ...process.env, DB, TAB: '\t', SAMPLE_SQL: files.sample, SAMPLES: files.samples, OUT: files.out, LIMITS, APP },
    encoding: 'utf8',
  });
  const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  return { label, ok: r.status === 0, out: read(files.out), ms: Date.now() - began, holds: holds(samplesIn(read(files.samples))) };
}

function main() {
  if (!/@(127\.0\.0\.1|localhost):/.test(DB)) {
    console.error('Refusing: the train is measured only on the runner\'s own database.');
    process.exit(2);
  }
  const train = require(join(MOBILE, 'supabase', 'diagnostics', 'train.cjs'));
  const p = train.plan(train.pendingIn(), train.rehearsalsIn());
  if (p.refuse) {
    console.log(`No train to measure: ${p.refuse}`);
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'train-locks-'));
  const runs = [];
  for (const step of p.steps.filter((x) => x.kind === 'rehearse')) {
    const prior = train.priorSql(step.before);
    let priorPath = null;
    if (prior) { priorPath = join(dir, `prior-${step.car.name}`); writeFileSync(priorPath, prior); }
    runs.push(measure(`A · ${step.what}`, train.psqlArgs(step, priorPath), dir, runs.length));
  }
  for (const step of p.steps.filter((x) => x.kind === 'apply')) {
    runs.push(measure(`B · ${step.what}`, train.psqlArgs(step, null), dir, runs.length));
  }

  const lines = [];
  let failed = false;
  for (const r of runs) {
    const apply = r.label.startsWith('B');
    lines.push(`${r.ok ? 'ran' : apply ? 'FAILED' : 'did not finish'}  ${r.label}  (${r.ms} ms)`);
    if (!r.ok) {
      lines.push(...r.out.split('\n').filter((l) => /ERROR|DETAIL|CONTEXT/.test(l)).slice(0, 6).map((l) => `    ${l}`));
      if (apply) failed = true;
    }
    for (const h of r.holds.filter((x) => BLOCKING.has(x.mode))) {
      lines.push(`    ${h.fault ? 'TOO LONG' : 'held    '}  ${String(h.ms).padStart(6)} ms  ${h.mode.padEnd(22)} ${h.relation}  ← ${h.query}`);
      if (h.fault) failed = true;
    }
  }
  const report = [`The train on 100,000 members: ${runs.length} runs; a blocking lock may be held ${HELD_MS} ms at most.`, '', ...lines, ''].join('\n');
  console.log(report);
  writeFileSync(join(process.env.RUNNER_TEMP ?? dir, 'lock-report.txt'), report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Locks\n\n\`\`\`\n${report}\n\`\`\`\n`);
  if (failed) process.exit(1);
}

// `--holds` and a file of saved samples: the judgement alone, for its test.
const at = process.argv.indexOf('--holds');
if (at >= 0) console.log(JSON.stringify(holds(JSON.parse(readFileSync(process.argv[at + 1], 'utf8')))));
else main();

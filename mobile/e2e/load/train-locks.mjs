#!/usr/bin/env node
/**
 * train-locks.mjs — the pending train run on a house of 100,000 members, every lock it takes timed (P0.6).
 *
 * Runs on the CI runner's own copy of production's shape, after e2e/load/seed.sql, before
 * probe.mjs. It takes the train's own plan (supabase/diagnostics/train.cjs: the pending
 * migrations, each with its one rehearsal, production's lock wait and statement limits) and runs
 * it car by car, as production will, each car in two runs:
 *   A. its rehearsal as the train rehearses it, on the house as the cars before it left it
 *      (applied and committed by their own B): its migration and its cases, in one transaction
 *      that is rolled back;
 *   B. its migration applied, one transaction, as apply.cjs applies it.
 * Then C: each paced job the train scheduled (pg_cron, every few seconds: what fills a car's new lists a
 * short run at a time, then ends itself) is watched to its end, from pg_cron's run history, or run here at
 * its pace where no scheduler runs it. A run holds what members' writes wait on, so a run over HELD_MS
 * fails as a lock would, and so does a job that has not ended itself within JOB_LIMIT_MS.
 * Each index built CONCURRENTLY comes first, alone and outside any transaction, as the train
 * builds it, so the rehearsals after it read through it. The train's probe after each apply is
 * not run here: it is A's cases without the migration, so it takes no lock A did not and holds
 * each for less time.
 * Meanwhile a second connection reads pg_locks every SAMPLE_MS. A lock is timed from the first
 * sample that sees it granted to the last (a lock is held to the end of the transaction that took
 * it, so in A a migration's lock is held through every case after it), and blamed on the
 * statement that was running when it appeared.
 *
 * It fails when a lock that blocks a member's reads or writes (Share, Share Row Exclusive,
 * Exclusive, Access Exclusive) on a relation the app reads or writes (anything in public, and
 * storage.objects) is held for over HELD_MS, in either run; and when a migration does not apply.
 * A rehearsal that fails on the load house is said, not failed on: its cases are P0.7's to make
 * house-agnostic. Each statement is timed by psql itself (echoed, with its timing switch on), and
 * the report names each run's three slowest. The report goes to the step summary and
 * lock-report.txt.
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

/**
 * Each statement's time from psql's own output (echoed with -e, timed with its timing switch):
 * the lines since the last time are the statement, and its first line names it. Slowest first.
 */
export function statementsIn(text) {
  const out = [];
  let since = [];
  for (const line of text.split('\n')) {
    const t = /^Time: ([\d.]+) ms/.exec(line);
    if (!t) { if (line.trim() && line.trim() !== 'Timing is on.') since.push(line.trim()); continue; }
    out.push({ ms: Math.round(+t[1]), text: (since[0] ?? '').slice(0, 160) });
    since = [];
  }
  return out.sort((a, b) => b.ms - a.ms);
}

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
  ].join('\n'), 'measure', '-e', '-c', '\\timing on', ...args], {
    env: { ...process.env, DB, TAB: '\t', SAMPLE_SQL: files.sample, SAMPLES: files.samples, OUT: files.out, LIMITS, APP },
    // what bash itself says (psql not found, an address refused) goes straight to the log
    stdio: 'inherit',
  });
  const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  const out = read(files.out);
  return { label, ok: r.status === 0, out, ms: Date.now() - began, statements: statementsIn(out), holds: holds(samplesIn(read(files.samples))) };
}

/** A paced job the train schedules (pg_cron, every few seconds) must end itself within this. */
export const JOB_LIMIT_MS = 60 * 60 * 1000;
/** A job scheduled every few seconds: one that fills what a car made, a short run at a time, then ends itself. */
export const paced = (schedule) => /^\d+ seconds?$/.test(schedule.trim());

/**
 * A paced job's verdict, from each run's time and its whole window: a run holds what members' writes
 * wait on (the job's lock), so a run over HELD_MS fails as a lock would; and a job that has not ended
 * itself within JOB_LIMIT_MS fails.
 */
export function jobVerdict({ name, runs, windowMs, ended, driven }) {
  const sorted = [...runs].sort((a, b) => a - b);
  const longest = sorted[sorted.length - 1] ?? 0;
  const middle = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const tooLong = longest > HELD_MS;
  const fault = tooLong || !ended;
  const how = driven ? 'run here at its pace (no scheduler)' : 'run by pg_cron';
  return {
    fault,
    lines: [
      `${ended ? 'ran' : 'DID NOT END'}  C · job ${name}, ${how}: ${runs.length} runs over ${Math.round(windowMs / 1000)} s`,
      `    ${tooLong ? 'TOO LONG' : 'run     '}  ${String(Math.round(longest)).padStart(6)} ms at most, ${Math.round(middle)} ms the middle run  (members' writes wait at most one run)`,
    ],
  };
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const rows = (sql) => {
  const r = spawnSync('psql', [DB, '-X', '-q', '-t', '-A', '-F', '\t', '-c', sql], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/).filter(Boolean).map((l) => l.split('\t')) : null;
};
/** The scheduled jobs, by name: none where the house keeps no jobs. */
const cronJobs = () => (rows("SELECT to_regclass('cron.job') IS NOT NULL")?.[0]?.[0] === 't'
  ? new Map((rows('SELECT jobname, jobid, schedule, command FROM cron.job') ?? []).map(([name, id, schedule, command]) => [name, { name, id, schedule, command }]))
  : new Map());

/**
 * One paced job watched to its end: pg_cron's own runs, read from its run history; or, where no run of
 * it is seen to succeed within 30 seconds (a copy whose scheduler is not running, or cannot sign in), its
 * command run here at its pace, each run timed with psql's own start (so a little longer than the run),
 * until it ends itself (it leaves the scheduled jobs).
 */
function watchJob(job) {
  const began = Date.now();
  const pace = Number.parseInt(job.schedule, 10) * 1000;
  const runsOf = () => (rows(`SELECT extract(epoch FROM start_time) * 1000, extract(epoch FROM end_time) * 1000 FROM cron.job_run_details WHERE jobid = ${job.id} AND status = 'succeeded' AND end_time IS NOT NULL ORDER BY start_time`) ?? [])
    .map(([s, e]) => [+s, +e]);
  const live = () => cronJobs().has(job.name);
  let driven = false;
  const timed = [];
  while (live() && Date.now() - began < JOB_LIMIT_MS) {
    if (!driven && runsOf().length === 0 && Date.now() - began > 30_000) driven = true;
    if (driven) {
      const t = Date.now();
      rows(job.command);
      timed.push([t, Date.now()]);
    }
    sleep(pace);
  }
  const runs = driven ? timed : runsOf();
  return jobVerdict({
    name: job.name,
    runs: runs.map(([s, e]) => e - s),
    windowMs: runs.length ? runs[runs.length - 1][1] - runs[0][0] : 0,
    ended: !live(),
    driven,
  });
}

/**
 * The runs, from the train's own steps, in its own order, car by car in name order: an index
 * built alone in its turn (as production builds it, the cars after it then read through it),
 * every other car its rehearsal and its apply, so each car is rehearsed with the cars before it
 * committed and none of their locks held. Each with psql's arguments as the train gives them (`psqlArgs`, train.cjs's).
 */
export function runsOf(steps, psqlArgs) {
  const RUN = { build: 'B', rehearse: 'A', apply: 'B' };
  return steps.filter((x) => RUN[x.kind]).map((step) => ({ label: `${RUN[step.kind]} · ${step.what}`, args: psqlArgs(step) }));
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
  // The paced jobs the train schedules, seen after each run (one may end itself before the train does).
  const jobsBefore = cronJobs();
  const scheduled = new Map();
  const runs = runsOf(p.steps, train.psqlArgs).map((r, n) => {
    const m = measure(r.label, r.args, dir, n);
    for (const j of cronJobs().values()) if (!jobsBefore.has(j.name) && paced(j.schedule)) scheduled.set(j.name, j);
    return m;
  });
  // C: each, watched to its end (the reads below are timed on what it filled).
  const jobs = [...scheduled.values()].map(watchJob);

  const lines = [];
  let failed = false;
  for (const r of runs) {
    const apply = r.label.startsWith('B');
    lines.push(`${r.ok ? 'ran' : apply ? 'FAILED' : 'did not finish'}  ${r.label}  (${r.ms} ms)`);
    if (!r.ok) {
      lines.push(...r.out.split('\n').filter((l) => /^(psql:.*ERROR|ERROR:|DETAIL:|CONTEXT:)/.test(l)).slice(0, 6).map((l) => `    ${l}`));
      if (apply) failed = true;
    }
    for (const s of r.statements.slice(0, 3)) lines.push(`    took     ${String(s.ms).padStart(6)} ms  ${s.text}`);
    for (const h of r.holds.filter((x) => BLOCKING.has(x.mode))) {
      lines.push(`    ${h.fault ? 'TOO LONG' : 'held    '}  ${String(h.ms).padStart(6)} ms  ${h.mode.padEnd(22)} ${h.relation}  ← ${h.query}`);
      if (h.fault) failed = true;
    }
  }
  for (const j of jobs) {
    lines.push(...j.lines);
    if (j.fault) failed = true;
  }
  const report = [`The train on 100,000 members, car by car: ${runs.length} runs; a blocking lock may be held ${HELD_MS} ms at most.`,
    'A: a car rehearsed, rolled back, on the house the cars before it left. B: a car applied, committed. C: a job the train scheduled, to its end.', '', ...lines, ''].join('\n');
  console.log(report);
  writeFileSync(join(process.env.RUNNER_TEMP ?? dir, 'lock-report.txt'), report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Locks\n\n\`\`\`\n${report}\n\`\`\`\n`);
  if (failed) process.exit(1);
}

// `--holds` and a file of saved samples, or `--statements` and psql's saved output: the reading
// alone. `--runs` and a file of { pending, rehearsals } (train.cjs's plan's own inputs): the runs
// that train would be measured in, with no database. `--job` and a file of a job's runs: its verdict;
// `--paced` and a schedule: whether a job of it is watched to its end.
const at = process.argv.indexOf('--holds');
const timed = process.argv.indexOf('--statements');
const planned = process.argv.indexOf('--runs');
const job = process.argv.indexOf('--job');
const pace = process.argv.indexOf('--paced');
if (at >= 0) console.log(JSON.stringify(holds(JSON.parse(readFileSync(process.argv[at + 1], 'utf8')))));
else if (pace >= 0) console.log(JSON.stringify(paced(process.argv[pace + 1])));
else if (job >= 0) console.log(JSON.stringify(jobVerdict(JSON.parse(readFileSync(process.argv[job + 1], 'utf8')))));
else if (timed >= 0) console.log(JSON.stringify(statementsIn(readFileSync(process.argv[timed + 1], 'utf8'))));
else if (planned >= 0) {
  const train = require(join(MOBILE, 'supabase', 'diagnostics', 'train.cjs'));
  const { pending, rehearsals } = JSON.parse(readFileSync(process.argv[planned + 1], 'utf8'));
  const p = train.plan(pending, rehearsals);
  console.log(JSON.stringify(p.refuse ? { refuse: p.refuse } : runsOf(p.steps, train.psqlArgs)));
} else main();

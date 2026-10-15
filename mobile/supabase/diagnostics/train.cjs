// Applies every pending migration to production in one command: the train procedure (P0.11).
//
//   node mobile/supabase/diagnostics/train.cjs
//
//   1. the checkout is what CI ran: nothing tracked changed, and HEAD is on origin/main;
//   2. production matches the committed snapshot (schema-snapshot.mjs --check);
//   3. a full copy of production is taken and read back (dump-production.cjs full);
//   4. every pending migration is rehearsed before any is applied, each with the ones before it
//      applied first, in one transaction that is always rolled back;
//   5. each is applied, in name order, as apply.cjs applies one; then its rehearsal runs again,
//      rolled back, on production as it now is (the live probe).
// It stops at the first step that fails and says what was done and what was not. "Pending" is a
// migration in either tree not named in mobile/supabase/APPLIED.txt; each must have exactly one
// rehearsal (a *_rehearsal.sql here that includes it under with_train). The address comes from
// the private settings file and is never printed; the whole run is kept in <private>/trains/.
const { spawnSync } = require('child_process');
const { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

const MOBILE = join(__dirname, '..', '..');
const ROOT = join(MOBILE, '..');
const { lint } = require(join(MOBILE, 'scripts', 'migration-lint.cjs'));
const { privateDir, privateFile, readPrivate } = require(join(MOBILE, 'scripts', 'private-settings.cjs'));

const LIMITS = '-c lock_timeout=2s -c statement_timeout=30s';
const TREES = ['supabase/migrations', 'mobile/supabase/migrations'];

/** The migrations production has not had, in name order, each with its path and SQL. */
const pendingIn = (root = ROOT) => {
  const applied = new Set(readFileSync(join(root, 'mobile', 'supabase', 'APPLIED.txt'), 'utf8')
    .split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
  return TREES.flatMap((dir) => readdirSync(join(root, dir)).filter((f) => f.endsWith('.sql') && !applied.has(f))
    .map((name) => ({ name, path: join(root, dir, name), sql: readFileSync(join(root, dir, name), 'utf8') })))
    // A file of comments alone changes nothing (as e2e/db/up-down-up.mjs counts them).
    .filter((m) => m.sql.split('\n').some((l) => l.trim() && !l.trim().startsWith('--')))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/** Each rehearsal here, with the migrations it includes under with_train. */
const rehearsalsIn = (dir = __dirname) => readdirSync(dir).filter((f) => /_rehearsal\.sql$/.test(f))
  .map((name) => ({ name, path: join(dir, name),
    includes: [...readFileSync(join(dir, name), 'utf8').matchAll(/^\\ir\s+\S*\/([^/\s]+\.sql)\s*$/gm)].map((m) => m[1]) }));

/** The steps of the train, or why it cannot run. */
const plan = (pending, rehearsals) => {
  if (!pending.length) return { refuse: 'nothing is pending: every migration is in APPLIED.txt' };
  const faults = [];
  const cars = pending.map((m) => {
    const { kind, faults: lintFaults } = lint(m.sql);
    if (lintFaults.length) faults.push(`${m.name}: the migration lint refuses it: ${lintFaults.join('; ')}`);
    if (kind === 'concurrently') faults.push(`${m.name}: a CONCURRENTLY file is applied alone, with apply.cjs --no-transaction`);
    const own = rehearsals.filter((r) => r.includes.includes(m.name));
    if (own.length !== 1) faults.push(`${m.name}: needs exactly one rehearsal that includes it, found ${own.length}`);
    return { ...m, rehearsal: own[0] };
  });
  if (faults.length) return { refuse: faults.join('\n  ') };
  return {
    steps: [
      { kind: 'tree', what: 'the checkout is what CI ran' },
      { kind: 'check', what: 'production matches the committed snapshot' },
      { kind: 'dump', what: 'a full copy of production, read back' },
      ...cars.map((m, i) => ({ kind: 'rehearse', what: `rehearse ${m.name}`, car: m, before: cars.slice(0, i) })),
      ...cars.flatMap((m) => [
        { kind: 'apply', what: `apply ${m.name}`, car: m },
        { kind: 'probe', what: `probe ${m.name} on production as it now is`, car: m },
      ]),
    ],
  };
};

/** psql's arguments for a step running SQL; `prior` opens the transaction, earlier cars applied. */
const psqlArgs = (step, prior) => {
  const quiet = ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'];
  if (step.kind === 'rehearse') return [...quiet, '-v', 'with_train=1', ...(prior ? ['-f', prior] : []), '-f', step.car.rehearsal.path];
  if (step.kind === 'probe') return [...quiet, '-f', step.car.rehearsal.path];
  if (step.kind === 'apply') return ['-X', '-1', '-v', 'ON_ERROR_STOP=1', '-f', step.car.path];
  return null;
};

/** The SQL that opens a rehearsal's transaction with the cars before it applied (none: no file). */
const priorSql = (before) => (before.length
  ? ['BEGIN;', ...before.map((c) => `\\ir ${c.path.replace(/\\/g, '/')}`), ''].join('\n')
  : null);

/**
 * Runs the steps in order through `exec(step) -> {ok, out}`, stopping at the first that fails.
 * Returns what was done, the step that failed (or null), and what was never started.
 */
const run = (steps, exec, say = () => {}) => {
  const done = [];
  for (let i = 0; i < steps.length; i++) {
    say(`→ ${steps[i].what}`);
    const r = exec(steps[i]);
    if (!r.ok) return { done, failed: { step: steps[i], out: r.out }, left: steps.slice(i + 1) };
    done.push(steps[i]);
    say(`  ✓ ${steps[i].what}`);
  }
  return { done, failed: null, left: [] };
};

/** What the person running it reads at the end. */
const verdict = (result) => {
  const applied = result.done.filter((s) => s.kind === 'apply').map((s) => s.car.name);
  if (!result.failed) return [`TRAIN DONE: ${applied.length} applied (${applied.join(', ')}), each probed.`];
  const lines = [`TRAIN STOPPED at: ${result.failed.step.what}`];
  lines.push(applied.length ? `Applied before it stopped: ${applied.join(', ')}` : 'Nothing was applied to production.');
  const notApplied = result.left.filter((s) => s.kind === 'apply').map((s) => s.car.name);
  if (result.failed.step.kind === 'apply') notApplied.unshift(result.failed.step.car.name);
  if (notApplied.length) {
    lines.push(`Not applied: ${notApplied.join(', ')}${result.failed.step.kind === 'apply' ? ' (the failed one was undone whole)' : ''}`);
  }
  lines.push('Its last words:', ...String(result.failed.out).trim().split('\n').slice(-25).map((l) => `  ${l}`));
  return lines;
};

if (require.main === module) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logDir = join(privateDir(), 'trains');
  mkdirSync(logDir, { recursive: true });
  const log = join(logDir, `${stamp}.log`);
  const say = (line) => { console.log(line); appendFileSync(log, `${line}\n`); };
  const url = readPrivate('SUPABASE_DB_URL');
  if (!url) { console.error(`REFUSED: no SUPABASE_DB_URL in ${privateFile()}`); process.exit(1); }
  const p = plan(pendingIn(), rehearsalsIn());
  if (p.refuse) { console.error(`REFUSED: ${p.refuse}`); process.exit(1); }
  const hide = (s) => String(s || '').split(url).join('***').replace(/\r/g, '');
  const shell = (cmd, args, opts = {}) => {
    const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e9, ...opts });
    const out = hide(`${r.stdout || ''}${r.stderr || ''}`);
    appendFileSync(log, out);
    return { status: r.status, out };
  };
  const exec = (step) => {
    if (step.kind === 'tree') {
      const changed = shell('git', ['status', '--porcelain', '--untracked-files=no']).out.split('\n')
        .filter((l) => l.trim() && !/supabase\/\.temp\//.test(l));
      if (changed.length) return { ok: false, out: `tracked files differ from the commit:\n${changed.join('\n')}` };
      shell('git', ['fetch', '--quiet', 'origin', 'main']);
      const on = shell('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main']);
      return on.status === 0 ? { ok: true, out: '' } : { ok: false, out: 'HEAD is not on origin/main: pull first' };
    }
    if (step.kind === 'check') {
      const r = shell('node', [join(MOBILE, 'scripts', 'schema-snapshot.mjs'), '--check']);
      return { ok: r.status === 0, out: r.out };
    }
    if (step.kind === 'dump') {
      const r = shell('node', [join(MOBILE, 'scripts', 'dump-production.cjs'), 'full']);
      return { ok: r.status === 0, out: r.out };
    }
    let prior = null;
    if (step.kind === 'rehearse' && step.before.length) {
      prior = join(tmpdir(), `train-${stamp}-${step.car.name}`);
      writeFileSync(prior, priorSql(step.before));
    }
    const r = shell('psql', [url, ...psqlArgs(step, prior)], { env: { ...process.env, PGOPTIONS: LIMITS } });
    return { ok: r.status === 0, out: r.out };
  };
  say(`The train: ${p.steps.filter((s) => s.kind === 'apply').map((s) => s.car.name).join(', ')}`);
  const result = run(p.steps, exec, say);
  for (const line of verdict(result)) say(line);
  say(`The whole run is kept in ${log}. Paste everything above to Claude.`);
  process.exit(result.failed ? 1 : 0);
}

module.exports = { pendingIn, plan, priorSql, psqlArgs, rehearsalsIn, run, verdict };

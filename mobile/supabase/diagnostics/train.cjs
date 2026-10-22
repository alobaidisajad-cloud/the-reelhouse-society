// Applies every pending migration to production in one command: the train procedure (P0.11).
//
//   node mobile/supabase/diagnostics/train.cjs
//
//   1. the checkout is what CI ran: nothing tracked changed, and HEAD is on origin/main;
//   2. CI passed on these exact database files: each workflow of MUST_PASS has a green run on main
//      whose migrations, functions and rehearsals are HEAD's (read with gh);
//   3. production matches the committed snapshot (schema-snapshot.mjs --check);
//   4. a full copy of production is taken and read back (dump-production.cjs full);
//   5. every pending migration is rehearsed before any is applied, each with the ones before it
//      applied first, in one transaction that is always rolled back;
//   6. each is applied, in name order, as apply.cjs applies one; then its rehearsal runs again,
//      rolled back, on production as it now is (the live probe).
// It stops at the first step that fails and says what was done and what was not. "Pending" is a
// migration in either tree not named in mobile/supabase/APPLIED.txt; each must have exactly one
// rehearsal (a *_rehearsal.sql here that includes it under with_train). The address comes from
// the private settings file and is never printed; the whole run is kept in <private>/trains/.
const { spawnSync } = require('child_process');
const { appendFileSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { basename, join, relative, sep } = require('path');

const MOBILE = join(__dirname, '..', '..');
const ROOT = join(MOBILE, '..');
const { lint } = require(join(MOBILE, 'scripts', 'migration-lint.cjs'));
const universe = require(join(MOBILE, 'test-utils', 'universe.js'));
const { privateDir, privateFile, readPrivate } = require(join(MOBILE, 'scripts', 'private-settings.cjs'));

const LIMITS = '-c lock_timeout=2s -c statement_timeout=30s';
/** The migrations production has not had, in name order, each with its path and SQL. */
const pendingIn = (root = ROOT) => {
  const applied = new Set(readFileSync(join(root, 'mobile', 'supabase', 'APPLIED.txt'), 'utf8')
    .split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
  // Both trees, as test-utils/universe.js names the migrations in them.
  return universe.at(root).files('migrations').filter((path) => !applied.has(basename(path)))
    .map((path) => ({ name: basename(path), path, sql: readFileSync(path, 'utf8') }))
    // A file of comments alone changes nothing (as e2e/db/up-down-up.mjs counts them).
    .filter((m) => m.sql.split('\n').some((l) => l.trim() && !l.trim().startsWith('--')))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/** Each rehearsal (test-utils/universe.js), with the migrations it includes under with_train. */
const rehearsalsIn = () => universe.files('rehearsals')
  .map((path) => ({ name: relative(__dirname, path).split(sep).join('/'), path,
    includes: [...readFileSync(path, 'utf8').matchAll(/^\\ir\s+\S*\/([^/\s]+\.sql)\s*$/gm)].map((m) => m[1]) }));

/** What production is made of, as the repository holds it. */
const DATABASE = ['supabase/migrations', 'mobile/supabase/migrations', 'mobile/supabase/migrations-down',
  'supabase/functions', 'mobile/supabase/functions', 'mobile/supabase/diagnostics', 'mobile/supabase/APPLIED.txt'];
/**
 * The workflows that must have passed on main before production is touched, each on a commit whose
 * files under `paths` are HEAD's: the builds in members' hands against the train (that workflow
 * runs when a migration or a function changes), the database's own checks and the rehearsals, the
 * app end to end on production as the train leaves it, and the train's locks on 100,000 members.
 */
const MUST_PASS = [
  { file: 'e2e-old-clients.yml', what: 'the builds in members\' hands, against the train',
    paths: ['supabase/migrations', 'mobile/supabase/migrations', 'mobile/supabase/migrations-down', 'supabase/functions', 'mobile/supabase/functions'] },
  { file: 'db-integration.yml', what: 'the database\'s own checks and the rehearsals', paths: DATABASE },
  { file: 'e2e.yml', what: 'the app end to end, on production as the train leaves it', paths: DATABASE },
  { file: 'load.yml', what: 'the train\'s locks on 100,000 members', paths: DATABASE },
];

/**
 * Each workflow of MUST_PASS with no green run that can stand for HEAD, said in words: `greens(file)`
 * gives the commits of its green runs on main, newest first, or null when they cannot be read;
 * `same(sha, paths)` says whether that commit's files under the paths are HEAD's.
 */
const unproven = (greens, same) => MUST_PASS.flatMap((w) => {
  const shas = greens(w.file);
  if (shas === null) return [`${w.what} (${w.file}): its runs could not be read (is gh installed and signed in?)`];
  return shas.some((sha) => same(sha, w.paths)) ? [] : [`${w.what} (${w.file}) has passed on no commit with these files`];
});

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
      { kind: 'ci', what: 'CI passed on these migrations, functions and rehearsals' },
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
    if (step.kind === 'ci') {
      const repo = shell('git', ['remote', 'get-url', 'origin']).out.trim().replace(/^.*github\.com[:/]/, '').replace(/\.git$/, '');
      const greens = (file) => {
        const r = shell('gh', ['run', 'list', '--repo', repo, '--workflow', file, '--branch', 'main', '--status', 'success',
          '--limit', '40', '--json', 'headSha', '--jq', '.[].headSha']);
        return r.status === 0 ? r.out.split('\n').map((l) => l.trim()).filter((l) => /^[0-9a-f]{40}$/.test(l)) : null;
      };
      const same = (sha, paths) => shell('git', ['diff', '--quiet', sha, 'HEAD', '--', ...paths]).status === 0;
      const missing = unproven(greens, same);
      return missing.length ? { ok: false, out: `CI has not passed on this train:\n${missing.join('\n')}` } : { ok: true, out: '' };
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

module.exports = { MUST_PASS, pendingIn, plan, priorSql, psqlArgs, rehearsalsIn, run, unproven, verdict };

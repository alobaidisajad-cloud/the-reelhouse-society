#!/usr/bin/env node
/**
 * Before a push: what CI would refuse is refused here, before it reaches main
 * (Vercel publishes main within seconds, and a push cancels a running E2E).
 * For the commits being pushed:
 *   - no mutant still in the working files, from a mutants run that was stopped;
 *   - the website freeze, the add-only check, the migration lint, and no frozen
 *     count raised in its baseline;
 *   - every frozen count the changes can move, measured whole (scripts/frozen-counts.cjs);
 *   - every comment names what exists (comments:check, as god_tier_ci runs it);
 *   - the app's types, lint on the changed files, the tests related to them,
 *     and every test that reads source (the repo's own guards among them);
 *   - each mutant standing on what changed, caught by its class's own test
 *     (scripts/mutants.cjs --changed).
 * Run by mobile/githooks/pre-push, which git feeds one line per ref:
 *   <local ref> <local sha> <remote ref> <remote sha>
 */
const { execFileSync, spawnSync } = require('child_process');
const { readFileSync } = require('fs');
const { join, sep } = require('path');

const ROOT = join(__dirname, '..', '..', '..');
const MOBILE = join(ROOT, 'mobile');
const ZERO = /^0+$/;
const { checksTouchedBy } = require('../frozen-counts.cjs');
const { mutantInPlace } = require('./pre-commit.cjs');

/**
 * Every test that reads source instead of importing it (test-utils/SOURCE-READING-TESTS.md, the
 * repo's own guards among them): no change is related to one by an import, so each runs on every
 * push, as CI runs it (a sweep's guard met a new script first in CI, 7ce46266).
 */
const readers = (mobile) => readFileSync(join(mobile, 'test-utils', 'SOURCE-READING-TESTS.md'), 'utf8')
  .split('\n').map((l) => /^\| `([^`]+)`/.exec(l)?.[1]).filter(Boolean);

/**
 * What jest leaves out: node_modules, and the worktrees and Stryker's sandbox
 * made inside this checkout, each a second copy of the tests. Anchored at the
 * checkout, so one that is itself a worktree still runs its own tests.
 */
const ignored = (mobile) => {
  const at = mobile.split(sep).join('/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return ['node_modules', `${at}/\\.claude/worktrees/`, `${at}/\\.stryker-tmp/`];
};

/**
 * How many jest workers the push can afford: each holds about one suite's heap
 * (jest.config.js lets a worker grow to 400 MB before it restarts), with a
 * gigabyte left for everything else. Too many on a busy machine and workers are
 * killed for memory, failing suites that have nothing wrong with them.
 */
const WORKER_BYTES = 600 * 1024 ** 2;
const RESERVE_BYTES = 1024 ** 3;
const workersFor = (freeBytes, cores) =>
  Math.max(1, Math.min(cores - 1, Math.floor((freeBytes - RESERVE_BYTES) / WORKER_BYTES)));

/** Where each pushed ref starts: the remote's tip, or where a new branch left main. */
const basesOf = (input, git) => input.split('\n').filter(Boolean).flatMap((line) => {
  const [, local, , remote] = line.trim().split(/\s+/);
  if (!local || ZERO.test(local)) return [];
  if (remote && !ZERO.test(remote)) return [remote];
  return [git('merge-base', local, 'origin/main').trim()];
});

/**
 * Paths in as few batches as fit on one command line. Windows takes 8,191 characters, the shell
 * and jest's own arguments included: the 240 source-reading tests in one call were refused whole
 * ("The command line is too long"), and the step never ran.
 */
const inBatches = (paths, room = 6000) => {
  const batches = [[]];
  let used = 0;
  for (const p of paths) {
    const last = batches[batches.length - 1];
    if (last.length && used + p.length + 1 > room) { batches.push([p]); used = p.length + 1; } else { last.push(p); used += p.length + 1; }
  }
  return batches.filter((b) => b.length);
};

const run = (label, cmd, args, cwd) => {
  console.log(`→ ${label}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  return r.status === 0 ? null : label;
};

if (require.main === module) {
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
  const bases = basesOf(readFileSync(0, 'utf8'), git);
  const faults = [];
  const placed = mutantInPlace(ROOT);
  if (placed) faults.push(placed);
  for (const base of bases) {
    for (const script of ['website-freeze.cjs', 'add-only.cjs', 'migration-lint.cjs']) {
      const f = run(`${script} from ${base.slice(0, 8)}`, 'node', [join(MOBILE, 'scripts', script), base], ROOT);
      if (f) faults.push(f);
    }
    const f = run(`frozen counts' baseline from ${base.slice(0, 8)}`, 'node', [join(MOBILE, 'scripts', 'frozen-counts.cjs'), '--base', base], ROOT);
    if (f) faults.push(f);
  }
  const touched = [...new Set(bases.flatMap((b) => git('diff', '--name-only', `${b}...HEAD`).split('\n')))].filter(Boolean);
  const frozen = checksTouchedBy(touched);
  if (frozen.length) {
    const f = run(`frozen counts: ${frozen.join(', ')}`, 'node', [join(MOBILE, 'scripts', 'frozen-counts.cjs'), '--only', frozen.join(',')], MOBILE);
    if (f) faults.push(f);
  }
  const changed = [...new Set(bases.flatMap((b) => git('diff', '--name-only', '--diff-filter=ACMR', `${b}...HEAD`).split('\n')))]
    .filter((p) => p.startsWith('mobile/')).map((p) => p.slice('mobile/'.length));
  const code = changed.filter((p) => /\.(?:[cm]?js|tsx?)$/.test(p));
  if (changed.length) {
    // God-tier's own comment gate: a comment naming what does not exist failed CI on ede2cc32.
    const c = run('every comment names what exists', 'npm', ['run', '-s', 'comments:check', '--', '--kinds', 'NAME,FILE,LINE'], MOBILE);
    if (c) faults.push(c);
  }
  if (code.length) {
    const t = run('types', 'npx', ['tsc', '--noEmit', '-p', '.'], MOBILE);
    if (t) faults.push(t);
    const l = run('lint on the changed files', 'npx', ['eslint', '--max-warnings=0', '--no-warn-ignored', ...code], MOBILE);
    if (l) faults.push(l);
  }
  const workers = workersFor(require('os').freemem(), require('os').cpus().length);
  const jest = ['jest', `--maxWorkers=${workers}`, '--testPathIgnorePatterns', ...ignored(MOBILE)];
  if (code.length) {
    for (const batch of inBatches(code)) {
      const j = run('the tests related to the changed files', 'npx', [...jest, '--passWithNoTests', '--findRelatedTests', ...batch], MOBILE);
      if (j) faults.push(j);
    }
  }
  if (changed.length) {
    for (const batch of inBatches(readers(MOBILE))) {
      const g = run('every test that reads source, the guards among them', 'npx', [...jest, '--runTestsByPath', ...batch], MOBILE);
      if (g) faults.push(g);
    }
  }
  // Last, on a tree the checks above found whole: each mutant standing on what changed, put back and caught.
  for (const base of bases) {
    const m = run(`the mutants standing on what changed from ${base.slice(0, 8)}`, 'node', [join(MOBILE, 'scripts', 'mutants.cjs'), '--changed', base], MOBILE);
    if (m) faults.push(m);
  }
  if (faults.length) { console.error(`\nPush refused: ${faults.join('; ')}`); process.exit(1); }
}

module.exports = { basesOf, ignored, inBatches, readers, workersFor };

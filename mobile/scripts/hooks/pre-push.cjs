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
 * The checks run side by side, each its own process, its output kept and printed whole as it
 * ends, every check to its end whatever another said. The tests run as one jest run (jest-run.cjs:
 * the related tests and the readers once each, the list handed over whole), the flow runner's
 * rehearsals (RUN_FLOWS) as a second beside it, and the mutants in checkouts of their own
 * (mutant-lanes.cjs), so no mutant is ever written into the files the tests read. Each check's
 * seconds are printed as a table at the end and kept in the system's temp folder.
 *
 *   node mobile/scripts/hooks/pre-push.cjs --plan     with the refs on stdin: every check and file it
 *                                                     would run, run nothing
 * A push of plant/* branches alone (the planted-mistakes kit's copies, which CI checks whole) runs only
 * what keeps it safe to publish: the secrets scan, the website freeze, the disclosure scan (PLANT,
 * plantChecks). Plant branches pushed with any other ref are refused.
 * Run by mobile/githooks/pre-push, which git feeds one line per ref:
 *   <local ref> <local sha> <remote ref> <remote sha>
 */
const { execFileSync, spawn } = require('child_process');
const { createHash } = require('crypto');
const { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require('fs');
const os = require('os');
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
 * The flow runner's rehearsals: the real run-flows.sh under bash, against a fake phone, whole runs
 * that wait on bash rather than the processor. They run on every push in a jest run of their own,
 * beside the rest, never inside it: one slow file there holds its last worker for the whole run.
 */
const RUN_FLOWS = /^e2e\/__tests__\/runFlows(?:\.[\w-]+)?\.rehearsal\.test\.ts$/;

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

/**
 * What lint reads: the changed files, or every file when lint's own rules changed. A new rule
 * fails files the push never touched: 31ea05b8's ordering rule failed two test-utils files in
 * CI, and the push, linting only what changed, never saw them.
 */
const LINT_RULES = /^(?:eslint\.config\.js|package(?:-lock)?\.json)$/;
const CODE = /\.(?:[cm]?js|tsx?)$/;
/** Every file in mobile/ a sweep reads, from the shared file list, as paths from mobile/. */
const everyCodeFile = () => {
  const { files, rel } = require('../../test-utils/universe');
  return files(['appCode', 'tests', 'testSupport', 'scripts', 'config', 'mockups', 'store', 'flowScripts']).map(rel);
};
const lintTargets = (changed, tracked) => (changed.some((p) => LINT_RULES.test(p)) ? tracked : changed).filter((p) => CODE.test(p));

/**
 * git exports GIT_DIR to a hook (in a linked worktree, that worktree's own git folder). A git call
 * under it from mobile/ takes mobile/ for the whole working tree, every path a folder out: pushing
 * from a worktree, every mutant read "not as committed". Cleared, each call finds its repository
 * from where it runs, in the main checkout and in a worktree alike.
 */
const HOOK_GIT_ENV = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR'];
const clearHookGitEnv = (env) => { for (const k of HOOK_GIT_ENV) delete env[k]; return env; };

const NODE = process.execPath;
const bin = (...p) => join(MOBILE, 'node_modules', ...p);

/**
 * A planted-mistakes branch (refs/heads/plant/<id>): the kit pushes a planted copy so that CI runs the
 * whole suite on it, so the push repeats none of the code gate, only what keeps it safe to publish.
 */
const PLANT = /^refs\/heads\/plant\/[\w.-]+$/;

/**
 * What a push is, from git's lines: 'plant' when every ref is a plant branch, 'mixed' when plant
 * branches go with any other ref (refused: the code gate would pass them unchecked), 'code' otherwise.
 * Each pushed plant (not a deletion) as { local, remote }.
 */
const pushKind = (input) => {
  const refs = input.split('\n').filter(Boolean).map((line) => {
    const [, local, remoteRef, remote] = line.trim().split(/\s+/);
    return { local, remoteRef: remoteRef ?? '', remote };
  });
  const plants = refs.filter((r) => PLANT.test(r.remoteRef));
  const kind = !plants.length ? 'code' : plants.length === refs.length ? 'plant' : 'mixed';
  return { kind, plants: plants.filter((r) => r.local && !ZERO.test(r.local)) };
};

/**
 * A plant push's checks, each from where its branch left main: the secrets scan of every commit it
 * adds (gitleaks, the repo's rules), the website freeze, and the disclosure scan of their messages and
 * the test titles they add (disclosure.cjs). Nothing of the code gate: CI runs all of it on the branch.
 */
const plantChecks = (plants, git) => plants.flatMap(({ local }) => {
  const base = git('merge-base', local, 'origin/main').trim();
  const at = `${base.slice(0, 8)}..${local.slice(0, 8)}`;
  return [
    { id: `secrets@${local}`, label: `no secret in the commits ${at}`, cmd: 'gitleaks', cwd: ROOT, after: [], low: false,
      args: ['git', '--log-opts', `${base}..${local}`, '--config', '.gitleaks.toml', '--gitleaks-ignore-path', '.gitleaksignore', '--redact=100', '--no-banner', '--log-level', 'warn', '.'] },
    { id: `website-freeze.cjs@${local}`, label: `website-freeze.cjs from ${base.slice(0, 8)}`, cwd: ROOT, after: [], low: false, args: [join(MOBILE, 'scripts', 'website-freeze.cjs'), base] },
    { id: `disclosure@${local}`, label: `no message or test title of ${at} describes a hole`, cwd: ROOT, after: [], low: false, args: [join(__dirname, 'disclosure.cjs'), base, local] },
  ];
});

/**
 * The checks for these bases and changes, each { id, label, args (node's), cwd, after, low }: `after`
 * names the checks it waits for, `low` runs it below normal priority (its children inherit it), so
 * the rehearsals' bash keeps the processor it waits on.
 */
const checksFor = ({ bases, touched, changed, files, workers, lanes, lists, clean }) => {
  const checks = [];
  const add = (c) => checks.push({ after: [], cwd: MOBILE, low: false, ...c });
  for (const base of bases) {
    for (const script of ['website-freeze.cjs', 'add-only.cjs', 'migration-lint.cjs']) {
      add({ id: `${script}@${base}`, label: `${script} from ${base.slice(0, 8)}`, args: [join(MOBILE, 'scripts', script), base], cwd: ROOT });
    }
    add({ id: `frozen-base@${base}`, label: `frozen counts' baseline from ${base.slice(0, 8)}`, args: [join(MOBILE, 'scripts', 'frozen-counts.cjs'), '--base', base], cwd: ROOT });
  }
  const frozen = checksTouchedBy(touched);
  if (frozen.length) add({ id: 'frozen', label: `frozen counts: ${frozen.join(', ')}`, args: [join(MOBILE, 'scripts', 'frozen-counts.cjs'), '--only', frozen.join(',')] });
  // God-tier's own comment gate: a comment naming what does not exist failed CI on ede2cc32.
  if (changed.length) add({ id: 'comments', label: 'every comment names what exists', args: [join(MOBILE, 'scripts', 'comment-truth.js'), '--kinds', 'NAME,FILE,LINE'] });
  if (files.code.length) add({ id: 'types', label: 'types', args: [bin('typescript', 'bin', 'tsc'), '--noEmit', '-p', '.'] });
  inBatches(files.linted).forEach((batch, i) => add({
    id: `lint-${i + 1}`, label: files.linted.length > files.code.length ? 'lint on every file, as lint\'s rules changed' : 'lint on the changed files',
    args: [bin('eslint', 'bin', 'eslint.js'), '--max-warnings=0', '--no-warn-ignored', ...batch],
  }));
  if (changed.length) {
    add({ id: 'rehearsals', label: 'the flow runner\'s rehearsals', args: [join(__dirname, 'jest-run.cjs'), '--workers', String(workers.rehearsals), '--out', lists.rehearsalReport, '--paths', lists.rehearsals] });
    add({
      id: 'tests', label: 'the tests related to the changed files, and every test that reads source, the guards among them', low: true,
      args: [join(__dirname, 'jest-run.cjs'), '--workers', String(workers.tests), '--out', lists.testReport, '--paths', lists.readers,
        ...(files.code.length ? ['--related', lists.related] : []), '--leave', RUN_FLOWS.source],
    });
  }
  // On a tree the tests found green, a mutant's first run is theirs (clean: nothing uncommitted they read).
  for (const base of bases) {
    const green = changed.length && clean ? ['--green', `${lists.testReport},${lists.rehearsalReport}`] : [];
    add({
      id: `mutants@${base}`, label: `the mutants standing on what changed from ${base.slice(0, 8)}`,
      args: [join(__dirname, 'mutant-lanes.cjs'), '--changed', base, '--lanes', String(lanes), ...green],
      after: green.length ? ['tests', 'rehearsals'] : [],
    });
  }
  return checks;
};

/** One check run: its output kept in its log and printed whole when it ends; its exit and seconds. */
const runCheck = (check, logDir) => new Promise((done) => {
  const log = join(logDir, `${check.id.replace(/[^\w.-]+/g, '_')}.log`);
  const out = createWriteStream(log);
  const t0 = Date.now();
  const child = spawn(check.cmd ?? NODE, check.args, { cwd: check.cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  if (check.low) { try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* a system that will not lower it runs it as it is */ } }
  child.stdout.pipe(out, { end: false });
  child.stderr.pipe(out, { end: false });
  // A tool that is not there fails its check by name, never passes it unrun.
  child.on('error', (e) => out.write(`${check.cmd ?? 'node'} could not start (${e.code ?? e.message}): this check did not run\n`));
  child.on('close', (code) => out.end(() => {
    const seconds = Math.round((Date.now() - t0) / 1000);
    console.log(`→ ${check.label} — ${code === 0 ? 'passed' : 'FAILED'} in ${seconds}s`);
    process.stdout.write(readFileSync(log, 'utf8'));
    done({ ...check, code, seconds, log });
  }));
});

/** Every check, each started once those it waits for have ended, all side by side otherwise. */
const runAll = async (checks, logDir) => {
  const ended = new Map();
  const started = new Set();
  const running = new Map();
  while (ended.size < checks.length) {
    for (const c of checks) {
      if (!started.has(c.id) && c.after.every((a) => ended.has(a) || !checks.some((x) => x.id === a))) {
        started.add(c.id);
        running.set(c.id, runCheck(c, logDir).then((r) => { ended.set(c.id, r); running.delete(c.id); }));
      }
    }
    // Nothing running and something left: a check waits on one that never starts, which is the push check's own fault.
    if (!running.size) throw new Error(`no check can start: ${checks.filter((c) => !started.has(c.id)).map((c) => c.id).join(', ')}`);
    await Promise.race(running.values());
  }
  return checks.map((c) => ended.get(c.id));
};

/** The seconds each check took, as a table, and the push's whole time. */
const table = (results, total) => ['| check | seconds | verdict |', '|---|---|---|',
  ...results.map((r) => `| ${r.label} | ${r.seconds} | ${r.code === 0 ? 'passed' : 'FAILED'} |`), `| the whole push check | ${total} | |`].join('\n');

/** The push check, as git's hook runs it: the refs on stdin. */
function main() {
  clearHookGitEnv(process.env);
  const plan = process.argv.includes('--plan');
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
  const input = readFileSync(0, 'utf8');
  const push = pushKind(input);
  if (push.kind === 'mixed') {
    console.error('Push refused: plant/* branches go alone, never with another ref, which the code gate would then pass unchecked');
    process.exit(1);
  }
  if (push.kind === 'plant') {
    // website-freeze.cjs reads to HEAD: a plant is pushed from a checkout at its own commit.
    const head = git('rev-parse', 'HEAD').trim();
    const away = push.plants.filter((p) => p.local !== head);
    if (away.length) { console.error(`Push refused: push a plant branch from a checkout at its commit (HEAD is ${head.slice(0, 8)})`); process.exit(1); }
    const checks = plantChecks(push.plants, git);
    if (process.argv.includes('--plan')) { for (const c of checks) console.log(`${c.id}\t${c.label}\t${c.args.join(' ')}`); process.exit(0); }
    const dir = mkdtempSync(join(os.tmpdir(), 'rh-push-'));
    runAll(checks, dir).then((results) => {
      const failed = results.filter((r) => r.code !== 0).map((r) => r.label);
      if (failed.length) { console.error(`\nPush refused: ${failed.join('; ')}`); process.exit(1); }
      console.log('\nA plant branch: published safely; CI runs the whole suite on it.');
    }, (e) => { console.error(`\nPush refused: the push check itself failed: ${e.message}`); process.exit(1); });
    return;
  }
  const bases = basesOf(input, git);
  const faults = [];
  const placed = mutantInPlace(ROOT);
  if (placed) faults.push(placed);
  const touched = [...new Set(bases.flatMap((b) => git('diff', '--name-only', `${b}...HEAD`).split('\n')))].filter(Boolean);
  const changed = [...new Set(bases.flatMap((b) => git('diff', '--name-only', '--diff-filter=ACMR', `${b}...HEAD`).split('\n')))]
    .filter((p) => p.startsWith('mobile/')).map((p) => p.slice('mobile/'.length));
  const code = changed.filter((p) => CODE.test(p));
  const files = { code, linted: lintTargets(changed, everyCodeFile()) };
  const all = readers(MOBILE);
  // Every rehearsal there is, from the shared file list as well as the ledger: one the ledger misses still runs.
  const { files: universe, rel } = require('../../test-utils/universe');
  const rehearsals = [...new Set([...all, ...universe('tests').map(rel)])].filter((p) => RUN_FLOWS.test(p)).sort();
  const cores = os.cpus().length;
  // The rehearsals' runs each hold a core of bash; the rest of the tests take what the memory allows.
  const workers = { rehearsals: Math.max(1, Math.min(rehearsals.length, 3)) };
  workers.tests = Math.max(1, Math.min(workersFor(os.freemem(), cores), cores - 1 - workers.rehearsals));
  const lanes = Math.max(1, Math.floor(cores / 3));
  const dir = mkdtempSync(join(os.tmpdir(), 'rh-push-'));
  const lists = {
    readers: join(dir, 'readers.txt'), rehearsals: join(dir, 'rehearsals.txt'), related: join(dir, 'related.txt'),
    testReport: join(dir, 'tests.json'), rehearsalReport: join(dir, 'rehearsals.json'),
  };
  writeFileSync(lists.readers, `${all.filter((p) => !RUN_FLOWS.test(p)).join('\n')}\n`);
  writeFileSync(lists.rehearsals, `${rehearsals.join('\n')}\n`);
  writeFileSync(lists.related, `${code.join('\n')}\n`);
  const clean = git('status', '--porcelain', '--untracked-files=no').trim() === '';
  const checks = checksFor({ bases, touched, changed, files, workers, lanes, lists, clean });
  if (plan) {
    for (const c of checks) console.log(`${c.id}\t${c.label}\t${c.args.slice(1).join(' ')}`);
    process.exit(faults.length ? 1 : 0);
  }
  const t0 = Date.now();
  runAll(checks, dir).then((results) => {
    const total = Math.round((Date.now() - t0) / 1000);
    console.log(`\n${table(results, total)}\n`);
    // The checks' seconds, kept per checkout for the next push's reading.
    const keep = join(os.tmpdir(), 'rh-push-times');
    mkdirSync(keep, { recursive: true });
    const file = join(keep, `${createHash('sha256').update(ROOT.toLowerCase()).digest('hex').slice(0, 10)}.json`);
    const had = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
    writeFileSync(file, `${JSON.stringify([...had.slice(-19), { at: new Date().toISOString(), total, checks: results.map((r) => ({ label: r.label, seconds: r.seconds, code: r.code })) }], null, 1)}\n`);
    faults.push(...results.filter((r) => r.code !== 0).map((r) => r.label));
    if (faults.length) { console.error(`\nPush refused: ${faults.join('; ')}`); process.exit(1); }
  }, (e) => { console.error(`\nPush refused: the push check itself failed: ${e.message}`); process.exit(1); });
}

if (require.main === module) main();

module.exports = {
  HOOK_GIT_ENV, PLANT, RUN_FLOWS, basesOf, checksFor, clearHookGitEnv, ignored, inBatches, lintTargets, plantChecks, pushKind, readers, runAll, table, workersFor,
};

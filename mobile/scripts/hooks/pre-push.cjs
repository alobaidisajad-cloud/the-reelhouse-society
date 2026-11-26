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
 * ends, every check to its end whatever another said, and never more of them at once than the
 * machine holds (capOf, runAll): each check says the processors and the memory it takes at its
 * peak (COST, measured on the push's own machine), and starts, in the plan's order, only once those
 * fit beside the checks running. The cap is measured when the push starts: the logical processors
 * but one, and the memory free then but a reserve. The tests run as one jest run (jest-run.cjs:
 * the related tests and the readers once each, the list handed over whole). The flow runner's
 * rehearsals (RUN_FLOWS) run as a jest run of their own, one whole run at a time, alone and last, at
 * normal priority, so their clocks are never starved; their last green verdict stands instead where
 * every input they read is byte for byte what earned it (verdicts.cjs). The
 * mutants run in checkouts of their own (mutant-lanes.cjs), so no mutant is ever written into the
 * files the tests read, their type checks answered by one warm checker, which checks the commit's
 * own types too. Each check's seconds, and when it started, are printed as a table at the end and
 * kept in the system's temp folder.
 *
 *   node mobile/scripts/hooks/pre-push.cjs --plan     with the refs on stdin: every check and file it
 *                                                     would run, run nothing
 *   node mobile/scripts/hooks/pre-push.cjs --dry-run [<base>]
 *                                                     every check a push of HEAD to main would run,
 *                                                     from <base> (origin/main by default), run as
 *                                                     that push runs them; nothing is pushed
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
 * that wait on bash rather than the processor. They run on every push in jest runs of their own,
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

const GB = 1024 ** 3;

/**
 * What each kind of check takes at its peak: processors, and bytes of memory, measured alone on the
 * push's own machine (12 logical processors, 16 GB) with the whole process tree's working set sampled:
 * tsc over tsconfig.json 31 s and 2.21 GB; comment-truth 118 s and 0.75 GB; the frozen counts (its tsc
 * and its typed eslint at once) 93 s and 3.41 GB; eslint on three files 0.36 GB; the warm type checker
 * 2.6 GB built and 2.8 GB after thirty mutants, run under a 3.5 GB heap. A jest worker restarts past
 * 400 MB of heap (jest.config.js). The rehearsals take the whole cap (sizesFor).
 */
const COST = {
  script: { cpu: 1, mem: 0.2 * GB },
  comments: { cpu: 1, mem: 0.8 * GB },
  types: { cpu: 1, mem: 2.3 * GB },
  frozen: { cpu: 2, mem: 3.5 * GB },
  lint: { cpu: 1, mem: 0.8 * GB },
  warm: { cpu: 1, mem: 3.2 * GB },
  worker: { cpu: 1, mem: 0.6 * GB },
  lane: { cpu: 1, mem: 0.7 * GB },
};

/** The memory kept for the system and the member at the keyboard, and the processor kept for them too. */
const RESERVE_BYTES = 0.5 * GB;

/** The machine as the push measures it when it starts: its logical processors, and the memory free then. */
const machine = () => ({ cores: os.cpus().length, freeBytes: os.freemem(), totalBytes: os.totalmem() });

/** What the push may hold at once: every logical processor but one, and the free memory but the reserve. */
const capOf = ({ cores, freeBytes }) => ({ cpu: Math.max(1, cores - 1), mem: Math.max(0, freeBytes - RESERVE_BYTES) });

/** How many of a thing of this cost fit in what is left of the cap, at least one, at most `most`. */
const fitting = (left, cost, most) => Math.max(1, Math.min(most, Math.floor(left.cpu / cost.cpu), Math.floor(left.mem / cost.mem)));

/**
 * The jest workers and the mutant lanes the cap allows, where the warm checker runs, and what a
 * rehearsal holds (`whole`). The rehearsals run alone, the whole cap theirs, one test at a time as
 * their file is written to: Git Bash starts each of their many processes the slower the more else runs,
 * whatever its priority. Measured on the push's machine: one test 137 s alone and 132 s beside one jest
 * worker, but 181 s beside two, and the slowest, 226 s beside one, ran out of its 300 s beside two; two
 * rehearsals side by side took 211 s each. The warm checker runs beside the tests when it needs no more
 * than half the cap (`warmEarly`), else after them; the tests' workers take what is left, and the lanes,
 * which start once the tests have ended, the whole cap. Each is at least one: what does not fit beside
 * the rest, runAll runs after it.
 */
const sizesFor = (cap, { mutants }) => {
  const warmEarly = mutants > 0 && COST.warm.mem <= cap.mem / 2 && COST.warm.cpu <= cap.cpu / 2;
  const room = warmEarly ? { cpu: cap.cpu - COST.warm.cpu, mem: cap.mem - COST.warm.mem } : cap;
  return { tests: fitting(room, COST.worker, cap.cpu), lanes: fitting(cap, COST.lane, cap.cpu), warmEarly, whole: cap };
};

/** A check's cost: what its kind takes, times how many of it run (jest's workers, the parts, the lanes). */
const costOf = (kind, times = 1) => ({ cpu: COST[kind].cpu * times, mem: COST[kind].mem * times });

/** Where each pushed ref starts: the remote's tip, or where a new branch left main. */
const basesOf = (input, git) => input.split('\n').filter(Boolean).flatMap((line) => {
  const [, local, , remote] = line.trim().split(/\s+/);
  if (!local || ZERO.test(local)) return [];
  if (remote && !ZERO.test(remote)) return [remote];
  return [git('merge-base', local, 'origin/main').trim()];
});

/** The line git would hand the hook for a push of HEAD to main over `base`: what --dry-run checks. */
const dryRunInput = (git, base = 'origin/main') => `refs/heads/main ${git('rev-parse', 'HEAD').trim()} refs/heads/main ${git('rev-parse', base).trim()}\n`;

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
    { id: `secrets@${local}`, label: `no secret in the commits ${at}`, cmd: 'gitleaks', cwd: ROOT, after: [], low: false, cost: costOf('script'),
      args: ['git', '--log-opts', `${base}..${local}`, '--config', '.gitleaks.toml', '--gitleaks-ignore-path', '.gitleaksignore', '--redact=100', '--no-banner', '--log-level', 'warn', '.'] },
    { id: `website-freeze.cjs@${local}`, label: `website-freeze.cjs from ${base.slice(0, 8)}`, cwd: ROOT, after: [], low: false, cost: costOf('script'), args: [join(MOBILE, 'scripts', 'website-freeze.cjs'), base] },
    { id: `disclosure@${local}`, label: `no message or test title of ${at} describes a hole`, cwd: ROOT, after: [], low: false, cost: costOf('script'), args: [join(__dirname, 'disclosure.cjs'), base, local] },
  ];
});

/**
 * The checks for these bases and changes, each { id, label, args (node's), cwd, after, low, cost }:
 * `after` names the checks it waits for, `low` runs it below normal priority (its children inherit
 * it), `cost` what it takes at its peak. Their order is the order they start in when the cap is
 * short: the tests (the warm checker before them when it fits beside them, else after), the rest, the
 * mutants, and last the rehearsals and the mutants a rehearsal proves, each alone.
 */
const checksFor = ({ bases, touched, changed, files, sizes, lists, clean, mutants, reuse = false }) => {
  const checks = [];
  const add = (c) => checks.push({ after: [], cwd: MOBILE, low: true, cost: costOf('script'), ...c });
  // The warm checker: the types of the commit, then each mutant's type check, which the lanes read as they come.
  const warm = () => add({ id: 'mutant-types', label: 'types, and the mutants\' type checks, by the warm checker', cost: costOf('warm'),
    args: [join(__dirname, 'mutant-lanes.cjs'), '--changed', bases[0], '--lanes', String(sizes.lanes), '--types-out', lists.types] });
  if (mutants && sizes.warmEarly) warm();
  if (changed.length) {
    add({
      id: 'tests', label: 'the tests related to the changed files, and every test that reads source, the guards among them', cost: costOf('worker', sizes.tests),
      args: [join(__dirname, 'jest-run.cjs'), '--workers', String(sizes.tests), '--out', lists.testReport, '--paths', lists.readers,
        ...(files.code.length ? ['--related', lists.related] : []), '--leave', RUN_FLOWS.source],
    });
  }
  if (mutants && !sizes.warmEarly) warm();
  for (const base of bases) {
    for (const script of ['website-freeze.cjs', 'add-only.cjs', 'migration-lint.cjs']) {
      add({ id: `${script}@${base}`, label: `${script} from ${base.slice(0, 8)}`, args: [join(MOBILE, 'scripts', script), base], cwd: ROOT });
    }
    add({ id: `frozen-base@${base}`, label: `frozen counts' baseline from ${base.slice(0, 8)}`, args: [join(MOBILE, 'scripts', 'frozen-counts.cjs'), '--base', base], cwd: ROOT });
  }
  const frozen = checksTouchedBy(touched);
  if (frozen.length) add({ id: 'frozen', label: `frozen counts: ${frozen.join(', ')}`, cost: costOf('frozen'), args: [join(MOBILE, 'scripts', 'frozen-counts.cjs'), '--only', frozen.join(',')] });
  // God-tier's own comment gate: a comment naming what does not exist failed CI on ede2cc32.
  if (changed.length) add({ id: 'comments', label: 'every comment names what exists', cost: costOf('comments'), args: [join(MOBILE, 'scripts', 'comment-truth.js'), '--kinds', 'NAME,FILE,LINE'] });
  // The warm checker builds the same project and fails on its errors: the types are not checked twice.
  if (files.code.length && !mutants) add({ id: 'types', label: 'types', cost: costOf('types'), args: [bin('typescript', 'bin', 'tsc'), '--noEmit', '-p', '.'] });
  inBatches(files.linted).forEach((batch, i) => add({
    id: `lint-${i + 1}`, label: files.linted.length > files.code.length ? 'lint on every file, as lint\'s rules changed' : 'lint on the changed files', cost: costOf('lint'),
    args: [bin('eslint', 'bin', 'eslint.js'), '--max-warnings=0', '--no-warn-ignored', ...batch],
  }));
  // On a tree the tests found green, a mutant's first run is theirs (clean: nothing uncommitted they read).
  // The lanes start once the warm checker has answered: no lane ever runs tsc beside it.
  const greenOf = () => (changed.length && clean ? ['--green', `${lists.testReport},${lists.rehearsalReport}`] : []);
  const typesOf = (base) => (mutants && base === bases[0] ? ['--types-from', lists.types] : []);
  const warmFirst = (base) => (typesOf(base).length ? ['mutant-types'] : []);
  for (const base of bases) {
    add({
      id: `mutants@${base}`, label: `the mutants standing on what changed from ${base.slice(0, 8)}`, cost: costOf('lane', sizes.lanes),
      args: [join(__dirname, 'mutant-lanes.cjs'), '--changed', base, '--lanes', String(sizes.lanes), '--rehearsals', 'none', ...greenOf(), ...typesOf(base)],
      after: [...(greenOf().length ? ['tests'] : []), ...warmFirst(base)],
    });
  }
  // The rehearsals alone, the whole cap theirs, and then the mutants a rehearsal proves, in one lane,
  // alone too: no other check, and never a second rehearsal, beside a rehearsal's clock.
  // Their last green verdict stands where every input they read is byte for byte what earned it
  // (verdicts.cjs, which says so, and checks it again as it runs); they run otherwise.
  if (changed.length && reuse) {
    add({ id: 'rehearsals', label: 'the flow runner\'s rehearsals, from their last green run on the very same inputs',
      args: [join(__dirname, 'verdicts.cjs'), '--reuse', lists.rehearsals, '--out', lists.rehearsalReport] });
  } else if (changed.length) {
    add({
      id: 'rehearsals', label: 'the flow runner\'s rehearsals, alone', low: false, cost: sizes.whole,
      args: [join(__dirname, 'jest-run.cjs'), '--workers', '1', '--out', lists.rehearsalReport, '--paths', lists.rehearsals],
    });
  }
  for (const base of bases) {
    add({
      id: `mutant-rehearsals@${base}`, label: `the mutants a rehearsal proves, standing on what changed from ${base.slice(0, 8)}, alone`, cost: sizes.whole,
      args: [join(__dirname, 'mutant-lanes.cjs'), '--changed', base, '--lanes', '1', '--rehearsals', 'only', ...greenOf(), ...typesOf(base)],
      after: ['rehearsals', ...warmFirst(base)],
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

/** Whether a cost fits in what is left: processors and memory both. */
const fits = (cost, left) => cost.cpu <= left.cpu + 1e-9 && cost.mem <= left.mem;

/**
 * Every check, each started once those it waits for have ended and its cost fits beside the checks
 * running, in the order given: the first ready check that does not fit holds every one after it, so
 * a large check is never passed over for ever by small ones. A check larger than the whole cap holds
 * none back: it runs alone, once nothing else is running. Each result carries the moments it started
 * and ended (ms from the first start).
 */
const runAll = async (checks, logDir, cap = { cpu: Infinity, mem: Infinity }, run = runCheck) => {
  const ended = new Map();
  const started = new Map();
  const running = new Map();
  const t0 = Date.now();
  const held = () => [...running.keys()].map((id) => checks.find((c) => c.id === id).cost ?? { cpu: 0, mem: 0 })
    .reduce((a, c) => ({ cpu: a.cpu + c.cpu, mem: a.mem + c.mem }), { cpu: 0, mem: 0 });
  while (ended.size < checks.length) {
    for (const c of checks) {
      if (started.has(c.id) || !c.after.every((a) => ended.has(a) || !checks.some((x) => x.id === a))) continue;
      const h = held();
      const cost = c.cost ?? { cpu: 0, mem: 0 };
      if (!fits(cost, cap)) { if (running.size) continue; } else if (!fits(cost, { cpu: cap.cpu - h.cpu, mem: cap.mem - h.mem }) && running.size) break;
      started.set(c.id, Date.now() - t0);
      running.set(c.id, run(c, logDir).then((r) => { ended.set(c.id, { ...r, from: started.get(c.id), to: Date.now() - t0 }); running.delete(c.id); }));
    }
    // Nothing running and something left: a check waits on one that never starts, which is the push check's own fault.
    if (!running.size) throw new Error(`no check can start: ${checks.filter((c) => !started.has(c.id)).map((c) => c.id).join(', ')}`);
    await Promise.race(running.values());
  }
  return checks.map((c) => ended.get(c.id));
};

/** The most the results held at once: processors and memory, from their moments and costs. */
const peakOf = (results) => {
  const moments = results.flatMap((r) => [[r.from, 1, r], [r.to, -1, r]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cpu = 0; let mem = 0; let most = { cpu: 0, mem: 0 };
  for (const [, d, r] of moments) {
    cpu += d * (r.cost?.cpu ?? 0); mem += d * (r.cost?.mem ?? 0);
    most = { cpu: Math.max(most.cpu, cpu), mem: Math.max(most.mem, mem) };
  }
  return most;
};

/** The seconds each check took, as a table, and the push's whole time. */
const table = (results, total) => ['| check | started at s | seconds | verdict |', '|---|---|---|---|',
  ...results.map((r) => `| ${r.label} | ${Math.round((r.from ?? 0) / 1000)} | ${r.seconds} | ${r.code === 0 ? 'passed' : 'FAILED'} |`), `| the whole push check | | ${total} | |`].join('\n');

/**
 * The rehearsals' verdict kept after a run: green, with its inputs and report, only while the inputs
 * are still the ones the run began on (`began`, their key); red, any green kept before forgotten.
 */
const keepRehearsals = (verdicts, rehearsals, began, green, report, commit) => {
  const file = verdicts.bookFile('rehearsals');
  const book = verdicts.readBook(file);
  const now = verdicts.rehearsalState(rehearsals);
  if (green && now.key !== began) { console.log('the rehearsals passed, but their inputs changed while they ran: their verdict is not kept'); return; }
  verdicts.remember(book, 'rehearsals', { ...now, verdict: green ? 'passed' : 'failed', commit });
  if (green) writeFileSync(join(verdicts.verdictsDir(), verdicts.REHEARSAL_REPORT), readFileSync(report));
  verdicts.writeBook(file, book);
};

/** The push check, as git's hook runs it: the refs on stdin, or --dry-run's own line. */
function main() {
  clearHookGitEnv(process.env);
  const plan = process.argv.includes('--plan');
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
  const dry = process.argv.indexOf('--dry-run');
  const input = dry >= 0 ? dryRunInput(git, process.argv[dry + 1] && !process.argv[dry + 1].startsWith('--') ? process.argv[dry + 1] : undefined) : readFileSync(0, 'utf8');
  if (dry >= 0) console.log(`a dry run: the checks of a push of HEAD to main (${input.trim()}), nothing pushed`);
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
    runAll(checks, dir, capOf(machine())).then((results) => {
      const failed = results.filter((r) => r.code !== 0).map((r) => r.label);
      if (failed.length) { console.error(`\nPush refused: ${failed.join('; ')}`); process.exit(1); }
      console.log('\nA plant branch: published safely; CI runs the whole suite on it.');
    }, (e) => { console.error(`\nPush refused: the push check itself failed: ${e.message}`); process.exit(1); });
    return;
  }
  // A code push is the gate itself, or one beside it: only the gate's own (push-head.ps1 holds the
  // lock, gate-lock.cjs) runs while the lock is held. A plant push, and the plan alone, take no machine.
  if (!plan) require('../gate-lock.cjs').refuseWhileGate('this push gate');
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
  const { readMutants, touchedSince } = require('../mutants.cjs');
  const mutants = bases.length ? touchedSince(bases[0], readMutants()).length : 0;
  const at = machine();
  const cap = capOf(at);
  const sizes = sizesFor(cap, { mutants });
  console.log(`the machine: ${at.cores} logical processors, ${(at.freeBytes / GB).toFixed(1)} of ${(at.totalBytes / GB).toFixed(1)} GB free; `
    + `the cap: ${cap.cpu} processors, ${(cap.mem / GB).toFixed(1)} GB; ${sizes.tests} jest workers, ${sizes.lanes} mutant lanes, `
    + `${mutants} mutants, the warm checker ${sizes.warmEarly ? 'beside the tests' : 'after them'}`);
  const dir = mkdtempSync(join(os.tmpdir(), 'rh-push-'));
  console.log(`each check's log and report: ${dir}`);
  const keep = join(os.tmpdir(), 'rh-push-times');
  mkdirSync(keep, { recursive: true });
  const checkout = createHash('sha256').update(ROOT.toLowerCase()).digest('hex').slice(0, 10);
  const lists = {
    readers: join(dir, 'readers.txt'), rehearsals: join(dir, 'rehearsals.txt'), related: join(dir, 'related.txt'),
    testReport: join(dir, 'tests.json'), rehearsalReport: join(dir, 'rehearsals.json'), types: join(dir, 'types.jsonl'),
  };
  writeFileSync(lists.readers, `${all.filter((p) => !RUN_FLOWS.test(p)).join('\n')}\n`);
  writeFileSync(lists.rehearsals, `${rehearsals.join('\n')}\n`);
  writeFileSync(lists.related, `${code.join('\n')}\n`);
  const clean = git('status', '--porcelain', '--untracked-files=no').trim() === '';
  // The rehearsals' inputs as the push begins: their last green verdict is taken where these are its own.
  const verdicts = require('./verdicts.cjs');
  const rehearsed = changed.length && rehearsals.length ? verdicts.rehearsalState(rehearsals) : null;
  const reuse = !!rehearsed && !!verdicts.lookup(verdicts.readBook(verdicts.bookFile('rehearsals')), 'rehearsals', rehearsed.key);
  const checks = checksFor({ bases, touched, changed, files, sizes, lists, clean, mutants, reuse });
  if (plan) {
    for (const c of checks) console.log(`${c.id}\t${c.label}\t${c.args.slice(1).join(' ')}`);
    process.exit(faults.length ? 1 : 0);
  }
  const t0 = Date.now();
  runAll(checks, dir, cap).then((results) => {
    const total = Math.round((Date.now() - t0) / 1000);
    const peak = peakOf(results);
    console.log(`\n${table(results, total)}\n\nthe most held at once: ${peak.cpu} of ${cap.cpu} processors, ${(peak.mem / GB).toFixed(1)} of ${(cap.mem / GB).toFixed(1)} GB\n`);
    // The checks' seconds, kept per checkout for the next push's reading.
    const file = join(keep, `${checkout}.json`);
    const had = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
    writeFileSync(file, `${JSON.stringify([...had.slice(-19), { at: new Date().toISOString(), total, cap, checks: results.map((r) => ({ label: r.label, from: r.from, seconds: r.seconds, code: r.code })) }], null, 1)}\n`);
    // A green run of the rehearsals is kept with its inputs, where they are still those it began on; a red one forgets.
    const ran = results.find((r) => r.id === 'rehearsals');
    if (rehearsed && ran && !reuse) keepRehearsals(verdicts, rehearsals, rehearsed.key, ran.code === 0, lists.rehearsalReport, git('rev-parse', 'HEAD').trim());
    faults.push(...results.filter((r) => r.code !== 0).map((r) => r.label));
    if (faults.length) { console.error(`\nPush refused: ${faults.join('; ')}`); process.exit(1); }
  }, (e) => { console.error(`\nPush refused: the push check itself failed: ${e.message}`); process.exit(1); });
}

if (require.main === module) main();

module.exports = {
  COST, HOOK_GIT_ENV, PLANT, RUN_FLOWS, basesOf, capOf, checksFor, clearHookGitEnv, dryRunInput, fits, ignored, inBatches, lintTargets,
  peakOf, plantChecks, pushKind, readers, runAll, sizesFor, table,
};

/**
 * The CI workflows — the rules that keep them honest.
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Every outside action runs at one exact commit. A tag (`@v5`) is a pointer
 *    its owner can move to other code, and that code runs with this repo's
 *    secrets. The version it was pinned at is written beside it.
 * 2. Every job has a time limit, and names its runner image. Without a limit a
 *    hung step holds a runner for six hours and reports nothing; `-latest`
 *    moves to a new OS on GitHub's date, not ours.
 * 3. Every workflow is watched by ci-alert.yml — by its exact name, which is how
 *    workflow_run finds it — and can be started by hand. Rename a workflow and
 *    forget the alert, and its failures would go back to being silent.
 * 4. A later push never cancels an E2E run in progress, so each commit's run is read.
 * 5. Supabase's advisers run on every push, and only as names and counts: the
 *    repository is public, and a finding's detail could describe a weakness.
 * 6. Known-vulnerable packages: every push judges the packages the phone holds;
 *    the nightly judges those, the website's and the edge functions' imports.
 * 7. Jest and the captures run in parts, each read together by a job that reads
 *    as many parts as run; jest runs in every zone scripts/test-timezones.js lists.
 *
 * Parsed as YAML, not matched as text: the rules are about the structure.
 */
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { files as universe } from '@/test-utils/universe';

// The Node build, by file: this project's Jest resolves packages the way a
// phone would (the `browser` condition), and yaml's browser build is ESM.
const { parse } = require(require.resolve('yaml/package.json').replace(/package\.json$/, 'dist/index.js')) as typeof import('yaml');

const DIR = join(__dirname, '..', '..', '..', '..', '.github', 'workflows');
type Step = { uses?: string; run?: string };
type Job = { 'timeout-minutes'?: number; 'runs-on'?: string; steps?: Step[]; uses?: string; with?: Record<string, unknown> };
/** A call to another of this repo's workflows: its runner and limit are checked there. */
const LOCAL_CALL = /^\.\/\.github\/workflows\/[\w-]+\.ya?ml$/;
const calls = (job: Job) => typeof job.uses === 'string' && LOCAL_CALL.test(job.uses);
type Workflow = { name: string; on: Record<string, unknown> | string | string[]; jobs: Record<string, Job> };

const files = universe('workflows').map((f) => relative(DIR, f));
const workflows = files.map((f) => {
  const text = readFileSync(join(DIR, f), 'utf8');
  return { file: f, text, wf: parse(text) as Workflow };
});
const triggers = (wf: Workflow) => (typeof wf.on === 'string' ? [wf.on] : Array.isArray(wf.on) ? wf.on : Object.keys(wf.on ?? {}));

it('reads every workflow — it is not passing on an empty folder', () => {
  expect(files.sort()).toEqual(expect.arrayContaining(['ci-alert.yml', 'ci.yml', 'db-integration.yml', 'god_tier_ci.yml']));
});

describe.each(workflows.map((w) => [w.file, w] as const))('%s', (_file, { text, wf }) => {
  it('has jobs, each run here or a call to a workflow checked in its own file', () => {
    const jobs = Object.values(wf.jobs);
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.filter((j) => !calls(j) && !j.steps?.length)).toEqual([]);
  });

  it('pins every outside action to a full commit, with its release noted', () => {
    const all = text.split('\n').filter((l) => /^\s*-?\s*uses:\s/.test(l));
    const lines = all.filter((l) => !LOCAL_CALL.test(l.replace(/^\s*-?\s*uses:\s*/, '').trim()));
    expect(all.length).toBeGreaterThan(0);
    for (const line of lines) {
      const ref = /uses:\s*([^@\s]+)@(\S+)(\s*#\s*(\S+))?/.exec(line);
      expect({ line: line.trim(), pinned: !!ref && /^[0-9a-f]{40}$/.test(ref[2]), noted: !!ref?.[4] })
        .toEqual({ line: line.trim(), pinned: true, noted: true });
    }
  });

  it('gives every job a time limit', () => {
    const limits = Object.entries(wf.jobs).filter(([, j]) => !calls(j))
      .map(([name, job]) => ({ job: name, limit: typeof job['timeout-minutes'] === 'number' && job['timeout-minutes'] > 0 }));
    expect(limits.filter((l) => !l.limit)).toEqual([]);
  });

  it('runs every job on a named runner image, never a moving -latest', () => {
    const images = Object.entries(wf.jobs).filter(([, j]) => !calls(j))
      .map(([name, job]) => ({ job: name, named: /^[a-z]+-\d+(\.\d+)?$/.test(String(job['runs-on'] ?? '')) }));
    expect(images.filter((i) => !i.named)).toEqual([]);
  });
});

it('a job that calls a workflow calls one that exists and takes the call, and nothing else is let off', () => {
  const callers = workflows.flatMap((w) => Object.entries(w.wf.jobs).filter(([, j]) => j.uses).map(([name, j]) => ({ file: w.file, name, uses: j.uses! })));
  expect(callers.filter((c) => !LOCAL_CALL.test(c.uses))).toEqual([]);
  for (const c of callers) {
    const callee = workflows.find((w) => `./.github/workflows/${w.file}` === c.uses);
    expect({ caller: `${c.file}:${c.name}`, takesTheCall: !!callee && triggers(callee.wf).includes('workflow_call') })
      .toEqual({ caller: `${c.file}:${c.name}`, takesTheCall: true });
  }
});

it('runs every shipped client the record marks checked, and only that workflow names a client', () => {
  const record = JSON.parse(readFileSync(join(DIR, '..', '..', 'mobile', 'e2e', 'old-clients.json'), 'utf8')) as {
    clients: { name: string; checked: boolean }[];
  };
  const named = workflows.flatMap((w) => Object.values(w.wf.jobs).filter((j) => j.with && 'client' in j.with)
    .map((j) => ({ file: w.file, client: String(j.with!.client) })));
  expect([...new Set(named.map((n) => n.file))]).toEqual(['e2e-old-clients.yml']);
  expect(named.map((n) => n.client).sort()).toEqual(record.clients.filter((c) => c.checked).map((c) => c.name).sort());
});

it('the alert watches every workflow, by its exact name: one started by hand on main is heard too', () => {
  const alert = workflows.find((w) => w.file === 'ci-alert.yml')!.wf;
  const watched = (alert.on as { workflow_run: { workflows: string[] } }).workflow_run.workflows;
  const others = workflows.filter((w) => w.file !== 'ci-alert.yml').map((w) => w.wf.name);
  expect(others.length).toBeGreaterThan(5);
  expect([...watched].sort()).toEqual([...others].sort());
});

it('every workflow but the alert can be started by hand', () => {
  const byHand = (wf: Workflow) => triggers(wf).includes('workflow_dispatch');
  expect(workflows.filter((w) => w.file !== 'ci-alert.yml' && !byHand(w.wf)).map((w) => w.file)).toEqual([]);
  expect(byHand(parse('name: x\non:\n  push:\n    branches: [main]\njobs: {}\n') as Workflow)).toBe(false);
});

type CommandStep = { name?: string; run?: string; if?: string; env?: unknown; 'working-directory'?: string };
/**
 * The commands a job runs twice, as `job › name`: the same command, in the same
 * folder, with the same env. npm's --silent is the same run. A retry of a step
 * that failed is that step's second try, not a second check.
 */
const twice = (wf: Workflow) => Object.entries(wf.jobs).flatMap(([job, j]) => {
  const seen = new Set<string>();
  return ((j.steps ?? []) as CommandStep[]).filter((s) => s.run && !/^steps\.[\w-]+\.outcome == 'failure'$/.test(s.if ?? '')).flatMap((s) => {
    const key = JSON.stringify([s['working-directory'] ?? '', s.env ?? null, s.run!.replace(/\bnpm run (?:-s|--silent) /g, 'npm run ').trim()]);
    if (seen.has(key)) return [`${job} › ${s.name ?? s.run}`];
    seen.add(key);
    return [];
  });
});

it('no job runs one command twice: a check run twice reads as two', () => {
  expect(workflows.flatMap((w) => twice(w.wf).map((t) => `${w.file} › ${t}`))).toEqual([]);
  const wf = (steps: string) => parse(`name: x\non: push\njobs:\n  j:\n    steps:\n${steps}`) as Workflow;
  expect(twice(wf('      - name: a\n        run: npm run check:routes\n      - name: b\n        run: npm run -s check:routes\n'))).toEqual(['j › b']);
  expect(twice(wf("      - id: p\n        run: npm ci\n      - name: again\n        if: steps.p.outcome == 'failure'\n        run: npm ci\n"))).toEqual([]);
  expect(twice(wf('      - name: a\n        run: npx jest\n      - name: b\n        env:\n          TZ: Asia/Tokyo\n        run: npx jest\n'))).toEqual([]);
});

/** Whether a workflow runs the E2E flows: by the runner script, or by calling e2e.yml. */
const runsFlows = (w: { text: string }) => /run-flows\.sh|uses:\s*\.\/\.github\/workflows\/e2e\.ya?ml/.test(w.text);
/** Whether a later push cancels its run in progress. */
/**
 * Whether a later push can end a run before it is read: by cancelling it, or
 * by sharing its group with other commits, where GitHub keeps one waiting run
 * and drops an older one that waits.
 */
const cancels = (wf: Workflow & { concurrency?: string | { group?: string; 'cancel-in-progress'?: unknown } }) => {
  const c = wf.concurrency;
  if (c === undefined) return false;
  const group = typeof c === 'string' ? c : c.group ?? '';
  return (typeof c === 'object' && c['cancel-in-progress'] === true) || !/\$\{\{\s*github\.sha\s*\}\}/.test(group);
};

/** A step that installs packages: the kind that hung for 25 minutes in a nightly (2026-10-12). */
const INSTALLS = /(^|[\s;&|(])(sudo\s+)?(apt-get|apt|brew)\s+install\b|\bnpm\s+(ci|install)\b|\bpip3?\s+install\b|\bplaywright\s+install\b|\bsdkmanager\b[^\n]*\s--install\b/m;

/** The action's name, without the commit it is pinned to. */
const actionOf = (uses: string) => uses.replace(/@.*$/, '');
/**
 * Every action a scheduled workflow uses, judged: true when it downloads what
 * it installs while the run runs, so it is an install like any other; or why
 * it is not one.
 */
const ACTIONS: Record<string, true | string> = {
  // "No matching Supabase CLI binary package found for linux-x64": one failed
  // download from npm failed the database run of 2026-10-15.
  'supabase/setup-cli': true,
  'actions/checkout': "this repository, from GitHub's own servers; the action tries each fetch again itself",
  'actions/setup-node': "Node 24 from the runner's own disk (\"Found in cache\", run 38804362129): nothing is downloaded",
  'actions/setup-java': "Java 17 from the runner's own disk (\"Resolved Java 17 from tool-cache\", run 38786642483): nothing is downloaded",
  'actions/upload-artifact': "the run's own files, to GitHub's store for the run",
  'actions/download-artifact': "the run's own files, from GitHub's store for the run",
  // What it would download is installed by the step before it: held by the emulator's test below.
  'reactivecircus/android-emulator-runner': 'boots the emulator and runs the flows in one step; its packages are installed before it, by a step tried once more alone',
};

type RunStep = { name?: string; id?: string; run?: string; uses?: string; with?: Record<string, unknown>; if?: string; 'timeout-minutes'?: number; 'continue-on-error'?: boolean };
const isInstall = (s: RunStep) => (!!s.run && INSTALLS.test(s.run)) || (!!s.uses && ACTIONS[actionOf(s.uses)] === true);
/** The same step: the same command, or the same action given the same inputs. */
const sameStep = (a: RunStep, b: RunStep) => a.run === b.run && a.uses === b.uses && JSON.stringify(a.with) === JSON.stringify(b.with);
/**
 * Each install, in a workflow that runs on a schedule (or one such a workflow
 * calls), written as a command or made by an action that downloads: the step
 * with its own limit of at most 5 minutes and let fail, then the same step
 * once more, only if it failed, under the same limit. Its second failure fails
 * the run. Each fault named by job and step.
 */
function installFaults(wf: Workflow): string[] {
  const faults: string[] = [];
  for (const [job, j] of Object.entries(wf.jobs)) {
    const steps = (j.steps ?? []) as RunStep[];
    steps.forEach((s, i) => {
      if (!isInstall(s) || /^steps\.[\w-]+\.outcome == 'failure'$/.test(s.if ?? '')) return;
      const at = `${job} › ${s.name ?? s.run ?? s.uses}`;
      const again = steps[i + 1];
      const limited = (x?: RunStep) => typeof x?.['timeout-minutes'] === 'number' && x['timeout-minutes']! <= 5;
      if (!limited(s)) faults.push(`${at}: no limit of 5 minutes or less`);
      if (!s.id || s['continue-on-error'] !== true) faults.push(`${at}: not let fail (id and continue-on-error) for its retry`);
      else if (!again || !sameStep(again, s) || again.if !== `steps.${s.id}.outcome == 'failure'`) faults.push(`${at}: no retry right after it`);
      else if (!limited(again)) faults.push(`${at}: its retry has no limit of 5 minutes or less`);
      else if (again['continue-on-error']) faults.push(`${at}: its retry may fail without failing the run`);
    });
  }
  return faults;
}
/** The workflows that run on a schedule, and the ones they call. */
const scheduled = () => {
  const own = workflows.filter((w) => triggers(w.wf).includes('schedule'));
  const called = own.flatMap((w) => Object.values(w.wf.jobs).map((j) => j.uses).filter((u): u is string => !!u && LOCAL_CALL.test(u)))
    .map((u) => u.split('/').pop()!);
  return workflows.filter((w) => own.includes(w) || called.includes(w.file));
};

it('in a workflow run on a schedule, every install has its own short limit and one retry of that step alone', () => {
  const nightly = scheduled();
  expect(nightly.map((w) => w.file)).toEqual(expect.arrayContaining(['db-integration.yml', 'e2e.yml', 'god_tier_ci.yml']));
  expect(nightly.flatMap((w) => installFaults(w.wf).map((f) => `${w.file} › ${f}`))).toEqual([]);
  // Each install counted: a parse that found none would pass on nothing.
  expect(nightly.flatMap((w) => Object.values(w.wf.jobs).flatMap((j) => (j.steps ?? []) as RunStep[]))
    .filter((s) => s.run && INSTALLS.test(s.run) && !s.if).length).toBeGreaterThanOrEqual(10);
});

it('says no to an install with no limit, one with no retry, and a retry that may fail', () => {
  const wf = (steps: string) => parse(`name: x\non: push\njobs:\n  j:\n    steps:\n${steps}`) as Workflow;
  const bare = '      - name: Packages\n        run: npm ci\n';
  expect(installFaults(wf(bare))).toEqual(['j › Packages: no limit of 5 minutes or less', 'j › Packages: not let fail (id and continue-on-error) for its retry']);
  const first = '      - name: Packages\n        id: p\n        timeout-minutes: 5\n        continue-on-error: true\n        run: npm ci\n';
  expect(installFaults(wf(first))).toEqual(['j › Packages: no retry right after it']);
  const retry = (extra: string) => `      - name: Packages, once more\n        if: steps.p.outcome == 'failure'\n${extra}        run: npm ci\n`;
  expect(installFaults(wf(first + retry('        timeout-minutes: 5\n')))).toEqual([]);
  expect(installFaults(wf(first + retry('        timeout-minutes: 9\n')))).toEqual(['j › Packages: its retry has no limit of 5 minutes or less']);
  expect(installFaults(wf(first + retry('        timeout-minutes: 5\n        continue-on-error: true\n')))).toEqual(['j › Packages: its retry may fail without failing the run']);
  for (const cmd of ['sudo apt-get install -y x', 'brew install x', 'pip install x', 'npm install', 'npx playwright install --with-deps chromium',
    '"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --install emulator']) {
    expect([cmd, INSTALLS.test(cmd)]).toEqual([cmd, true]);
  }
  expect(INSTALLS.test('npm run build')).toBe(false);
  expect(INSTALLS.test('yes | sdkmanager --licenses')).toBe(false);
  // An action that downloads is an install: bare, it fails; retried with other inputs, it fails.
  const cli = (extra: string, version = '2') => `      - name: CLI\n${extra}        uses: supabase/setup-cli@abc\n        with:\n          version: ${version}\n`;
  const cliFirst = cli('        id: c\n        timeout-minutes: 5\n        continue-on-error: true\n');
  const cliAgain = (version?: string) => cli("        if: steps.c.outcome == 'failure'\n        timeout-minutes: 5\n", version);
  expect(installFaults(wf(cli('')))).toEqual(['j › CLI: no limit of 5 minutes or less', 'j › CLI: not let fail (id and continue-on-error) for its retry']);
  expect(installFaults(wf(cliFirst + cliAgain('3')))).toEqual(['j › CLI: no retry right after it']);
  expect(installFaults(wf(cliFirst + cliAgain()))).toEqual([]);
});

it('judges every action a scheduled workflow uses: it downloads, and is an install, or it is named with why not', () => {
  const used = [...new Set(scheduled().flatMap((w) => Object.values(w.wf.jobs).flatMap((j) => ((j.steps ?? []) as RunStep[])
    .map((s) => s.uses).filter((u): u is string => !!u && !LOCAL_CALL.test(u)).map(actionOf))))].sort();
  expect(used).toEqual(expect.arrayContaining(['supabase/setup-cli', 'actions/checkout']));
  expect(used.filter((a) => !(a in ACTIONS))).toEqual([]);
  // Each one named is still used: a stale entry is a judgement nothing reads.
  expect(Object.keys(ACTIONS).filter((a) => !used.includes(a))).toEqual([]);
});

it('the emulator finds every package it would download already installed, by a step tried once more alone', () => {
  const e2e = workflows.find((w) => w.file === 'e2e.yml')!;
  const runs = Object.values(e2e.wf.jobs).filter((j) => ((j.steps ?? []) as RunStep[]).some((s) => s.uses && actionOf(s.uses) === 'reactivecircus/android-emulator-runner'));
  expect(runs.length).toBe(1);
  const steps = runs[0]!.steps as RunStep[];
  const at = steps.findIndex((s) => s.uses && actionOf(s.uses) === 'reactivecircus/android-emulator-runner');
  const w = steps[at]!.with as { 'api-level': number; target: string; arch: string };
  const installed = steps.slice(0, at).filter((s) => s.run && INSTALLS.test(s.run) && /\bsdkmanager\b/.test(s.run) && !s.if).map((s) => s.run!).join('\n');
  // What the action installs before it boots (its log, run 38786642483); the build tools' version is its own.
  for (const pkg of [`'system-images;android-${w['api-level']};${w.target};${w.arch}'`, 'emulator', 'platform-tools', `'platforms;android-${w['api-level']}'`, "'build-tools;"]) {
    expect([pkg, installed.includes(pkg)]).toEqual([pkg, true]);
  }
});

/**
 * Each Gradle run that downloads nothing itself, as `job › step` faults: it
 * passes android.builder.sdkDownload=false, after a step of its job that
 * installs scripts/android-packages.cjs's list (that step is an install, so the
 * rule above gives it its retry).
 */
const gradleFaults = (wf: Workflow) => Object.entries(wf.jobs).flatMap(([job, j]) => {
  const steps = (j.steps ?? []) as RunStep[];
  return steps.flatMap((s, i) => {
    if (!s.run || !/\bgradlew\b/.test(s.run)) return [];
    const at = `${job} › ${s.name ?? s.run}`;
    const faults: string[] = [];
    if (!/-Pandroid\.builder\.sdkDownload=false\b/.test(s.run)) faults.push(`${at}: Gradle may download a package itself`);
    if (!steps.slice(0, i).some((p) => !p.if && p.run && /\bsdkmanager\b[^\n]*--install \$\(node scripts\/android-packages\.cjs\)/.test(p.run))) {
      faults.push(`${at}: no step before it installs the packages it needs`);
    }
    return faults;
  });
});

it('every Gradle run finds its Android packages installed by a step tried once more, and downloads none itself', () => {
  const builds = workflows.filter((w) => /\bgradlew\b/.test(w.text));
  expect(builds.map((w) => w.file).sort()).toEqual(expect.arrayContaining(['e2e.yml', 'god_tier_ci.yml']));
  expect(builds.flatMap((w) => gradleFaults(w.wf).map((f) => `${w.file} › ${f}`))).toEqual([]);
  const wf = (steps: string) => parse(`name: x\non: push\njobs:\n  j:\n    steps:\n${steps}`) as Workflow;
  const install = '      - name: Packages\n        run: sdkmanager --install $(node scripts/android-packages.cjs)\n';
  const build = (flags: string) => `      - name: Build\n        run: cd android && ./gradlew assembleRelease ${flags}\n`;
  expect(gradleFaults(wf(build('-Pandroid.builder.sdkDownload=false')))).toEqual(['j › Build: no step before it installs the packages it needs']);
  expect(gradleFaults(wf(install + build('')))).toEqual(['j › Build: Gradle may download a package itself']);
  expect(gradleFaults(wf(install + build('-Pandroid.builder.sdkDownload=false')))).toEqual([]);
});

it('every Android install asks the disk, not sdkmanager\'s exit code, whether its packages arrived', () => {
  // sdkmanager reports a broken download as a warning (Sealed E2E runs 38796451028, 38804362075).
  const asksTheDisk = (run: string) => /android-packages\.cjs --installed\b/.test(run);
  const installs = workflows.flatMap((w) => Object.values(w.wf.jobs).flatMap((j) => (j.steps ?? []) as RunStep[])
    .filter((s) => s.run && /\bsdkmanager\b[^\n]*\s--install\b/.test(s.run)).map((s) => ({ file: w.file, s })));
  expect(installs.length).toBeGreaterThanOrEqual(6);
  expect(installs.filter(({ s }) => !asksTheDisk(s.run!)).map(({ file, s }) => `${file} › ${s.name}`)).toEqual([]);
  expect(asksTheDisk('sdkmanager --install ndk\n')).toBe(false);
});

it('a TMDB request the E2E world has no recording for fails the run, by name', () => {
  const e2e = workflows.find((w) => w.file === 'e2e.yml')!;
  const step = Object.values(e2e.wf.jobs).flatMap((j) => (j.steps ?? []) as RunStep[]).find((s) => s.name === 'TMDB requests with no recording');
  expect(step?.if).toBe('always()');
  expect(step?.run).toMatch(/annotate\.mjs "TMDB requests with no recording[^"]*" "\$RUNNER_TEMP\/tmdb-misses\.txt" error\n\s*exit 1\n/);
});

it('no workflow that runs the E2E flows is cancelled by a later push: each commit\'s run is read', () => {
  const flows = workflows.filter(runsFlows);
  expect(flows.map((w) => w.file).sort()).toEqual(expect.arrayContaining(['e2e-old-clients.yml', 'e2e.yml']));
  expect(flows.filter((w) => cancels(w.wf)).map((w) => w.file)).toEqual([]);
  const planted = 'name: x\non: push\nconcurrency:\n  group: g\n  cancel-in-progress: true\njobs: {}\n';
  expect([runsFlows({ text: 'run: bash mobile/e2e/run-flows.sh' }), cancels(parse(planted) as Workflow)]).toEqual([true, true]);
  // Not cancelled, but one group per branch: the older waiting run is dropped.
  const byBranch = 'name: x\non: push\nconcurrency:\n  group: ${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: false\njobs: {}\n';
  const byCommit = byBranch.replace('github.ref', 'github.sha');
  expect([cancels(parse(byBranch) as Workflow), cancels(parse(byCommit) as Workflow)]).toEqual([true, false]);
});

/** Every step that runs a command, with its workflow and its triggers. */
const runSteps = () => workflows.flatMap((w) => Object.values(w.wf.jobs).flatMap((j) => (j.steps ?? [])
  .filter((s) => typeof s.run === 'string').map((s) => ({ file: w.file, on: triggers(w.wf), run: s.run! }))));

it("Supabase's advisers run on every push to main, proven able to fail, and print only names and counts", () => {
  const advisers = runSteps().filter((s) => /e2e\/db\/advisers\.mjs/.test(s.run));
  expect(advisers.map((s) => s.file)).toEqual(['db-integration.yml', 'db-integration.yml']);
  expect(advisers.every((s) => s.on.includes('push'))).toBe(true);
  expect(advisers.filter((s) => /--details|--from|--allowlist/.test(s.run)).map((s) => s.run)).toEqual([]);
  expect(advisers.map((s) => /--self-test/.test(s.run))).toEqual([true, false]);
});

type PartJob = Omit<Job, 'steps'> & { strategy?: { matrix?: { part?: unknown[] } }; env?: Record<string, unknown>; needs?: string; steps?: (Step & { name?: string; env?: Record<string, unknown> })[] };
/** The jobs run in parts, each with the job that reads its parts together. */
const SPLIT = [{ parts: 'native-unit-tests', together: 'jest-together' }, { parts: 'captures', together: 'captures-together' }];
/** Each way god_tier_ci.yml's split runs fall out of step, with each other or the zones, in words. */
function splitFaults(wf: Workflow, zones: { ZONES: string[]; recordOf: (tz: string) => string }): string[] {
  const faults: string[] = [];
  const jobs = wf.jobs as Record<string, PartJob>;
  for (const { parts, together } of SPLIT) {
    const p = jobs[parts];
    const t = jobs[together];
    const count = p?.strategy?.matrix?.part?.length ?? 0;
    if (!p || !t) { faults.push(`${parts} or ${together} is missing`); continue; }
    if (count < 2) faults.push(`${parts} is not split in parts`);
    if (Number(t.env?.PARTS) !== count) faults.push(`${together} reads ${String(t.env?.PARTS)} parts, but ${parts} runs ${count}`);
    if (t.needs !== parts) faults.push(`${together} does not wait for ${parts}`);
    const jests = (p.steps ?? []).map((s) => s.run ?? '').filter((r) => /npx jest/.test(r));
    if (!jests.length || jests.some((r) => !r.includes('--shard=${{ matrix.part }}/${{ strategy.job-total }}'))) {
      faults.push(`a jest run in ${parts} is not its part of the matrix`);
    }
  }
  const steps = jobs['native-unit-tests']?.steps ?? [];
  const covered = steps.find((s) => /--coverage\b/.test(s.run ?? ''));
  const tz = String(covered?.env?.TZ ?? '');
  if (!zones.ZONES.includes(tz)) faults.push(`the coverage run's zone (${tz || 'none'}) is not one of test-timezones.js's`);
  if (!covered?.run?.includes(`--outputFile=${zones.recordOf(tz)}`)) faults.push(`the coverage run does not write ${zones.recordOf(tz)}`);
  const others = steps.find((s) => /test-timezones\.js'\)/.test(s.run ?? '') && /TZ="\$tz" npx jest/.test(s.run ?? ''));
  if (!others?.run?.includes(`t.ZONES.filter((z) => z !== '${tz}')`)) faults.push(`no step runs every zone of test-timezones.js but the coverage run's (${tz})`);
  const read = (jobs['jest-together']?.steps ?? []).some((s) => (s.run ?? '').includes('t.ZONES.map(t.recordOf)'));
  if (!read) faults.push('jest-together does not read a record for every zone of test-timezones.js');
  return faults;
}

it('runs jest and the captures in parts, each read together by a job that reads as many parts, and jest in every zone of test-timezones.js', () => {
  const zones = require('../../../scripts/test-timezones.js') as { ZONES: string[]; recordOf: (tz: string) => string };
  expect(zones.ZONES).toEqual(expect.arrayContaining(['UTC', 'Pacific/Midway', 'Pacific/Kiritimati']));
  expect(zones.ZONES).toHaveLength(6);
  const god = workflows.find((w) => w.file === 'god_tier_ci.yml')!;
  expect(splitFaults(god.wf, zones)).toEqual([]);

  // Each rule says no to the fault it is for.
  // A Windows checkout ends its lines with \r\n.
  const text = god.text.split('\r\n').join('\n');
  const planted = (from: string, to: string) => {
    expect([from, text.split(from).length]).toEqual([from, 2]);
    return parse(text.split(from).join(to)) as Workflow;
  };
  expect(splitFaults(planted('      PARTS: 4\n', '      PARTS: 3\n'), zones)).toEqual(['jest-together reads 3 parts, but native-unit-tests runs 4']);
  expect(splitFaults(planted('        part: [1, 2, 3]\n', '        part: [1, 2]\n'), zones)).toEqual(['captures-together reads 3 parts, but captures runs 2']);
  expect(splitFaults(planted("z !== 'UTC'", "z !== 'Asia/Tokyo'"), zones)).toEqual(["no step runs every zone of test-timezones.js but the coverage run's (UTC)"]);
  expect(splitFaults(planted('          TZ: UTC\n', '          TZ: Europe/Paris\n'), zones)).toEqual([
    "the coverage run's zone (Europe/Paris) is not one of test-timezones.js's",
    'the coverage run does not write jest-Europe-Paris.json',
    "no step runs every zone of test-timezones.js but the coverage run's (Europe/Paris)",
  ]);
  expect(splitFaults(planted('npx jest --ci --maxWorkers=2 --shard=${{ matrix.part }}/${{ strategy.job-total }} \\\n            --json --outputFile=capture-run.json',
    'npx jest --ci --maxWorkers=2 \\\n            --json --outputFile=capture-run.json'), zones)).toEqual(['a jest run in captures is not its part of the matrix']);
  expect(splitFaults(planted('t.ZONES.map(t.recordOf)', "['jest-UTC.json']"), zones)).toEqual(['jest-together does not read a record for every zone of test-timezones.js']);
});

it('known-vulnerable packages: every push judges the phone, and the nightly judges the website and the functions too', () => {
  const steps = runSteps();
  const judged = steps.filter((s) => /e2e\/advisories\.mjs judge/.test(s.run));
  const pushed = judged.filter((s) => s.on.includes('push'));
  const nightly = judged.filter((s) => s.on.includes('schedule') && !s.on.includes('push'));
  expect(pushed.map((s) => s.file)).toEqual(['god_tier_ci.yml']);
  expect(nightly.map((s) => s.file)).toEqual(['nightly.yml']);
  expect(nightly.every((s) => /--website/.test(s.run) && /--functions/.test(s.run))).toBe(true);
  expect(judged.filter((s) => /--allowlist/.test(s.run)).map((s) => s.run)).toEqual([]);
  for (const s of judged) {
    expect({ file: s.file, readsTheBundle: steps.some((o) => o.file === s.file && /advisories\.mjs phone-modules/.test(o.run)) })
      .toEqual({ file: s.file, readsTheBundle: true });
  }
});

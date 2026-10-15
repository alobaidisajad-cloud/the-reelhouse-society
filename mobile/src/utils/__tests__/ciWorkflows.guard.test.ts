/**
 * The CI workflows — three rules that keep them honest.
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Every outside action runs at one exact commit. A tag (`@v5`) is a pointer
 *    its owner can move to other code, and that code runs with this repo's
 *    secrets. The version it was pinned at is written beside it.
 * 2. Every job has a time limit, and names its runner image. Without a limit a
 *    hung step holds a runner for six hours and reports nothing; `-latest`
 *    moves to a new OS on GitHub's date, not ours.
 * 3. Every workflow that runs on `main` is watched by ci-alert.yml — by its exact
 *    name, which is how workflow_run finds it. Rename a workflow and forget the
 *    alert, and its failures would go back to being silent.
 *
 * Parsed as YAML, not matched as text: the rules are about the structure.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// The Node build, by file: this project's Jest resolves packages the way a
// phone would (the `browser` condition), and yaml's browser build is ESM.
const { parse } = require(require.resolve('yaml/package.json').replace(/package\.json$/, 'dist/index.js')) as typeof import('yaml');

const DIR = join(__dirname, '..', '..', '..', '..', '.github', 'workflows');
type Step = { uses?: string };
type Job = { 'timeout-minutes'?: number; 'runs-on'?: string; steps?: Step[]; uses?: string; with?: Record<string, unknown> };
/** A call to another of this repo's workflows: its runner and limit are checked there. */
const LOCAL_CALL = /^\.\/\.github\/workflows\/[\w-]+\.ya?ml$/;
const calls = (job: Job) => typeof job.uses === 'string' && LOCAL_CALL.test(job.uses);
type Workflow = { name: string; on: Record<string, unknown> | string | string[]; jobs: Record<string, Job> };

const files = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));
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

it('the alert watches every workflow that runs on main, by its exact name', () => {
  const alert = workflows.find((w) => w.file === 'ci-alert.yml')!.wf;
  const watched = (alert.on as { workflow_run: { workflows: string[] } }).workflow_run.workflows;
  const onMain = workflows
    .filter((w) => w.file !== 'ci-alert.yml')
    .filter((w) => triggers(w.wf).some((t) => t === 'push' || t === 'schedule'))
    .map((w) => w.wf.name);
  expect(onMain.length).toBeGreaterThan(0);
  expect([...watched].sort()).toEqual([...onMain].sort());
});

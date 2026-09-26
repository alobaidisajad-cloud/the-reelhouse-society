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
type Job = { 'timeout-minutes'?: number; 'runs-on'?: string; steps?: Step[] };
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
  it('pins every outside action to a full commit, with its release noted', () => {
    const lines = text.split('\n').filter((l) => /^\s*-?\s*uses:\s/.test(l));
    for (const line of lines) {
      const ref = /uses:\s*([^@\s]+)@(\S+)(\s*#\s*(\S+))?/.exec(line);
      expect({ line: line.trim(), pinned: !!ref && /^[0-9a-f]{40}$/.test(ref[2]), noted: !!ref?.[4] })
        .toEqual({ line: line.trim(), pinned: true, noted: true });
    }
  });

  it('gives every job a time limit', () => {
    for (const [name, job] of Object.entries(wf.jobs)) {
      expect({ job: name, limit: typeof job['timeout-minutes'] === 'number' && job['timeout-minutes'] > 0 })
        .toEqual({ job: name, limit: true });
    }
  });

  it('runs every job on a named runner image, never a moving -latest', () => {
    for (const [name, job] of Object.entries(wf.jobs)) {
      const image = String(job['runs-on'] ?? '');
      expect({ job: name, named: /^[a-z]+-\d+(\.\d+)?$/.test(image) }).toEqual({ job: name, named: true });
    }
  });
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

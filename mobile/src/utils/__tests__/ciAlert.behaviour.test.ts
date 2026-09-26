/**
 * The CI alert, run — not read.
 * ─────────────────────────────────────────────────────────────────────────────
 * ci-alert.yml's script is taken out of the YAML exactly as GitHub runs it and
 * run here against a fake GitHub, through every case it promises to handle:
 * the first failure, the same failure again, a different failure, green, a
 * cancelled run, and two workflows red at once. A green main never exercises
 * the red half, so without this the red half would first run on the day it
 * was needed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const { parse } = require(require.resolve('yaml/package.json').replace(/package\.json$/, 'dist/index.js')) as typeof import('yaml');

const WF = parse(readFileSync(join(__dirname, '..', '..', '..', '..', '.github', 'workflows', 'ci-alert.yml'), 'utf8'));
const SCRIPT: string = WF.jobs.alert.steps[0].with.script;
// From a string, so Babel cannot rewrite the `async` away — github-script runs
// the script as the body of a real async function, and so must this.
const AsyncFunction = new Function('return (async () => {}).constructor')() as new (...args: string[]) => (...a: unknown[]) => Promise<void>;
const alertScript = new AsyncFunction('github', 'context', 'core', SCRIPT);

type Issue = { number: number; title: string; body: string; state: 'open' | 'closed'; labels: string[]; assignees: string[] };
type Job = { name: string; conclusion: string; html_url: string; steps?: { name: string; conclusion: string }[] };

/** A GitHub with just the calls the alert makes, keeping every write. */
const fakeGitHub = () => {
  const issues: Issue[] = [];
  const comments: { issue: number; body: string }[] = [];
  const labels = new Set<string>();
  let jobs: Job[] = [];
  const rest = {
    issues: {
      listForRepo: async (p: { state: string; labels: string }) =>
        ({ data: issues.filter((i) => i.state === p.state && i.labels.includes(p.labels)) }),
      getLabel: async (p: { name: string }) => {
        if (!labels.has(p.name)) throw Object.assign(new Error('Not Found'), { status: 404 });
        return { data: { name: p.name } };
      },
      createLabel: async (p: { name: string }) => { labels.add(p.name); return { data: {} }; },
      create: async (p: { title: string; body: string; labels: string[]; assignees: string[] }) => {
        const issue: Issue = { number: issues.length + 1, state: 'open', ...p };
        issues.push(issue);
        return { data: issue };
      },
      createComment: async (p: { issue_number: number; body: string }) => { comments.push({ issue: p.issue_number, body: p.body }); return { data: {} }; },
      update: async (p: { issue_number: number; body?: string; state?: 'closed' }) => {
        const issue = issues.find((i) => i.number === p.issue_number)!;
        if (p.body !== undefined) issue.body = p.body;
        if (p.state) issue.state = p.state;
        return { data: issue };
      },
    },
    actions: { listJobsForWorkflowRun: async () => ({ data: jobs }) },
  };
  const github = { rest, paginate: async (m: (p: unknown) => Promise<{ data: unknown[] }>, p: unknown) => (await m(p)).data };
  return { github, issues, comments, labels, setJobs: (j: Job[]) => { jobs = j; } };
};

const run = (conclusion: string, path = '.github/workflows/god_tier_ci.yml', name = 'Matrix') => ({
  id: 1, name, path, conclusion, head_sha: 'abcdef1234567', html_url: 'https://run', event: 'push',
});

const fire = async (gh: ReturnType<typeof fakeGitHub>, workflowRun: ReturnType<typeof run>) =>
  alertScript(gh.github, { repo: { owner: 'owner', repo: 'repo' }, payload: { workflow_run: workflowRun } }, { info: () => undefined });

const failing = (name: string, step = 'Run Jest'): Job =>
  ({ name, conclusion: 'failure', html_url: `https://job/${name}`, steps: [{ name: 'Checkout', conclusion: 'success' }, { name: step, conclusion: 'failure' }] });

it('a first failure opens ONE issue, labelled and assigned to the owner, naming each failed job and step', async () => {
  const gh = fakeGitHub();
  gh.setJobs([failing('Jest'), { name: 'Lint', conclusion: 'success', html_url: '' }]);
  await fire(gh, run('failure'));
  expect(gh.labels.has('ci-red')).toBe(true);
  expect(gh.issues).toHaveLength(1);
  const [issue] = gh.issues;
  expect(issue).toMatchObject({ title: 'CI is red: Matrix', state: 'open', labels: ['ci-red'], assignees: ['owner'] });
  expect(issue.body).toContain('**Jest** — failure at “Run Jest”');
  expect(issue.body).not.toContain('Lint');
  expect(issue.body).toContain('`abcdef1`');
});

it('the same failure again says nothing more', async () => {
  const gh = fakeGitHub();
  gh.setJobs([failing('Jest')]);
  await fire(gh, run('failure'));
  await fire(gh, run('failure'));
  expect(gh.issues).toHaveLength(1);
  expect(gh.comments).toHaveLength(0);
});

it('a different failure adds one comment — and a repeat of THAT says nothing', async () => {
  const gh = fakeGitHub();
  gh.setJobs([failing('Jest')]);
  await fire(gh, run('failure'));
  gh.setJobs([failing('Jest'), failing('Vitest', 'Run tests')]);
  await fire(gh, run('failure'));
  await fire(gh, run('failure'));
  expect(gh.issues).toHaveLength(1);
  expect(gh.comments).toHaveLength(1);
  expect(gh.comments[0].body).toContain('**Vitest** — failure at “Run tests”');
});

it('a timed-out job is a failure too', async () => {
  const gh = fakeGitHub();
  gh.setJobs([{ name: 'Maestro', conclusion: 'timed_out', html_url: '' }]);
  await fire(gh, run('timed_out'));
  expect(gh.issues[0].body).toContain('**Maestro** — timed_out');
});

it('green comments once and closes the alert; green with no alert does nothing', async () => {
  const gh = fakeGitHub();
  gh.setJobs([failing('Jest')]);
  await fire(gh, run('failure'));
  await fire(gh, run('success'));
  expect(gh.issues[0].state).toBe('closed');
  expect(gh.comments.map((c) => c.body)).toEqual([expect.stringContaining('Green again at `abcdef1`')]);
  await fire(gh, run('success'));
  expect(gh.comments).toHaveLength(1);
  expect(gh.issues).toHaveLength(1);
});

it('a cancelled or skipped run says nothing', async () => {
  const gh = fakeGitHub();
  await fire(gh, run('cancelled'));
  await fire(gh, run('skipped'));
  expect(gh.issues).toHaveLength(0);
  expect(gh.labels.size).toBe(0);
});

it('two workflows red at once are two alerts, and each closes on its own', async () => {
  const gh = fakeGitHub();
  gh.setJobs([failing('Jest')]);
  await fire(gh, run('failure', '.github/workflows/god_tier_ci.yml', 'Matrix'));
  gh.setJobs([failing('db-security', 'Run database security integration tests')]);
  await fire(gh, run('failure', '.github/workflows/db-integration.yml', 'DB'));
  expect(gh.issues.map((i) => i.title)).toEqual(['CI is red: Matrix', 'CI is red: DB']);
  await fire(gh, run('success', '.github/workflows/db-integration.yml', 'DB'));
  expect(gh.issues.map((i) => i.state)).toEqual(['open', 'closed']);
});

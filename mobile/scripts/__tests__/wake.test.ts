/**
 * wake.test.ts — the wake task starts a scheduled run GitHub skipped, once, and only for a time of
 * that schedule's own (scripts/wake.mjs).
 *
 * The script is ES modules, so each case runs it in a node of its own, as the computer's task and the
 * heartbeat jobs run it; GitHub is a fake handed in, so nothing here reaches the network.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const SCRIPT = join(__dirname, '..', 'wake.mjs');
const RULES = JSON.parse(readFileSync(join(__dirname, '..', '..', 'register', 'alert-rules.json'), 'utf8')) as {
  heartbeats: { workflow: string; cron: string }[];
};

/** `body` run in a module with the script as `w`; what it returns, as JSON. */
function inWake(body: string): unknown {
  const code = `import * as w from ${JSON.stringify(pathToFileURL(SCRIPT).href)};\n` +
    `const out = await (async () => { ${body} })();\nconsole.log(JSON.stringify(out));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  expect(r.stderr).toBe('');
  return JSON.parse(r.stdout);
}

const at = (iso: string) => Date.parse(iso);

describe('the schedule\'s times', () => {
  it('reads every schedule the rules name, and refuses a shape it would have to guess at', () => {
    expect(inWake(`return ${JSON.stringify(RULES.heartbeats.map((h) => h.cron))}.map((c) => w.parseCron(c) && 'read');`))
      .toEqual(RULES.heartbeats.map(() => 'read'));
    expect(inWake(`return ['*/5 * * * *', '17 3 1 * *', '17 3 * * 1-5', '60 3 * * *', '17 24 * * *'].map((c) => { try { w.parseCron(c); return 'read'; } catch { return 'refused'; } });`))
      .toEqual(['refused', 'refused', 'refused', 'refused', 'refused']);
  });

  it('carries the latest time two hours old, a day\'s or a week\'s, and none older than 26 hours', () => {
    const due = (cron: string, now: string) => inWake(`const s = w.dueSlot(${JSON.stringify(cron)}, ${at(now)}); return s === null ? null : w.slotName(s);`);
    expect(due('17 3 * * *', '2026-11-21T06:00:00Z')).toBe('2026-11-21T03:17Z');
    // Under two hours after tonight's time, the last carried time is yesterday's, which a run then answered.
    expect(due('17 3 * * *', '2026-11-21T05:00:00Z')).toBe('2026-11-20T03:17Z');
    // Monday's run, carried on Tuesday morning; by Tuesday's noon it is past carrying.
    expect(due('47 7 * * 1', '2026-11-24T08:00:00Z')).toBe('2026-11-23T07:47Z');
    expect(due('47 7 * * 1', '2026-11-24T12:00:00Z')).toBeNull();
  });

  it('names a time one way, and reads back only that way', () => {
    expect(inWake(`return [w.slotName(${at('2026-11-21T03:17:00Z')}), w.parseSlot('2026-11-21T03:17Z') === ${at('2026-11-21T03:17:00Z')},
      w.parseSlot('2026-11-21T03:17:00Z'), w.parseSlot('2026-11-31T03:17Z'), w.parseSlot('tonight'), w.wakeTitle(${at('2026-11-21T03:17:00Z')})];`))
      .toEqual(['2026-11-21T03:17Z', true, null, null, null, 'Carried by the wake task: 2026-11-21T03:17Z']);
  });
});

describe('which run is a time\'s run', () => {
  const slot = at('2026-11-21T03:17:00Z');
  const carries = (run: object) => inWake(`return w.carries(${JSON.stringify(run)}, ${slot});`);

  it('the schedule\'s own, however late GitHub started it; never the night before\'s', () => {
    expect(carries({ event: 'schedule', created_at: '2026-11-21T11:02:41Z', display_title: 'x' })).toBe(true);
    expect(carries({ event: 'schedule', created_at: '2026-11-20T11:02:41Z', display_title: 'x' })).toBe(false);
  });

  it('one the wake task started for it, by its name; never one started by hand', () => {
    expect(carries({ event: 'workflow_dispatch', created_at: '2026-11-21T05:45:00Z', display_title: 'Carried by the wake task: 2026-11-21T03:17Z' })).toBe(true);
    expect(carries({ event: 'workflow_dispatch', created_at: '2026-11-21T05:45:00Z', display_title: 'Carried by the wake task: 2026-11-20T03:17Z' })).toBe(false);
    expect(carries({ event: 'workflow_dispatch', created_at: '2026-11-21T05:45:00Z', display_title: '🌙 Nightly' })).toBe(false);
    expect(carries({ event: 'push', created_at: '2026-11-21T05:45:00Z', display_title: 'fix: something' })).toBe(false);
  });
});

describe('one pass of the task', () => {
  /** A pass over one schedule at 06:00, GitHub answering with these runs and this state. */
  const pass = (runs: object[], state = 'active', dryRun = false) => inWake(`
    const started = [];
    const api = { state: async () => ${JSON.stringify(state)}, runs: async () => ${JSON.stringify(runs)},
      dispatch: async (wf, inputs) => { started.push([wf, inputs]); } };
    const results = await w.wake({ rules: { heartbeats: [{ workflow: 'nightly.yml', cron: '17 3 * * *' }] }, now: ${at('2026-11-21T06:00:00Z')}, api, dryRun: ${dryRun} });
    return { results, started, faults: w.faultsOf(results) };`);

  it('starts the run GitHub skipped, once, with its time', () => {
    expect(pass([])).toEqual({
      results: [{ workflow: 'nightly.yml', slot: '2026-11-21T03:17Z', action: 'started', state: 'active' }],
      started: [['nightly.yml', { wake_night: '2026-11-21T03:17Z' }]],
      faults: [],
    });
  });

  it('starts nothing where the schedule ran, late or not, or where it already carried the time', () => {
    for (const run of [
      { event: 'schedule', created_at: '2026-11-21T05:12:00Z', display_title: '🌙 Nightly' },
      { event: 'workflow_dispatch', created_at: '2026-11-21T05:45:00Z', display_title: 'Carried by the wake task: 2026-11-21T03:17Z' },
    ]) {
      expect(pass([run])).toMatchObject({ results: [{ action: 'ran' }], started: [] });
    }
    // A run started by hand is no night's run: the time is still carried.
    expect(pass([{ event: 'workflow_dispatch', created_at: '2026-11-21T04:00:00Z', display_title: '🌙 Nightly' }])).toMatchObject({ started: [['nightly.yml', { wake_night: '2026-11-21T03:17Z' }]] });
  });

  it('says what it would start, and starts nothing, on a dry run', () => {
    expect(pass([], 'active', true)).toMatchObject({ results: [{ action: 'would start' }], started: [] });
  });

  it('names a workflow GitHub turned off as a fault, and starts nothing on it', () => {
    expect(pass([], 'disabled_inactivity')).toEqual({
      results: [{ workflow: 'nightly.yml', slot: '2026-11-21T03:17Z', action: 'not started: the workflow is turned off', state: 'disabled_inactivity' }],
      started: [],
      faults: ['nightly.yml is disabled_inactivity: its schedule no longer runs'],
    });
  });
});

describe('a carried run\'s time, checked by its heartbeat job', () => {
  const rules = { heartbeats: [{ workflow: 'nightly.yml', cron: '17 3 * * *' }, { workflow: 'load.yml', cron: '47 7 * * 1' }] };
  const verify = (wf: string, text: string, now: string) => inWake(`return w.verify(${JSON.stringify(rules)}, ${JSON.stringify(wf)}, ${JSON.stringify(text)}, ${at(now)});`);

  it('takes one of the schedule\'s own times, come and under 26 hours old', () => {
    expect(verify('nightly.yml', '2026-11-21T03:17Z', '2026-11-21T06:00:00Z')).toBeNull();
    expect(verify('load.yml', '2026-11-23T07:47Z', '2026-11-23T10:00:00Z')).toBeNull();
  });

  it('refuses any other', () => {
    const refusals = [
      verify('nightly.yml', '2026-11-21T03:18Z', '2026-11-21T06:00:00Z'),
      verify('load.yml', '2026-11-24T07:47Z', '2026-11-24T10:00:00Z'),
      verify('nightly.yml', '2026-11-22T03:17Z', '2026-11-21T06:00:00Z'),
      verify('nightly.yml', '2026-11-19T03:17Z', '2026-11-21T06:00:00Z'),
      verify('nightly.yml', 'last night', '2026-11-21T06:00:00Z'),
      verify('god_tier_ci.yml', '2026-11-21T06:23Z', '2026-11-21T09:00:00Z'),
    ];
    expect(refusals.map((r) => typeof r === 'string' && r.length > 0)).toEqual([true, true, true, true, true, true]);
  });

  it('as the job runs it: exit 0 for a true time, an error annotation and exit 1 for another', () => {
    const now = Date.now();
    const slot = inWake(`return w.slotName(w.dueSlot('17 3 * * *', ${now}, 0));`) as string;
    const ok = spawnSync(process.execPath, [SCRIPT, '--verify', 'nightly.yml', slot], { encoding: 'utf8' });
    expect([ok.status, ok.stdout]).toEqual([0, expect.stringContaining(`nightly.yml: the run the wake task started for ${slot}`)]);
    const bad = spawnSync(process.execPath, [SCRIPT, '--verify', 'nightly.yml', '2020-01-01T03:17Z'], { encoding: 'utf8' });
    expect([bad.status, bad.stdout]).toEqual([1, expect.stringMatching(/^::error title=Not a night the wake task carried::2020-01-01T03:17Z is older than 26 hours/)]);
  });
});

describe('GitHub, as the task asks it', () => {
  it('starts a run on main with the time as its input, and reads runs from a whole second', () => {
    const asked = inWake(`
      const calls = [];
      const fetchImpl = async (url, init) => { calls.push({ url, method: init.method, body: init.body ?? null, auth: init.headers.Authorization });
        return { ok: true, status: url.endsWith('/dispatches') ? 204 : 200, json: async () => ({ workflow_runs: [], state: 'active' }) }; };
      const api = w.githubApi({ repo: 'owner/repo', token: 'TOKEN', fetchImpl });
      await api.dispatch('nightly.yml', { wake_night: '2026-11-21T03:17Z' });
      await api.runs('nightly.yml', ${at('2026-11-21T03:16:00.500Z')});
      return calls;`);
    expect(asked).toEqual([
      { url: 'https://api.github.com/repos/owner/repo/actions/workflows/nightly.yml/dispatches', method: 'POST', body: '{"ref":"main","inputs":{"wake_night":"2026-11-21T03:17Z"}}', auth: 'Bearer TOKEN' },
      { url: 'https://api.github.com/repos/owner/repo/actions/workflows/nightly.yml/runs?per_page=100&created=%3E%3D2026-11-21T03%3A16%3A00Z', method: 'GET', body: null, auth: 'Bearer TOKEN' },
    ]);
  });

  it('says a refusal by its status alone, never the token', () => {
    const said = inWake(`
      const api = w.githubApi({ repo: 'owner/repo', token: 'TOKEN-VALUE', fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
      try { await api.state('nightly.yml'); return 'no refusal'; } catch (e) { return e.message; }`);
    expect(said).toBe('GitHub answered 401 to GET /actions/workflows/nightly.yml');
  });

  it('knows the repository by origin\'s address, either form', () => {
    expect(inWake(`return [w.repoOf('https://github.com/owner/the-repo.git\\n'), w.repoOf('git@github.com:owner/the-repo.git')];`))
      .toEqual(['owner/the-repo', 'owner/the-repo']);
  });
});

describe('the computer\'s task, run', () => {
  let dir = '';
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'wake-private-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('starts nothing without its token, and says where it looked', () => {
    writeFileSync(join(dir, 'production.env'), 'SOMETHING_ELSE=1\n');
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: { ...process.env, REELHOUSE_PRIVATE: dir } });
    expect([r.status, r.stderr]).toEqual([1, expect.stringContaining('No GITHUB_WAKE_TOKEN in')]);
  });

  it('refuses an argument it does not know, before anything runs', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--now'], { encoding: 'utf8', env: { ...process.env, REELHOUSE_PRIVATE: dir } });
    expect(r.status).toBe(2);
  });
});

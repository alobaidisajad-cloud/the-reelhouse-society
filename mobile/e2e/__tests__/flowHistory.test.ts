/**
 * flowHistory.test.ts — the shard map and each shard's minutes are what the
 * measured runs make of them.
 *
 * The map was once balanced by one run's times (about 8 minutes a shard);
 * Sealed E2E 38837073968 then ran shard 2's flows past its 20 minutes on a
 * slow runner, while shard 3 never took 12. e2e/flow-history.mjs keeps each
 * part's seconds from every run, and the committed e2e/shards.json must be
 * what shardsFrom makes of e2e/flow-history.json, its minutes inside the
 * workflow's own limits. The reading of a shard's logs is shown on a new run's
 * shape and an old one's.
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

const { parse } = require(require.resolve('yaml/package.json').replace(/package\.json$/, 'dist/index.js')) as typeof import('yaml');

const E2E = join(__dirname, '..');
const SCRIPT = join(E2E, 'flow-history.mjs');
const FIXTURES = join(__dirname, 'fixtures', 'flow-history');

type Part = { part: string; seconds: number };
type Shard = { flows: string[]; keyboardProbes?: boolean; launchWithAnimations?: boolean; minutes: number };

/** The module's answers to one program, as node runs it. */
function answer<T>(body: string): T {
  const code = `const h = await import(${JSON.stringify(pathToFileURL(SCRIPT).href)});
    const fs = await import('node:fs');
    console.log(JSON.stringify(await (async () => { ${body} })()));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout) as T;
}

describe("a shard's logs, read", () => {
  it('times each part from its start to the next, the launch from the flows\' beginning, retries summed, a part the budget stopped left out', () => {
    const parts = answer<Part[]>(`return h.partsOf(${JSON.stringify(join(FIXTURES, 'new'))}, false);`);
    expect(parts).toEqual([
      { part: 'launch', seconds: 65 },
      { part: 'stack probe', seconds: 235 },
      { part: 'alpha', seconds: 181 },
      { part: 'beta', seconds: 60 },
    ]);
  });

  it("an older run's: its launch from Android stopping the app for it; its last part ends at the device log's last line when its job passed, and is not measured when it failed", () => {
    const passed = answer<Part[]>(`return h.partsOf(${JSON.stringify(join(FIXTURES, 'old'))}, true);`);
    const failed = answer<Part[]>(`return h.partsOf(${JSON.stringify(join(FIXTURES, 'old'))}, false);`);
    expect(passed).toEqual([{ part: 'launch', seconds: 30 }, { part: 'a', seconds: 40 }, { part: 'b', seconds: 120 }]);
    expect(failed).toEqual([{ part: 'launch', seconds: 30 }, { part: 'a', seconds: 40 }]);
  });

  it('gives no launch to a shard whose plan ran none, whatever its log says of the app stopping', () => {
    const parts = answer<Part[]>(`return h.partsOf(${JSON.stringify(join(FIXTURES, 'old-other-shard'))}, true);`);
    expect(parts.map((p) => p.part)).toEqual(['a', 'b']);
  });
});

describe('the map a history makes', () => {
  const history = { samples: [
    ...[100, 110, 120, 130, 140, 150, 160, 170, 180, 400].map((s) => ({ run: s, shard: 2, part: 'heavy', seconds: s })),
    { run: 1, shard: 1, part: 'launch', seconds: 60 },
    { run: 1, shard: 1, part: 'stack probe', seconds: 120 },
    { run: 1, shard: 1, part: 'log probe', seconds: 120 },
    { run: 1, shard: 3, part: 'light', seconds: 30 },
    { run: 1, shard: 3, part: 'middle', seconds: 90 },
  ] };

  it("weighs each part by its 90th percentile, nearest rank: not one run's best, nor its single worst", () => {
    const w = answer<Record<string, number>>(`return h.weightsFrom(${JSON.stringify(history)});`);
    expect(w.heavy).toBe(180);
  });

  it('keeps the launch and the probes on shard 1, gives each flow, heaviest first, to the lightest shard, and each shard its weight and a quarter in minutes', () => {
    const shards = answer<Shard[]>(`return h.shardsFrom(${JSON.stringify(history)}, ['heavy', 'light', 'middle', 'unmeasured'], 3);`);
    // Shard 1 starts at 300 s (launch and probes); unmeasured (420) goes to 2, heavy (180) to 3,
    // then middle (90) and light (30) to 3, still the lightest.
    expect(shards).toEqual([
      { keyboardProbes: true, launchWithAnimations: true, flows: [], minutes: 7 },
      { flows: ['unmeasured'], minutes: 9 },
      { flows: ['heavy', 'light', 'middle'], minutes: 7 },
    ]);
  });
});

describe('the committed map', () => {
  it('is what the committed history makes of the flows the runner runs', () => {
    const made = answer<Shard[]>(`
      const history = JSON.parse(fs.readFileSync(${JSON.stringify(join(E2E, 'flow-history.json'))}, 'utf8'));
      return h.shardsFrom(history, h.flowNames(), 3);`);
    const committed = JSON.parse(readFileSync(join(E2E, 'shards.json'), 'utf8')).shards as Shard[];
    expect(committed).toEqual(made);
  });

  it("measures every flow it places, and keeps no run's samples twice", () => {
    const { unmeasured, twice } = answer<{ unmeasured: string[]; twice: string[] }>(`
      const history = JSON.parse(fs.readFileSync(${JSON.stringify(join(E2E, 'flow-history.json'))}, 'utf8'));
      const w = h.weightsFrom(history);
      const seen = new Set(); const twice = [];
      for (const s of history.samples) { const k = s.run + '/' + s.shard + '/' + s.part; if (seen.has(k)) twice.push(k); seen.add(k); }
      return { unmeasured: [...h.flowNames(), ...h.FIRST_SHARD_PARTS].filter((p) => !(p in w)), twice };`);
    expect({ unmeasured, twice }).toEqual({ unmeasured: [], twice: [] });
  });

  it("fits inside the workflow: the flows step outlasts the longest shard's minutes and what follows the flows, the job outlasts the step and the emulator's start", () => {
    const committed = JSON.parse(readFileSync(join(E2E, 'shards.json'), 'utf8')).shards as Shard[];
    const longest = Math.max(...committed.map((s) => s.minutes));
    const wf = parse(readFileSync(join(E2E, '..', '..', '.github', 'workflows', 'e2e.yml'), 'utf8')) as {
      jobs: { flows: { 'timeout-minutes': number; steps: { env?: Record<string, string>; 'timeout-minutes'?: number }[] } };
    };
    const step = wf.jobs.flows.steps.find((s) => s.env?.E2E_SHARD);
    // After the flows: the crash gate, the device's records and the verdicts, about four minutes on a slow runner.
    expect(step?.['timeout-minutes']).toBeGreaterThanOrEqual(longest + 6);
    // Before them: the app downloaded, the emulator's image restored and booted, about ten.
    expect(wf.jobs.flows['timeout-minutes']).toBeGreaterThanOrEqual((step?.['timeout-minutes'] ?? 0) + 12);
    // The map's minutes are the shard's budget: no workflow value stands over them.
    expect(step?.env?.E2E_FLOWS_MINUTES).toBeUndefined();
  });
});

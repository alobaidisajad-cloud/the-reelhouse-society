/**
 * shards.test.ts — every flow runs on exactly one of e2e.yml's machines.
 *
 * e2e/shards.json is held to the flows in mobile/.maestro, and to e2e.yml's own
 * count of shards; shards.mjs is run as run-flows.sh runs it, and shown saying
 * no to each way a map goes wrong.
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { basename, join } from 'path';
import { pathToFileURL } from 'url';
import { files as universe } from '../../test-utils/universe';

// yaml's Node build, by file: this Jest resolves packages as a phone does.
const { parse } = require(require.resolve('yaml/package.json').replace(/package\.json$/, 'dist/index.js')) as typeof import('yaml');

const E2E = join(__dirname, '..');
const SCRIPT = join(E2E, 'shards.mjs');
const MAP_FILE = join(E2E, 'shards.json');

type Shard = { flows: string[]; keyboardProbes?: boolean; launchWithAnimations?: boolean };
type ShardMap = { shards: Shard[] };
type Plan = { index: number; total: number; flows: string[]; probes: boolean; launch: boolean; notices: string[] };
interface Shards {
  mapProblems: (map: unknown) => string[];
  coverageProblems: (map: ShardMap, flows: string[]) => string[];
  planShard: (map: unknown, spec: string, files: string[]) => Plan | Error;
}

/** The module's functions, as node loads it. */
function ask<T>(fn: keyof Shards, ...args: unknown[]): T {
  const code = `import * as s from ${JSON.stringify(pathToFileURL(SCRIPT).href)};
    const r = s[${JSON.stringify(fn)}](...${JSON.stringify(args)});
    console.log(JSON.stringify(r instanceof Error ? { error: r.message } : r));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  expect(r.stderr).toBe('');
  return JSON.parse(r.stdout) as T;
}

const map = JSON.parse(readFileSync(MAP_FILE, 'utf8')) as ShardMap;
const flows = universe('runFlows').map((f) => basename(f).replace(/\.yaml$/, ''));

describe('the committed map', () => {
  it('puts every flow in mobile/.maestro in exactly one shard, and names no other', () => {
    expect(flows.length).toBeGreaterThan(10);
    expect(ask('mapProblems', map)).toEqual([]);
    expect(ask('coverageProblems', map, flows)).toEqual([]);
  });

  it('gives the keyboard probes and the launch with animations on to the first shard', () => {
    expect(map.shards.map((s) => [s.keyboardProbes === true, s.launchWithAnimations === true]))
      .toEqual([[true, true], [false, false], [false, false]]);
  });

  it('has as many shards as e2e.yml runs, and e2e.yml tells each machine and the verdict that count', () => {
    const text = readFileSync(join(E2E, '..', '..', '.github', 'workflows', 'e2e.yml'), 'utf8');
    const wf = parse(text) as { jobs: Record<string, {
      strategy?: { matrix?: { shard?: number[] } }; steps?: { env?: Record<string, string>; run?: string }[];
    }> };
    const n = map.shards.length;
    expect(wf.jobs.flows.strategy?.matrix?.shard).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    const flowsStep = wf.jobs.flows.steps!.find((s) => s.env?.E2E_SHARD);
    expect(flowsStep?.env?.E2E_SHARD).toBe(`\${{ matrix.shard }}/${n}`);
    expect(wf.jobs.verdict.steps!.some((s) => s.run?.includes(`shard-verdict.mjs "$RUNNER_TEMP/shards" --shards ${n} `))).toBe(true);
  });
});

describe('a map that is wrong says so', () => {
  const two = { shards: [{ flows: ['a', 'b'], keyboardProbes: true, launchWithAnimations: true }, { flows: ['c'] }] };

  it('a flow in no shard', () => {
    expect(ask('coverageProblems', two, ['a', 'b', 'c', 'd'])).toEqual(['d is in no shard']);
  });

  it('a flow in two shards', () => {
    const twice = { shards: [two.shards[0], { flows: ['c', 'a'] }] };
    expect(ask('mapProblems', twice)).toEqual(['a is named 2 times (shards 1, 2)']);
  });

  it('a name that is no flow', () => {
    expect(ask('coverageProblems', two, ['a', 'b'])).toEqual(['c is named but is no flow']);
  });

  it('the probes or the launch in no shard, or in two', () => {
    const none = { shards: [{ flows: ['a'] }, { flows: ['b'], launchWithAnimations: true }] };
    expect(ask('mapProblems', none)).toEqual(['keyboardProbes must be in exactly one shard, and is in none']);
    const both = { shards: [two.shards[0], { flows: ['c'], launchWithAnimations: true }] };
    expect(ask('mapProblems', both)).toEqual(['launchWithAnimations must be in exactly one shard, and is in 1, 2']);
  });

  it('and a run refuses it, as it refuses a shard the map does not have', () => {
    const twice = { shards: [two.shards[0], { flows: ['a'] }] };
    expect(ask('planShard', twice, '1/2', [])).toEqual({ error: 'the shard map is wrong: a is named 2 times (shards 1, 2)' });
    expect(ask('planShard', two, '3/2', [])).toEqual({ error: 'E2E_SHARD is 3/2: no such shard' });
    expect(ask('planShard', two, '1/3', [])).toEqual({ error: 'E2E_SHARD is 1/3, but the map has 2 shards' });
    expect(ask('planShard', two, 'two', [])).toEqual({ error: 'E2E_SHARD is "two": it must be "i/N"' });
  });
});

describe('a shard\'s plan', () => {
  const two = { shards: [{ flows: ['c', 'a'], keyboardProbes: true, launchWithAnimations: true }, { flows: ['b'] }] };
  const files = ['f/a.yaml', 'f/b.yaml', 'f/c.yaml', 'f/new.yaml'];

  it('is its own flows in the order given, with the probes and the launch where the map puts them', () => {
    expect(ask('planShard', two, '1/2', files)).toEqual({ index: 1, total: 2, flows: ['f/a.yaml', 'f/c.yaml'], probes: true, launch: true, notices: [] });
  });

  it('runs a flow the map does not name in the last shard, and says so', () => {
    expect(ask('planShard', two, '2/2', files)).toEqual({
      index: 2, total: 2, flows: ['f/b.yaml', 'f/new.yaml'], probes: false, launch: false,
      notices: ['new is in no shard of the map, so it runs here, in the last'],
    });
  });

  it('says so of a flow it names that this tree does not have', () => {
    const plan = ask<Plan>('planShard', two, '1/2', ['f/a.yaml']);
    expect([plan.flows, plan.notices]).toEqual([['f/a.yaml'], ['c is named for this shard but is not among the flows, so it is not run']]);
  });

  it('is printed for run-flows.sh: probes, launch, notices, then each flow', () => {
    const r = spawnSync(process.execPath, [SCRIPT, MAP_FILE, '2/3', ...flows.map((f) => `mobile/.maestro/${f}.yaml`).sort()], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(['probes no', 'launch no', ...map.shards[1].flows.slice().sort().map((f) => `flow mobile/.maestro/${f}.yaml`)].join('\n') + '\n');
    const bad = spawnSync(process.execPath, [SCRIPT, MAP_FILE, '4/3'], { encoding: 'utf8' });
    expect([bad.status, bad.stdout]).toEqual([1, 'E2E_SHARD is 4/3: no such shard\n']);
  });
});

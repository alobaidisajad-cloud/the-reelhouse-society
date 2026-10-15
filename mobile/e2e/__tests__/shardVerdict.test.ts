/**
 * shardVerdict.test.ts — what no one shard can judge, judged from all their
 * kept logs, and shown saying no to each way a sharded run falls short.
 *
 * shard-verdict.mjs is run as e2e.yml's verdict runs it: on a folder of the
 * shards' downloaded logs, one folder per shard, in the shape run-flows.sh and
 * screen-times.mjs write them.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'shard-verdict.mjs');
const NAME = 'e2e-logs-{i} - TestFlight build 41';
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shard-verdict-'));
  mkdirSync(join(dir, 'flows'));
  for (const f of ['a_flow', 'b_flow', 'c_flow', 'config']) writeFileSync(join(dir, 'flows', `${f}.yaml`), 'appId: x\n');
  writeFileSync(join(dir, 'ceilings.json'), JSON.stringify({ lobby: 5000, film: 3000, welcome: 900 }));
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

type Kept = { flows?: string[]; record?: { complete: boolean; reported: string[] } | string };
/** One shard's kept logs; undefined keeps none at all. */
function shard(i: number, kept: Kept | undefined) {
  if (!kept) return;
  const folder = join(dir, 'logs', NAME.replace('{i}', String(i)));
  mkdirSync(folder, { recursive: true });
  if (kept.flows) writeFileSync(join(folder, 'flows-run.txt'), kept.flows.map((f) => `${f}\n`).join(''));
  if (kept.record) writeFileSync(join(folder, 'screen-record.json'), typeof kept.record === 'string' ? kept.record : JSON.stringify(kept.record));
}
function verdict(...kept: (Kept | undefined)[]) {
  kept.forEach((k, i) => shard(i + 1, k));
  mkdirSync(join(dir, 'logs'), { recursive: true });
  const r = spawnSync(process.execPath, [SCRIPT, join(dir, 'logs'), '--shards', String(kept.length), '--name', NAME,
    '--ceilings', join(dir, 'ceilings.json'), '--flows', join(dir, 'flows')], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, problems: r.stdout.split('\n').filter((l) => l.startsWith('✗ ')) };
}
const whole = (reported: string[]) => ({ complete: true, reported });

it('passes three whole shards that ran every flow once and between them reported every ceiling', () => {
  const r = verdict(
    { flows: ['a_flow'], record: whole(['welcome']) },
    { flows: ['b_flow'], record: whole(['film', 'lobby']) },
    { flows: ['c_flow'], record: whole(['lobby']) },
  );
  expect({ code: r.code, problems: r.problems }).toEqual({ code: 0, problems: [] });
  expect(r.out).toContain('shard 2/3: 1 flow, 2 screens reported, every flow ran to its end');
});

it('says no to a ceiling no shard reported, naming it', () => {
  const r = verdict({ flows: ['a_flow', 'b_flow'], record: whole(['welcome']) }, { flows: ['c_flow'], record: whole(['lobby']) });
  expect(r.code).toBe(1);
  expect(r.problems).toEqual(['✗ film has a ceiling but no shard reported it: renamed, or no flow reaches it']);
});

it('leaves that rule to a whole run: a shard cut short fails its own job, and it is said here', () => {
  const r = verdict({ flows: ['a_flow', 'b_flow'], record: whole(['welcome']) }, { flows: ['c_flow'], record: { complete: false, reported: [] } });
  expect({ code: r.code, problems: r.problems }).toEqual({ code: 0, problems: [] });
  expect(r.out).toContain('shard 2/2: 1 flow, 0 screens reported, cut short');
  expect(r.out).toContain('(a ceiling no shard reported is not judged: a shard did not run every flow to its end)');
});

it('says no to a missing shard, by its number', () => {
  const r = verdict({ flows: ['a_flow', 'b_flow'], record: whole(['welcome', 'film', 'lobby']) }, undefined, { flows: ['c_flow'], record: whole([]) });
  expect(r.code).toBe(1);
  expect(r.problems).toEqual(['✗ shard 2/3 kept no logs: it never ran, or ended before they were kept']);
});

it('says no to a shard that kept logs but never reached its end', () => {
  const r = verdict({ flows: ['a_flow', 'b_flow', 'c_flow'], record: whole(['welcome', 'film', 'lobby']) }, { flows: [] }, {}, { flows: [], record: '{"broken' });
  expect(r.code).toBe(1);
  expect(r.problems).toEqual([
    '✗ shard 2/4 did not finish: it wrote no record of its screens',
    '✗ shard 3/4 did not finish: it wrote no list of the flows it ran',
    '✗ shard 3/4 did not finish: it wrote no record of its screens',
    '✗ shard 4/4 did not finish: it wrote no record of its screens',
  ]);
});

it('says no to a flow no shard ran, one two shards ran, and one not among the flows', () => {
  const r = verdict({ flows: ['a_flow', 'z_flow'], record: whole(['welcome', 'film', 'lobby']) }, { flows: ['a_flow'], record: whole([]) });
  expect(r.code).toBe(1);
  expect(r.problems).toEqual([
    '✗ a_flow ran in shards 1, 2: a flow runs in one',
    '✗ b_flow ran in no shard',
    '✗ c_flow ran in no shard',
    '✗ z_flow ran in shard 1 but is not among the flows: the shards ran another tree',
  ]);
});

it('refuses to judge without what it needs', () => {
  const r = spawnSync(process.execPath, [SCRIPT, dir, '--shards', '3', '--name', 'no-placeholder'], { encoding: 'utf8' });
  expect(r.status).toBe(2);
});

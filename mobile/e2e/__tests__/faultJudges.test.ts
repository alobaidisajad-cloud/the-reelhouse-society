/**
 * faultJudges.test.ts — the fault runs' judges (e2e/fault-judges.mjs) say NO: to a failure drawn
 * as an empty room, to a fault flow where nothing failed (its fault never set), to a slow answer
 * said as a failure, to a wait past its limit or never ended; and the script is run as the
 * workflow runs it, on log lines in logcat's threadtime shape, as e2eTrace writes them.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const SCRIPT = join(__dirname, '..', 'fault-judges.mjs');
type Times = { name: string; attempt: number; since: number }[];
/** One of the script's own values, asked in a Node of its own (jest cannot load an ES module here). */
const ask = (expression: string): unknown => {
  const code = `const m = await import(${JSON.stringify(pathToFileURL(SCRIPT).href)}); console.log(JSON.stringify(${expression}));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
};
const judges = {
  judge: (log: string, t: Times) => ask(`m.judge(${JSON.stringify(log)}, ${JSON.stringify(t)})`) as { faults: string[]; unread: string[] },
};

/** A device log line at a second of 18:01, as the app writes it. */
const at = (s: number, event: string, detail: Record<string, unknown>) =>
  `10-16 18:${String(1 + Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.000  4321  4377 W ReactNativeJS: [e2e] ${event} ${JSON.stringify(detail)}`;
/** Each flow's start, as run-flows.sh writes the flow-times file: name, attempt, the device's clock. */
const stampOf = (s: number) => `10-16 18:${String(1 + Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.000`;
const timesLines = (starts: [string, number][]) => starts.map(([n, s]) => `${n}\t1\t${stampOf(s)}`).join('\n');
const times = (starts: [string, number][]): Times => {
  const toSeconds = (s: number) => ((((10 * 31 + 16) * 24 + 18) * 60 + 1 + Math.floor(s / 60)) * 60) + (s % 60);
  return starts.map(([name, s]) => ({ name, attempt: 1, since: toSeconds(s) }));
};

/** A run in which both fault flows hold. */
const GOOD = [
  at(1, 'screen.reading', { name: 'dispatch' }),
  at(4, 'screen.failed', { name: 'dispatch', ms: 3000 }),
  at(5, 'state.failed', { what: 'The paper could not be reached.' }),
  at(31, 'screen.reading', { name: 'film' }),
  at(39, 'screen.ready', { name: 'film', ms: 8000 }),
];
const STARTS: [string, number][] = [['house_unreachable', 0], ['slow_link', 30]];

it('names the two fault flows, each with what its fault does, and a limit of about twenty seconds', () => {
  expect(ask('[m.FAULT_FLOWS, m.SPINNER_LIMIT_S]')).toEqual([{ house_unreachable: 'fails', slow_link: 'slow' }, 20]);
});

it('judges every flow in .maestro/faults, which the fault runs\' one machine runs, and no other', () => {
  const folder = readdirSync(join(__dirname, '..', '..', '.maestro', 'faults')).filter((f) => f.endsWith('.yaml')).map((f) => f.replace(/\.yaml$/, '')).sort();
  const map = JSON.parse(readFileSync(join(__dirname, '..', 'fault-shards.json'), 'utf8')) as { shards: { flows: string[] }[] };
  expect(map.shards.flatMap((s) => s.flows).sort()).toEqual(folder);
  expect(Object.keys(ask('m.FAULT_FLOWS') as Record<string, string>).sort()).toEqual(folder);
});

it('passes a run in which a failure is said as one and the slow link loads', () => {
  expect(judges.judge(GOOD.join('\n'), times(STARTS))).toEqual({ faults: [], unread: [] });
});

it('refuses a failure drawn as an empty room', () => {
  const log = [...GOOD, at(6, 'state.empty', { what: 'The Archive is Empty' })].join('\n');
  expect(judges.judge(log, times(STARTS)).faults).toEqual(['house_unreachable: a failure drawn as an empty room ("The Archive is Empty")']);
});

it('refuses a flow where nothing failed: its fault was never set', () => {
  const log = GOOD.filter((l) => !/failed/.test(l)).join('\n');
  expect(judges.judge(log, times(STARTS)).faults).toEqual([
    'house_unreachable: no failure was said, so the fault was never set and the flow proves nothing',
    'house_unreachable: dispatch was still waiting when the flow ended, 29 s after it began',
  ]);
});

it('refuses a slow answer said as a failure, and a slow link where nothing loaded', () => {
  const log = [...GOOD.slice(0, 4), at(39, 'screen.failed', { name: 'film', ms: 8000 })].join('\n');
  expect(judges.judge(log, times(STARTS)).faults).toEqual([
    'slow_link: a slow answer said as a failure ("film")',
    'slow_link: no screen was ready on the slow link',
  ]);
});

it('refuses a wait past the limit, and one still waiting at its flow\'s end', () => {
  const late = [...GOOD.slice(0, 4), at(52, 'screen.ready', { name: 'film', ms: 21000 }), at(53, 'screen.reading', { name: 'member' })];
  expect(judges.judge(late.join('\n'), times(STARTS)).faults).toEqual([
    'slow_link: film waited 21 s, past 20 s',
    'slow_link: member was still waiting when the flow ended, 0 s after it began',
  ]);
});

it('takes a wait of exactly the limit, and judges each flow on its own lines alone', () => {
  const log = [...GOOD.slice(0, 4), at(51, 'screen.ready', { name: 'film', ms: 20000 }), at(60, 'state.empty', { what: 'after the runs' })];
  expect(judges.judge(log.join('\n'), times([...STARTS, ['a_later_flow', 59]])).faults).toEqual([]);
});

describe('as the workflow runs it', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'fault-judges-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  const run = (log: string, starts: [string, number][]) => {
    writeFileSync(join(dir, 'logcat.txt'), log);
    writeFileSync(join(dir, 'flow-times.txt'), timesLines(starts));
    return spawnSync(process.execPath, [SCRIPT, join(dir, 'logcat.txt'), '--flow-times', join(dir, 'flow-times.txt')], { encoding: 'utf8' });
  };

  it('ends 0 on a good run, 1 naming each fault, 2 when a fault flow never ran or a file is missing', () => {
    expect(run(GOOD.join('\n'), STARTS).status).toBe(0);
    const bad = run([...GOOD, at(6, 'state.empty', { what: 'Nothing filed yet.' })].join('\n'), STARTS);
    expect([bad.status, bad.stdout.split('\n')[0]]).toEqual([1, '✗ house_unreachable: a failure drawn as an empty room ("Nothing filed yet.")']);
    const short = run(GOOD.join('\n'), [['house_unreachable', 0]]);
    expect([short.status, short.stderr.trim()]).toEqual([2, 'never ran: slow_link']);
    expect(spawnSync(process.execPath, [SCRIPT, join(dir, 'nowhere.txt')], { encoding: 'utf8' }).status).toBe(2);
  });
});

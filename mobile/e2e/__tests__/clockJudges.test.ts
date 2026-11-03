/**
 * clockJudges.test.ts — the clock runs' judges (e2e/clock-judges.mjs) say NO: to a flow whose clock
 * was never moved, or that never waited past its token; to a tab whose first read never came; to a
 * failed read and a sign-out; to a refresh loop, and to a behind run whose token never ran out. They
 * place nothing by the phone's clock (the one thing a clock run breaks), judge only the run's own
 * way, and the script is run as the workflow runs it, on log lines in logcat's threadtime shape, as
 * e2eTrace, fault-proxy.mjs and run-flows.sh write them.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { files as universe } from '../../test-utils/universe';
import { pathToFileURL } from 'url';

const SCRIPT = join(__dirname, '..', 'clock-judges.mjs');
/** One of the script's own values, asked in a Node of its own (jest cannot load an ES module here). */
const ask = (expression: string): unknown => {
  const code = `const m = await import(${JSON.stringify(pathToFileURL(SCRIPT).href)}); console.log(JSON.stringify(${expression}));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
};
type Start = { name: string; attempt: number; at: number };
const judge = (log: string[], gateway: string[], starts: Start[], clock: 'ahead' | 'behind') =>
  ask(`m.judge(${JSON.stringify(log.join('\n'))}, ${JSON.stringify(gateway.join('\n'))}, ${JSON.stringify(starts)}, ${JSON.stringify(clock)})`) as { faults: string[]; unread: string[] };

/**
 * A device log line, as the app writes it. Its stamp is the phone's clock, which a clock run sets
 * wrong: the lines here are stamped days apart in no order, and the judge must not care.
 */
let day = 0;
const line = (event: string, detail: Record<string, unknown>) =>
  `10-${String(10 + (day++ % 17)).padStart(2, '0')} 18:01:00.000  4321  4377 W ReactNativeJS: [e2e] ${event} ${JSON.stringify(detail)}`;
const TABS = ['lobby', 'dispatch', 'reel', 'darkroom', 'member'];
const tabs = () => TABS.map((t) => line('screen.ready', { name: t, ms: 1200 }));
/** An ahead flow: its marker, the lobby before the clock moved, the move, five tabs (eight lines). */
const ahead = (name: string) => [line('flow.begins', { name, attempt: 1 }), line('screen.ready', { name: 'lobby', ms: 900 }), line('phone.clock', { minutes: 5 }), ...tabs()];
/** A behind flow: the same, then the wait past its token and five tabs again (fourteen lines). */
const behind = (name: string) => [...ahead(name), line('phone.waited', { seconds: 195 }), ...tabs()];
const AHEAD = ['ahead_minutes', 'ahead_hours', 'ahead_day'];
const BEHIND = ['behind_minutes', 'behind_hours', 'behind_day'];
const GOOD_AHEAD = AHEAD.flatMap(ahead);
const GOOD_BEHIND = BEHIND.flatMap(behind);
/** The runner's clock, which the gateway and flow-starts.txt keep: each flow ten minutes long. */
const T0 = Date.parse('2026-11-02T06:00:00Z');
const startsOf = (names: string[]): Start[] => names.map((name, i) => ({ name, attempt: 1, at: T0 + i * 600_000 }));
const refresh = (seconds: number) => JSON.stringify({ id: 1, method: 'POST', path: '/auth/v1/token?grant_type=refresh_token', at: new Date(T0 + seconds * 1000).toISOString(), status: 200 });
const asked = (seconds: number, path: string) => JSON.stringify({ id: 1, method: 'GET', path, at: new Date(T0 + seconds * 1000).toISOString(), status: 200 });
/** A refresh in each behind flow's window, as its 180 s token nears its end. */
const BEHIND_REFRESHES = [refresh(100), refresh(700), refresh(1300)];

it('names the six flows, minutes, hours and a day each way, and every tab', () => {
  expect(ask('[m.CLOCK_FLOWS, m.TABS, m.AHEAD_MOST, m.AHEAD_WINDOW_S]')).toEqual([{
    ahead_minutes: { direction: 'ahead', minutes: 5 }, ahead_hours: { direction: 'ahead', minutes: 180 }, ahead_day: { direction: 'ahead', minutes: 1440 },
    behind_minutes: { direction: 'behind', minutes: 5 }, behind_hours: { direction: 'behind', minutes: 180 }, behind_day: { direction: 'behind', minutes: 1440 },
  }, TABS, 2, 300]);
});

it.each(['ahead', 'behind'])('judges every flow in .maestro/clock/%s, which that run\'s one machine runs, and no other', (way) => {
  const folder = universe('flows', { under: [`.maestro/clock/${way}`] }).map((f) => basename(f, '.yaml')).sort();
  expect(folder.length).toBe(3);
  const map = JSON.parse(readFileSync(join(__dirname, '..', `clock-${way}-shards.json`), 'utf8')) as { shards: { flows: string[] }[] };
  expect(map.shards.flatMap((s) => s.flows).sort()).toEqual(folder);
  const flows = ask('m.CLOCK_FLOWS') as Record<string, { direction: string }>;
  expect(Object.keys(flows).filter((f) => flows[f]?.direction === way).sort()).toEqual(folder);
});

it('passes runs in which every flow moved its clock and read every tab, with a refresh or two', () => {
  expect(judge(GOOD_AHEAD, [refresh(30), asked(31, '/rest/v1/logs'), refresh(700)], startsOf(AHEAD), 'ahead')).toEqual({ faults: [], unread: [] });
  expect(judge(GOOD_BEHIND, BEHIND_REFRESHES, startsOf(BEHIND), 'behind')).toEqual({ faults: [], unread: [] });
});

it('judges the run\'s own way alone: the other way\'s flows are neither judged nor missed', () => {
  expect(judge([...GOOD_AHEAD, ...behind('behind_day').slice(0, 2)], [], startsOf(AHEAD), 'ahead')).toEqual({ faults: [], unread: [] });
  expect(judge(GOOD_AHEAD, [], startsOf(AHEAD), 'behind').unread).toEqual(BEHIND);
});

it('refuses a flow whose clock was never moved, and a tab ready only before it moved', () => {
  expect(judge([...GOOD_AHEAD.slice(0, 2), ...GOOD_AHEAD.slice(3)], [], startsOf(AHEAD), 'ahead').faults)
    .toEqual(['ahead_minutes: the clock was never moved, so the flow proves nothing']);
  const early = [...GOOD_AHEAD.slice(0, 3), ...tabs().slice(1), ...GOOD_AHEAD.slice(8)];
  expect(judge(early, [], startsOf(AHEAD), 'ahead').faults).toEqual(['ahead_minutes: the lobby tab\'s first read was not ready after the clock moved']);
});

it('refuses a behind flow that never waited past its token, and a tab not read again past it', () => {
  const noWait = [...GOOD_BEHIND.slice(0, 8), ...GOOD_BEHIND.slice(9)];
  expect(judge(noWait, BEHIND_REFRESHES, startsOf(BEHIND), 'behind').faults)
    .toEqual(['behind_minutes: the flow never waited past its token, so it proves nothing']);
  const once = [...GOOD_BEHIND.slice(0, 13), ...GOOD_BEHIND.slice(14)];
  expect(judge(once, BEHIND_REFRESHES, startsOf(BEHIND), 'behind').faults)
    .toEqual(['behind_minutes: the member tab\'s first read was not ready past the token']);
});

it('refuses a failed read and a sign-out, each in its own flow alone', () => {
  const log = [...GOOD_AHEAD.slice(0, 8), line('state.failed', { what: 'Transmission Interrupted' }), line('screen.failed', { name: 'reel', ms: 15000 }),
    ...GOOD_AHEAD.slice(8, 16), line('screen.ready', { name: 'welcome', ms: 300 }), ...GOOD_AHEAD.slice(16)];
  expect(judge(log, [], startsOf(AHEAD), 'ahead').faults).toEqual([
    'ahead_minutes: a read failed with the clock ahead ("Transmission Interrupted")',
    'ahead_minutes: a read failed with the clock ahead ("reel")',
    'ahead_hours: the member was signed out with the clock ahead',
  ]);
});

it('takes a welcome door drawn before the session was restored, which is no sign-out', () => {
  const log = [line('flow.begins', { name: 'ahead_minutes', attempt: 1 }), line('phone.clock', { minutes: 5 }),
    line('screen.ready', { name: 'welcome', ms: 1 }), ...tabs(), ...GOOD_AHEAD.slice(8)];
  expect(judge(log, [], startsOf(AHEAD), 'ahead').faults).toEqual([]);
});

it('refuses three refreshes in five minutes ahead, takes two, and counts each flow\'s alone', () => {
  expect(judge(GOOD_AHEAD, [refresh(10), refresh(100), refresh(309)], startsOf(AHEAD), 'ahead').faults)
    .toEqual(['ahead_minutes: 3 token refreshes in 5 minutes, past 2: a refresh loop']);
  expect(judge(GOOD_AHEAD, [refresh(10), refresh(310), refresh(609)], startsOf(AHEAD), 'ahead').faults).toEqual([]);
  expect(judge(GOOD_AHEAD, [refresh(590), refresh(599), refresh(601)], startsOf(AHEAD), 'ahead').faults).toEqual([]);
});

it('refuses a behind flow with no refresh, and one past one a minute', () => {
  expect(judge(GOOD_BEHIND, BEHIND_REFRESHES.slice(1), startsOf(BEHIND), 'behind').faults)
    .toEqual(['behind_minutes: no token was refreshed, so its 180 s token never ran out and the flow proves nothing']);
  expect(judge(GOOD_BEHIND, [refresh(100), refresh(110), refresh(120), ...BEHIND_REFRESHES.slice(1)], startsOf(BEHIND), 'behind').faults)
    .toEqual(['behind_minutes: 3 refreshes in 1 minute(s), past one a minute: a refresh loop']);
});

it('judges a flow\'s last attempt alone: its marker begins it, and its start on the runner\'s clock', () => {
  const retried = [...ahead('ahead_minutes').slice(0, 2), line('flow.begins', { name: 'ahead_minutes', attempt: 2 }), ...GOOD_AHEAD.slice(1)];
  const starts = [{ name: 'ahead_minutes', attempt: 1, at: T0 - 600_000 }, ...startsOf(AHEAD)];
  expect(judge(retried, [refresh(-590), refresh(-580), refresh(-570)], starts, 'ahead').faults).toEqual([]);
});

it('counts one a minute: N + 1 in N minutes holds, one more is a loop', () => {
  // One a minute, as a 180 s token is renewed with under 120 s left, holds; one at every 30 s look is a loop.
  expect(ask('[m.pastOneAMinute([0, 60, 120, 180]), m.pastOneAMinute([0, 30, 59]), m.pastOneAMinute([0, 30, 60, 90]), m.pastOneAMinute([0, 10]), m.pastOneAMinute([])]'))
    .toEqual([null, '3 refreshes in 1 minute(s)', '4 refreshes in 2 minute(s)', null, null]);
});

describe('as the workflow runs it', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'clock-judges-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  const run = (log: string[], gateway: string[], starts: Start[], clock: string | null) => {
    writeFileSync(join(dir, 'logcat.txt'), log.join('\n'));
    writeFileSync(join(dir, 'gateway.jsonl'), gateway.join('\n'));
    writeFileSync(join(dir, 'flow-starts.txt'), starts.map((s) => `${s.name}\t${s.attempt}\t${new Date(s.at).toISOString()}`).join('\n'));
    const args = [SCRIPT, join(dir, 'logcat.txt'), '--gateway', join(dir, 'gateway.jsonl'), '--flow-starts', join(dir, 'flow-starts.txt')];
    return spawnSync(process.execPath, clock ? [...args, '--clock', clock] : args, { encoding: 'utf8' });
  };

  it('ends 0 on a good run, 1 naming each fault, 2 when a flow never ran, the way is not named or a file is missing', () => {
    expect(run(GOOD_AHEAD, [refresh(30)], startsOf(AHEAD), 'ahead').status).toBe(0);
    expect(run(GOOD_BEHIND, BEHIND_REFRESHES, startsOf(BEHIND), 'behind').status).toBe(0);
    const bad = run(GOOD_AHEAD, [refresh(1), refresh(2), refresh(3)], startsOf(AHEAD), 'ahead');
    expect([bad.status, bad.stdout.split('\n')[0]]).toEqual([1, '✗ ahead_minutes: 3 token refreshes in 5 minutes, past 2: a refresh loop']);
    const short = run(GOOD_AHEAD, [], startsOf(AHEAD).slice(0, 2), 'ahead');
    expect([short.status, short.stderr.trim()]).toEqual([2, 'never ran: ahead_day']);
    expect(run(GOOD_AHEAD, [], startsOf(AHEAD), null).status).toBe(2);
    expect(spawnSync(process.execPath, [SCRIPT, join(dir, 'nowhere.txt')], { encoding: 'utf8' }).status).toBe(2);
  });
});

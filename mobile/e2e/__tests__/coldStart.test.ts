/**
 * coldStart.test.ts — the cold-start table: a row for every launch of the app, every cell a value
 * or why not (WORKLIST P0.104).
 *
 * cold-start.mjs is run as run-flows.sh runs it, on device-log lines copied from Sealed E2E run
 * 39625257830's admin shard (logcat `threadtime`, Davey lines cut after their flags), with the
 * measured launch's records written as run-flows.sh writes them.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'cold-start.mjs');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cold-start-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

// One launch of that run, as Android and the app logged it.
const START = (pid: string, at = '15:43:35.347') => `10-21 ${at}   517   546 I ActivityManager: Start proc ${pid}:com.reelhouse.society/u0a192 for next-top-activity {com.reelhouse.society/com.reelhouse.society.MainActivity}`;
const DISPLAYED = '10-21 15:43:38.446   517   534 I ActivityTaskManager: Displayed com.reelhouse.society/.MainActivity for user 0: +3s9ms';
const SKIPPED = (pid: string) => `10-21 15:43:38.260  ${pid}  ${pid} I Choreographer: Skipped 36 frames!  The application may be doing too much work on its main thread.`;
const DAVEY = (pid: string) => `10-21 15:43:39.042  ${pid}  6661 I OpenGLRenderer: Davey! duration=1083ms; Flags=0, FrameTimelineVsyncId=35480,`;
const READY = (pid: string) => `10-21 15:43:39.345  ${pid}  6684 W ReactNativeJS: [e2e] screen.ready {"name":"lobby","ms":2017}`;
// After the first screen ready: not the cold start's.
const LATE_DAVEY = (pid: string) => `10-21 15:43:39.451  ${pid}  6663 I OpenGLRenderer: Davey! duration=847ms; Flags=0, FrameTimelineVsyncId=35513,`;
// Another process's frames, in the same seconds (the launcher's, pid 836).
const OTHERS = '10-21 15:43:38.300   836   836 I Choreographer: Skipped 67 frames!  The application may be doing too much work on its main thread.';
const SUBPROCESS = '10-21 15:43:30.100   517   546 I ActivityManager: Start proc 7001:com.reelhouse.society:remote/u0a192 for service';

const MEMINFO = [
  '** MEMINFO in pid 6648 [com.reelhouse.society] **',
  '                   Pss  Private  Private  SwapPss      Rss     Heap     Heap     Heap',
  '  Native Heap    40112    40056        0        0    41800    52224    44562     3801',
  ' App Summary',
  '           Native Heap:    40056                          41800',
].join('\n');
const AM = 'Starting: Intent { cmp=com.reelhouse.society/.MainActivity }\nStatus: ok\nLaunchState: COLD\nActivity: com.reelhouse.society/.MainActivity\nTotalTime: 3009\nWaitTime: 3015\nComplete\n';

/** The table for these lines; `measured` names the 1-based line its launch began at, with its records. */
function table(lines: string[], measured?: { from: number; am?: string; meminfo?: string }) {
  writeFileSync(join(dir, 'stream.txt'), lines.join('\n') + '\n');
  writeFileSync(join(dir, 'times.txt'), 'auth_flow\t1\t10-21 15:43:30.000\n');
  const args = [SCRIPT, join(dir, 'stream.txt'), '--flow-times', join(dir, 'times.txt')];
  rmSync(join(dir, 'motion'), { recursive: true, force: true }); // each table's records its own
  if (measured) {
    mkdirSync(join(dir, 'motion'));
    writeFileSync(join(dir, 'motion', 'cold-from.txt'), `${measured.from}\n`);
    if (measured.am !== undefined) writeFileSync(join(dir, 'motion', 'cold-am.txt'), measured.am);
    if (measured.meminfo !== undefined) writeFileSync(join(dir, 'motion', 'cold-meminfo.txt'), measured.meminfo);
    args.push('--measured', join(dir, 'motion'));
  }
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  const rows = r.stdout.split('\n').filter((l) => /^\| \d/.test(l)).map((l) => l.slice(2, -2).split(' | '));
  return { status: r.status, stderr: r.stderr, out: r.stdout, rows };
}

const LAUNCH = (pid: string) => [START(pid), SKIPPED(pid), OTHERS, DISPLAYED, DAVEY(pid), READY(pid), LATE_DAVEY(pid)];

it('reads a launch of Maestro\'s: Displayed, its first screen ready, and its frames to that screen alone', () => {
  const r = table([SUBPROCESS, ...LAUNCH('6648')]);
  expect([r.status, r.stderr]).toEqual([0, '']);
  expect(r.rows).toEqual([[
    '1', 'auth_flow', '3009 ms', 'lobby, 3998 ms', '36', '1, longest 1083 ms',
    "not measured: am's time is taken at the measured launch alone", 'not measured: read at the measured launch alone',
  ]]);
  expect(r.out).toMatch(/^\| # \| launch \| Displayed \| first screen ready \(after start\) \| skipped frames \| Davey frames \| am TotalTime \| native heap at ready \|\n\| --- \|/);
  expect(r.out).toContain('goldfish_pipe, the emulator\'s software GPU, which a phone does not have');
  expect(r.out).toContain('The measured launch is not in this log');
});

it('takes am\'s time and the native heap for the measured launch alone, found by its line though the pid comes again', () => {
  const first = LAUNCH('6648');
  const r = table([...first, ...LAUNCH('6648')], { from: first.length + 1, am: AM, meminfo: MEMINFO });
  expect(r.rows.map((row) => [row[1], row[6], row[7]])).toEqual([
    ['auth_flow', "not measured: am's time is taken at the measured launch alone", 'not measured: read at the measured launch alone'],
    ['the measured launch (run-flows.sh)', '3009 ms', '39.1 MB'],
  ]);
  expect(r.out).not.toContain('The measured launch is not in this log');
});

it('says why, in every cell it cannot fill', () => {
  // The measured launch's process wrote no screen ready, so no heap was read, and am said no time.
  const noReady = table([START('6648'), DISPLAYED.replace('Displayed', 'Displaying')], { from: 1, am: 'Error: Activity not started\n' });
  expect(noReady.rows).toEqual([[
    '1', 'the measured launch (run-flows.sh)', 'not measured: Android logged no "Displayed" for it',
    'not measured: no ready marker in this build', '0 (no screen ready: to its end)', '0',
    'not measured: am said no TotalTime (Error: Activity not started)', 'not measured: no screen said it was ready, so no reading was taken',
  ]]);
  // Another launch wrote one, so this build has the marker: this process ended before its own.
  const ended = table([START('6648'), START('6700', '15:43:50.000'), READY('6700')]);
  expect(ended.rows.map((row) => row[3])[0]).toBe('not measured: no screen said it was ready before this process ended');
  // A heap the reading did not hold.
  expect(table(LAUNCH('6648'), { from: 1, am: AM, meminfo: 'No process found for: 6648\n' }).rows.map((row) => row[7])[0]).toBe('not measured: dumpsys meminfo said no native heap');
  // No cell is ever left empty.
  for (const r of [noReady, ended]) for (const row of r.rows) for (const cell of row) expect(cell.trim()).not.toBe('');
});

it('has no table, and fails, for a log with no launch of the app', () => {
  const r = table([SUBPROCESS, OTHERS]);
  expect(r.status).toBe(1);
  expect(r.out.trim()).toBe('No launch of com.reelhouse.society in the device log (no "Start proc …:com.reelhouse.society/" line): no cold-start table.');
});

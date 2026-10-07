/**
 * appCrashes.test.ts — the app crashing or freezing at any moment fails the run,
 * and a log that did not see the whole run cannot say it did not.
 *
 * app-crashes.mjs is run as run-flows.sh runs it, on device logs in logcat's
 * `threadtime` shape ("MM-DD HH:MM:SS.mmm  PID  TID L Tag: message") and
 * Maestro's per-flow crash reports.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'app-crashes.mjs');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'app-crashes-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const line = (time: string, pid: number, level: string, tag: string, msg: string) => `10-04 ${time}.100  ${pid}  ${pid + 20} ${level} ${tag}: ${msg}\n`;
const QUIET = line('01:00:00', 525, 'I', 'ActivityManager', 'Start proc 16631:com.reelhouse.society/u0a192');
const END = line('01:29:58', 525, 'D', 'ConnectivityService', 'the device is still talking');

function check(log: string, extra: string[] = [], deviceNow = '10-04 01:30:00') {
  writeFileSync(join(dir, 'stream.txt'), QUIET + log + END);
  writeFileSync(join(dir, 'times.txt'), 'stack probe\t1\t10-04 01:00:00.000\nlogin_flow\t1\t10-04 01:10:00.000\nlogin_flow\t2\t10-04 01:12:00.000\nlounge_flow\t1\t10-04 01:20:00.000\n');
  const r = spawnSync(process.execPath, [SCRIPT, join(dir, 'stream.txt'), '--flow-times', join(dir, 'times.txt'),
    '--maestro', join(dir, 'debug'), '--stream-alive', 'yes', '--device-now', deviceNow, ...extra], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout.trim(), stderr: r.stderr };
}
const javaCrash = (time: string, pid: number, process: string) =>
  line(time, pid, 'E', 'AndroidRuntime', 'FATAL EXCEPTION: main') +
  line(time, pid, 'E', 'AndroidRuntime', `Process: ${process}, PID: ${pid}`) +
  line(time, pid, 'E', 'AndroidRuntime', 'com.facebook.react.common.JavascriptException: TypeError: undefined is not a function') +
  line(time, pid, 'E', 'AndroidRuntime', '\tat com.facebook.react.modules.core.ExceptionsManagerModule.reportException');

it('passes a run in which the app never crashed, and says what it read', () => {
  const r = check(line('01:15:00', 16631, 'W', 'ReactNativeJS', '[e2e] screen.ready {"name":"lobby","ms":293}'));
  expect(r).toMatchObject({ status: 0, stderr: '' });
  expect(r.out).toBe('No crash or freeze of com.reelhouse.society: 3 log lines read, 01:00:00 to 01:29:58, and Maestro reported none.');
});

it('fails a Java crash of the app, on the flow that was running, with its cause — even in a flow that passed', () => {
  const r = check(javaCrash('01:21:30', 16631, 'com.reelhouse.society'));
  expect(r.status).toBe(1);
  expect(r.out).toContain('01:21:30 crash during lounge_flow: com.facebook.react.common.JavascriptException: TypeError: undefined is not a function');
  expect(r.out).toContain('  at com.facebook.react.modules.core.ExceptionsManagerModule.reportException');
});

it('names a second attempt as such', () => {
  expect(check(javaCrash('01:13:00', 16631, 'com.reelhouse.society')).out).toContain('crash during login_flow (attempt 2):');
});

it('fails a crash of one of the app’s named processes', () => {
  expect(check(javaCrash('01:21:30', 17000, 'com.reelhouse.society:remote')).status).toBe(1);
});

it('leaves out every other process’s crash — Maestro’s own driver, which each run reinstalls, and Google’s', () => {
  const r = check(
    line('01:27:19', 525, 'W', 'ActivityManager', 'Crash of app dev.mobile.maestro running instrumentation ComponentInfo{dev.mobile.maestro.test/androidx.test.runner.AndroidJUnitRunner}') +
    javaCrash('01:22:00', 900, 'com.google.android.gms') +
    javaCrash('01:22:00', 901, 'com.reelhouse.society.other'));
  expect(r.status).toBe(0);
});

it('pairs a FATAL line with the Process line of its own process only', () => {
  // Another process's "Process:" line arriving between them must not be taken for the app's.
  const r = check(line('01:22:00', 900, 'E', 'AndroidRuntime', 'FATAL EXCEPTION: main') +
    line('01:22:00', 16631, 'E', 'AndroidRuntime', 'Process: com.reelhouse.society, PID: 16631') +
    line('01:22:00', 900, 'E', 'AndroidRuntime', 'Process: com.google.android.gms, PID: 900'));
  expect(r.status).toBe(0);
});

it('fails a native crash of the app, from its tombstone, with the signal', () => {
  const r = check(
    line('01:21:40', 16631, 'F', 'libc', 'Fatal signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0 in tid 16660 (mqt_js), pid 16631 (elhouse.society)') +
    line('01:21:40', 17700, 'F', 'DEBUG', 'pid: 16631, tid: 16660, name: mqt_js  >>> com.reelhouse.society <<<'));
  expect(r.status).toBe(1);
  expect(r.out).toContain('01:21:40 native crash during lounge_flow: Fatal signal 11 (SIGSEGV), code 1 (SEGV_MAPERR)');
});

it('fails a freeze (ANR) of the app, with Android’s reason', () => {
  const r = check(line('01:11:00', 525, 'E', 'ActivityManager', 'ANR in com.reelhouse.society') +
    line('01:11:00', 525, 'E', 'ActivityManager', 'PID: 16631') +
    line('01:11:00', 525, 'E', 'ActivityManager', 'Reason: Input dispatching timed out (Waited 5001ms for KeyEvent)'));
  expect(r.status).toBe(1);
  expect(r.out).toContain('01:11:00 freeze (ANR) during login_flow: Input dispatching timed out (Waited 5001ms for KeyEvent)');
});

it('does not take an "ANR in" that ActivityManager did not say — an element’s text, read by Maestro', () => {
  expect(check(line('01:11:00', 5000, 'I', 'Maestro', 'Skipping invisible child: text: ANR in com.reelhouse.society')).status).toBe(0);
});

it('fails on Maestro’s own crash or ANR report, a second source', () => {
  mkdirSync(join(dir, 'debug', 'lounge_flow', 'logs'), { recursive: true });
  writeFileSync(join(dir, 'debug', 'lounge_flow', 'logs', 'anr-report.txt'), '\nANR in com.reelhouse.society\nReason: x\n');
  const r = check('');
  expect(r.status).toBe(1);
  expect(r.out).toContain("freeze (Maestro's report): ANR in com.reelhouse.society");
});

describe('a log that did not see the whole run cannot vouch for it', () => {
  it('when the copy had stopped', () => {
    const r = check('', ['--stream-alive', 'no']);
    expect(r).toMatchObject({ status: 1 });
    expect(r.out).toBe('The crash check cannot vouch for the whole run: the device log copy had stopped before the run ended.');
  });

  it('when its last line is old against the device’s clock', () => {
    const r = check('', [], '10-04 01:32:01');
    expect(r.status).toBe(1);
    expect(r.out).toContain("the copy's last line is 123s older than the device's clock: it stopped early");
    expect(check('', [], '10-04 01:31:58').status).toBe(0);
  });

  it('when the device did not answer for its clock', () => {
    expect(check('', [], '').out).toContain('the device did not answer for its clock');
  });

  it('when the copy was never written', () => {
    const r = spawnSync(process.execPath, [SCRIPT, join(dir, 'none.txt'), '--device-now', '10-04 01:30:00'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('was never written');
  });

  it('and says so beside a crash it did see', () => {
    const r = check(javaCrash('01:21:30', 16631, 'com.reelhouse.society'), ['--stream-alive', 'no']);
    expect(r.out.split('\n')[0]).toContain('crashed or froze during the run');
    expect(r.out).toContain('cannot vouch for the whole run');
  });
});

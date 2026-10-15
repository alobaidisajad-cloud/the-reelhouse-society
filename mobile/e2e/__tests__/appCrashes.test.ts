/**
 * appCrashes.test.ts — the app crashing or freezing at any moment fails the run,
 * and a log that did not see the whole run cannot say it did not.
 *
 * app-crashes.mjs is run as run-flows.sh runs it, on device logs in logcat's
 * `threadtime` shape ("MM-DD HH:MM:SS.mmm  PID  TID L Tag: message") and
 * Maestro's per-flow crash reports.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
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

describe('a soft crash: React destroyed with no crash dialog, the app alive and its screen gone', () => {
  // Cut from kept logs, never typed: study run 37800869905 and Sealed E2E run 38262703073.
  const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

  it('is caught: the launch crash with animations on (the study\'s arm A)', () => {
    const r = check(fixture('soft-crash-study-arm-A.txt'));
    expect(r.status).toBe(1);
    expect(r.out).toContain('JS error (React instance destroyed)');
    expect(r.out).toContain('undefined is not a function');
  });

  it('is caught: React destroyed mid-run by a mount on a missing parent (Sealed E2E 38262703073)', () => {
    const r = check(fixture('soft-crash-e2e-38262703073.txt'));
    expect(r.status).toBe(1);
    expect(r.out.split('\n').filter((l) => l.includes('JS error (React instance destroyed)'))).toEqual([
      expect.stringContaining('Unable to find viewState for tag 2450. Surface stopped: false'),
    ]);
  });

  it('passes the fixed build\'s launch (the study\'s arm MF)', () => {
    expect(check(fixture('soft-crash-study-arm-MF.txt')).status).toBe(0);
  });

  it('passes the same lines from another process', () => {
    const elsewhere = fixture('soft-crash-study-arm-A.txt').split('\n')
      .map((l) => (l.includes('Start proc') ? l : l.replace(/^(\S+ \S+\s+)6176(\s+)/, '$17777$2'))).join('\n');
    expect(elsewhere).toContain(' 7777 ');
    expect(check(elsewhere).status).toBe(0);
  });
});

describe('a shipped client\'s own crash (--own): reported apart, failing nothing; anything else fails as ever', () => {
  // Cut from Sealed E2E 38679641286 (build 41, two crashes), with that run's flow times.
  const RUN = readFileSync(join(__dirname, 'fixtures', 'own-crash-e2e-38679641286.txt'), 'utf8');
  const STUDY_A = readFileSync(join(__dirname, 'fixtures', 'soft-crash-study-arm-A.txt'), 'utf8');
  const TIMES = 'lobby_wall_flow\t1\t10-15 04:37:04.000\nlog_film_flow\t1\t10-15 04:38:42.000\n' +
    'login_flow\t1\t10-15 04:40:36.000\nlounge_flow\t1\t10-15 04:42:04.000\n';
  const BUILD_41 = {
    client: 'TestFlight build 41',
    ownCrashes: [{ class: 'RN-react-destroyed-on-mount', match: 'Unable to find viewState for tag', fixedIn: 'e103781c', why: 'x' }],
  };
  const own = (log: string, record: unknown = BUILD_41) => {
    writeFileSync(join(dir, 'own.json'), JSON.stringify(record));
    writeFileSync(join(dir, 'run-times.txt'), TIMES);
    return check(log, ['--own', join(dir, 'own.json'), '--flow-times', join(dir, 'run-times.txt')]);
  };
  const OWN_LINES = [
    "TestFlight build 41 carries these crashes, each fixed since in the app; they do not fail this run:",
    "04:40:08 TestFlight build 41's own crash, class RN-react-destroyed-on-mount, fixed in e103781c: during log_film_flow: Unable to find viewState for tag 2450. Surface stopped: false",
    "  04:40:09 then, from the same process: Tried to enqueue runnable on already finished thread: 'v_native... dropping Runnable. (26 lines)",
    "04:42:28 TestFlight build 41's own crash, class RN-react-destroyed-on-mount, fixed in e103781c: during lounge_flow: Unable to find viewState for tag 680. Surface stopped: false",
    "  04:42:29 then, from the same process: Tried to enqueue runnable on already finished thread: 'v_native... dropping Runnable. (24 lines)",
  ];

  it('passes the run, each own crash and the aftermath of its process in a section of its own', () => {
    const r = own(RUN);
    expect(r).toMatchObject({ status: 0, stderr: '' });
    expect(r.out.split('\n')).toEqual([
      "No crash or freeze of com.reelhouse.society but TestFlight build 41's own: 286 log lines read, 01:00:00 to 01:29:58, and Maestro reported none.",
      ...OWN_LINES,
    ]);
  });

  it('fails the same log with no --own, exactly as before', () => {
    const r = check(RUN);
    expect(r.status).toBe(1);
    expect(r.out.split('\n').filter((l) => l.includes('JS error (React instance destroyed)'))).toHaveLength(4);
    expect(r.out).not.toContain('own crash');
  });

  it('fails a different soft crash in the same log, and still sets the own ones apart', () => {
    const r = own(RUN + STUDY_A);
    expect(r.status).toBe(1);
    const failing = r.out.split('\n').slice(0, r.out.split('\n').indexOf(OWN_LINES[0]));
    expect(failing[0]).toContain('crashed or froze during the run');
    expect(failing.join('\n')).toContain('undefined is not a function');
    expect(failing.join('\n')).not.toContain('viewState');
    expect(r.out.split('\n').slice(-5)).toEqual(OWN_LINES);
  });

  it('fails an aftermath line too late to be the own crash\'s, or from another process', () => {
    const after = RUN.split('\n').find((l) => l.includes('already finished thread') && l.includes(' 14462 '))!;
    expect(own(RUN + after.replace('04:40:09', '04:40:14') + '\n').status).toBe(1);
    expect(own(RUN + after.replace('04:40:09', '04:40:13') + '\n').status).toBe(0);
    const started = RUN.split('\n').find((l) => l.includes('Start proc 14462'))!;
    const elsewhere = `${started.replace(/14462/g, '14999')}\n${after.replace(/ 14462 /, ' 14999 ')}\n`;
    expect(own(RUN + elsewhere).status).toBe(1);
  });

  it('fails a report whose lines are not all the own crash\'s: one that does not hold its match', () => {
    const at = RUN.split('\n').find((l) => l.includes('handleHostException(message = "Unable to find viewState for tag 2450'))!;
    const other = at.replace(/message = "[^"]*"/, 'message = "undefined is not a function"');
    expect(own(RUN + other + '\n').status).toBe(1);
    // Nor is a new crash of the same process two seconds on its aftermath.
    expect(own(RUN + other.replace('04:40:08', '04:40:10') + '\n').status).toBe(1);
  });

  it('refuses an own file that does not hold a client\'s own crashes', () => {
    const r = own(RUN, { client: 'TestFlight build 41', ownCrashes: [{ class: 'RN-react-destroyed-on-mount', match: '' }] });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("does not hold a client's own crashes");
  });
});

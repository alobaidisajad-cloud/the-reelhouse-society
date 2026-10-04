/**
 * attempt.test.ts — a failed attempt is run again only when it says nothing about the app.
 *
 * attempt.mjs is run as run-flows.sh runs it, on Maestro's records written here
 * in the shapes Maestro 2.10.0 writes them: its JUnit report (JUnitTestSuiteReporter),
 * its step record (commands.json, under .maestro/tests/<time>/<flow>/), its own
 * log (log4j "HH:mm:ss.SSS [ INFO] logger.method: message"), and the device's log
 * for the attempt (logcat -v threadtime). Each rule is shown to refuse on its own.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'attempt.mjs');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'attempt-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

// Run 37165878763's report: Maestro's first call raced its driver's start.
const RAN_BEFORE_DRIVER = "maestro.android.DeviceServerDiedException: Device server died during 'deviceInfo' on emulator-5554 " +
  '(1085ms since last byte, connection age 1726ms): StatusRuntimeException: UNAVAILABLE\n\tat maestro.android.AndroidDeviceConnection.onGrpcDeath(AndroidDeviceConnection.kt:319)';
// Run 37155828199's shape: one typing call outran the 120 s deadline.
const TYPING_DEADLINE = "maestro.android.DeviceServerDiedException: Device server died during 'inputText' on emulator-5554 " +
  '(120041ms since last byte, connection age 125310ms): StatusRuntimeException: DEADLINE_EXCEEDED';
const ASSERTION = 'Assertion is false: id: profile-tab is visible';

const DEBUG = () => join(dir, 'debug');
const FLOW_DIR = () => join(DEBUG(), '.maestro', 'tests', '2026-10-04_012718', 'f');

function junit(failure?: string) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;');
  writeFileSync(join(dir, 'report.xml'), [
    "<?xml version='1.0' encoding='UTF-8'?>", '<testsuites>',
    `  <testsuite name="Test Suite" device="test" tests="1" failures="${failure ? 1 : 0}">`,
    `    <testcase id="f" name="f" classname="f" status="${failure ? 'ERROR' : 'SUCCESS'}">`,
    ...(failure ? [`      <failure>${esc(failure)}</failure>`] : []),
    '    </testcase>', '  </testsuite>', '</testsuites>'].join('\n'));
}
function commands(entries: unknown[]) {
  mkdirSync(FLOW_DIR(), { recursive: true });
  writeFileSync(join(FLOW_DIR(), 'commands.json'), JSON.stringify(entries));
}
const STEP = { command: { launchAppCommand: { appId: 'com.reelhouse.society', clearState: true } }, metadata: { status: 'COMPLETED' } };
/** Maestro's own log; `steps` adds CliConsoleListener's lines for the steps it began. */
function maestroLog(steps = 0, extra = '') {
  const dirOf = join(DEBUG(), '.maestro', 'tests', '2026-10-04_012718');
  mkdirSync(dirOf, { recursive: true });
  let text = '01:27:17.401 [ INFO] maestro.cli.runner.TestSuiteInteractor.runFlow:  Running flow f\n';
  for (let i = 0; i < steps; i++) {
    text += `01:27:18.0${i}0 [ INFO] maestro.cli.runner.CliConsoleListener.onCommandStart: Launch app "com.reelhouse.society" with clear state RUNNING\n`;
  }
  writeFileSync(join(dirOf, 'maestro.log'), text + extra);
}
const line = (time: string, pid: number, level: string, tag: string, msg: string) => `10-04 ${time}.100  ${pid}  ${pid + 20} ${level} ${tag}: ${msg}\n`;
function deviceLog(text: string) { writeFileSync(join(dir, 'device.log'), text); }

function decide(over: Record<string, string | number> = {}) {
  const o: Record<string, string | number> = {
    kind: 'flow', exit: 1, junit: join(dir, 'report.xml'), debug: DEBUG(), log: join(dir, 'device.log'),
    left: 2000, need: 1680, retries: 0, max: 3, device: 'alive', attempt: 1, ...over,
  };
  const args = Object.entries(o).flatMap(([k, v]) => [`--${k}`, String(v)]);
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  const [verdict, why, ...evidence] = r.stdout.trim().split('\n');
  return { status: r.status, verdict, why, evidence: evidence.join('\n'), stderr: r.stderr };
}

/** Run 2's whole record: failed, no step record, a log of its own with no step in it. */
function neverBegan() { junit(RAN_BEFORE_DRIVER); maestroLog(0); deviceLog(''); }

describe('Maestro never began a step', () => {
  it('runs a flow again when all three records agree — run 37165878763', () => {
    neverBegan();
    const d = decide();
    expect(d).toMatchObject({ status: 0, verdict: 'retry', why: 'run again: Maestro never began a step' });
    expect(d.evidence).toContain("Maestro said: maestro.android.DeviceServerDiedException: Device server died during 'deviceInfo'");
    expect(d.evidence).toContain('steps Maestro recorded: 0; steps in its own log: 0');
  });

  it('does not, when its step record holds a step', () => {
    neverBegan(); commands([STEP]);
    expect(decide()).toMatchObject({ status: 1, verdict: 'final' });
  });

  it('does not, when its own log names a step', () => {
    neverBegan(); maestroLog(1);
    expect(decide()).toMatchObject({ status: 1, verdict: 'final' });
  });

  it('does not, when it left no log of its own to confirm it', () => {
    junit(RAN_BEFORE_DRIVER); deviceLog('');
    const d = decide();
    expect(d).toMatchObject({ status: 1, verdict: 'final' });
    expect(d.why).toContain('no log of its own');
  });

  it('does not, when its JUnit report says it passed', () => {
    junit(); maestroLog(0); deviceLog('');
    expect(decide()).toMatchObject({ status: 1, verdict: 'final', why: 'not run again: a step failed, which is the app\'s answer' });
  });

  it('counts an unreadable step record as a step, not as none', () => {
    neverBegan();
    mkdirSync(FLOW_DIR(), { recursive: true });
    writeFileSync(join(FLOW_DIR(), 'commands.json'), '{ cut short');
    expect(decide()).toMatchObject({ status: 1, verdict: 'final' });
  });
});

describe('Maestro lost its connection to the phone', () => {
  const lostWhileTyping = () => { junit(TYPING_DEADLINE); commands([STEP, { ...STEP, metadata: { status: 'RUNNING' } }]); maestroLog(2); deviceLog(''); };

  it('runs a PROBE again — run 37155828199', () => {
    lostWhileTyping();
    expect(decide({ kind: 'probe', need: 240 })).toMatchObject({
      status: 0, verdict: 'retry', why: 'run again: Maestro lost its connection to the phone (DeviceServerDiedException)',
    });
  });

  it('never runs a FLOW again once it had begun — it may have saved something — and says it is no verdict on the app', () => {
    lostWhileTyping();
    const d = decide();
    expect(d).toMatchObject({ status: 1, verdict: 'final' });
    expect(d.why).toMatch(/^not run again: Maestro lost its driver \(DeviceServerDiedException\) — no verdict on the app; .*2 steps on record, 2 in its log/);
  });

  it('knows Maestro’s other transport death too', () => {
    junit("maestro.DeviceUnreachableException: Device emulator-5554 is unreachable during 'tap': AdbException");
    commands([STEP]); maestroLog(1); deviceLog('');
    expect(decide({ kind: 'probe' }).why).toBe('run again: Maestro lost its connection to the phone (DeviceUnreachableException)');
  });

  it('reads Maestro’s own log for it when the JUnit report was never written', () => {
    commands([STEP]); deviceLog('');
    maestroLog(1, "01:28:00.000 [ERROR] maestro.cli.runner.TestSuiteInteractor.runFlow: Failed to complete flow\nmaestro.android.DeviceServerDiedException: Device server died during 'inputText'\n");
    expect(decide({ kind: 'probe' })).toMatchObject({ status: 0, verdict: 'retry' });
  });

  it('but not when the report names another reason — the report wins', () => {
    junit(ASSERTION); commands([STEP]); deviceLog('');
    maestroLog(1, "maestro.android.DeviceServerDiedException: Device server died during 'close'\n");
    expect(decide({ kind: 'probe' })).toMatchObject({ status: 1, why: 'not run again: a step failed, which is the app\'s answer' });
  });

  it('a lookalike class is not Maestro’s', () => {
    junit('com.example.DeviceServerDiedException: not Maestro'); commands([STEP]); maestroLog(1); deviceLog('');
    expect(decide({ kind: 'probe' })).toMatchObject({ status: 1, verdict: 'final' });
  });
});

describe('never run again, whatever Maestro said', () => {
  it('a failed step — the app’s answer', () => {
    junit(ASSERTION); commands([STEP, { ...STEP, metadata: { status: 'FAILED' } }]); maestroLog(2); deviceLog('');
    expect(decide({ kind: 'probe' })).toMatchObject({ status: 1, why: 'not run again: a step failed, which is the app\'s answer' });
  });

  it.each([124, 137])('a run that ran out of its time (exit %i)', (exit) => {
    neverBegan();
    expect(decide({ exit })).toMatchObject({ status: 1, why: 'not run again: it ran out of its time' });
  });

  it('a gone emulator', () => {
    neverBegan();
    expect(decide({ device: 'gone' })).toMatchObject({ status: 1, why: 'not run again: the emulator no longer answers' });
  });

  it('the app’s Java crash in the attempt’s device log', () => {
    neverBegan();
    deviceLog(line('01:27:18', 16631, 'E', 'AndroidRuntime', 'FATAL EXCEPTION: main') +
      line('01:27:18', 16631, 'E', 'AndroidRuntime', 'Process: com.reelhouse.society, PID: 16631') +
      line('01:27:18', 16631, 'E', 'AndroidRuntime', 'java.lang.IllegalStateException: boom'));
    expect(decide().why).toBe('not run again: the app crashed or froze during it — java.lang.IllegalStateException: boom');
  });

  it('the app’s freeze (ANR)', () => {
    neverBegan();
    deviceLog(line('01:27:18', 525, 'E', 'ActivityManager', 'ANR in com.reelhouse.society') +
      line('01:27:18', 525, 'E', 'ActivityManager', 'Reason: Input dispatching timed out'));
    expect(decide().why).toBe('not run again: the app crashed or froze during it — Input dispatching timed out');
  });

  it('Maestro’s own crash report for the app', () => {
    neverBegan();
    mkdirSync(join(FLOW_DIR(), 'logs'), { recursive: true });
    writeFileSync(join(FLOW_DIR(), 'logs', 'crash-report.txt'), 'java.lang.RuntimeException: from Maestro\n\tat x');
    expect(decide().why).toBe('not run again: the app crashed or froze during it — java.lang.RuntimeException: from Maestro');
  });

  it('but another process’s crash — Maestro’s own driver, as each run reinstalls it — is not the app’s', () => {
    neverBegan();
    deviceLog(line('01:27:19', 525, 'W', 'ActivityManager', 'Crash of app dev.mobile.maestro running instrumentation ComponentInfo{dev.mobile.maestro.test/androidx.test.runner.AndroidJUnitRunner}') +
      line('01:27:19', 900, 'E', 'AndroidRuntime', 'FATAL EXCEPTION: main') +
      line('01:27:19', 900, 'E', 'AndroidRuntime', 'Process: com.google.android.gms, PID: 900'));
    expect(decide()).toMatchObject({ status: 0, verdict: 'retry' });
  });

  it('a second attempt', () => {
    neverBegan();
    expect(decide({ attempt: 2 })).toMatchObject({ status: 1, why: 'not run again: Maestro never began a step, again, on its second attempt' });
  });

  it('a run that already ran the most attempts again', () => {
    neverBegan();
    expect(decide({ retries: 3 })).toMatchObject({ status: 1, why: 'not run again: Maestro never began a step, but this run has already run 3 attempts again (the most it may)' });
    expect(decide({ retries: 2 })).toMatchObject({ status: 0 });
  });

  it('too little time left', () => {
    neverBegan();
    expect(decide({ left: 1679, need: 1680 })).toMatchObject({ status: 1, why: 'not run again: Maestro never began a step, but 1679s are left and running it again needs 1680s' });
    expect(decide({ left: 1680, need: 1680 })).toMatchObject({ status: 0 });
  });

  it('no report from Maestro at all', () => {
    commands([STEP]); maestroLog(1); deviceLog('');
    expect(decide()).toMatchObject({ status: 1, why: 'not run again: Maestro left no report to read' });
  });
});

it('refuses to decide on arguments it cannot read', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--kind', 'flow'], { encoding: 'utf8' });
  expect(r.status).toBe(2);
  expect(r.stderr).toMatch(/^usage:/);
});

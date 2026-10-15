/**
 * runFlows.rehearsal.test.ts — the real run-flows.sh, against a fake phone and a fake Maestro.
 *
 * The decisions are tested in their own files (attempt, app-crashes, …); this
 * proves the WIRING: that the script calls them, with the right records, at the
 * right moments, and acts on what they say. Each scenario is a whole run:
 *
 *   - `adb` is a script that answers as the emulator does (settings, input
 *     methods, the clock, the window list) and streams a device log the fake
 *     Maestro writes to, so crashes and screen times reach the script as on CI.
 *   - `maestro` is a script that plays each flow's part from a scenario file
 *     (one behaviour per attempt: pass, never-began, lost-driver, step-failed,
 *     gone, crash-then-pass, takeover-then-pass, own-crash, failed-read-then-pass)
 *     and writes the phone's runtime and Maestro 2.10.0's own records: the JUnit
 *     report, commands.json under .maestro/tests/<time>/<flow>/, and its log. Every
 *     Maestro it plays leaves a session file behind, as a killed one would; every
 *     launch it plays logs ActivityManager's "Start proc" line, as Android does.
 *
 * Runs in bash: /bin/bash on CI, Git Bash on Windows (whose `timeout`, `awk` and
 * `tail -f` it uses). A missing bash fails here rather than skipping: a rehearsal
 * that does not run proves nothing.
 */
import { spawn } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'run-flows.sh');
const BASH = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
const SCREENS = Object.keys(JSON.parse(readFileSync(join(__dirname, '..', 'screen-ceilings.json'), 'utf8')));
const posix = (p: string) => p.replace(/\\/g, '/');

const ADB = `#!/usr/bin/env bash
T="__T__"
case "$1" in
  install) echo Success ;;
  root) echo "restarting adbd as root" ;;
  get-state) [ -f "$T/state/gone" ] && exit 1; echo device ;;
  logcat)
    shift
    case "$*" in
      -c) ;;
      "-v threadtime") [ -f "$T/state/dead-stream" ] && exit 0; exec tail -n +1 -f "$T/device.log" ;;
      *) cat "$T/device.log" ;;
    esac ;;
  exec-out) cat "$T/fixtures/dump.xml" ;;
  shell)
    shift; cmd="$*"
    case "$cmd" in
      "ime list -a -s") echo "com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME" ;;
      "pm disable"*) echo "Package x new state: disabled" ;;
      "settings get global "*_scale) cat "$T/state/\${cmd##* }" 2>/dev/null || echo 0.0 ;;
      "settings put global "*_scale" "*) set -- $cmd; echo "$5" > "$T/state/$4" ;;
      "settings get secure autofill_service") echo null ;;
      date*) case "$cmd" in *S.000*) date +'%m-%d %H:%M:%S.000' ;; *) date +'%m-%d %H:%M:%S' ;; esac ;;
      "dumpsys input_method") echo "mInputShown=true" ;;
      "dumpsys window windows") cat "$T/fixtures/windows.txt" ;;
      "pidof com.reelhouse.society") echo 16631 ;;
      # A launch, as Android logs it: the process, then the first screen ready, or React destroyed.
      "am start-activity"*)
        now=$(date +'%m-%d %H:%M:%S.000')
        echo "$now  523  543 I ActivityManager: Start proc 16631:com.reelhouse.society/u0a192 for next-top-activity" >> "$T/device.log"
        if [ -f "$T/state/motion-crash" ]; then
          echo "$now  16631  16631 W unknown:BridgelessReact: ReactHost{0}.handleHostException(message = \\"undefined is not a function\\")" >> "$T/device.log"
        else
          rt=$(cat "$T/state/runtime-name" 2>/dev/null || echo AbortController)
          echo "$now  16631  16651 W ReactNativeJS: [e2e] runtime {\\"of\\":\\"globalThis\\",\\"part\\":1,\\"parts\\":1,\\"names\\":[\\"$rt\\"]}" >> "$T/device.log"
          echo "$now  16631  16651 W ReactNativeJS: [e2e] screen.ready {\\"name\\":\\"welcome\\",\\"ms\\":100}" >> "$T/device.log"
        fi ;;
    esac ;;
esac
exit 0
`;

const MAESTRO = `#!/usr/bin/env bash
T="__T__"
echo "$*" >> "$T/state/calls"
# Every Maestro leaves its session behind, as one killed for its time would;
# the script must clear it before the next, or that one never starts its driver.
[ -e "$HOME/.maestro/sessions" ] && echo "$*" >> "$T/state/stale-sessions"
mkdir -p "$HOME/.maestro"; echo "MAESTRO_SESSION=1" > "$HOME/.maestro/sessions"
say() { echo "$(date +'%m-%d %H:%M:%S.000')  $1  $(( $1 + 20 )) $2 $3: $4" >> "$T/device.log"; }
if [ "$1" = hierarchy ]; then echo '{"attributes":{},"children":[]}'; exit 0; fi
flow="$2"; name=$(basename "$flow" .yaml); out=""; dbg=""
while [ $# -gt 0 ]; do case "$1" in --output) out="$2"; shift ;; --debug-output) dbg="$2"; shift ;; esac; shift; done
case "$flow" in *.tap.yaml) exit 0 ;; esac
n=$(( $(cat "$T/state/count-$name" 2>/dev/null || echo 0) + 1 )); echo $n > "$T/state/count-$name"
behaviour=$(sed -n "\${n}p" "$T/scenario/$name" 2>/dev/null); [ -z "$behaviour" ] && behaviour=pass
tests="$dbg/.maestro/tests/2026-10-04_0000$n"; mkdir -p "$tests/$name"
log="$tests/maestro.log"
echo "00:00:00.000 [ INFO] maestro.cli.runner.TestSuiteInteractor.runFlow:  Running flow $name" > "$log"
junit() {
  [ -n "$out" ] || return 0
  mkdir -p "$(dirname "$out")"
  if [ -n "\${1:-}" ]; then st=ERROR; fl="<failure>$1</failure>"; else st=SUCCESS; fl=""; fi
  printf '<?xml version="1.0" encoding="UTF-8"?>\\n<testsuites><testsuite name="Test Suite" tests="1"><testcase id="%s" name="%s" classname="%s" status="%s">%s</testcase></testsuite></testsuites>\\n' "$name" "$name" "$name" "$st" "$fl" > "$out"
}
step() { echo "00:00:01.000 [ INFO] maestro.cli.runner.CliConsoleListener.onCommandStart: $1 RUNNING" >> "$log"; }
pass() {
  say 523 I ActivityManager "Start proc 16631:com.reelhouse.society/u0a192 for next-top-activity {com.reelhouse.society/com.reelhouse.society.MainActivity}"
  step 'Launch app "com.reelhouse.society" with clear state'
  echo '[{"command":{"launchAppCommand":{}},"metadata":{"status":"COMPLETED"}}]' > "$tests/$name/commands.json"
  rt=$(cat "$T/state/runtime-name" 2>/dev/null || echo AbortController)
  say 16631 W ReactNativeJS "[e2e] runtime {\\"of\\":\\"globalThis\\",\\"part\\":1,\\"parts\\":1,\\"names\\":[\\"$rt\\"]}"
  for s in __SCREENS__; do say 16631 W ReactNativeJS "[e2e] screen.ready {\\"name\\":\\"$s\\",\\"ms\\":100}"; done
  junit; echo "[Passed] $name (1s)"; exit 0
}
case "$behaviour" in
  pass) pass ;;
  failed-read-then-pass)
    say 16631 W ReactNativeJS "[e2e] screen.failed {\\"name\\":\\"dispatch\\",\\"ms\\":100}"
    pass ;;
  takeover-then-pass)
    say 16631 D SplashScreenView "Building from parcel drawable: android.graphics.drawable.BitmapDrawable@82bf60a"
    pass ;;
  crash-then-pass)
    say 16631 E AndroidRuntime "FATAL EXCEPTION: main"
    say 16631 E AndroidRuntime "Process: com.reelhouse.society, PID: 16631"
    say 16631 E AndroidRuntime "java.lang.IllegalStateException: a rehearsed crash"
    pass ;;
  never-began)
    echo "maestro.android.DeviceServerDiedException: Device server died during 'deviceInfo'" >> "$log"
    junit "maestro.android.DeviceServerDiedException: Device server died during &apos;deviceInfo&apos; on emulator-5554 (1085ms since last byte, connection age 1726ms): StatusRuntimeException: UNAVAILABLE"
    echo "[Failed] $name (230ms)"; exit 1 ;;
  lost-driver|lost-driver-and-a-scale)
    # The second: the emulator also lost its window animation setting on the way down.
    [ "$behaviour" = lost-driver-and-a-scale ] && echo 1.0 > "$T/state/window_animation_scale"
    step 'Launch app'; step 'Input text \${E2E_MEMBER_EMAIL}'
    echo '[{"command":{"launchAppCommand":{}},"metadata":{"status":"COMPLETED"}},{"command":{"inputTextCommand":{"text":"x"}},"metadata":{"status":"RUNNING"}}]' > "$tests/$name/commands.json"
    junit "maestro.android.DeviceServerDiedException: Device server died during &apos;inputText&apos; on emulator-5554 (120041ms since last byte)"
    echo "[Failed] $name (2m 4s)"; exit 1 ;;
  gone)
    step 'Launch app'; step 'Tap on id: profile-tab'
    touch "$T/state/gone"
    echo '[{"command":{"launchAppCommand":{}},"metadata":{"status":"COMPLETED"}},{"command":{"tapOnElement":{"selector":{"idRegex":"profile-tab"}}},"metadata":{"status":"RUNNING"}}]' > "$tests/$name/commands.json"
    junit "maestro.DeviceUnreachableException: Device emulator-5554 is unreachable during &apos;tap&apos;: AdbException"
    echo "[Failed] $name (31s)"; exit 1 ;;
  own-crash)
    # Build 41's own crash, in the words of run 38679641286, then the step it failed.
    say 523 I ActivityManager "Start proc 16631:com.reelhouse.society/u0a192 for next-top-activity {com.reelhouse.society/com.reelhouse.society.MainActivity}"
    step 'Launch app'; step 'Tap on id: darkroom-search-input'
    say 16631 W unknown:BridgelessReact 'ReactHost{0}.handleHostException(message = "Unable to find viewState for tag 2450. Surface stopped: false")'
    say 16631 W unknown:ReactNative "Tried to enqueue runnable on already finished thread: 'v_native... dropping Runnable."
    echo '[{"command":{"launchAppCommand":{}},"metadata":{"status":"COMPLETED"}},{"command":{"tapOnElement":{"selector":{"idRegex":"darkroom-search-input"}}},"metadata":{"status":"FAILED"}}]' > "$tests/$name/commands.json"
    junit "Element not found: Id matching regex: darkroom-search-input"
    echo "[Failed] $name (1m 38s) (Element not found: Id matching regex: darkroom-search-input)"; exit 1 ;;
  step-failed)
    step 'Launch app'; step 'Assert that id: profile-tab is visible'
    echo '[{"command":{"launchAppCommand":{}},"metadata":{"status":"COMPLETED"}},{"command":{"assertConditionCommand":{"condition":{"visible":{"idRegex":"profile-tab"}}}},"metadata":{"status":"FAILED","error":{"message":"Assertion is false: id: profile-tab is visible"}}}]' > "$tests/$name/commands.json"
    junit "Assertion is false: id: profile-tab is visible"
    echo "[Failed] $name (9s) (Assertion is false: id: profile-tab is visible)"; exit 1 ;;
esac
exit 3
`;

// The keyboard up, as Android lists it, and the app's window with both probes' targets clear of it.
const WINDOWS = [
  '  Window #3 Window{a1 u0 InputMethod}:',
  '    mViewVisibility=0x0 mHaveFrame=true mObscured=false',
  '    mGivenContentInsets=[0,1389][0,0] mGivenVisibleInsets=[0,1389][0,0]',
  '    Frames: parent=[0,128][1080,2400] display=[0,128][1080,2400] frame=[0,128][1080,2400] last=[0,128][1080,2400]',
  '    isOnScreen=true',
  '  Window #4 Window{b2 u0 com.reelhouse.society/com.reelhouse.society.MainActivity}:',
  '    mDrawState=HAS_DRAWN',
].join('\n');
const DUMP = '<?xml version="1.0" encoding="UTF-8"?><hierarchy rotation="0">' +
  '<node index="0" text="FILE THE STACK" resource-id="" content-desc="" bounds="[600,1300][1000,1367]" />' +
  '<node index="1" text="" resource-id="com.reelhouse.society:id/review-input" content-desc="" bounds="[60,1400][1020,1517]" /></hierarchy>';

interface Run { status: number | null; stdout: string; stderr: string; T: string; out: string }

// Every run's folder goes when the file is done, passed or failed: a failed
// expectation must not leave a whole fake run behind in the temp folder.
const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

/** One whole run: `flows` are the top-level flows; `scenario` each flow's behaviour, one per attempt. */
function rehearse(flows: string[], scenario: Record<string, string[]>, opts: { env?: Record<string, string>; state?: Record<string, string> } = {}): Promise<Run> {
  const T = posix(mkdtempSync(join(tmpdir(), 'rehearsal-')));
  made.push(T);
  for (const d of ['bin', 'home', 'out', 'state', 'scenario', 'fixtures', 'flows/keyboard']) mkdirSync(join(T, d), { recursive: true });
  writeFileSync(join(T, 'bin', 'adb'), ADB.replace(/__T__/g, T), { mode: 0o755 });
  writeFileSync(join(T, 'bin', 'maestro'), MAESTRO.replace(/__T__/g, T).replace('__SCREENS__', SCREENS.join(' ')), { mode: 0o755 });
  writeFileSync(join(T, 'fixtures', 'windows.txt'), WINDOWS);
  writeFileSync(join(T, 'fixtures', 'dump.xml'), DUMP);
  // The device's clock is the runner's local one (the fake adb answers with `date`), so its first line is too.
  const now = new Date();
  const local = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${now.toTimeString().slice(0, 8)}`;
  writeFileSync(join(T, 'device.log'), `${local}.000  525  545 I ActivityManager: the device boots\n`);
  for (const f of [...flows, 'config']) writeFileSync(join(T, 'flows', `${f}.yaml`), 'appId: com.reelhouse.society\n---\n');
  for (const f of ['stack', 'stack.tap', 'log', 'log.tap']) writeFileSync(join(T, 'flows', 'keyboard', `${f}.yaml`), 'appId: com.reelhouse.society\n---\n');
  for (const [name, steps] of Object.entries(scenario)) writeFileSync(join(T, 'scenario', name), `${steps.join('\n')}\n`);
  for (const [k, v] of Object.entries(opts.state ?? {})) writeFileSync(join(T, 'state', k), v);
  // The committed copy of the phone's runtime, as the fake launches write it.
  writeFileSync(join(T, 'fixtures', 'phone-runtime.json'), JSON.stringify({ globalThis: ['AbortController'] }));
  const env = {
    ...process.env,
    PATH: `${join(T, 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
    HOME: T + '/home', RUNNER_TEMP: T + '/out', E2E_FLOWS: T + '/flows', MAESTRO_BIN: T + '/bin/maestro',
    E2E_MEMBER_EMAIL: 'e2e_member@e2e.test', E2E_MEMBER_PASSWORD: 'rehearsal-Pw_0123456789x', E2E_MEMBER_USERNAME: 'e2e_member',
    GITHUB_STEP_SUMMARY: T + '/summary.md', E2E_MOTION_SECONDS: '1',
    E2E_RUNTIME_COPY: T + '/fixtures/phone-runtime.json',
    ...opts.env,
  };
  return new Promise((resolve, reject) => {
    const child = spawn(BASH, [posix(SCRIPT)], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr, T, out: T + '/out' }));
  });
}

const calls = (r: Run, name: string) => (existsSync(join(r.T, 'state', 'calls')) ? readFileSync(join(r.T, 'state', 'calls'), 'utf8') : '')
  .split('\n').filter((l) => new RegExp(`^test \\S*/${name}\\.yaml`).test(l)).length;
const annotations = (r: Run, level: string) => r.stdout.split('\n').filter((l) => l.startsWith(`::${level} title=`));
const titled = (r: Run, level: string, title: string) => annotations(r, level).find((l) => l.startsWith(`::${level} title=${title}::`)) ?? '';
const file = (r: Run, ...p: string[]) => readFileSync(join(r.out, ...p), 'utf8');

/** What holds in every run, whatever its scenario. */
function always(r: Run) {
  // CRLF or any other shell slip shows up here first.
  expect(r.stderr).not.toMatch(/\$'\\r'|command not found|syntax error|unbound variable/);
  // No Maestro started over a session an earlier one left.
  expect(existsSync(join(r.T, 'state', 'stale-sessions')) ? readFileSync(join(r.T, 'state', 'stale-sessions'), 'utf8') : '').toBe('');
  // The password never reaches an annotation.
  expect(r.stdout).not.toMatch(/^::.*rehearsal-Pw_0123456789x/m);
}

// One whole run at a time, as a single test file should load the machine: six at once
// started dozens of shells together and slowed the suite's other files past their 5 s.
jest.setTimeout(300_000);

it('runs in bash, as stored: LF line endings', () => {
  expect(existsSync(BASH) || BASH === 'bash').toBe(true);
  expect(readFileSync(SCRIPT, 'utf8')).not.toContain('\r');
});

it('a hiccup is run again and the run is green, with a warning that says so', async () => {
  const r = await rehearse(['a_flow', 'b_flow'], { stack: ['lost-driver-and-a-scale', 'pass'], a_flow: ['never-began', 'pass'] });
  expect({ status: r.status, errors: annotations(r, 'error') }).toEqual({ status: 0, errors: [] });
  expect([calls(r, 'stack'), calls(r, 'a_flow'), calls(r, 'b_flow')]).toEqual([2, 2, 1]);
  const twice = titled(r, 'warning', 'Run twice  2 attempts told nothing about the app');
  expect(twice).toContain('the stack probe — run again: Maestro lost its connection to the phone (DeviceServerDiedException)');
  expect(twice).toContain('a_flow — run again: Maestro never began a step');
  expect(file(r, 'maestro-summary.txt')).toMatch(/^\[Retried\] a_flow \(its first attempt, \d+s: Maestro never began a step\)\n\[Passed\] a_flow \(1s\)\n\[Passed\] b_flow \(1s\)\n$/);
  // The first attempts are kept whole, and out of the final reports.
  expect(existsSync(join(r.out, 'first-attempts', 'a_flow', 'a_flow.xml'))).toBe(true);
  expect(existsSync(join(r.out, 'first-attempts', 'keyboard-stack', 'keyboard-stack.xml'))).toBe(true);
  expect(file(r, 'flow-reports', 'a_flow.xml')).toContain('status="SUCCESS"');
  // The animation scale the emulator had lost is put back, and said so.
  expect(titled(r, 'warning', "The phone's animations were not off")).toContain("before the stack probe: window_animation_scale was '1.0'; set to 0");
  expect(readFileSync(join(r.T, 'state', 'window_animation_scale'), 'utf8').trim()).toBe('0');
  expect(file(r, 'keyboard-room.txt')).toMatch(/^stack: "FILE THE STACK" clear/m);
  always(r);
});

it('the app’s answers are never run again: a failed step, and a flow that lost its driver once begun', async () => {
  const r = await rehearse(['a_flow', 'b_flow'], { a_flow: ['step-failed', 'pass'], b_flow: ['lost-driver', 'pass'] });
  expect(r.status).toBe(1);
  expect([calls(r, 'a_flow'), calls(r, 'b_flow')]).toEqual([1, 1]);
  expect(titled(r, 'error', 'E2E flows failed')).toContain('[Failed] a_flow (9s) (Assertion is false: id: profile-tab is visible)');
  expect(r.stdout).toContain("decided: not run again: a step failed, which is the app's answer");
  expect(r.stdout).toContain('decided: not run again: Maestro lost its driver (DeviceServerDiedException) — no verdict on the app');
  expect(titled(r, 'warning', 'Run twice')).toBe('');
  always(r);
});

it('a crash fails a run whose every flow passed — and the flows are not blamed for it', async () => {
  const r = await rehearse(['a_flow', 'b_flow'], { b_flow: ['crash-then-pass'] });
  expect(r.status).toBe(1);
  expect(titled(r, 'error', 'The app crashed or froze during the run')).toContain('crash during b_flow: java.lang.IllegalStateException: a rehearsed crash');
  expect(titled(r, 'error', 'E2E flows failed')).toBe('');
  expect(titled(r, 'notice', 'Every flow passed — the run failed on what the other errors name')).toContain('[Passed] b_flow');
  always(r);
});

describe('a shipped client\'s own crash (E2E_OLD_CLIENT, from the real old-clients.json)', () => {
  const OLD = { E2E_OLD_CLIENT: 'TestFlight build 41' };
  const OWN = "TestFlight build 41's own crash, class RN-react-destroyed-on-mount, fixed in 10a39fa3";

  it('is run again once; twice, its flow is not judged and listed; the run is green', async () => {
    const r = await rehearse(['a_flow', 'b_flow'], { a_flow: ['own-crash', 'pass'], b_flow: ['own-crash', 'own-crash'] }, { env: OLD });
    expect({ status: r.status, errors: annotations(r, 'error') }).toEqual({ status: 0, errors: [] });
    expect([calls(r, 'a_flow'), calls(r, 'b_flow')]).toEqual([2, 2]);
    expect(file(r, 'maestro-summary.txt')).toMatch(new RegExp(
      `^\\[Retried\\] a_flow \\(its first attempt, \\d+s: ${OWN}\\)\\n\\[Passed\\] a_flow \\(1s\\)\\n` +
      `\\[Retried\\] b_flow \\(its first attempt, \\d+s: ${OWN}\\)\\n` +
      "\\[Not judged\\] b_flow \\(TestFlight build 41's own crash, twice: class RN-react-destroyed-on-mount\\)\\n$"));
    expect(file(r, 'maestro.log')).toContain('Maestro: failed, not counted: b_flow (1m 38s)');
    expect(titled(r, 'warning', "Not judged — 1 ended by TestFlight build 41's own crash")).toContain('[Not judged] b_flow');
    // Build 41 is older than the runtime dump: its run never asks for one.
    expect(file(r, 'runtime-dump.txt')).toMatch(/^Not judged: TestFlight build 41 writes no runtime/);
    const gate = titled(r, 'warning', "No crash or freeze but TestFlight build 41's own");
    expect(gate).toContain(`${OWN}: during a_flow:`);
    expect(gate).toContain(`${OWN}: during b_flow (attempt 2):`);
    // verify-writes.mjs's list: a_flow may have saved twice, b_flow is not checked.
    expect(file(r, 'own-crash-flows.txt')).toBe('a_flow\tretried\nb_flow\tretried\nb_flow\tnot-judged\n');
    always(r);
  });

  it('fails a flow that fails for any other reason, own crash before it or not, and any other crash', async () => {
    const r = await rehearse(['a_flow', 'b_flow', 'c_flow'],
      { a_flow: ['own-crash', 'step-failed'], b_flow: ['step-failed', 'pass'], c_flow: ['crash-then-pass'] }, { env: OLD });
    expect(r.status).toBe(1);
    expect([calls(r, 'a_flow'), calls(r, 'b_flow'), calls(r, 'c_flow')]).toEqual([2, 1, 1]);
    const failed = titled(r, 'error', 'E2E flows failed');
    expect(failed).toContain('[Failed] a_flow (9s)');
    expect(failed).toContain('[Failed] b_flow (9s)');
    expect(file(r, 'not-judged.txt')).toBe('');
    const said = titled(r, 'error', 'The app crashed or froze during the run');
    expect(said).toContain('crash during c_flow: java.lang.IllegalStateException: a rehearsed crash');
    expect(said).toContain(`${OWN}: during a_flow:`);
    always(r);
  });

  it('is the app\'s crash in a run of this app: not run again, and the run fails', async () => {
    const r = await rehearse(['a_flow'], { a_flow: ['own-crash', 'pass'] }, { env: { E2E_OLD_CLIENT: '' } });
    expect(r.status).toBe(1);
    expect(calls(r, 'a_flow')).toBe(1);
    expect(titled(r, 'error', 'The app crashed or froze during the run')).toContain('JS error (React instance destroyed) during a_flow: Unable to find viewState for tag 2450');
    expect(r.stdout).toContain('decided: not run again: the app crashed or froze during it — Unable to find viewState for tag 2450');
    expect(existsSync(join(r.out, 'own-crashes.json'))).toBe(false);
    always(r);
  });
});

it('at most three attempts a run are run again', async () => {
  const flows = ['a_flow', 'b_flow', 'c_flow', 'd_flow'];
  const r = await rehearse(flows, Object.fromEntries(flows.map((f) => [f, ['never-began', 'pass']])));
  expect(r.status).toBe(1);
  expect(flows.map((f) => calls(r, f))).toEqual([2, 2, 2, 1]);
  expect(r.stdout).toContain('decided: not run again: Maestro never began a step, but this run has already run 3 attempts again (the most it may)');
  always(r);
});

it('a log copy that stopped cannot vouch for the run', async () => {
  const r = await rehearse(['a_flow'], {}, { state: { 'dead-stream': '1' } });
  expect(r.status).toBe(1);
  expect(titled(r, 'error', 'The app crashed or froze during the run')).toContain('the device log copy had stopped before the run ended');
  always(r);
});

it('a probe is run again only from time the flows do not need', async () => {
  // Two flows keep 240s; eight minutes leave the probe about 235s, and running it again needs 240 above theirs.
  const r = await rehearse(['a_flow', 'b_flow'], { stack: ['lost-driver', 'pass'] }, { env: { E2E_FLOWS_MINUTES: '8' } });
  expect(r.status).toBe(1);
  expect(calls(r, 'stack')).toBe(1);
  expect(titled(r, 'error', 'The keyboard covers what a member needs')).toMatch(/not run again: Maestro lost its connection to the phone \(DeviceServerDiedException\), but -?\d+s are left and running it again needs 240s/);
  // The flows still ran, whole.
  expect([calls(r, 'a_flow'), calls(r, 'b_flow')]).toEqual([1, 1]);
  always(r);
});

it('a launch that takes Android\'s splash over fails the run, though every flow passed', async () => {
  const r = await rehearse(['a_flow'], { a_flow: ['takeover-then-pass'] });
  expect(r.status).toBe(1);
  expect(titled(r, 'error', "The app took Android's splash over")).toContain("took Android's splash over on 1 of 1 launch.");
  expect(titled(r, 'error', 'E2E flows failed')).toBe('');
  always(r);
});

it('a launch with animations on that destroys React fails the run, though every flow passed', async () => {
  const r = await rehearse(['a_flow'], { a_flow: ['pass'] }, { state: { 'motion-crash': '' } });
  expect(r.status).toBe(1);
  const said = titled(r, 'error', 'A launch with animations on failed');
  expect(said).toContain('JS error (React instance destroyed)');
  expect(said).toContain('no screen said it was ready');
  expect(titled(r, 'error', 'E2E flows failed')).toBe('');
  always(r);
});

it('a launch with animations on that lives and draws passes, and says so', async () => {
  const r = await rehearse(['a_flow'], { a_flow: ['pass'] });
  expect(r.status).toBe(0);
  expect(file(r, 'motion', 'result.txt')).toBe('A launch with animations on: alive at 1 s (pid 16631), no crash, the first screen ready.\n');
  // The phone's runtime is the copy, and kept with the logs.
  expect(file(r, 'runtime-dump.txt')).toMatch(/^The phone's runtime, written by 1 launch, is the committed copy/);
  expect(JSON.parse(file(r, 'phone-runtime.json'))).toEqual({ globalThis: ['AbortController'] });
  always(r);
});

it('a screen whose read failed fails a run whose every flow passed — but not in the flow that cuts the network', async () => {
  const r = await rehearse(['a_flow', 'offline_resilience'], { a_flow: ['failed-read-then-pass'], offline_resilience: ['failed-read-then-pass'] });
  expect(r.status).toBe(1);
  const said = titled(r, 'error', 'A screen could not read or is slower than its ceiling');
  expect(said).toContain('dispatch could not read during a_flow');
  expect(said).not.toContain('during offline_resilience');
  expect(titled(r, 'error', 'E2E flows failed')).toBe('');
  always(r);
});

it('a phone runtime that is not the committed copy fails the run, naming what changed', async () => {
  const r = await rehearse(['a_flow'], { a_flow: ['pass'] }, { state: { 'runtime-name': 'AbortSignal' } });
  expect(r.status).toBe(1);
  const said = titled(r, 'error', "The phone's runtime is not the committed copy");
  expect(said).toContain('globalThis: the phone has AbortSignal, the copy does not');
  expect(said).toContain('globalThis: the copy has AbortController, the phone does not');
  expect(titled(r, 'error', 'E2E flows failed')).toBe('');
  always(r);
});

it('an emulator that goes away is reported as gone: its flow is not run again, and the rest are skipped, not blamed', async () => {
  const r = await rehearse(['a_flow', 'b_flow'], { a_flow: ['gone', 'pass'] });
  expect(r.status).toBe(1);
  expect([calls(r, 'a_flow'), calls(r, 'b_flow')]).toEqual([1, 0]);
  expect(file(r, 'maestro-summary.txt')).toBe(
    '[Failed] a_flow (31s)\n[Gone] the emulator went away during a_flow\n[Skipped] b_flow (the emulator was gone)\n');
  expect(file(r, 'flow-hierarchy', 'a_flow.verdict')).toContain('not run again: the emulator no longer answers');
  expect(titled(r, 'error', 'The emulator went away during the flows')).toContain('adb no longer sees the emulator');
  expect(titled(r, 'error', 'The app crashed or froze during the run')).toContain('the device did not answer for its clock');
  always(r);
});

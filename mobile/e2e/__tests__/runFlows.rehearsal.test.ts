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
 * A run with E2E_SHARD is one machine's part, by a map of the scenario's own
 * flows (E2E_SHARD_MAP); every other run has none, and is the whole run.
 *
 * Runs in bash: /bin/bash on CI, Git Bash on Windows (whose `timeout`, `awk` and
 * `tail -f` it uses). A missing bash fails here rather than skipping: a rehearsal
 * that does not run proves nothing.
 */
import { spawn } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';

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
    # adb hands the device what it reads on its own input, as the real one does: a loop that
    # reads its lines from the same input loses the rest of them to the first command.
    cat > /dev/null
    # Every command, in the order the phone was asked, with Maestro's flows among them.
    echo "adb: $cmd" >> "$T/state/order"
    case "$cmd" in
      # The system's dark mode, as Android answers it; a phone whose read fails, as one that went away.
      "cmd uimode night") [ -f "$T/state/night-unread" ] && { echo "error: closed"; exit 1; }; echo "Night mode: no" ;;
      "cmd uimode night "*) echo "Night mode: \${cmd##* }" ;;
      # The system's language: read, then set with the system restarted, which takes it a while.
      "l="*) echo "en-US" ;;
      "setprop persist.sys.locale "*) echo 0 > "$T/state/config-asked" ;;
      "am get-config | grep -q ldrtl")
        [ -f "$T/state/never-rtl" ] && exit 1
        n=$(( $(cat "$T/state/config-asked") + 1 )); echo $n > "$T/state/config-asked"; [ $n -ge 3 ] || exit 1 ;;
      "ime list -a -s") echo "com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME" ;;
      "pm disable"*) echo "Package x new state: disabled" ;;
      "settings get global "*_scale) cat "$T/state/\${cmd##* }" 2>/dev/null || echo 0.0 ;;
      "settings put global "*_scale" "*) set -- $cmd; echo "$5" > "$T/state/$4" ;;
      "settings get secure autofill_service") echo null ;;
      date*) case "$cmd" in *S.%3N*) date +'%m-%d %H:%M:%S.%3N' ;; *S.000*) date +'%m-%d %H:%M:%S.000' ;; *) date +'%m-%d %H:%M:%S' ;; esac ;;
      "dumpsys input_method") echo "mInputShown=true" ;;
      "dumpsys window windows") cat "$T/fixtures/windows.txt" ;;
      "pidof com.reelhouse.society") echo 16631 ;;
      # The phone's load: each ask takes the next of a scenario's (state/loads), then a quiet phone's.
      "cat /proc/loadavg") l=0.42; if [ -s "$T/state/loads" ]; then l=$(head -n 1 "$T/state/loads"); sed -i 1d "$T/state/loads"; fi; echo "$l 0.50 0.60 1/300 4242" ;;
      "dumpsys meminfo 16631") printf '** MEMINFO in pid 16631 [com.reelhouse.society] **\\n App Summary\\n           Native Heap:    41984\\n' ;;
      # A launch, as Android logs it: the process, then the first screen ready, or React destroyed.
      "am start-activity"*)
        now=$(date +'%m-%d %H:%M:%S.%3N')
        echo "$now  523  543 I ActivityManager: Start proc 16631:com.reelhouse.society/u0a192 for next-top-activity" >> "$T/device.log"
        echo "$now  523  560 I ActivityTaskManager: Displayed com.reelhouse.society/.MainActivity for user 0: +1s234ms" >> "$T/device.log"
        printf 'Status: ok\\nLaunchState: COLD\\nTotalTime: 1312\\nWaitTime: 1320\\nComplete\\n'
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
say() { echo "$(date +'%m-%d %H:%M:%S.%3N')  $1  $(( $1 + 20 )) $2 $3: $4" >> "$T/device.log"; }
if [ "$1" = hierarchy ]; then echo '{"attributes":{},"children":[]}'; exit 0; fi
flow="$2"; name=$(basename "$flow" .yaml); out=""; dbg=""; shots=""
while [ $# -gt 0 ]; do case "$1" in --output) out="$2"; shift ;; --debug-output) dbg="$2"; shift ;; --test-output-dir) shots="$2"; shift ;; esac; shift; done
case "$flow" in *.tap.yaml) exit 0 ;; esac
echo "maestro: $name" >> "$T/state/order"
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
  # The route walk: a picture of every route its plan (walk.tsv, beside the flow) names.
  captures|captures-and-a-cut)
    # The second: a label the app says it cut on the way (src/components/text).
    [ "$behaviour" = captures-and-a-cut ] && say 16631 W ReactNativeJS "[e2e] text.cut {\\"words\\":\\"FOUNDING MEMBER\\",\\"cut\\":\\"ended early\\",\\"lines\\":1,\\"numberOfLines\\":1}"
    # As Maestro 2.10 does: a capture is a name inside its output folder (--test-output-dir), and a
    # path that leaves it fails the flow at that step (run 38991748010).
    if grep -qE '^- takeScreenshot: "(/|[A-Za-z]:)' "$flow" || [ -z "$shots" ]; then
      junit "Invalid path for takeScreenshot: it resolves outside this run's takeScreenshot output folder"
      echo "[Failed] $name (1s)"; exit 1
    fi
    mkdir -p "$shots/2026-10-17_000000"
    # A moment's fourth column, the part of it that is the app's, is no part of its capture's name.
    while IFS="$(printf '\\t')" read -r _ _ shot _; do
      { printf '\\211PNG'; head -c 2048 /dev/zero; } > "$shots/2026-10-17_000000/$shot"
    done < "$(dirname "$flow")/walk.tsv"
    pass ;;
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
function rehearse(flows: string[], scenario: Record<string, string[]>, opts: { env?: Record<string, string>; state?: Record<string, string>; map?: object } = {}): Promise<Run> {
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
  // A shard map of the scenario's own flows, where a run is one shard of them.
  if (opts.map) writeFileSync(join(T, 'fixtures', 'shards.json'), JSON.stringify(opts.map));
  const env = {
    ...process.env,
    PATH: `${join(T, 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
    HOME: T + '/home', RUNNER_TEMP: T + '/out', E2E_FLOWS: T + '/flows', MAESTRO_BIN: T + '/bin/maestro',
    E2E_MEMBER_EMAIL: 'e2e_member@e2e.test', E2E_MEMBER_PASSWORD: 'rehearsal-Pw_0123456789x', E2E_MEMBER_USERNAME: 'e2e_member',
    GITHUB_STEP_SUMMARY: T + '/summary.md', E2E_MOTION_SECONDS: '1',
    E2E_RUNTIME_COPY: T + '/fixtures/phone-runtime.json',
    // No shard unless a scenario names one: then the run is the whole run.
    E2E_SHARD: '',
    ...(opts.map ? { E2E_SHARD_MAP: T + '/fixtures/shards.json' } : {}),
    ...opts.env,
  };
  return new Promise((resolve, reject) => {
    // No input, as on CI: the fake adb reads its input to the end, as the real one does.
    const child = spawn(BASH, [posix(SCRIPT)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
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
  // With no shard, the whole run: the probes too, and no shard's records.
  expect([calls(r, 'stack'), calls(r, 'log'), calls(r, 'a_flow')]).toEqual([1, 1, 1]);
  expect(['flows-run.txt', 'screen-record.json', 'shard-plan.txt'].filter((f) => existsSync(join(r.out, f)))).toEqual([]);
  // The phone's runtime is the copy, and kept with the logs.
  expect(file(r, 'runtime-dump.txt')).toMatch(/^The phone's runtime, written by 1 launch, is the committed copy/);
  expect(JSON.parse(file(r, 'phone-runtime.json'))).toEqual({ globalThis: ['AbortController'] });
  always(r);
});

describe('one shard of the flows (E2E_SHARD, with a map of the scenario\'s flows)', () => {
  const FLOWS = ['a_flow', 'b_flow', 'c_flow', 'd_flow', 'new_flow'];
  const MAP = { shards: [
    { keyboardProbes: true, launchWithAnimations: true, flows: ['a_flow'] },
    { flows: ['c_flow', 'b_flow'] },
    { flows: ['d_flow'] },
  ] };
  const ran = (r: Run) => FLOWS.filter((f) => calls(r, f) > 0);

  it('runs only its own flows, in order, with no probe and no launch with animations on, its app launched once before them, and lists them', async () => {
    const r = await rehearse(FLOWS, {}, { map: MAP, env: { E2E_SHARD: '2/3' } });
    expect({ status: r.status, errors: annotations(r, 'error') }).toEqual({ status: 0, errors: [] });
    expect([ran(r), calls(r, 'stack'), calls(r, 'log')]).toEqual([['b_flow', 'c_flow'], 0, 0]);
    expect(file(r, 'maestro-summary.txt')).toBe('[Passed] b_flow (1s)\n[Passed] c_flow (1s)\n');
    expect(existsSync(join(r.out, 'motion', 'am.txt'))).toBe(false);
    expect(file(r, 'motion', 'result.txt')).toBe('The launch with animations on runs in another shard (e2e/shards.json); this shard launched the app once before its flows.\n');
    // That launch measured, then the app stopped, before the shard's first flow (run 39625257830).
    const asked = readFileSync(join(r.T, 'state', 'order'), 'utf8').split('\n');
    const launch = asked.findIndex((l) => l.startsWith('adb: am start-activity'));
    const heap = asked.indexOf('adb: dumpsys meminfo 16631');
    const stop = asked.findIndex((l, i) => i > heap && l.startsWith('adb: am force-stop'));
    expect([launch >= 0, heap > launch, stop > heap, asked.findIndex((l) => l.startsWith('maestro: ')) > stop]).toEqual([true, true, true, true]);
    // Its row in the cold-start table, each of its cells measured, and the table on the summary as one.
    const rows = file(r, 'cold-start.txt').split('\n').filter((l) => l.startsWith('| '));
    expect(rows[0]).toBe('| # | launch | Displayed | first screen ready (after start) | skipped frames | Davey frames | am TotalTime | native heap at ready |');
    expect(rows.find((l) => l.includes('the measured launch'))).toMatch(/^\| 1 \| the measured launch \(run-flows\.sh\) \| 1234 ms \| welcome, \d+ ms \| 0 \| 0 \| 1312 ms \| 41\.0 MB \|$/);
    expect(readFileSync(join(r.T, 'summary.md'), 'utf8')).toContain('### How each launch went\n\n| # | launch |');
    expect(file(r, 'keyboard-room.txt')).toBe("The keyboard's probes run in another shard (e2e/shards.json).\n");
    expect(file(r, 'flows-run.txt')).toBe('b_flow\nc_flow\n');
    // Its screens, for the verdict: every flow ran to its end.
    expect(JSON.parse(file(r, 'screen-record.json'))).toEqual({ complete: true, reported: [...SCREENS].sort() });
    always(r);
  });

  it('runs the probes and the launch with animations on where the map puts them', async () => {
    const r = await rehearse(FLOWS, {}, { map: MAP, env: { E2E_SHARD: '1/3' } });
    expect({ status: r.status, errors: annotations(r, 'error') }).toEqual({ status: 0, errors: [] });
    expect([ran(r), calls(r, 'stack'), calls(r, 'log')]).toEqual([['a_flow'], 1, 1]);
    expect(file(r, 'motion', 'result.txt')).toBe('A launch with animations on: alive at 1 s (pid 16631), no crash, the first screen ready.\n');
    // The measured launch comes after the one with animations on, the same pid read again by its line.
    expect(file(r, 'cold-start.txt')).toMatch(/^\| 1 \| before the first flow \| 1234 ms \|.*\| not measured: am's time is taken at the measured launch alone \|.*\n\| 2 \| the measured launch \(run-flows\.sh\) \| 1234 ms \|.*\| 1312 ms \| 41\.0 MB \|$/m);
    expect(file(r, 'keyboard-room.txt')).toMatch(/^stack: "FILE THE STACK" clear/m);
    expect(file(r, 'flows-run.txt')).toBe('a_flow\n');
    always(r);
  });

  it('runs a flow the map does not name in the last shard, and says so', async () => {
    const r = await rehearse(FLOWS, {}, { map: MAP, env: { E2E_SHARD: '3/3' } });
    expect({ status: r.status, errors: annotations(r, 'error') }).toEqual({ status: 0, errors: [] });
    expect([ran(r), calls(r, 'stack')]).toEqual([['d_flow', 'new_flow'], 0]);
    expect(titled(r, 'notice', 'Shard 3/3  flows out of e2e/shards.json'))
      .toContain('new_flow is in no shard of the map, so it runs here, in the last');
    expect(file(r, 'flows-run.txt')).toBe('d_flow\nnew_flow\n');
    always(r);
  });
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

describe('a variant run (E2E_VARIANT): the phone set before the run touches it, and put back at its end', () => {
  // The sealed world's rows, as the walk reads them back by name (walkRoutes.test.ts holds the reads).
  let world: Server;
  let API = '';
  beforeAll(async () => {
    world = createServer((req, res) => {
      const path = req.url ?? '';
      const rows = path.includes('profiles') ? [{ id: 'm-1' }]
        : path.includes('title=eq.E2E%20walk%20essay') ? [{ id: 'd-1', series_id: 's-1' }]
          : path.includes('dispatch_posts') ? [{ id: 'f-1' }]
            : path.includes('/lists') ? [{ id: 'st-1' }]
              : path.includes('/logs') ? [{ id: 'l-1' }]
                : path.includes('/lounges') ? [{ id: 'lo-1' }] : [];
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(rows));
    });
    await new Promise<void>((done) => world.listen(0, '127.0.0.1', done));
    API = `http://127.0.0.1:${(world.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((done) => world.close(() => done())));

  const WALK_MAP = JSON.parse(readFileSync(join(__dirname, '..', 'walk-shards.json'), 'utf8'));
  const walk = (variant: string, scenario: Record<string, string[]>, state: Record<string, string> = {}) => rehearse([], scenario, {
    map: WALK_MAP, state,
    env: { E2E_SHARD: '1/1', E2E_FLOWS: 'none', E2E_WALK: '1', E2E_VARIANT: variant, API_URL: API, SERVICE_ROLE_KEY: 'rehearsal-key' },
  });
  /** One machine of the flows of a variant that runs them: its flows, no walk. */
  const flows = (variant: string, scenario: Record<string, string[]>, state: Record<string, string> = {}, env: Record<string, string> = {}) =>
    rehearse(['a_flow'], scenario, { state, env: { E2E_VARIANT: variant, ...env } });
  /** What the phone was asked about the variant, and every Maestro run among it, in order. */
  const VARIANT_SAID = /uimode|font_scale|persist\.sys\.locale|ldrtl|^adb: l=|^maestro: /;
  const order = (r: Run, said = VARIANT_SAID) => (existsSync(join(r.T, 'state', 'order')) ? readFileSync(join(r.T, 'state', 'order'), 'utf8') : '')
    .split('\n').filter((l) => said.test(l));

  it('reads the mode the phone had, sets the variant, walks, and puts back exactly what it read', async () => {
    const r = await walk('dark', { walk: ['captures'] });
    expect({ status: r.status, errors: annotations(r, 'error') }).toEqual({ status: 0, errors: [] });
    expect(order(r)).toEqual(['adb: cmd uimode night', 'adb: cmd uimode night yes', 'maestro: walk', 'adb: cmd uimode night no']);
    expect(file(r, 'variant.txt')).toMatch(
      /^read: cmd uimode night -> no\nset: cmd uimode night yes -> Night mode: yes\nsettled: load 0\.42 after [01] s\nput back: cmd uimode night no -> Night mode: no\n$/);
    expect(titled(r, 'notice', 'The phone as the dark run had it')).toContain('put back: cmd uimode night no');
    expect(titled(r, 'notice', 'Every route  opened cold and captured')).toMatch(/every route captured: \d+/);
    always(r);
  });

  it('waits for a phone the variant changed to settle before the walk, and goes on, saying so, when it does not', async () => {
    // Busy, then quiet: asked until its load falls under 1.0, five seconds apart, before the walk.
    const busy = await walk('dark', { walk: ['captures'] }, { loads: '2.31\n1.06\n0.74\n' });
    expect({ status: busy.status, errors: annotations(busy, 'error') }).toEqual({ status: 0, errors: [] });
    expect(file(busy, 'variant.txt')).toMatch(/\nsettled: load 0\.74 after 1\d s\n/);
    const asked = readFileSync(join(busy.T, 'state', 'order'), 'utf8').split('\n');
    expect(asked.filter((l) => l === 'adb: cat /proc/loadavg')).toHaveLength(3);
    expect(asked.lastIndexOf('adb: cat /proc/loadavg')).toBeLessThan(asked.indexOf('maestro: walk'));
    // Never quiet in its tries: said, and walked all the same.
    const never = await rehearse([], { walk: ['captures'] }, {
      map: WALK_MAP, state: { loads: '3.10\n2.90\n' },
      env: { E2E_SHARD: '1/1', E2E_FLOWS: 'none', E2E_WALK: '1', E2E_VARIANT: 'dark', E2E_SETTLE_TRIES: '2', API_URL: API, SERVICE_ROLE_KEY: 'rehearsal-key' },
    });
    expect({ status: never.status, errors: annotations(never, 'error') }).toEqual({ status: 0, errors: [] });
    expect(file(never, 'variant.txt')).toMatch(/\nnot settled: load 2\.90 after \d+ s; the run goes on, its times not the plain phone's\n/);
    // The plain phone was changed by nothing, so it is not waited on.
    const plain = await walk('plain', { walk: ['captures'] });
    expect(readFileSync(join(plain.T, 'state', 'order'), 'utf8')).not.toContain('loadavg');
    for (const r of [busy, never, plain]) always(r);
  });

  it('sends every one of a variant\'s commands, though adb reads its input as each is sent', async () => {
    const r = await walk('motion-on', { walk: ['captures'] });
    expect(order(r, /_animation_scale|animator_duration_scale|^maestro: /)).toEqual([
      'adb: settings put global transition_animation_scale 1', 'adb: settings put global animator_duration_scale 1', 'adb: settings put global window_animation_scale 0',
      'maestro: walk',
      'adb: settings put global transition_animation_scale 0', 'adb: settings put global animator_duration_scale 0', 'adb: settings put global window_animation_scale 0',
    ]);
    always(r);
  });

  it('puts the phone back after a walk that failed', async () => {
    const r = await walk('largest-text', { walk: ['pass'] });
    expect(r.status).toBe(1);
    expect(order(r)).toEqual(['adb: settings put system font_scale 2.0', 'maestro: walk', 'adb: settings put system font_scale 1.0']);
    expect(titled(r, 'error', 'The route walk did not capture every route')).toContain('not captured');
    always(r);
  });

  it('runs every flow, the probes among them, on the phone as the variant has it, and puts it back after them all', async () => {
    const r = await flows('largest-text', { a_flow: ['step-failed', 'pass'] });
    // A flow that fails at the largest text is a finding: the run fails, by its own report.
    expect(r.status).toBe(1);
    expect(order(r)).toEqual(['adb: settings put system font_scale 2.0', 'maestro: stack', 'maestro: log', 'maestro: a_flow', 'adb: settings put system font_scale 1.0']);
    // Not held to the plain phone's ceilings: a variant's times are reported.
    expect(titled(r, 'error', 'A screen could not read or is slower than its ceiling')).toBe('');
    always(r);
  });

  it('waits for the system to restart in the variant\'s language, then puts back the one it had', async () => {
    const r = await flows('right-to-left', {});
    expect({ status: r.status, errors: annotations(r, 'error') }).toEqual({ status: 0, errors: [] });
    expect(order(r)).toEqual([
      'adb: l=$(getprop persist.sys.locale); echo ${l:-$(getprop ro.product.locale)}',
      'adb: setprop persist.sys.locale ar-IQ; stop; start',
      'adb: am get-config | grep -q ldrtl', 'adb: am get-config | grep -q ldrtl', 'adb: am get-config | grep -q ldrtl',
      'maestro: stack', 'maestro: log', 'maestro: a_flow',
      'adb: setprop persist.sys.locale en-US; stop; start',
    ]);
    expect(file(r, 'variant.txt')).toMatch(/^read: .* -> en-US\nset: setprop persist\.sys\.locale ar-IQ; stop; start -> \nready: am get-config \| grep -q ldrtl\nready: cmd package resolve-activity /);
    always(r);
  });

  it('runs nothing on a phone that never became the variant, and puts it back', async () => {
    const r = await flows('right-to-left', {}, { 'never-rtl': '' }, { E2E_READY_TRIES: '2' });
    expect(r.status).toBe(1);
    expect(order(r)).toEqual([
      'adb: l=$(getprop persist.sys.locale); echo ${l:-$(getprop ro.product.locale)}',
      'adb: setprop persist.sys.locale ar-IQ; stop; start',
      'adb: am get-config | grep -q ldrtl', 'adb: am get-config | grep -q ldrtl',
      'adb: setprop persist.sys.locale en-US; stop; start',
    ]);
    expect(titled(r, 'error', 'The phone never became the right-to-left variant')).toContain('never ready: am get-config | grep -q ldrtl');
    always(r);
  });

  it('fails a largest-text run on a label the app cut, and a variant that does not judge cut text, not', async () => {
    const bold = await walk('largest-text', { walk: ['captures-and-a-cut'] });
    expect(bold.status).toBe(1);
    // Named by the last screen ready before it: the fake walk says none, so the launch before the walk's.
    expect(titled(bold, 'error', 'Text cut on the largest-text phone')).toContain('✗ "FOUNDING MEMBER" ended early on welcome (said 1 time)');
    always(bold);
    const dark = await walk('dark', { walk: ['captures-and-a-cut'] });
    expect({ status: dark.status, errors: annotations(dark, 'error') }).toEqual({ status: 0, errors: [] });
    expect(existsSync(join(dark.out, 'cut-text.txt'))).toBe(false);
    always(dark);
  });

  it('puts back nothing it could not read, and says so, rather than a word of an error', async () => {
    const r = await walk('dark', { walk: ['captures'] }, { 'night-unread': '' });
    expect(order(r)).toEqual(['adb: cmd uimode night', 'adb: cmd uimode night yes', 'maestro: walk']);
    expect(file(r, 'variant.txt')).toContain("dark's read answered closed, which ^(no|yes|auto|custom_schedule|custom_bedtime)$ does not match: nothing is put back");
    always(r);
  });

  it('walks nothing for a variant with no name in the list, and sends the phone nothing of it', async () => {
    const r = await walk('sideways', { walk: ['captures'] });
    expect(r.status).toBe(1);
    expect(order(r)).toEqual([]);
    // Not even its refusal, sent as though it were a command.
    expect(readFileSync(join(r.T, 'state', 'order'), 'utf8')).not.toMatch(/variant|sideways/);
    expect(calls(r, 'walk')).toBe(0);
    expect(titled(r, 'error', 'No variant named sideways')).toContain('no variant named sideways (the variants: plain, motion-on');
    always(r);
  });
});

it('puts the phone back before every lifecycle flow, whatever the one before changed', async () => {
  const r = await rehearse(['a_flow', 'b_flow'], {}, { env: { E2E_LIFECYCLE: '1' } });
  expect(r.status).toBe(0);
  const order = readFileSync(join(r.T, 'state', 'order'), 'utf8').split('\n')
    .filter((l) => /font_scale|wm density|always_finish_activities|^maestro: [ab]_flow$/.test(l));
  const back = ['adb: settings put system font_scale 1.0', 'adb: wm density reset', 'adb: settings put global always_finish_activities 0'];
  expect(order).toEqual([...back, 'maestro: a_flow', ...back, 'maestro: b_flow']);
  // Not held to the plain phone's ceilings: a lifecycle flow's times are reported.
  expect(titled(r, 'error', 'A screen could not read or is slower than its ceiling')).toBe('');
  always(r);
});

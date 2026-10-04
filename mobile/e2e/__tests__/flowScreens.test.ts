/**
 * flowScreens.test.ts — the E2E run's account of each failed flow says what it saw.
 *
 * flow-screens.mjs is run as the workflow runs it, on Maestro records and logs
 * written here in their real shapes.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'flow-screens.mjs');
let dir: string;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'flow-screens-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const failedAt = (id: string, status = 'FAILED', message = `Assertion is false: id: ${id} is visible`) => [
  { command: { tapOnElement: { selector: { idRegex: 'darkroom-tab' } } }, metadata: { status: 'COMPLETED' } },
  {
    command: { assertConditionCommand: { condition: { visible: { idRegex: id } } } },
    metadata: status === 'FAILED' ? { status, error: { message } } : { status },
  },
];

/** A failed flow's Maestro record and, when given, the device's log for it. */
function flow(name: string, entries: unknown[], log?: string) {
  mkdirSync(join(dir, 'debug', name), { recursive: true });
  writeFileSync(join(dir, 'debug', name, `commands-(${name}).json`), JSON.stringify(entries));
  mkdirSync(join(dir, 'h'), { recursive: true });
  if (log !== undefined) writeFileSync(join(dir, 'h', `${name}.log`), log);
}

/** The lines of one section of a report, between its heading and the next. */
const section = (report: string, heading: string) =>
  report.split(`${heading}:\n`)[1].split(/\n(?=traced by|said during|what the driver waited on|drawn but called|on the screen then)/)[0];

function run() {
  const r = spawnSync(process.execPath, [SCRIPT, join(dir, 'debug'), join(dir, 'out'), join(dir, 'h'), '--junit', join(dir, 'junit')], { encoding: 'utf8' });
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
  const out = join(dir, 'out');
  return existsSync(out) ? Object.fromEntries(readdirSync(out).map((f) => [f, readFileSync(join(out, f), 'utf8')])) : {};
}

/** A flow's JUnit report, in the shape Maestro's JUnitTestSuiteReporter writes it. */
function junit(file: string, name: string, failure?: string) {
  mkdirSync(join(dir, 'junit'), { recursive: true });
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;');
  writeFileSync(join(dir, 'junit', `${file}.xml`), [
    "<?xml version='1.0' encoding='UTF-8'?>",
    '<testsuites>',
    `  <testsuite name="Test Suite" device="test" tests="1" failures="${failure ? 1 : 0}" time="0.275">`,
    `    <testcase id="${name}" name="${name}" classname="${name}" file="mobile/.maestro/${name}.yaml" time="0.23" status="${failure ? 'ERROR' : 'SUCCESS'}">`,
    ...(failure ? [`      <failure>${esc(failure)}</failure>`] : []),
    '    </testcase>',
    '  </testsuite>',
    '</testsuites>',
  ].join('\n'));
}

/** One line as Android prints an AccessibilityNodeInfo that Maestro skipped. */
const skipped = (pkg: string, cls: string, bounds: string, id = 'null', text = 'null', at = '00:30:10.100') =>
  `09-29 ${at}  5000  5020 I Maestro : Skipping invisible child: android.view.accessibility.AccessibilityNodeInfo@8001; ` +
  `boundsInParent: Rect(0, 0 - 10, 10); boundsInScreen: ${bounds}; packageName: ${pkg}; className: ${cls}; ` +
  `text: ${text}; error: null; contentDescription: null; viewIdResName: ${id}; checkable: false\n`;

describe('what Android drew but called invisible', () => {
  it('names the app’s hidden elements, named ones first, each largest first; other apps are left out', () => {
    flow('darkroom_search', failedAt('darkroom-suggestion-row'),
      skipped('com.reelhouse.society', 'android.view.ViewGroup', 'Rect(40, 300 - 1040, 400)') +
      skipped('com.reelhouse.society', 'android.view.ViewGroup', 'Rect(40, 600 - 1040, 900)') +
      skipped('com.reelhouse.society', 'android.widget.TextView', 'Rect(0, 100 - 100, 110)', 'null', 'Small') +
      skipped('com.reelhouse.society', 'android.widget.FrameLayout', 'Rect(0, 2400 - 360, 2900)', 'film-card', 'Heat') +
      skipped('com.google.android.inputmethod.latin', 'android.view.View', 'Rect(0, 0 - 10, 10)', 'key_pos_0_0'));
    const report = run()['darkroom_search.txt'];
    expect(section(report, 'drawn but called invisible by Android')).toBe(
      '#film-card "Heat" Rect(0, 2400 - 360, 2900)\n' +
      '"Small" Rect(0, 100 - 100, 110)\n' +
      'ViewGroup Rect(40, 600 - 1040, 900)\n' +
      'ViewGroup Rect(40, 300 - 1040, 400)');
  });

  it('keeps only the last reading of the screen, not every screen the flow passed', () => {
    // The last reading's two seconds, to the millisecond: 2.1s before it is out, 1.9s is in.
    flow('film_log', failedAt('darkroom-suggestion-row'),
      skipped('com.reelhouse.society', 'android.widget.Button', 'Rect(150, 1715 - 930, 1845)', 'sign-in-submit', 'null', '00:30:08.400') +
      skipped('com.reelhouse.society', 'android.view.ViewGroup', 'Rect(40, 600 - 1040, 900)', 'null', 'null', '00:30:08.600') +
      skipped('com.reelhouse.society', 'android.view.ViewGroup', 'Rect(40, 300 - 1040, 400)', 'null', 'null', '00:30:10.500'));
    expect(section(run()['film_log.txt'], 'drawn but called invisible by Android')).toBe(
      'ViewGroup Rect(40, 600 - 1040, 900)\n' +
      'ViewGroup Rect(40, 300 - 1040, 400)');
  });

  it('leaves out empty boxes, and those scrolled off the screen', () => {
    flow('darkroom_search', failedAt('x'),
      skipped('com.reelhouse.society', 'android.view.ViewGroup', 'Rect(0, 0 - 1080, 0)') +
      skipped('com.reelhouse.society', 'android.widget.TextView', 'Rect(1522, 332 - 1080, 355)', 'null', 'TOY STORY 5') +
      skipped('com.reelhouse.society', 'android.view.ViewGroup', 'Rect(40, 600 - 1040, 900)'));
    expect(section(run()['darkroom_search.txt'], 'drawn but called invisible by Android')).toBe(
      'ViewGroup Rect(40, 600 - 1040, 900)');
  });

  it('comes before the screen, whose long list the annotation cuts short', () => {
    flow('darkroom_search', failedAt('darkroom-suggestion-row'), '');
    const report = run()['darkroom_search.txt'];
    expect(report.indexOf('said during the flow')).toBeLessThan(report.indexOf('drawn but called invisible'));
    expect(report.indexOf('drawn but called invisible')).toBeLessThan(report.indexOf('on the screen then'));
  });

  it('tells "nothing was skipped" from "the log was not kept"', () => {
    flow('kept_empty', failedAt('a'), '');
    flow('never_kept', failedAt('b', 'FAILED', 'another reason'));
    const out = run();
    expect(out['kept_empty.txt']).toContain('(the driver skipped nothing as invisible)');
    expect(out['never_kept.txt']).toContain('(the log was not kept)');
  });

  it('says so when only other apps were skipped', () => {
    flow('darkroom_search', failedAt('x'), skipped('com.google.android.inputmethod.latin', 'android.view.View', 'Rect(0, 0 - 10, 10)'));
    expect(run()['darkroom_search.txt']).toContain('(none of the app: only other apps, or empty boxes)');
  });
});

describe('what the app traced', () => {
  const trace = (time: string, msg: string) => `09-29 ${time}.100  5000  5020 W ReactNativeJS: [e2e] ${msg}\n`;

  it('comes first, in order, time and event, and is not repeated among what was said', () => {
    flow('darkroom_search', failedAt('darkroom-suggestion-row'),
      trace('00:30:01', 'darkroom.field {"focused":true}') +
      trace('00:30:03', 'darkroom.search.ask {"val":"the godfather"}') +
      trace('00:30:04', 'darkroom.search.answer {"val":"the godfather","count":5}'));
    const report = run()['darkroom_search.txt'];
    expect(section(report, 'traced by the app')).toBe(
      '00:30:01 darkroom.field {"focused":true}\n' +
      '00:30:03 darkroom.search.ask {"val":"the godfather"}\n' +
      '00:30:04 darkroom.search.answer {"val":"the godfather","count":5}');
    expect(section(report, 'said during the flow')).toBe('(no hang, crash, error or warning)');
    expect(report.indexOf('traced by the app')).toBeLessThan(report.indexOf('said during the flow'));
  });

  it('keeps the last twelve', () => {
    let log = '';
    for (let i = 10; i < 25; i++) log += trace(`00:30:${i}`, `step ${i}`);
    flow('f', failedAt('x'), log);
    const lines = section(run()['f.txt'], 'traced by the app').split('\n');
    expect(lines[0]).toBe('… 3 earlier');
    expect(lines).toHaveLength(13);
    expect(lines[12]).toBe('00:30:24 step 24');
  });

  it('says when there was none', () => {
    flow('f', failedAt('x'), '');
    expect(section(run()['f.txt'], 'traced by the app')).toBe('(no trace)');
  });
});

describe('what Android and the app said during the flow', () => {
  const line = (time: string, level: string, tag: string, msg: string) => `09-29 ${time}.100  5000  5020 ${level} ${tag}: ${msg}\n`;

  it('keeps hangs, crashes and the app’s warnings and errors, time first; drops the rest', () => {
    flow('auth_flow', failedAt('recovery-email-input', 'RUNNING'),
      line('00:31:00', 'I', 'ReactNativeJS', 'Running "main"') +
      line('00:31:01', 'W', 'unknown:ReactNative', 'StatusBarModule: Ignored status bar change, current activity is edge-to-edge.') +
      line('00:31:02', 'W', 'ReactNativeJS', 'a warning from the app') +
      line('00:31:03', 'I', 'Maestro', 'Skipping invisible child: text: ANR in nothing') +
      line('00:31:04', 'W', 'InputDispatcher', 'Window 7f0 com.reelhouse.society is unresponsive') +
      line('00:31:05', 'E', 'ActivityManager', 'ANR in com.reelhouse.society') +
      line('00:31:06', 'D', 'EGL_emulation', 'app_time_stats: avg=16ms'));
    expect(section(run()['auth_flow.txt'], 'said during the flow')).toBe(
      '00:31:02 W ReactNativeJS: a warning from the app\n' +
      '00:31:04 W InputDispatcher: Window 7f0 com.reelhouse.society is unresponsive\n' +
      '00:31:05 E ActivityManager: ANR in com.reelhouse.society');
  });

  it('keeps the last eight, and says how many came before', () => {
    let log = '';
    for (let i = 10; i < 20; i++) log += line(`00:31:${i}`, 'E', 'ReactNativeJS', `error ${i}`);
    flow('auth_flow', failedAt('x'), log);
    const said = section(run()['auth_flow.txt'], 'said during the flow').split('\n');
    expect(said[0]).toBe('… 2 earlier');
    expect(said.slice(1)).toHaveLength(8);
    expect(said[8]).toBe('00:31:19 E ReactNativeJS: error 19');
  });

  it('says when nothing was said, and when the log was not kept', () => {
    flow('quiet', failedAt('a'), line('00:31:00', 'I', 'ReactNativeJS', 'Running "main"'));
    flow('unkept', failedAt('b', 'FAILED', 'another reason'));
    const out = run();
    expect(section(out['quiet.txt'], 'said during the flow')).toBe('(no hang, crash, error or warning)');
    expect(section(out['unkept.txt'], 'said during the flow')).toBe('(the log was not kept)');
  });
});

describe('what the driver waited on', () => {
  const line = (time: string, level: string, tag: string, msg: string) => `09-30 ${time}.100  900  1020 ${level} ${tag}: ${msg}\n`;

  it('counts each wait that ran out, first to last, and names the window Android never drew', () => {
    flow('auth_flow', failedAt('recovery-email-input', 'RUNNING'),
      line('06:56:40', 'W', 'WindowManager', 'Timed out waiting for animations') +
      line('06:56:50', 'W', 'WindowManager', 'Timeout waiting for drawn: undrawn=[Window{1 u0 PopupWindow:9f}]') +
      line('06:58:32', 'W', 'WindowManager', 'Timeout waiting for drawn: undrawn=[Window{2 u0 com.reelhouse.society/MainActivity}]'));
    expect(section(run()['auth_flow.txt'], 'what the driver waited on')).toBe(
      'windows still animating (WindowManager): 1 time, 06:56:40 to 06:56:40\n' +
      'windows never drawn (WindowManager): 2 times, 06:56:50 to 06:58:32\n' +
      '  last: Timeout waiting for drawn: undrawn=[Window{2 u0 com.reelhouse.society/MainActivity}]');
  });

  // Android 14's line, as WindowManagerService.waitForAnimationsToComplete writes it.
  const timedOut = (time: string, container: string, type: string, starting = false) => line(time, 'W', 'WindowManager',
    `Timed out waiting for animations to complete, animatingContainer=${container} animationType=${type} animateStarting=${starting}`);

  it('names what Android said was animating, each kind counted, most often first', () => {
    flow('stack', failedAt('x', 'RUNNING'),
      timedOut('21:55:49', 'Task{4b1 #12 type=standard A=10192:com.reelhouse.society}', 'TRANSITION') +
      timedOut('21:55:54', 'Task{4b1 #12 type=standard A=10192:com.reelhouse.society}', 'TRANSITION') +
      timedOut('21:55:59', 'ActivityRecord{9c2 u0 com.reelhouse.society/.MainActivity}', 'STARTING_REVEAL', true));
    expect(section(run()['stack.txt'], 'what the driver waited on')).toBe(
      'windows still animating (WindowManager): 3 times, 21:55:49 to 21:55:59\n' +
      '  animating: Task{4b1 #12 type=standard A=10192:com.reelhouse.society} (TRANSITION) × 2\n' +
      '  animating: ActivityRecord{9c2 u0 com.reelhouse.society/.MainActivity} (STARTING_REVEAL, a starting window) × 1');
  });

  it('never reports QueryController’s idle line — it is logged on every key of fast runs too', () => {
    // Run 37165878763 typed at half a second a key with one of these per key.
    flow('auth_flow', failedAt('x'),
      line('01:24:47', 'W', 'QueryController', 'Could not detect idle state.') +
      line('01:24:48', 'W', 'QueryController', 'Could not detect idle state.'));
    expect(section(run()['auth_flow.txt'], 'what the driver waited on')).toBe('(no wait ran out)');
  });

  it('lists the windows as the flow failed, with what each still called undrawn or animating', () => {
    flow('darkroom_search', failedAt('x', 'RUNNING'), line('06:56:40', 'W', 'WindowManager', 'Timed out waiting for animations'));
    writeFileSync(join(dir, 'h', 'darkroom_search.wm'),
      '  Window #0 Window{a1 u0 com.reelhouse.society/com.reelhouse.society.MainActivity}:\n' +
      '    mDrawState=HAS_DRAWN mLastHidden=false\n' +
      '    mAnimatingExit=false mRemoveOnExit=false\n' +
      '  Window #1 Window{b2 u0 PopupWindow:4c1}:\n' +
      '    mDrawState=DRAW_PENDING mLastHidden=false\n' +
      '    isAnimating=true\n');
    expect(section(run()['darkroom_search.txt'], 'what the driver waited on')).toBe(
      'windows still animating (WindowManager): 1 time, 06:56:40 to 06:56:40\n' +
      'windows then\n' +
      'com.reelhouse.society/com.reelhouse.society.MainActivity\n' +
      'PopupWindow:4c1\n' +
      '  mDrawState=DRAW_PENDING\n' +
      '  isAnimating=true');
  });

  it('leaves the windows out when no window wait ran out — they crowd out the screen', () => {
    flow('error_recovery', failedAt('darkroom-search-input'), line('12:47:54', 'W', 'QueryController', 'Could not detect idle state.'));
    writeFileSync(join(dir, 'h', 'error_recovery.wm'), '  Window #0 Window{a1 u0 StatusBar}:\n    mDrawState=NO_SURFACE\n');
    expect(section(run()['error_recovery.txt'], 'what the driver waited on')).toBe('(no wait ran out)');
  });

  it('tells "nothing ran out" from "the log was not kept"', () => {
    flow('quiet', failedAt('a'), line('06:56:39', 'I', 'ReactNativeJS', 'Running "main"'));
    flow('unkept', failedAt('b', 'FAILED', 'another reason'));
    const out = run();
    expect(section(out['quiet.txt'], 'what the driver waited on')).toBe('(no wait ran out)');
    expect(section(out['unkept.txt'], 'what the driver waited on')).toBe('(the log was not kept)');
  });

  it('comes after what was said and before what was drawn but called invisible', () => {
    flow('f', failedAt('x'), '');
    const report = run()['f.txt'];
    expect(report.indexOf('said during the flow')).toBeLessThan(report.indexOf('what the driver waited on'));
    expect(report.indexOf('what the driver waited on')).toBeLessThan(report.indexOf('drawn but called invisible'));
  });
});

describe('the failed step', () => {
  it('groups flows that failed alike into one report that names them all', () => {
    flow('film_log', failedAt('darkroom-suggestion-row'));
    flow('offline_resilience', failedAt('darkroom-suggestion-row'));
    const out = run();
    expect(Object.keys(out)).toEqual(['film_log-and-1-more.txt']);
    expect(out['film_log-and-1-more.txt']).toMatch(/^film_log, offline_resilience: failed at step 2 of 2/);
  });

  it('reports a step that never finished as the one that hung', () => {
    flow('auth_flow', failedAt('recovery-email-input', 'RUNNING'));
    expect(run()['auth_flow.txt']).toContain('why: the step never finished (RUNNING)');
  });

  it('leaves the keyboard out of the screen', () => {
    flow('darkroom_search', failedAt('x'));
    writeFileSync(join(dir, 'h', 'darkroom_search.json'), JSON.stringify({
      attributes: {},
      children: [
        { attributes: { 'resource-id': 'darkroom-search-input', text: 'The Godfather', bounds: '[0,300][1080,400]' } },
        { attributes: { 'resource-id': 'com.google.android.inputmethod.latin:id/key_pos_0_0', 'content-desc': 'q', bounds: '[0,1800][100,1900]' } },
      ],
    }));
    const report = run()['darkroom_search.txt'];
    expect(report).toContain('#darkroom-search-input "The Godfather"');
    expect(report).not.toContain('key_pos_0_0');
  });
});

describe('Maestro’s own word, from its JUnit report', () => {
  // Run 37165878763's report, as Maestro wrote it (first lines of the stack).
  const RUN_2 = "maestro.android.DeviceServerDiedException: Device server died during 'deviceInfo' on emulator-5554 " +
    '(1085ms since last byte, connection age 1726ms): StatusRuntimeException: UNAVAILABLE\n' +
    '\tat maestro.android.AndroidDeviceConnection.onGrpcDeath(AndroidDeviceConnection.kt:319)';

  it('reports a flow that failed before Maestro recorded a single step — the case that used to report nothing', () => {
    junit('session_survives_restart', 'session_survives_restart', RUN_2);
    const out = run();
    expect(Object.keys(out)).toEqual(['session_survives_restart.txt']);
    expect(out['session_survives_restart.txt']).toMatch(
      /^session_survives_restart: failed before Maestro recorded a single step\nwhy: maestro\.android\.DeviceServerDiedException: Device server died during 'deviceInfo'/);
    // The stack's own lines stay out: the first line is the reason.
    expect(out['session_survives_restart.txt']).not.toContain('onGrpcDeath');
  });

  it('adds "Maestro said" where its reason is not the step’s own — a transport death leaves the step RUNNING', () => {
    flow('stack', failedAt('email-input', 'RUNNING'));
    junit('keyboard-stack', 'stack', "maestro.android.DeviceServerDiedException: Device server died during 'inputText' (120041ms since last byte)");
    const report = run()['stack.txt'];
    expect(report).toContain('why: the step never finished (RUNNING)\n' +
      "Maestro said: maestro.android.DeviceServerDiedException: Device server died during 'inputText' (120041ms since last byte)\n");
  });

  it('does not repeat Maestro’s word when it is the step’s own reason', () => {
    flow('film_log', failedAt('x'));
    junit('film_log', 'film_log', 'Assertion is false: id: x is visible');
    expect(run()['film_log.txt']).not.toContain('Maestro said');
  });

  it('keeps apart two flows that stopped at the same step for different reasons', () => {
    flow('a_flow', failedAt('x', 'RUNNING'));
    flow('b_flow', failedAt('x', 'RUNNING'));
    junit('a_flow', 'a_flow', "maestro.android.DeviceServerDiedException: Device server died during 'inputText'");
    junit('b_flow', 'b_flow', 'maestro.DeviceUnreachableException: Device emulator-5554 is unreachable during \'tap\'');
    expect(Object.keys(run()).sort()).toEqual(['a_flow.txt', 'b_flow.txt']);
  });

  it('reports a flow Maestro failed after its last step, none of which failed', () => {
    flow('lounge_flow', [{ command: { tapOnElement: { selector: { idRegex: 'a' } } }, metadata: { status: 'COMPLETED' } }]);
    junit('lounge_flow', 'lounge_flow', 'onFlowComplete hook failed');
    expect(run()['lounge_flow.txt']).toMatch(/^lounge_flow: failed after its last step \(1 on record, none failed\)\nwhy: onFlowComplete hook failed/);
  });

  it('says nothing of a flow that passed', () => {
    junit('boot_verification', 'boot_verification');
    expect(run()).toEqual({});
  });

  it('carries the runner’s decision about running it again', () => {
    flow('auth_flow', failedAt('x'));
    writeFileSync(join(dir, 'h', 'auth_flow.verdict'), "final\nnot run again: a step failed, which is the app's answer\n  Maestro said: Assertion is false\n");
    expect(run()['auth_flow.txt']).toContain("why: Assertion is false: id: x is visible\ndecided: not run again: a step failed, which is the app's answer\n");
  });
});

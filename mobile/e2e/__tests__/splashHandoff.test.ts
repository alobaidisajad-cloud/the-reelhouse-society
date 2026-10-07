/**
 * splashHandoff.test.ts — every launch shows the app never took Android's splash over.
 *
 * splash-handoff.mjs is run as run-flows.sh runs it, on device-log lines
 * copied from Sealed E2E run 37201431874 (logcat `threadtime`), the run whose
 * late handover held every key for 10 s.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'splash-handoff.mjs');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'splash-handoff-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

// Run 37201431874's own lines.
const START = '10-04 12:32:36.794   523   554 I ActivityManager: Start proc 6028:com.reelhouse.society/u0a192 for next-top-activity {com.reelhouse.society/com.reelhouse.society.MainActivity}';
const TAKEOVER = '10-04 12:32:42.310  6028  6028 D SplashScreenView: Building from parcel drawable: android.graphics.drawable.BitmapDrawable@82bf60a';
const SYSTEM_SPLASH = '10-04 12:31:54.711   843   905 D SplashScreenView: Build android.window.SplashScreenView{3c9115 V.E...... ......ID 0,0-0,0}';
const TIMEOUT = '10-04 12:32:42.356   523   545 W ActivityTaskManager: Activity transferring splash screen timeout for ActivityRecord{b1240d8 u0 com.reelhouse.society/.MainActivity t9} state 2';
const OTHER_START = '10-04 12:31:30.272   523   554 I ActivityManager: Start proc 3784:com.google.android.configupdater/u0a130 for broadcast {com.google.android.configupdater/com.google.android.configupdater.MainReceiver}';

function check(...lines: string[]) {
  writeFileSync(join(dir, 'stream.txt'), lines.join('\n') + '\n');
  writeFileSync(join(dir, 'times.txt'), 'stack probe\t1\t10-04 12:32:14.000\n');
  const r = spawnSync(process.execPath, [SCRIPT, join(dir, 'stream.txt'), '--flow-times', join(dir, 'times.txt')], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout.trim(), stderr: r.stderr };
}

it('passes launches whose splash Android removed itself — the system’s own splash lines are not a takeover', () => {
  expect(check(START, SYSTEM_SPLASH)).toEqual({
    status: 0, stderr: '', out: 'com.reelhouse.society never took Android\'s splash over: 1 launch, no takeover, no handover timeout.',
  });
});

it('fails a launch that took the splash over, and a handover that ran past Android’s 2 s — run 37201431874', () => {
  const r = check(START, SYSTEM_SPLASH, TAKEOVER, TIMEOUT);
  expect(r.status).toBe(1);
  expect(r.out).toContain('took Android\'s splash over on 1 of 1 launch, and 1 handover ran past Android\'s 2 s.');
  expect(r.out).toContain('  timeout 12:32:42 during stack probe');
  expect(r.out).toContain('  takeover 12:32:42 during stack probe (pid 6028)');
  expect(r.out).toContain('plugins/withSplashWithoutHandoff.js');
});

it('fails a takeover on its own, with no timeout', () => {
  expect(check(START, TAKEOVER).status).toBe(1);
});

it('fails a timeout on its own — the app late to a handover it should never have had', () => {
  expect(check(START, TIMEOUT).status).toBe(1);
});

it('leaves another app’s own takeover out — only the app’s processes count', () => {
  expect(check(START, OTHER_START, TAKEOVER.replace(/ {2}6028 {2}6028 /, '  3784  3784 ')).status).toBe(0);
});

it('cannot vouch for a log with no launch of the app', () => {
  const r = check(SYSTEM_SPLASH, OTHER_START);
  expect(r.status).toBe(1);
  expect(r.out).toMatch(/^No launch of com\.reelhouse\.society in the device log/);
});

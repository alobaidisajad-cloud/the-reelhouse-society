/**
 * animationWaits.test.ts — every animation Android held the test on is named, by flow.
 *
 * animation-waits.mjs is run as run-flows.sh runs it, on device logs with
 * WindowManager's line as Android 14 writes it
 * (WindowManagerService.waitForAnimationsToComplete).
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'animation-waits.mjs');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'animation-waits-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const timedOut = (time: string, container: string, type: string, starting = false) =>
  `10-03 ${time}.100   519   600 W WindowManager: Timed out waiting for animations to complete, animatingContainer=${container} animationType=${type} animateStarting=${starting}\n`;
const TASK = 'Task{4b1 #12 type=standard A=10192:com.reelhouse.society}';

function read(log: string) {
  writeFileSync(join(dir, 'stream.txt'), log);
  writeFileSync(join(dir, 'times.txt'), 'auth_flow\t1\t10-03 21:54:30.000\nstack probe\t1\t10-03 21:55:12.000\nstack probe\t2\t10-03 21:59:00.000\n');
  const r = spawnSync(process.execPath, [SCRIPT, join(dir, 'stream.txt'), '--flow-times', join(dir, 'times.txt')], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout.trim() };
}

it('says so, and exits 0, when Android never waited', () => {
  expect(read('10-03 21:55:00.000   519   600 W QueryController: Could not detect idle state.\n'))
    .toEqual({ status: 0, out: 'Android never waited on a stuck animation.' });
});

it('puts each wait on the flow that was running, counts the seconds lost, and names what animated', () => {
  const r = read(
    timedOut('21:54:40', TASK, 'TRANSITION') +
    timedOut('21:55:49', TASK, 'TRANSITION') + timedOut('21:55:54', TASK, 'TRANSITION') +
    timedOut('21:55:59', 'ActivityRecord{9c2 u0 com.reelhouse.society/.MainActivity}', 'STARTING_REVEAL', true));
  expect(r.status).toBe(1);
  expect(r.out).toBe([
    "Android held the test's every key and tap on an animation that would not end (5 s each wait):",
    'auth_flow: 1 wait, about 5s lost, 21:54:40 to 21:54:40',
    `  animating: ${TASK} (TRANSITION) × 1`,
    'stack probe: 3 waits, about 15s lost, 21:55:49 to 21:55:59',
    `  animating: ${TASK} (TRANSITION) × 2`,
    '  animating: ActivityRecord{9c2 u0 com.reelhouse.society/.MainActivity} (STARTING_REVEAL, a starting window) × 1',
  ].join('\n'));
});

it('still counts a wait whose line names nothing, and says it named nothing', () => {
  const r = read('10-03 21:59:10.000   519   600 W WindowManager: Timed out waiting for animations\n');
  expect(r.out).toContain('stack probe (attempt 2): 1 wait, about 5s lost');
  expect(r.out).toContain("animating: (Android's lines did not name it)");
});

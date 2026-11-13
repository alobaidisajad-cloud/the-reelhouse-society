/**
 * iosIpadJudge.test.ts — the app on an iPad simulator, upright and on its side (WORKLIST P4.33).
 * ios-ipad-judge.mjs is run as ios-launch.yml runs it, on hierarchies written here in Maestro's iOS
 * shape (an iPad Pro 13-inch: 1032 by 1376 points). It must say no to a turn the app refused, to an
 * iPhone's window, to a stage never reached and to a control lost or outside the window.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'ios-ipad-judge.mjs');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ios-ipad-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const tree = (w: number, h: number, id: string, box: string) => ({
  attributes: { bounds: `[0,0][${w},${h}]` },
  children: [{ attributes: { 'resource-id': id, bounds: box } }],
});
const GOOD = {
  'upright-lobby': tree(1032, 1376, 'home-tab', '[464,1290][568,1350]'),
  'upright-sign-in': tree(1032, 1376, 'sign-in-submit', '[200,900][832,952]'),
  'side-sign-in': tree(1376, 1032, 'sign-in-submit', '[372,800][1004,852]'),
  'side-lobby': tree(1376, 1032, 'home-tab', '[636,946][740,1006]'),
};

function judge(stages: Record<string, object | null>) {
  for (const [name, t] of Object.entries(stages)) if (t) writeFileSync(join(dir, `${name}.json`), JSON.stringify(t));
  const r = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout.trim() };
}

it('passes every stage in place, and prints each window and control', () => {
  const r = judge(GOOD);
  expect(r.status).toBe(0);
  expect(r.out).toMatch(/^the iPad, upright and on its side: every stage in place$/m);
  expect(r.out).toMatch(/side-lobby: in place, window 1376x1032pt; home-tab at 636,946\.\.740,1006/);
});

it('fails a turn the app refused: the window still upright', () => {
  const r = judge({ ...GOOD, 'side-sign-in': GOOD['upright-sign-in'] });
  expect(r.status).toBe(1);
  expect(r.out).toMatch(/side-sign-in: FAILED \(still upright: the app did not turn\)/);
});

it('fails an iPhone\'s window shown on the iPad', () => {
  const r = judge({ ...GOOD, 'upright-lobby': tree(402, 874, 'home-tab', '[150,800][250,860]') });
  expect(r.status).toBe(1);
  expect(r.out).toMatch(/upright-lobby: FAILED \(a window of 402x874pt is no iPad's/);
});

it('fails a stage never reached, and one whose control is lost or outside the window', () => {
  const r = judge({
    ...GOOD,
    'upright-sign-in': null,
    'side-lobby': tree(1376, 1032, 'home-tab', '[636,1040][740,1100]'),
    'side-sign-in': tree(1376, 1032, 'other', '[0,0][10,10]'),
  });
  expect(r.status).toBe(1);
  expect(r.out).toMatch(/upright-sign-in: NO TREE/);
  expect(r.out).toMatch(/side-lobby: FAILED \(home-tab outside the window\)/);
  expect(r.out).toMatch(/side-sign-in: FAILED \(sign-in-submit not found\)/);
});

it('is run by the iPhone check on an iPad, after each stage is photographed and read', () => {
  const wf = readFileSync(join(__dirname, '..', '..', '..', '.github', 'workflows', 'ios-launch.yml'), 'utf8');
  const step = wf.slice(wf.indexOf('The app on an iPad, upright and on its side'), wf.indexOf("Keep the iPad's records"));
  expect(step).toContain('for s in "upright-lobby ipad_lobby" "upright-sign-in sign_in_sheet" "side-sign-in turn_sideways" "side-lobby ipad_lobby"; do');
  expect(step).toMatch(/\.maestro\/ios\/\$2\.yaml[\s\S]*simctl io "\$IPAD" screenshot "\$S\/\$1\.png"[\s\S]*hierarchy > "\$S\/\$1\.json"[\s\S]*node e2e\/ios-ipad-judge\.mjs "\$S"/);
  expect(step).toContain("IPAD=$(bash e2e/ios-simulator.sh 'iPad Pro 13-inch')");
});

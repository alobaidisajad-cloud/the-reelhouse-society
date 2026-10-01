/**
 * keyboardRoom.test.ts — the probe that measures the keyboard can say NO.
 *
 * keyboard-room.mjs is run as run-flows.sh runs it, on a `maestro hierarchy`
 * and a `dumpsys window windows` written here in their shapes. It must fail on
 * a covered target, and on a run where no keyboard showed: a probe that passes
 * without a keyboard on screen has measured nothing.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'keyboard-room.mjs');
let dir: string;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'keyboard-room-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** The app's screen: a rail at the foot, a field near the top. */
const screen = (railBottom: number) => ({
  attributes: { bounds: '[0,0][1080,2400]' },
  children: [
    { attributes: { 'resource-id': 'stack-title-input', bounds: '[60,300][1020,420]', accessibilityText: 'Stack title' } },
    { attributes: { text: 'FILE THE STACK', bounds: `[600,${railBottom - 40}][1000,${railBottom}]` } },
    { attributes: { 'resource-id': 'com.reelhouse.society:id/review-input', bounds: '[60,1500][1020,1700]' } },
  ],
});

/** Android's window list, with the input method's window in the given state. */
const windows = (ime: string | null) => [
  'WINDOW MANAGER WINDOWS (dumpsys window windows)',
  '  Window #0 Window{a1b2c3 u0 com.reelhouse.society/com.reelhouse.society.MainActivity}:',
  '    mDisplayId=0 rootTaskId=12 mSession=Session{5d 1234:u0a10190} mClient=android.os.BinderProxy@1',
  '    frames: parent=[0,0][1080,2400] display=[0,0][1080,2400] frame=[0,0][1080,2400] last=[0,0][1080,2400]',
  '    isOnScreen=true',
  ...(ime === null ? [] : [
    '  Window #1 Window{d4e5f6 u0 InputMethod}:',
    '    mDisplayId=0 rootTaskId=1 mSession=Session{6e 2345:u0a10120} mClient=android.os.BinderProxy@2',
    '    mOwnerUid=10120 showForAllUsers=true package=com.google.android.inputmethod.latin appop=NONE',
    ime,
  ]),
  '  Window #2 Window{f7a8b9 u0 NavigationBar0}:',
  '    frames: parent=[0,2337][1080,2400] display=[0,0][1080,2400] frame=[0,2337][1080,2400]',
  '    isOnScreen=true',
].join('\n');

const SHOWN = [
  '    frames: parent=[0,0][1080,2400] display=[0,0][1080,2400] frame=[0,1395][1080,2400] last=[0,1395][1080,2400]',
  '    mGivenContentInsets=[0,0][0,0] mGivenVisibleInsets=[0,0][0,0]',
  '    mViewVisibility=0x0 mHaveFrame=true mObscured=false',
  '    isOnScreen=true',
].join('\n');

function run(target: string, railBottom: number, ime: string | null, rn = false) {
  writeFileSync(join(dir, 'h.json'), JSON.stringify(screen(railBottom)));
  writeFileSync(join(dir, 'w.txt'), rn ? windows(ime).replace(/\n/g, '\r\n') : windows(ime));
  const r = spawnSync(process.execPath, [SCRIPT, 'stack', target, join(dir, 'h.json'), join(dir, 'w.txt')], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout.trim() };
}

describe('the keyboard room', () => {
  it('fails a target the keyboard covers, and says by how much', () => {
    const r = run('"FILE THE STACK"', 2280, SHOWN);
    expect(r.status).toBe(1);
    expect(r.out).toBe('stack: "FILE THE STACK" COVERED — its foot at 2280px, the keyboard from 1395px (885px under it)');
  });

  it('passes a target the screen lifted above the keyboard', () => {
    const r = run('"FILE THE STACK"', 1390, SHOWN);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/clear — its foot at 1390px, the keyboard from 1395px/);
  });

  it('fails when no keyboard window exists: nothing was measured', () => {
    const r = run('"FILE THE STACK"', 2280, null);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/NO KEYBOARD/);
  });

  it('fails when the keyboard window is there but hidden', () => {
    for (const hidden of [SHOWN.replace('isOnScreen=true', 'isOnScreen=false'), SHOWN.replace('0x0', '0x8')]) {
      const r = run('"FILE THE STACK"', 1000, hidden);
      expect(r.status).toBe(1);
      expect(r.out).toMatch(/NO KEYBOARD/);
    }
  });

  it('reads the older mFrame line, and the content inset below the frame top', () => {
    const older = '    mFrame=[0,1200][1080,2400] last=[0,1200][1080,2400]\n    mGivenContentInsets=[0,150][0,0]\n    isOnScreen=true';
    expect(run('"FILE THE STACK"', 1349, older).status).toBe(0);
    expect(run('"FILE THE STACK"', 1351, older).out).toMatch(/keyboard from 1350px \(1px under it\)/);
  });

  it('reads the shape the emulator printed (API 34): the frame below the status bar, the top as an inset', () => {
    const seen = [
      '    mViewVisibility=0x0 mHaveFrame=true mObscured=false',
      '    mGivenContentInsets=[0,1389][0,0] mGivenVisibleInsets=[0,1389][0,0]',
      '    Frames: parent=[0,128][1080,2400] display=[0,128][1080,2400] frame=[0,128][1080,2400] last=[0,128][1080,2400] insetsChanged=false',
      '    isOnScreen=true',
    ].join('\n');
    expect(run('"FILE THE STACK"', 2280, seen).out).toMatch(/the keyboard from 1517px/);
  });

  it('reads a window list with Windows line endings', () => {
    expect(run('"FILE THE STACK"', 2280, SHOWN, true).out).toMatch(/COVERED/);
  });

  it('finds a target by id, with or without the package, and by label', () => {
    expect(run('#review-input', 0, SHOWN).out).toMatch(/#review-input COVERED — its foot at 1700px/);
    expect(run('#stack-title-input', 0, SHOWN).status).toBe(0);
    expect(run('"Stack title"', 0, SHOWN).status).toBe(0);
  });

  it('fails a target that is not on the screen', () => {
    const r = run('#nothing-here', 0, SHOWN);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/not found on screen/);
  });
});

describe('what the runner measures exists', () => {
  const runner = readFileSync(join(__dirname, '..', 'run-flows.sh'), 'utf8');
  const probes = [...runner.matchAll(/'(\w+)\|([#"][^']+)'/g)].map((m) => ({ name: m[1], target: m[2] }));

  it('every probe has its two flows', () => {
    expect(probes.map((p) => p.name)).toEqual(['stack', 'log']);
    for (const { name } of probes) {
      for (const f of [`${name}.yaml`, `${name}.tap.yaml`]) {
        expect(() => readFileSync(join(__dirname, '..', '..', '.maestro', 'keyboard', f))).not.toThrow();
      }
    }
  });

  it('and every id it taps or measures is one the app sets', () => {
    const app = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
    expect(app('app/(modals)/list-modal.tsx')).toMatch(/testID="stack-title-input"/);
    expect(app('app/(modals)/list-modal.tsx')).toMatch(/'FILE THE STACK'/);
    expect(app('app/(modals)/log-modal.tsx') + app('src/components/log/LogForm.tsx')).toMatch(/testID="review-input"/);
  });
});

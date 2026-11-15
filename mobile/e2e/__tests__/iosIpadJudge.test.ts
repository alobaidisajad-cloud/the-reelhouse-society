/**
 * iosIpadJudge.test.ts — the app on an iPad simulator, upright and on its side (WORKLIST P4.33).
 * ios-ipad-judge.mjs is run as ios-launch.yml runs it, on hierarchies written here in Maestro's iOS
 * shape (an iPad Pro 13-inch: 1032 by 1376 points). It must say no to a turn the app refused, to an
 * iPhone's window, to a stage never reached and to a control lost or outside the window.
 */
import { spawnSync } from 'child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
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

/**
 * The upright welcome photographed at 1x (1032x1376): `level(x, y)` the light, in levels over the
 * ink. Dithered, as Skia and Android draw it: each pixel takes the level below or above by turns.
 */
type Light = (x: number, y: number) => number;
const photo = (level: Light, dithered: boolean | 'half' = true) => {
  type Png = { data: Buffer };
  const { PNG } = jest.requireActual('pngjs') as {
    PNG: { new (size: { width: number; height: number }): Png; sync: { write(png: Png): Buffer } };
  };
  const png = new PNG({ width: 1032, height: 1376 });
  for (let y = 0; y < 1376; y++) for (let x = 0; x < 1032; x++) {
    const l = level(x, y);
    // 'half': an ordered dither half a level wide, as Skia's: a whole level stays one colour.
    const v = 13 + (dithered === 'half' ? Math.floor(l + ((x + y) & 1) * 0.5) : Math.floor(l) + (dithered ? (x + y) & 1 : 0));
    const i = (1032 * y + x) << 2;
    png.data[i] = v; png.data[i + 1] = v - 2; png.data[i + 2] = v - 4; png.data[i + 3] = 255;
  }
  writeFileSync(join(dir, 'upright-lobby.png'), PNG.sync.write(png));
};
/** A shaft of light: brightest at the page's middle, falling away smoothly on every side. */
const SHAFT: Light = (x, y) => 6 * Math.exp(-(((x - 516) / 160) ** 2) - (((y - 900) / 420) ** 2));

function judge(stages: Record<string, object | null>, light: Light | null = SHAFT, script = SCRIPT) {
  if (light) photo(light);
  for (const [name, t] of Object.entries(stages)) if (t) writeFileSync(join(dir, `${name}.json`), JSON.stringify(t));
  const r = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
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

/**
 * The iPad's job installs no packages: the judge read its photograph through pngjs, stopped at its
 * first line on the runner, and the four stages it had photographed were never judged (ios-launch
 * 43670385265), while this file passed on a checkout where every package is installed. So it is run
 * here as the job runs it: its files alone, in a folder no installed package can be reached from.
 */
it('judges where no package is installed, as the iPad job runs it', () => {
  const bare = mkdtempSync(join(tmpdir(), 'ios-ipad-bare-'));
  try {
    for (const f of ['ios-ipad-judge.mjs', 'ios-sign-in-judge.mjs', 'png.mjs']) copyFileSync(join(__dirname, '..', f), join(bare, f));
    const r = judge(GOOD, SHAFT, join(bare, 'ios-ipad-judge.mjs'));
    expect(r.out).not.toMatch(/Cannot find module/);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/the beam: smooth/);
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
});

it('is run by the iPhone check on an iPad, after each stage is photographed and read', () => {
  const wf = readFileSync(join(__dirname, '..', '..', '..', '.github', 'workflows', 'ios-launch.yml'), 'utf8');
  const step = wf.slice(wf.indexOf('The app on an iPad, upright and on its side'), wf.indexOf("Keep the iPad's records"));
  expect(step).toContain('for s in "upright-lobby ipad_lobby" "upright-sign-in sign_in_sheet" "side-sign-in turn_sideways" "side-lobby ipad_lobby"; do');
  expect(step).toMatch(/\.maestro\/ios\/\$2\.yaml[\s\S]*simctl io "\$IPAD" screenshot "\$S\/\$1\.png"[\s\S]*hierarchy > "\$S\/\$1\.json"[\s\S]*node e2e\/ios-ipad-judge\.mjs "\$S"/);
  expect(step).toContain("IPAD=$(bash e2e/ios-simulator.sh 'iPad Pro 13-inch')");
});

describe('the welcome\'s projector beam, upright', () => {
  it('passes a shaft of light that falls away with no band and no edge, and prints what it read', () => {
    const r = judge(GOOD);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/^ {2}the beam: smooth, no band and no edge, across \d+ colours, longest band [0-4] px \(run \d+\)/m);
  });

  it('passes a light that rests on one level for long, its dither leaving one colour there', () => {
    // A plateau: the light holds a whole level, and dither, which breaks a level only between two,
    // leaves one colour. No stair stands either side of it: no band.
    photo((x, y) => Math.min(3, SHAFT(x, y)), 'half');
    const r = judge(GOOD, null);
    // A run of one colour far over BEAM_RUN_MAX is there, and is no band.
    expect(r.out).toMatch(/longest band [0-4] px \(run \d{2,}\)/);
    expect(r.out).not.toMatch(/BANDED/);
    expect(r.status).toBe(0);
  });

  it('fails a beam that begins in a straight line, as iOS drew a tilted shaft (43670385265)', () => {
    // Its plane drawn only below the window's middle: the light there at its brightest, above it none.
    const r = judge(GOOD, (x, y) => (y >= 688 ? SHAFT(x, y) : 0));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/the beam: FAILED \(.*down its heart: AN EDGE, a step of [\d.]+ levels/);
  });

  it('fails a light that meets the page\'s sides low on the page, a line where it stops', () => {
    // The tilted shaft's foot, as wide as the page: two lines at its sides, read against the margin.
    const r = judge(GOOD, (x, y) => (y > 1000 && x >= 236 && x < 796 ? 3 : 0));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/the beam: FAILED \(across the page: AN EDGE, a step of [\d.]+ levels/);
  });

  it('fails a beam drawn without dither: one colour held across a band', () => {
    photo(SHAFT, false);
    const r = judge(GOOD, null);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/the beam: FAILED \(.*BANDED, one colour for \d+ px/);
  });

  it('fails a beam cut by the page\'s edge: a straight line in the light', () => {
    // The phone's beam on the iPad: light to the page's edge, cut there (the photographs of 43607139446).
    const r = judge(GOOD, (x, y) => (x > 250 && y > 690 ? 4 : 0));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/the beam: FAILED \(across the page: AN EDGE, a step of [\d.]+ levels/);
  });

  it('fails a welcome it could not read: no photograph', () => {
    const r = judge(GOOD, null);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/the beam: NOT READ/);
  });
});

it('reads the page where the app lays it: its column is the app\'s own READING_MAX', () => {
  const metrics = readFileSync(join(__dirname, '..', '..', 'src', 'components', 'layout', 'navMetrics.ts'), 'utf8');
  const judgeSource = readFileSync(SCRIPT, 'utf8');
  const app = Number(/export const READING_MAX = (\d+);/.exec(metrics)?.[1]);
  const judged = Number(/export const PAGE_COLUMN = (\d+);/.exec(judgeSource)?.[1]);
  expect(app).toBeGreaterThan(0);
  expect(judged).toBe(app);
});

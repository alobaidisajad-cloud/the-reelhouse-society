/**
 * iosSignInJudge.test.ts — the sign-in sheet on the iPhone simulator, judged left to right in Arabic
 * (WORKLIST P4.27), and the halo's light read. ios-sign-in-judge.mjs is run as ios-launch.yml runs it,
 * on hierarchies written here in Maestro's iOS shape. It must say no to a control that moved, and to
 * an Arabic run the simulator never took.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const SCRIPT = join(__dirname, '..', 'ios-sign-in-judge.mjs');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ios-sign-in-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** The sheet as Maestro reads it on an iPhone (402pt wide): its three controls and its seal. */
const sheet = (shift = 0) => ({
  attributes: { bounds: '[0,0][402,874]' },
  children: [
    { attributes: { accessibilityText: 'The ReelHouse Society seal', bounds: '[155,120][247,212]' } },
    { attributes: { 'resource-id': 'email-input', bounds: `[${40 + shift},420][${362 + shift},470]` } },
    { attributes: { 'resource-id': 'password-input', bounds: '[40,500][362,550]' } },
    { attributes: { 'resource-id': 'sign-in-submit', bounds: '[40,600][362,652]' } },
  ],
});

function judge(en: object, ar: object, languages = '(\n    ar\n)') {
  writeFileSync(join(dir, 'en.json'), JSON.stringify(en));
  writeFileSync(join(dir, 'ar.json'), JSON.stringify(ar));
  writeFileSync(join(dir, 'ar-languages.txt'), languages);
  const r = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout.trim() };
}

describe('left to right, the system in Arabic', () => {
  it('passes a sheet whose every control stands where it stood in English', () => {
    const r = judge(sheet(), sheet());
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/^left to right, the system in Arabic: no control moved$/m);
    for (const id of ['email-input', 'password-input', 'sign-in-submit']) expect(r.out).toMatch(new RegExp(`${id}: in place`));
  });

  it('fails a control that moved, and says by how much', () => {
    const r = judge(sheet(), sheet(-30));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/email-input: MOVED 30pt/);
  });

  it('fails a control it cannot find in either', () => {
    const lost = { ...sheet(), children: sheet().children.slice(0, 2) };
    const r = judge(sheet(), lost);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/sign-in-submit: not found in Arabic/);
  });

  it('counts nothing when the simulator never said it was in Arabic', () => {
    const r = judge(sheet(), sheet(), '(\n    en\n)');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/^the simulator never said it was in Arabic/m);
  });
});

describe('the halo\'s light', () => {
  /** longestRun, run in node as the judge runs (an .mjs module jest cannot load). */
  const runOf = (pixel: string) => {
    const url = pathToFileURL(SCRIPT).href;
    const code = `import { longestRun } from '${url}'; const at = ${pixel}; console.log(longestRun(at, 0, 60, 60).longest);`;
    return Number(spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' }).stdout.trim());
  };
  it('reads the longest run of one colour once the glow begins, dithered or banded', () => {
    // A dithered glow: levels alternating, no run over 2 px. A banded one: 5 px of each level.
    expect(runOf('(x, y) => { const v = 40 - Math.floor(y / 2) + (y % 2); return [v, v, v]; }')).toBeLessThanOrEqual(2);
    expect(runOf('(x, y) => { const v = 40 - Math.floor(y / 5); return [v, v, v]; }')).toBe(5);
  });

  it('is not judged without a photograph', () => {
    const r = judge(sheet(), sheet());
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/^the halo \(not judged\): /m);
  });

  /** The sheet with its header (a full-width box holding the close button), at 1x. */
  const withHeader = () => ({
    ...sheet(),
    children: [
      { attributes: { bounds: '[0,62][402,100]' }, children: [{ attributes: { accessibilityText: 'Close login', bounds: '[22,66][70,96]' } }] },
      ...sheet().children,
    ],
  });
  /** A 402x874 photograph whose column above the seal holds `level(y)`, the header's flat grey above it. */
  const photo = (level: (y: number) => number) => {
    const { PNG } = jest.requireActual('pngjs') as typeof import('pngjs');
    const png = new PNG({ width: 402, height: 874 });
    for (let y = 0; y < 874; y++) for (let x = 0; x < 402; x++) {
      const v = y < 100 ? 30 : level(y);
      const i = (402 * y + x) << 2;
      png.data[i] = v; png.data[i + 1] = v; png.data[i + 2] = v; png.data[i + 3] = 255;
    }
    writeFileSync(join(dir, 'en.png'), PNG.sync.write(png));
  };

  it('judges the glow up to the header, never into its flat grey', () => {
    photo((y) => 40 + (y % 2) + Math.floor(y / 2));
    const r = judge(withHeader(), withHeader());
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/^the halo: smooth, above the seal to the header, \d+ colours over 16 px/m);
  });

  it('fails a glow held one colour for more than HALO_RUN_MAX pixels: rings', () => {
    photo((y) => 40 + Math.floor(y / 6));
    const r = judge(withHeader(), withHeader());
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/^the halo: BANDED, .* the longest run of one 6 px/m);
  });
});

describe('the iPhone check runs it', () => {
  it('photographs and reads the sheet in English, then in Arabic, read back, then judges', () => {
    const wf = readFileSync(join(__dirname, '..', '..', '..', '.github', 'workflows', 'ios-launch.yml'), 'utf8');
    const step = wf.slice(wf.indexOf('The sign-in sheet in English and in Arabic'), wf.indexOf("Keep the flows' records"));
    expect(step).toMatch(/sheet en[\s\S]*defaults write -g AppleLanguages -array ar[\s\S]*defaults read -g AppleLanguages > "\$S\/ar-languages\.txt"[\s\S]*sheet ar[\s\S]*node e2e\/ios-sign-in-judge\.mjs "\$S"/);
    expect(step).toContain('.maestro/ios/sign_in_sheet.yaml');
  });
});

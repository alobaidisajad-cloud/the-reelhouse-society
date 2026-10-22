/**
 * The speed lab (WORKLIST P0.103, P0.104), its three scripts run as processes: the arms against
 * the tree as committed (e2e/lab/arm.mjs), the light judged from shots (e2e/lab/proofs.mjs) and
 * the timed starts judged, the A/A pair first (e2e/lab/analyze.mjs).
 */
import { spawnSync } from 'child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { crc32, deflateSync } from 'zlib';

const MOBILE = join(__dirname, '..', '..');
const LAB = join(MOBILE, 'e2e', 'lab');
const run = (script: string, args: string[], cwd = MOBILE) => spawnSync(process.execPath, [join(LAB, script), ...args], { cwd, encoding: 'utf8' });

let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'speed-lab-')); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const fresh = (name: string) => { const d = join(dir, name); mkdirSync(d, { recursive: true }); return d; };

describe('the arms', () => {
  it('every build the lab makes applies to the tree as committed, each text found exactly once', () => {
    const r = run('arm.mjs', ['--check']);
    const faults = JSON.parse(r.stdout) as Record<string, string[]>;
    expect(Object.keys(faults)).toEqual(expect.arrayContaining(['Ws', 'Ps', 'N', 'STILL', 'STILL+Ws', 'STILL+Pm']));
    expect(Object.entries(faults).filter(([, f]) => f.length)).toEqual([]);
    expect(r.status).toBe(0);
  });

  it('refuses an arm whose text is gone, by name, and writes nothing', () => {
    const root = fresh('tree');
    for (const f of ['app/(tabs)/index.tsx', 'src/components/CinematicOverlays.tsx', 'src/components/auth/AuthChrome.tsx']) {
      mkdirSync(dirname(join(root, f)), { recursive: true });
      copyFileSync(join(MOBILE, f), join(root, f));
    }
    const welcome = join(root, 'app/(tabs)/index.tsx');
    const changed = readFileSync(welcome, 'utf8').split('<RoomLight room="lobby" />').join('<RoomLight room="lobby" hem={1} />');
    writeFileSync(welcome, changed);
    const halo = readFileSync(join(root, 'src/components/auth/AuthChrome.tsx'), 'utf8');
    const r = run('arm.mjs', ['Dm'], root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Dm: the text to change in app/(tabs)/index.tsx is not there exactly once');
    // Its other edits found their text, and still nothing was written.
    expect(readFileSync(join(root, 'src/components/auth/AuthChrome.tsx'), 'utf8')).toBe(halo);
  });
});

/** A PNG of a flat image with a lit disc, as Android's screencap writes one (8-bit RGBA). */
function png(file: string, light: number, at = { x: 50, y: 60, r: 40 }) {
  const width = 100;
  const height = 200;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const inside = (x - at.x) ** 2 + (y - at.y) ** 2 <= at.r ** 2;
      const v = 20 + (inside ? light : 0);
      const i = y * (width * 4 + 1) + 1 + x * 4;
      raw[i] = v; raw[i + 1] = v; raw[i + 2] = v; raw[i + 3] = 255;
    }
  }
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), body])), 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  writeFileSync(file, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const SCENES = [['A', 'Ws'], ['Dm', 'Ds'], ['Hm', 'Hs'], ['Gm', 'Gs'], ['Pm', 'Ps']];
/** A folder of shots: each scene's main and SVG builds shot twice, lit as given, and N unlit. */
function shots(name: string, main: number, svg: number, opts: { drop?: string; again?: number } = {}) {
  const d = fresh(name);
  png(join(d, 'N-1.png'), 0);
  for (const [m, s] of SCENES) {
    for (const n of [1, 2]) {
      png(join(d, `${m}-${n}.png`), n === 2 && opts.again != null ? opts.again : main);
      png(join(d, `${s}-${n}.png`), svg);
    }
  }
  if (opts.drop) rmSync(join(d, `${opts.drop}.png`));
  return d;
}
const verdicts = (r: ReturnType<typeof run>) => r.stdout.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3, 7));

describe('the light, judged', () => {
  it('passes a light drawn the same both ways, present against none and holding still', () => {
    const r = run('proofs.mjs', [shots('same', 30, 31)]);
    expect(verdicts(r)).toEqual(['PASS', 'PASS', 'PASS', 'PASS', 'PASS']);
    expect(r.status).toBe(0);
  });

  it('says no where the two lights differ by more than the bar', () => {
    const r = run('proofs.mjs', [shots('apart', 30, 50)]);
    expect(verdicts(r)).toEqual(['FAIL', 'FAIL', 'FAIL', 'FAIL', 'FAIL']);
    expect(r.stdout).toContain('NO   same: main against SVG, max 20');
    expect(r.status).toBe(1);
  });

  it('says no to "the same" when both are blank: the light must be there', () => {
    const r = run('proofs.mjs', [shots('blank', 0, 0)]);
    expect(r.stdout).toContain('NO   present');
    expect(r.status).toBe(1);
  });

  it('says no when a build shot twice moved, and gives no verdict on a missing shot', () => {
    expect(run('proofs.mjs', [shots('moved', 30, 30, { again: 40 })]).stdout).toContain('NO   still');
    const r = run('proofs.mjs', [shots('missing', 30, 30, { drop: 'Ps-2' })]);
    expect(r.stdout).toContain("FAIL — a member's spotlight (Pm against Ps)\n  NO VERDICT: no shot Ps-2");
    expect(r.status).toBe(1);
  });
});

/** A lab folder of fresh starts: each arm's TotalTime values, one start per value. */
function starts(name: string, arms: Record<string, number[]>) {
  const d = fresh(name);
  mkdirSync(join(d, 'runs'));
  const rows: string[] = [];
  for (const [arm, times] of Object.entries(arms)) {
    times.forEach((t, i) => {
      writeFileSync(join(d, 'runs', `${arm}-a${i}.am`), `Status: ok\nTotalTime: ${t}\n`);
      rows.push([arm, `a${i}`, String(1000 + i), '0.5', '3'].join('\t'));
    });
  }
  writeFileSync(join(d, 'launches.tsv'), `${rows.join('\n')}\n`);
  return d;
}
const steady = [2010, 1990, 2005, 1995, 2000, 2003, 1997, 2008, 1992, 2001];

describe('the timed starts, judged', () => {
  it('calls a real difference, with the A/A pair quiet', () => {
    const r = run('analyze.mjs', [starts('real', { A: steady, Z: [...steady].reverse(), N: steady.map((t) => t - 300) })]);
    expect(r.stdout).toMatch(/\* first frame \(am TotalTime, ms\)\s+-300/);
    expect(r.stdout).toContain('A/A: Z against A calls nothing');
    expect(r.status).toBe(0);
  });

  it('fails the run when Z, the same APK, differs from A: no call can then be trusted', () => {
    const r = run('analyze.mjs', [starts('unsteady', { A: steady, Z: steady.map((t) => t + 400) })]);
    expect(r.stdout).toContain('A/A: FAILED');
    expect(r.status).toBe(1);
  });

  it('calls nothing on noise alone, and a clear shift at p under 0.01', () => {
    const diff = (a: number[], b: number[]) => {
      const f = join(dir, `d${a.length}${b[0]}.json`);
      writeFileSync(f, JSON.stringify({ a, b }));
      return JSON.parse(run('analyze.mjs', ['--diff', f]).stdout) as { mid: number; p: number };
    };
    expect(diff(steady, [...steady].reverse()).p).toBeGreaterThan(0.5);
    expect(diff(steady, steady.map((t) => t + 50)).p).toBeLessThan(0.01);
  });
});

/** A folder of one screen's scroll: its hashes before and after each swipe, and gfxinfo's counts. */
function scrolled(name: string, hashes: string[], gfx = 'Total frames rendered: 412\nJanky frames: 9 (2.18%)\n50th percentile: 8ms\n90th percentile: 14ms\n99th percentile: 40ms\n') {
  const d = fresh(name);
  writeFileSync(join(d, 'reel-1.moves'), hashes.map((h) => `${h}  -`).join('\n'));
  writeFileSync(join(d, 'reel-1.gfx'), gfx);
  return d;
}
const hash = (i: number) => i.toString(16).padStart(32, '0');

describe('the signed-in scrolls, judged', () => {
  it('passes a list that moved on every swipe of three screen heights, with its frames counted', () => {
    const r = run('scrolls.mjs', [scrolled('far', Array.from({ length: 11 }, (_, i) => hash(i)))]);
    expect(r.stdout).toMatch(/reel-1\s+412\s+9\s+8\s+14\s+40\s+5\/5/);
    expect(r.status).toBe(0);
  });

  it('fails a list that ran out before three screen heights, by name', () => {
    const r = run('scrolls.mjs', [scrolled('short', [0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2].map(hash))]);
    expect(r.stdout).toContain('reel-1: the list stopped after 2 of 5 swipes: it holds less than three screen heights');
    expect(r.status).toBe(1);
  });

  it('fails a scroll whose frames were never counted', () => {
    const r = run('scrolls.mjs', [scrolled('unmeasured', Array.from({ length: 11 }, (_, i) => hash(i)), 'Total frames rendered: 0\n')]);
    expect(r.stdout).toContain('reel-1: no frames were measured for its scroll');
    expect(r.status).toBe(1);
  });
});

describe('the house the lab scrolls', () => {
  const seed = (args: string[]) => spawnSync(process.execPath, [join(MOBILE, 'e2e', 'db', 'lab-seed.mjs'), ...args], { cwd: MOBILE, encoding: 'utf8' });

  it('draws on enough recorded films, each with its poster, for its longest stack', () => {
    const films = JSON.parse(seed(['--films']).stdout) as [number, string, string, string][];
    expect(films.length).toBeGreaterThanOrEqual(60);
    expect(films.filter(([, , , poster]) => !/^\/\w+\.jpg$/.test(poster))).toEqual([]);
  });

  it('names every list it filled too thinly', () => {
    const counts = { reel: 480, salon: 320, stack: 61, comments: 25, filings: 30, own_logs: 61, portrait: 1 };
    expect(JSON.parse(seed(['--short', JSON.stringify(counts)]).stdout)).toEqual([]);
    expect(JSON.parse(seed(['--short', JSON.stringify({ ...counts, salon: 12, portrait: 0 })]).stdout))
      .toEqual(['salon: 12, at least 300 needed', 'portrait: 0, at least 1 needed']);
  });
});

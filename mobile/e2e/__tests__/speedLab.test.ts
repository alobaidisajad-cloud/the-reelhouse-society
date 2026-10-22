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

/**
 * A screens folder with a reel/ folder: each build's rounds of the Reel, each scrolled far, its
 * opening and its frames as given (ready ms, frames drawn, p90 ms per round; every frame janky, as on the lab's GPU),
 * and, where given, the frame record's long JavaScript tasks (LabFrameLog's lines, split over two seconds).
 */
function reelRounds(name: string, builds: Record<string, { ready: number[]; frames: number[]; p90: number[]; js?: number[] }>) {
  const d = scrolled(name, Array.from({ length: 11 }, (_, i) => hash(i)));
  const reel = join(d, 'reel');
  mkdirSync(reel);
  for (const [b, r] of Object.entries(builds)) {
    r.ready.forEach((ms, i) => {
      const f = join(reel, `${b}-${i + 1}`);
      writeFileSync(`${f}.moves`, Array.from({ length: 11 }, (_, k) => `${hash(k)}  -`).join('\n'));
      writeFileSync(`${f}.gfx`, `Total frames rendered: ${r.frames[i] ?? 0}\nJanky frames: ${r.frames[i] ?? 0} (100.00%)\n50th percentile: 800ms\n90th percentile: ${r.p90[i] ?? 0}ms\n99th percentile: 2000ms\n`);
      const said = (event: string, detail: object) => `10-22 16:00:32.537 W/ReactNativeJS( 5765): [e2e] ${event} ${JSON.stringify(detail)}\n`;
      const js = r.js?.[i];
      writeFileSync(`${f}.log`, said('screen.ready', { name: 'reel', ms }) + (js == null ? '' : [
        said('lab.frames.on', { path: '/reels' }),
        said('lab.frames', { path: '/reels', js: { long: Math.ceil(js / 2), longest: 90 }, ui: { frames: 40, slow: 30, worst: 900 } }),
        said('lab.frames', { path: '/reels', js: { long: Math.floor(js / 2), longest: 70 }, ui: { frames: 40, slow: 30, worst: 900 } }),
      ].join('')));
    });
  }
  return d;
}
// Fourteen rounds, as scrolls.sh runs (it says why).
const around = (base: number) => [0, 3, -2, 5, -4, 1, -1, 2, 4, -3, 6, -5, -6, 7].map((n) => base + n);

describe("the Reel's layers, costed", () => {
  it('names a layer whose removal opens the Reel faster, against A, and calls nothing on noise', () => {
    const r = run('scrolls.mjs', [reelRounds('reel-costs', {
      A: { ready: around(3000), frames: around(50), p90: around(20), js: around(40) },
      Rb: { ready: around(2000), frames: around(50), p90: around(20), js: [0, 1, 0, 2, 1, 0, 1, 1, 0, 2, 0, 1, 0, 1] },
      Rw: { ready: around(3000), frames: around(50), p90: around(20) },
    })]);
    expect(r.status).toBe(0);
    const row = (b: string) => r.stdout.split('\n').find((l) => l.startsWith(`${b} `)) ?? '';
    // The long JavaScript tasks are each round's sum over its seconds; a build without the record reads blank.
    expect(row('A')).toMatch(/^A\s+14\s+3000\.5\s+50\.5\s+800\s+20\.5\s+40\.5$/);
    expect(row('Rb')).toMatch(/^Rb\s+14\s+2000\.5 -1000\*\s+50\.5 \+0 \s+800 \+0 \s+20\.5 \+0 \s+1 -39\.5\*$/);
    expect(row('Rw')).toMatch(/^Rw\s+14\s+3000\.5 \+0 \s+50\.5 \+0 \s+800 \+0 \s+20\.5 \+0 \s+—$/);
  });

  it('fails when A was never scrolled, or a round of an arm ran out, by name', () => {
    const r = run('scrolls.mjs', [reelRounds('reel-no-a', { Rb: { ready: around(2000), frames: around(50), p90: around(20) } })]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('reel: A, the app as it is, was never scrolled: nothing to compare');
    const short = reelRounds('reel-short', { A: { ready: around(3000), frames: around(50), p90: around(20) } });
    writeFileSync(join(short, 'reel', 'A-3.moves'), [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1].map((i) => `${hash(i)}  -`).join('\n'));
    const s = run('scrolls.mjs', [short]);
    expect(s.status).toBe(1);
    expect(s.stdout).toContain('reel A-3: the list stopped after 1 of 5 swipes');
  });
});

/** A screens folder: each screen's two rounds, scrolled far, opened in `ready` ms, its frames and long JS tasks as given. */
function budgetRounds(name: string, screens: Record<string, { ready: number; slowUi: number; p90: number; jsOpen?: number; jsScroll?: number; ready2?: number }>) {
  const d = fresh(name);
  const said = (event: string, detail: object) => `10-23 10:00:00.000 W/ReactNativeJS( 1): [e2e] ${event} ${JSON.stringify(detail)}\n`;
  const READY: Record<string, string> = { settings: 'settings', reel: 'reel', log: 'log' };
  for (const [screen, r] of Object.entries(screens)) {
    for (const round of [1, 2]) {
      const f = join(d, `${screen}-${round}`);
      writeFileSync(`${f}.moves`, Array.from({ length: 11 }, (_, k) => `${hash(k)}  -`).join('\n'));
      writeFileSync(`${f}.gfx`, `Total frames rendered: 100\nJanky frames: 100 (100.00%)\n50th percentile: 700ms\n90th percentile: ${r.p90}ms\n99th percentile: 2000ms\nNumber Slow UI thread: ${r.slowUi}\n`);
      writeFileSync(`${f}.log`, said('lab.frames.on', { path: '/' }) + said('screen.ready', { name: READY[screen], ms: round === 2 && r.ready2 != null ? r.ready2 : r.ready })
        + said('lab.frames', { path: '/', js: { long: r.jsOpen ?? 0, longest: 80 }, ui: { frames: 40, slow: 5, worst: 900 } })
        + '10-23 10:00:09.000 I/ReelLab( 2): lab.scroll.begin\n'
        + said('lab.frames', { path: '/', js: { long: r.jsScroll ?? 0, longest: 80 }, ui: { frames: 40, slow: 5, worst: 900 } }));
    }
  }
  return d;
}

describe('the lab\'s phone is the flows\' phone', () => {
  it('both prepare it with the same pieces: error dialogs hidden, no keyboard', () => {
    // Speed lab 39857275319: "Pixel Launcher isn't responding" over the sign-in, both halves; the
    // flows had hidden such dialogs for months, the lab had not.
    const flows = readFileSync(join(MOBILE, 'e2e', 'run-flows.sh'), 'utf8');
    const lab = readFileSync(join(LAB, 'scrolls.sh'), 'utf8');
    for (const piece of ['no-error-dialogs.sh', 'no-keyboard.sh']) {
      expect(flows).toContain(`. "$(dirname "$0")/${piece}"`);
      expect(lab).toContain(`. "$(dirname "$0")/../${piece}"`);
    }
    expect(readFileSync(join(MOBILE, 'e2e', 'no-error-dialogs.sh'), 'utf8')).toContain('settings put global hide_error_dialogs 1');
  });
});

describe('the frame budget (P0.112)', () => {
  type Line = { reason: string } & Record<string, number | string>;
  const budget = JSON.parse(readFileSync(join(LAB, 'budget.json'), 'utf8')) as {
    control: string; lines: { ready: Line; jsOpen: Line; jsScroll: Line; slowUi: Line; p90: Line };
  };

  it('gives every line a reason, and is read whole: no line the judge does not hold a screen to', () => {
    expect(Object.keys(budget.lines).sort()).toEqual(['jsOpen', 'jsScroll', 'p90', 'ready', 'slowUi']);
    expect(Object.entries(budget.lines).filter(([, l]) => (l.reason ?? '').length < 40).map(([k]) => k)).toEqual([]);
    // The control is scrolled in every lab run, so the budget is never silently unjudged.
    expect(readFileSync(join(LAB, 'scrolls.sh'), 'utf8')).toMatch(new RegExp(`SCREENS="[^"]* ${budget.control}\\|${budget.control}\\|down"`));
  });

  it('holds each screen to the control: over a line, named with the line and its reason; within, not', () => {
    const r = run('scrolls.mjs', [budgetRounds('budget', {
      settings: { ready: 400, slowUi: 30, p90: 800 },
      reel: { ready: 1600, slowUi: 45, p90: 1100, jsOpen: 3, jsScroll: 1 },
      log: { ready: 1300, slowUi: 38, p90: 990 },
    })]);
    expect(r.status).toBe(1);
    const over = r.stdout.split('\n').filter((l) => l.startsWith('over budget: '));
    expect(over).toEqual([
      `over budget: reel: ready 1600 over its budget of 1400 (${budget.lines.ready.reason})`,
      `over budget: reel: jsOpen 3 over its budget of 2 (${budget.lines.jsOpen.reason})`,
      `over budget: reel: jsScroll 1 over its budget of 0 (${budget.lines.jsScroll.reason})`,
      `over budget: reel: slowUi 45 over its budget of 40 (${budget.lines.slowUi.reason})`,
      `over budget: reel: p90 1100 over its budget of 1000 (${budget.lines.p90.reason})`,
    ]);
  });

  it('judges nothing without the control, and says so', () => {
    const r = run('scrolls.mjs', [budgetRounds('no-control', { log: { ready: 9000, slowUi: 90, p90: 5000, jsScroll: 4 } })]);
    expect(r.stdout).toContain('(no settings in this folder: the frame budget is not judged)');
    expect(r.stdout).not.toContain('over budget:');
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

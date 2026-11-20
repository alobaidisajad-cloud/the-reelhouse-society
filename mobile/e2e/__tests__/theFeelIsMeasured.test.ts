/**
 * theFeelIsMeasured.test.ts — the speed lab's feel run judged (e2e/lab/feel.mjs) on a folder planted
 * here: a tap answered past the next frame, a tap stamped on another clock, a node that moved 2 px
 * with no touch, a commit while scrolling past a frame and a JS frame past its limit each fail by
 * name, and a screen within every limit passes; a screen whose instruments saw nothing fails. The
 * limits themselves (e2e/limits.json): every measure a number with its reason and its tool, the
 * floors at the floor, none looser than today, only the best-app numbers waiting for the owner. And
 * the framework's floor (floor-app.mjs), written from the app's own versions.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const LAB = join(__dirname, '..', 'lab');
const MOBILE = join(__dirname, '..', '..');

/** One of a script's own values, asked in a Node of its own (jest cannot load an ES module here). */
const ask = (script: string, expression: string): unknown => {
  const code = `const m = await import(${JSON.stringify(pathToFileURL(join(LAB, script)).href)}); console.log(JSON.stringify(await (async () => ${expression})()));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
};
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'feel-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const line = (event: string, detail: object) => `11-20 10:00:00.000  1  2 W ReactNativeJS: [e2e] ${event} ${JSON.stringify(detail)}`;
const node = (id: string, bounds: number[], extra = '') => `<node index="0" text="" resource-id="${id}" class="android.view.View" content-desc="" clickable="false" bounds="[${bounds[0]},${bounds[1]}][${bounds[2]},${bounds[3]}]"${extra}/>`;
const dump = (...nodes: string[]) => `<?xml version='1.0'?><hierarchy rotation="0"><node index="0" text="" resource-id="" class="android.widget.FrameLayout" content-desc="" clickable="false" bounds="[0,0][1080,2400]">${nodes.join('')}</node></hierarchy>`;

/** One screen's run, as feel.sh leaves it, every measure within the limits unless told otherwise. */
function plant(name: string, { tap = 9.5, apart = false, moved = 0, scrollCommit = 8, js = [3, 4, 5, 6] } = {}) {
  writeFileSync(join(dir, `${name}.log`), [
    line('feel.on', { path: `/${name}` }),
    apart ? line('feel.tap', { path: `/${name}`, clocks: 'apart', js: -40 }) : line('feel.tap', { path: `/${name}`, js: 4, answer: tap, commit: 3 }),
    line('feel.commits', { path: `/${name}`, n: 3, total: 30, longest: 20 }),
    '11-20 10:00:01.000  1  2 I ReelLab: feel.scroll.begin',
    line('feel.commits', { path: `/${name}`, n: 9, total: 40, longest: scrollCommit }),
    '11-20 10:00:06.000  1  2 I ReelLab: feel.scroll.end',
  ].join('\n'));
  writeFileSync(join(dir, `${name}-open-0.xml`), dump(node('film-title', [40, 300, 600, 360])));
  writeFileSync(join(dir, `${name}-open-1.xml`), dump(node('film-title', [40, 300 + moved, 600, 360 + moved])));
  writeFileSync(join(dir, `${name}.js.txt`), ['"frame_ts","js_ms"', ...js.map((ms, i) => `${1000 + i},${ms}`)].join('\n'));
  writeFileSync(join(dir, `${name}.rx`), ' eth0: 1000 0 0\n lo: 5 0\n-----\n eth0: 4000 0 0\n lo: 9 0\n');
}
function judge() {
  const r = spawnSync(process.execPath, [join(LAB, 'feel.mjs'), dir], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout };
}

describe('feel.mjs', () => {
  it('passes a screen within every limit, and records what opening it downloaded', () => {
    plant('reel');
    const { code, out } = judge();
    expect(out).toMatch(/every screen within its feel limits/);
    expect(out).toMatch(/^reel .*3000$/m);
    expect(code).toBe(0);
  });

  it.each([
    ['a tap answered past the next frame', { tap: 40 }, /a tap answered in 40 ms, past the next frame/],
    ['a tap stamped on another clock', { apart: true }, /stamped on another clock than JavaScript's: tap response unmeasured/],
    ['a node moved 2 px with no touch', { moved: 2 }, /open: film-title moved 2px with no touch/],
    ['a commit while scrolling past a frame', { scrollCommit: 30 }, /a commit while scrolling took 30 ms, over a frame/],
    ['a JS frame past its limit', { js: [3, 4, 5, 40] }, /worked 40 ms in one frame/],
  ])('fails %s', (_what, plantWith, said) => {
    plant('reel', plantWith);
    const { code, out } = judge();
    expect(out).toMatch(said);
    expect(code).toBe(1);
  });

  it('holds only the app\'s own nodes still: the launcher behind it, once back has left, is not judged', () => {
    plant('reel');
    const launcher = (y: number) => node('launcher-icon', [0, y, 200, y + 200], ' package="com.google.android.apps.nexuslauncher"');
    writeFileSync(join(dir, 'reel-back-0.xml'), dump(launcher(1000)));
    writeFileSync(join(dir, 'reel-back-1.xml'), dump(launcher(1040)));
    expect(judge().code).toBe(0);
  });

  it('fails a screen whose instruments saw nothing, and a run with no screen', () => {
    writeFileSync(join(dir, 'stack.log'), 'nothing');
    const { code, out } = judge();
    expect(out).toMatch(/stack: no touch was measured/);
    expect(out).toMatch(/stack: the screen was never read/);
    expect(out).toMatch(/stack: no frame of the JS thread was read/);
    expect(code).toBe(1);
    rmSync(join(dir, 'stack.log'));
    expect(judge().out).toMatch(/no screen was run/);
  });

  it('picks a control in the middle of the screen to tap, never one in its head', () => {
    const xml = dump(node('back', [0, 80, 120, 200], ' clickable="true"').replace(' clickable="false"', ''),
      node('film-row', [0, 1100, 1080, 1300], ' clickable="true"').replace(' clickable="false"', ''));
    writeFileSync(join(dir, 'pick.xml'), xml);
    expect(spawnSync(process.execPath, [join(LAB, 'feel.mjs'), 'pick', join(dir, 'pick.xml')], { encoding: 'utf8' }).stdout.trim()).toBe('540 1200');
  });
});

describe('e2e/limits.json', () => {
  const limits = JSON.parse(readFileSync(join(MOBILE, 'e2e', 'limits.json'), 'utf8')) as { measures: Record<string, { value?: number | null; status: string; reason: string; tool: string; today?: number | null; in?: string; lowerIsBetter?: boolean; trigger?: string }> };
  const entries = Object.entries(limits.measures);
  const BEST_APP = ['coldStart', 'memory', 'imageWeight'];

  it('gives every measure its reason and a tool that exists', () => {
    for (const [k, m] of entries) {
      expect([k, m.reason.length >= 40]).toEqual([k, true]);
      expect([k, existsSync(join(MOBILE, m.tool))]).toEqual([k, true]);
      if (m.in) expect([k, existsSync(join(MOBILE, m.in))]).toEqual([k, true]);
    }
  });

  it('gives every measure a number, but the best-app numbers that wait for the owner, the records still to be measured and the launch build\'s own', () => {
    for (const [k, m] of entries) {
      if (m.in) continue;
      if (m.status === 'pending-owner') expect([k, BEST_APP.includes(k)]).toEqual([k, true]);
      else if (m.status === 'pending-lab') expect([k, m.value === null]).toEqual([k, true]);
      // Measured on the launch build alone, never invented before it: no number, and its trigger.
      else if (m.status === 'launch-time') expect([k, m.value === null, (m.trigger ?? '').length >= 20]).toEqual([k, true, true]);
      else expect([k, m.status, typeof m.value]).toEqual([k, 'set', 'number']);
    }
  });

  it('holds tap response and layout jumps to the physical floor', () => {
    expect(limits.measures.tapResponse?.value).toBeLessThanOrEqual(1000 / 60 + 0.05);
    expect(limits.measures.layoutJumps?.value).toBe(0);
  });

  it('is never looser than today, where today is measured', () => {
    for (const [k, m] of entries) {
      if (typeof m.today === 'number' && typeof m.value === 'number') expect([k, m.lowerIsBetter ? m.value <= m.today : m.value >= m.today]).toEqual([k, true]);
    }
  });

  it('hands the feel judge every number it reads', () => {
    expect(Object.values(ask('feel.mjs', 'm.feelLimits()') as Record<string, unknown>).every((v) => typeof v === 'number')).toBe(true);
  });
});

describe('floor-app.mjs', () => {
  it('writes an empty app on exactly the versions the app is built on, under its own name, with the build\'s own plugins', () => {
    const { files, plugins, pkgName } = ask('floor-app.mjs', '({ files: m.floorFiles(), plugins: m.BUILD_PLUGINS, pkgName: m.FLOOR_PACKAGE })') as { files: Record<string, string>; plugins: string[]; pkgName: string };
    const lock = JSON.parse(readFileSync(join(MOBILE, 'package-lock.json'), 'utf8'));
    const pkg = JSON.parse(files['package.json'] ?? '{}');
    for (const n of ['expo', 'react', 'react-native']) expect(pkg.dependencies[n]).toBe(lock.packages[`node_modules/${n}`].version);
    const app = JSON.parse(files['app.json'] ?? '{}').expo;
    expect(app.android.package).toBe(pkgName);
    expect(app.plugins).toEqual(plugins.map((p) => `./plugins/${p}`));
    for (const p of plugins) expect(existsSync(join(MOBILE, 'plugins', `${p}.js`))).toBe(true);
    expect(files['index.js']).toContain("console.warn('[floor] ready')");
  });

  it('reads a timed start: am\'s TotalTime and the memory once ready', () => {
    expect(ask('floor-app.mjs', "m.startOf('Status: ok\\nTotalTime: 412\\n', '  Native Heap:   9000\\n  TOTAL PSS:   61000\\n')")).toEqual({ totalMs: 412, pssKb: 61000, nativeKb: 9000 });
    expect(ask('floor-app.mjs', "m.startOf('', '')")).toEqual({ totalMs: null, pssKb: null, nativeKb: null });
  });
});

/**
 * groundsJudges.test.ts — the dark-mode run's judge (e2e/grounds-judges.mjs) and the PNG reader
 * it stands on (e2e/png.mjs): pictures written here, through every row filter a PNG may use, are
 * read back to the pixel; a body the system turned light or dark, or status-bar icons it turned
 * dark, fail the route; the same picture, or a small change of content, passes; two walks with no
 * route in common prove nothing and say so.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { crc32, deflateSync } from 'zlib';

const SCRIPT = join(__dirname, '..', 'grounds-judges.mjs');
const PNG = join(__dirname, '..', 'png.mjs');

/** One of a module's own answers, asked in a Node of its own (jest cannot load an ES module here). */
const ask = (module: string, expression: string): unknown => {
  const code = `const m = await import(${JSON.stringify(pathToFileURL(module).href)}); console.log(JSON.stringify(${expression}));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
};

type Rgb = [number, number, number];
/** A PNG of `width` × `height`, each pixel `at(x, y)`, its rows written with `filter` (0 none … 4 Paeth). */
function png(width: number, height: number, at: (x: number, y: number) => Rgb, filter = 0, alpha = true): Buffer {
  const ch = alpha ? 4 : 3;
  const px = (x: number, y: number, c: number) => (x < 0 || y < 0 ? 0 : c < 3 ? at(x, y)[c] ?? 0 : 255);
  const rows: number[] = [];
  for (let y = 0; y < height; y++) {
    rows.push(filter);
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < ch; c++) {
        const v = px(x, y, c);
        const a = px(x - 1, y, c);
        const b = px(x, y - 1, c);
        const d = px(x - 1, y - 1, c);
        const p = a + b - d;
        const pred = filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1
          : filter === 4 ? (Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - d) ? a : Math.abs(p - b) <= Math.abs(p - d) ? b : d) : 0;
        rows.push((v - pred + 256) & 0xff);
      }
    }
  }
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), body])));
    return Buffer.concat([len, Buffer.from(type, 'latin1'), body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))]);
}

describe('the PNG reader', () => {
  const at = (x: number, y: number): Rgb => [(x * 37 + y) & 0xff, (y * 11) & 0xff, (x ^ y) & 0xff];
  it.each([0, 1, 2, 3, 4])('reads back every pixel of rows written with filter %i, with and without alpha', (filter) => {
    for (const alpha of [true, false]) {
      const read = ask(PNG, `(() => { const p = m.decodePng(Buffer.from(${JSON.stringify(png(9, 7, at, filter, alpha).toString('base64'))}, 'base64')); return [p.width, p.height, [...p.pixels]]; })()`) as [number, number, number[]];
      const want: number[] = [];
      for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++) want.push(...at(x, y), 255);
      expect(read).toEqual([9, 7, want]);
    }
  });

  it('refuses what is not a PNG it can read, by name', () => {
    expect(() => ask(PNG, "m.decodePng(Buffer.from('not a picture'))")).toThrow(/not a PNG/);
  });
});

describe('the judge', () => {
  let dir = '';
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'grounds-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const DARK: Rgb = [14, 12, 10];
  const INK: Rgb = [200, 190, 170];
  const ICON: Rgb = [235, 235, 235];
  /** A screen of the app: a dark ground, a line of ink every tenth row, light icons in the status bar. */
  const screen = (ground: Rgb, icons: Rgb, ink: Rgb = INK) => png(40, 200, (x, y) => (y < 9 ? (x % 5 === 0 ? icons : DARK) : y % 10 === 0 ? ink : ground));
  const walk = (name: string, shots: Record<string, Buffer>) => {
    const d = join(dir, name);
    mkdirSync(join(d, 'routes', 'nested'), { recursive: true });
    const files = Object.keys(shots);
    writeFileSync(join(d, 'walk.tsv'), files.map((f, i) => `${f}\t/${i}\t0${i + 1}-r.png`).join('\n') + '\n');
    files.forEach((f, i) => writeFileSync(join(d, 'routes', 'nested', `0${i + 1}-r.png`), shots[f] as Buffer));
    return d;
  };
  const judge = (a: string, b: string) => spawnSync(process.execPath, [SCRIPT, a, b], { encoding: 'utf8' });

  it('passes a dark walk that draws every route as the plain one does, a small change of content included', () => {
    const plain = walk('plain', { 'app/a.tsx': screen(DARK, ICON), 'app/b.tsx': screen(DARK, ICON) });
    const dark = walk('dark', { 'app/a.tsx': screen(DARK, ICON), 'app/b.tsx': screen(DARK, ICON, [230, 225, 210]) });
    const r = judge(plain, dark);
    expect([r.status, r.stdout.trim().split('\n').at(-1)]).toEqual([0, 'every route as the plain run draws it: 2']);
  });

  it('fails a route whose ground the system turned light, one it turned dark, and one whose status icons it turned dark', () => {
    const PAPER: Rgb = [245, 245, 245];
    const plain = walk('plain', { 'app/a.tsx': screen(DARK, ICON), 'app/b.tsx': screen(DARK, ICON), 'app/c.tsx': screen(DARK, ICON), 'app/d.tsx': screen(PAPER, ICON) });
    const dark = walk('dark', { 'app/a.tsx': screen(PAPER, ICON), 'app/b.tsx': screen(DARK, [30, 30, 30]), 'app/c.tsx': screen(DARK, ICON), 'app/d.tsx': screen(DARK, ICON) });
    const r = judge(plain, dark);
    expect(r.status).toBe(1);
    const lines = r.stdout.trim().split('\n');
    expect(lines[0]).toMatch(/^✗ app\/a\.tsx: .* — its body's lightness 0\.\d\d → 0\.\d\d; near white 0% → \d+%$/);
    expect(lines[1]).toMatch(/^✗ app\/b\.tsx: .* — the status bar's icons [\d.]+% → 0\.0% light$/);
    expect(lines[2]).toMatch(/^✓ app\/c\.tsx: /);
    expect(lines[3]).toMatch(/^✗ app\/d\.tsx: .* — its body's lightness 0\.\d\d → 0\.\d\d; near white \d+% → 0%$/);
    expect(lines.at(-1)).toBe('3 of 4 routes drawn otherwise in dark mode');
  });

  it('reads of a moment the system draws part of only the app\'s part: a keyboard turned light passes, and the same screen as a route fails', () => {
    expect(ask(SCRIPT, 'm.PARTS')).toEqual({ 'above-keyboard': 0.5 });
    const plain = walk('plain', { 'app/k.tsx': screen(DARK, ICON), 'moment: the keyboard': screen(DARK, ICON) });
    // The keyboard: the lower 45% of the screen, which Android draws light in a light system.
    const keyboard = png(40, 200, (x, y) => (y >= 110 ? [236, 239, 241] : y < 9 ? (x % 5 === 0 ? ICON : DARK) : y % 10 === 0 ? INK : DARK));
    const dark = walk('dark', { 'app/k.tsx': keyboard, 'moment: the keyboard': keyboard });
    writeFileSync(join(plain, 'walk.tsv'), 'app/k.tsx\t/0\t01-r.png\nmoment: the keyboard\t/1\t02-r.png\tabove-keyboard\n');
    writeFileSync(join(dark, 'walk.tsv'), 'app/k.tsx\t/0\t01-r.png\nmoment: the keyboard\t/1\t02-r.png\tabove-keyboard\n');
    const r = judge(plain, dark);
    const lines = r.stdout.trim().split('\n');
    expect(lines[0]).toMatch(/^✗ app\/k\.tsx: .* — its body's lightness/);
    expect(lines[1]).toMatch(/^✓ moment: the keyboard \(above-keyboard\): /);
    expect([r.status, lines.at(-1)]).toEqual([1, '1 of 2 routes drawn otherwise in dark mode']);
  });

  it('proves nothing, and says so, for two walks with no captured route in common, or none at all', () => {
    const plain = walk('plain', { 'app/a.tsx': screen(DARK, ICON) });
    const dark = walk('dark', { 'app/z.tsx': screen(DARK, ICON) });
    expect(judge(plain, dark).status).toBe(2);
    expect(judge(plain, join(dir, 'nowhere')).status).toBe(2);
  });
});

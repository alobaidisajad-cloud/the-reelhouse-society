/**
 * THE VEIL MEETS THE LIGHT — where a photograph ends, nothing shows.
 * ──────────────────────────────────────────────────────────────────────────
 * A hero photograph fades into the room under a veil that lays down the lit
 * room (see RoomVeil). The join is seamless only if two things hold:
 *
 *   · the veil ends SOLID at the hem — a veil that stops short of full
 *     strength leaves the photograph's own bottom edge showing through; and
 *   · the light the veil carries is the room's light exactly — drawn from the
 *     one `lightGeometry`, never a second copy of the numbers.
 *
 * Measured on the renders when this was built: the film page's backdrop ended
 * in a step of 13 to 20 across two pixels; the Lobby's, 18 to 23; the member
 * file's plate, 13 to 23. After: continuous to within one level.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { BLOOM, CORNERS, LAMPS, POOL, lightGeometry } from '../light';

const ROOT = join(__dirname, '..', '..', '..');
function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}
const ALL = [...files(join(ROOT, 'app')), ...files(join(ROOT, 'src'))];

/** Every `const X: VeilStops = [...]` in the app, parsed. */
const VEILS = ALL.flatMap((f) => {
  const src = readFileSync(f, 'utf8');
  return [...src.matchAll(/const\s+(\w+)\s*:\s*VeilStops\s*=\s*(\[[^;]*\]);/g)].map((m) => ({
    where: `${relative(ROOT, f).split('\\').join('/')} · ${m[1]}`,
    stops: new Function(`return ${m[2]}`)() as [number, number][],
  }));
});

describe('every veil ends solid at its hem', () => {
  it('finds the veils (a scan that finds none proves nothing)', () => {
    expect(VEILS.length).toBeGreaterThanOrEqual(8);
  });

  it.each(VEILS.map((v) => [v.where, v.stops] as const))('%s runs from 0 to a solid 1', (_, stops) => {
    expect(stops[0][0]).toBe(0);
    expect(stops[stops.length - 1]).toEqual([1, 1]);
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i][0]).toBeGreaterThan(stops[i - 1][0]);
      // A veil only ever darkens toward its hem.
      expect(stops[i][1]).toBeGreaterThanOrEqual(stops[i - 1][1]);
    }
    for (const [, a] of stops) { expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThanOrEqual(1); }
  });
});

describe('one geometry for the light', () => {
  const W = 390, H = 844;

  it('hangs the pool from the crown with no photograph, and from the hem under one', () => {
    expect(lightGeometry('film', W, H).pool.cy).toBeCloseTo(POOL.crownY * H);
    expect(lightGeometry('film', W, H, 439).pool.cy).toBe(439);
  });

  it('burns at the lamp’s strength, and at underHero of it beneath a photograph', () => {
    for (const [room, lamp] of Object.entries(LAMPS)) {
      const open = lightGeometry(room as never, W, H).pool.stops;
      const under = lightGeometry(room as never, W, H, 400).pool.stops;
      expect(open[0][1]).toBeCloseTo(lamp.strength, 4);
      expect(under[0][1]).toBeCloseTo(lamp.strength * POOL.underHero, 4);
      expect(open.map(([at]) => at)).toEqual(POOL.stops.map(([at]) => at));
    }
  });

  it('sizes the pool, corners and bloom from the screen', () => {
    const g = lightGeometry('lobby', W, H, 549);
    expect(g.pool.rx).toBeCloseTo(POOL.rx * W);
    expect(g.pool.ry).toBeCloseTo(POOL.ry * H);
    expect(g.corners.rx).toBeCloseTo(CORNERS.rx * W);
    expect(g.bloom.width).toBeCloseTo(W * BLOOM.scale);
    expect(g.bloom.left).toBeCloseTo(-(W * BLOOM.scale - W) / 2);
    expect(g.bloom.height).toBeCloseTo(BLOOM.height * H);
  });

  it('is the only place the room’s light reads its recipe', () => {
    // The drawings read lightGeometry; none reaches past it to the raw numbers.
    const drawn = readFileSync(join(ROOT, 'src/components/atmosphere/RoomLight.tsx'), 'utf8');
    expect(drawn).toMatch(/lightGeometry\(/);
    expect(drawn).not.toMatch(/\b(POOL|CORNERS|FLOOR|LAMPS)\./);
  });
});

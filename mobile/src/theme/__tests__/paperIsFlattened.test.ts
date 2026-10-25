/**
 * paperIsFlattened.test.ts — a card's paper drawn as one opaque gradient is the
 * paper the eye was shown when it was three layers.
 *
 * The layers are composited here the long way, as a screen does: the paper,
 * then the edge's face light falling to nothing at EDGE.faceTo, then the wash
 * between its two colours at WASH's strength, at every 1% of the height. The
 * flat gradient, read at the same height between its stops, is that colour to
 * within half a level of 255.
 */
import { EDGE, WASH, flatPaper, seenAt } from '../light';

type C = { r: number; g: number; b: number; a: number };
const read = (s: string): C => {
  const m = /\(([^)]+)\)/.exec(s);
  if (m) {
    const p = m[1].split(',').map(Number);
    return { r: p[0] ?? 0, g: p[1] ?? 0, b: p[2] ?? 0, a: p[3] ?? 1 };
  }
  const v = parseInt(s.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255, a: 1 };
};
const lay = (top: C, under: C): C => ({
  r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1,
});
const mid = (x: C, y: C, t: number): C => ({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t, a: x.a + (y.a - x.a) * t });

/** The three layers, composited at height y (0 the top, 1 the foot). */
function layered(paper: string, from: string, to: string, y: number): C {
  const face = read(EDGE.face);
  const lit = { ...face, a: y >= EDGE.faceTo ? 0 : face.a * (1 - y / EDGE.faceTo) };
  const wash = mid(read(from), read(to), y);
  return lay({ ...wash, a: wash.a * WASH.opacity }, lay(lit, read(paper)));
}

/** The flat gradient's colour at height y, between its stops. */
function flat(p: ReturnType<typeof flatPaper>, y: number): C {
  const [s0, s1, s2] = p.locations;
  const [c0, c1, c2] = p.colors.map(read);
  return y <= s1 ? mid(c0, c1, (y - s0) / (s1 - s0)) : mid(c1, c2, (y - s1) / (s2 - s1));
}

const CARDS = {
  plain: ['#1E1914', 'rgba(30,25,20,0.95)', 'rgba(6,5,4,0.98)'],
  premium: ['#0D0B09', 'rgba(30,25,20,0.95)', 'rgba(6,5,4,0.98)'],
  auteur: ['#2A140D', 'rgba(40,18,18,0.7)', 'rgba(14,5,5,0.95)'],
} as const;

describe('a card\'s paper, flattened', () => {
  it.each(Object.entries(CARDS))('%s: the colour the three layers made, at every height, within half a level', (_, [paper, from, to]) => {
    const p = flatPaper(paper, from, to);
    let worst = 0;
    for (let i = 0; i <= 100; i++) {
      const y = i / 100;
      const want = layered(paper, from, to, y);
      const got = flat(p, y);
      worst = Math.max(worst, Math.abs(want.r - got.r), Math.abs(want.g - got.g), Math.abs(want.b - got.b));
    }
    expect(worst).toBeLessThanOrEqual(0.5);
  });

  it('is opaque, with its top line as the highlight showed under the wash', () => {
    const p = flatPaper(...CARDS.plain);
    expect(p.colors.every((c) => c.startsWith('rgb('))).toBe(true);
    const under = lay(read(EDGE.highlight), lay(read(EDGE.face), read(CARDS.plain[0])));
    const wash = read(CARDS.plain[1]);
    const want = lay({ ...wash, a: wash.a * WASH.opacity }, under);
    const got = read(p.line);
    expect(Math.max(Math.abs(want.r - got.r), Math.abs(want.g - got.g), Math.abs(want.b - got.b))).toBeLessThanOrEqual(0.5);
  });

  it('says NO to paper that leaves out a layer', () => {
    const p = flatPaper(...CARDS.plain);
    const bare = read(CARDS.plain[0]);
    const top = read(p.colors[0]);
    expect(Math.max(Math.abs(bare.r - top.r), Math.abs(bare.g - top.g), Math.abs(bare.b - top.b))).toBeGreaterThan(2);
  });

  it('draws a view\'s opacity into the colour itself', () => {
    expect(seenAt('rgba(184, 137, 26, 0.08)', 0.35)).toBe('rgba(184,137,26,0.028)');
    expect(seenAt('#1E1914', 0.5)).toBe('rgba(30,25,20,0.5)');
  });
});

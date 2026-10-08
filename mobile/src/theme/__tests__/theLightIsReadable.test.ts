/**
 * theLightIsReadable.test.ts — every gradient the light is drawn with is one
 * React Native can read, and reads as the shape it was meant to be.
 *
 * The room's light, the Lobby's vignette, a member's spotlight and the doors'
 * candlelight halo are native
 * backgrounds (`experimental_backgroundImage`), not SVGs. React Native parses
 * that CSS itself, and a gradient it cannot read is DROPPED: no error, no
 * warning, the light simply gone. So each string is read back here through
 * React Native's own parser — the code the phone runs — and every centre,
 * radius and stop compared with the numbers it was built from.
 */
import { EDGE_LIT, LAMPS, lightGeometry, roomLightImage, spotlightImage, type Room } from '@/src/theme/light';
import { VIGNETTE_IMAGE } from '@/src/components/CinematicOverlays';
import { candlelightImage } from '@/src/components/auth/AuthChrome';
import { colors } from '@/src/theme/theme';

type Stop = { color: number; position: string | number };
type Layer = {
  type: string;
  shape?: string;
  size?: { x: number | string; y: number | string };
  position?: { top?: number | string; left?: number | string; bottom?: number | string; right?: number | string };
  direction?: { type: string; value: number };
  colorStops: Stop[];
};

// React Native's own parser, as the phone runs it (it ships no type declarations).
const processBackgroundImage: (css: string) => unknown =
  require('react-native/Libraries/StyleSheet/processBackgroundImage').default;
const read = (css: string) => processBackgroundImage(css) as Layer[];
/** A colour as [r, g, b, alpha 0–255]. */
const rgba = (c: number) => [(c >>> 16) & 255, (c >>> 8) & 255, c & 255, (c >>> 24) & 255];
const near = (a: number | string | undefined, b: number) => expect(Math.abs(Number(a) - b)).toBeLessThanOrEqual(0.006);
/** Where Android puts a layer's centre, down from the top of a box H tall (RadialGradient.getShader). */
const centreY = (l: Layer, H: number) => (l.position?.top != null ? Number(l.position.top) : H - Number(l.position?.bottom));

/**
 * Every number Android is handed: positions, sizes and stops. Android keeps a
 * length or a percentage only when it is zero or more (LengthPercentage) and
 * reads any other as NONE — a centre falls back to the middle of the box.
 */
const androidNumbers = (l: Layer): number[] => [
  ...Object.values(l.position ?? {}), ...(l.size && typeof l.size === 'object' ? [l.size.x, l.size.y] : []), ...l.colorStops.map((c) => c.position),
].map((v) => (typeof v === 'string' ? parseFloat(v) : v));

const ROOMS = Object.keys(LAMPS) as Room[];
const SCREENS: [number, number][] = [[320, 568], [393, 852], [430, 932], [412, 915], [800, 1280]];

describe("the room's light", () => {
  const cases = SCREENS.flatMap(([W, H]) => ROOMS.flatMap((room) => [undefined, 280].map((hem) => ({ W, H, room, hem }))));

  it('reads as three layers on every screen, in every room, with and without a photograph above it', () => {
    expect(cases.length).toBe(SCREENS.length * ROOMS.length * 2);
    for (const { W, H, room, hem } of cases) {
      expect(read(roomLightImage(lightGeometry(room, W, H, hem), H)).map((l) => l.type))
        .toEqual(['radial-gradient', 'linear-gradient', 'radial-gradient']);
    }
  });

  it('draws the corners, the floor and the pool where lightGeometry puts them, at its strengths', () => {
    for (const { W, H, room, hem } of cases) {
      const g = lightGeometry(room, W, H, hem);
      const [corners, floor, pool] = read(roomLightImage(g, H));

      for (const [layer, e, rgb] of [[corners, g.corners, [0, 0, 0]], [pool, g.pool, g.pool.rgb]] as const) {
        expect(layer.shape).toBe('ellipse');
        near(layer.size?.x, e.rx);
        near(layer.size?.y, e.ry);
        near(layer.position?.left, e.cx);
        near(centreY(layer, H), e.cy);
        expect(layer.colorStops.map((s) => s.position)).toEqual(e.stops.map(([at]) => `${+(at * 100).toFixed(2)}%`));
        expect(layer.colorStops.map((s) => rgba(s.color))).toEqual(e.stops.map(([, a]) => [...rgb, Math.round(a * 255)]));
      }

      expect(floor.direction).toEqual({ type: 'angle', value: 180 });
      floor.colorStops.forEach((s, i) => near(s.position, g.floor.stops[i][0] * H));
      expect(floor.colorStops.map((s) => rgba(s.color))).toEqual(g.floor.stops.map(([, a]) => [0, 0, 0, Math.round(a * 255)]));
    }
  });

  it('hangs the pool from the hem under a photograph, and above the crown without one', () => {
    const pool = (hem?: number) => read(roomLightImage(lightGeometry('film', 393, 852, hem), 852))[2];
    expect(pool(300).position).toEqual({ top: 300, left: 196.5 });
    // Above the screen: given from the bottom edge, a positive distance past the screen's height.
    expect(pool().position).toEqual({ bottom: 852 + 0.06 * 852, left: 196.5 });
    expect(centreY(pool(), 852)).toBeCloseTo(-0.06 * 852, 2);
  });
});

describe('the vignette', () => {
  it('is one ellipse, 72% by 58%, centred, clear to 55% and 0.34 black at its rim', () => {
    const [v, ...more] = read(VIGNETTE_IMAGE);
    expect(more).toEqual([]);
    expect(v).toMatchObject({ type: 'radial-gradient', shape: 'ellipse', size: { x: '72%', y: '58%' }, position: { top: '50%', left: '50%' } });
    expect(v.colorStops.map((s) => [rgba(s.color), s.position])).toEqual([[[0, 0, 0, 0], '55%'], [[0, 0, 0, Math.round(0.34 * 255)], '100%']]);
  });
});

describe("a member's spotlight", () => {
  // The SVG it replaced: an ellipse at (50%, 28%) with radii 62% × 58% of the
  // plate, filled with a gradient at (50%, 22%), radii 58% × 62% — measured
  // against the ELLIPSE's bounding box, the SVG default.
  const box = { x: 50 - 62, y: 28 - 58, w: 2 * 62, h: 2 * 58 };
  const svg = { cx: box.x + 0.5 * box.w, cy: box.y + 0.22 * box.h, rx: 0.58 * box.w, ry: 0.62 * box.h };

  it('has the centre and radii the SVG drew, in the plate’s own percentages', () => {
    for (const [tint, opacity] of [['#B42D2D', 0.2], [colors.champagne, 0.26], ['#B8891A', 0.18]] as const) {
      const [s, ...more] = read(spotlightImage(tint, opacity));
      expect(more).toEqual([]);
      expect(s.shape).toBe('ellipse');
      expect(s.size).toEqual({ x: `${+svg.rx.toFixed(2)}%`, y: `${+svg.ry.toFixed(2)}%` });
      // Above the plate, so from its bottom edge (100% down, then 4.48% more).
      expect(s.position).toEqual({ left: `${svg.cx}%`, bottom: `${+(100 - svg.cy).toFixed(2)}%` });
      const v = parseInt(tint.slice(1), 16);
      const rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
      expect(s.colorStops.map((c) => [rgba(c.color), c.position])).toEqual([[[...rgb, Math.round(opacity * 255)], '0%'], [[...rgb, 0], '100%']]);
    }
  });

  it('loses nothing to the ellipse it no longer fills: inside the plate, the gradient was never cut', () => {
    let checked = 0;
    for (const W of [320, 393, 430, 800]) {
      const H = 340;
      for (let x = 0; x <= W; x += 2) {
        for (let y = 0; y <= H; y += 2) {
          const t = Math.hypot((x / W * 100 - svg.cx) / svg.rx, (y / H * 100 - svg.cy) / svg.ry);
          const inEllipse = ((x / W * 100 - 50) / 62) ** 2 + ((y / H * 100 - 28) / 58) ** 2 <= 1;
          if (!inEllipse) expect(t).toBeGreaterThanOrEqual(1);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(10_000);
  });
});

describe('the candlelight halo', () => {
  it('is a circle as wide as its square: candlelight at the heart, brass at 42%, nothing at the rim', () => {
    for (const [size, intensity] of [[180, 0.5], [132, 0.38], [96.5, 0.5]] as const) {
      const [h, ...more] = read(candlelightImage(size, intensity));
      expect(more).toEqual([]);
      expect(h).toMatchObject({ type: 'radial-gradient', shape: 'ellipse', position: { top: '50%', left: '50%' } });
      near(h.size?.x, size / 2);
      near(h.size?.y, size / 2);
      const hex = (c: string) => { const v = parseInt(c.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
      expect(h.colorStops.map((c) => [rgba(c.color), c.position])).toEqual([
        [[...hex(colors.flicker), Math.round(intensity * 255)], '0%'],
        [[...hex(colors.sepia), Math.round(intensity * 0.32 * 255)], '42%'],
        [[...hex(colors.sepia), 0], '100%'],
      ]);
    }
  });
});

it('hands Android no negative number, in any light, on any screen, in any room', () => {
  const layers = [
    ...SCREENS.flatMap(([W, H]) => (Object.keys(LAMPS) as Room[]).flatMap((room) =>
      [undefined, 0, 280].flatMap((hem) => read(roomLightImage(lightGeometry(room, W, H, hem), H))))),
    ...read(VIGNETTE_IMAGE),
    ...read(spotlightImage('#B42D2D', 0.2)),
    ...read(candlelightImage(180, 0.5)),
    ...read(EDGE_LIT.experimental_backgroundImage),
  ];
  const numbers = layers.flatMap(androidNumbers);
  expect(numbers.length).toBeGreaterThan(1000);
  expect(numbers.filter((v) => !(v >= 0))).toEqual([]);
});

it("a lit surface's edge reads too", () => {
  expect(read(EDGE_LIT.experimental_backgroundImage).map((l) => l.type)).toEqual(['linear-gradient']);
});

/**
 * theBeamFallsAwayInsideThePage.test.tsx — the welcome's projector beam on a wide window.
 *
 * The phone's beam, wider than the page, was cut by the page's edges: on a phone those are the
 * screen's, on the iPad two straight lines down the screen (ios-launch 43607139446). Drawn as a
 * shaft and tilted as the phone's beam is, iOS drew only the half of its plane before the page: the
 * light began at the window's middle in a straight line, at its brightest, and its foot still met
 * the page's edges in two lines (ios-launch 43670385265, read by ios-ipad-judge.mjs). On a wide
 * window the shaft is drawn flat, already tilted, by a shader (SHAFT_SKSL); here that shader is
 * compiled and drawn by CanvasKit, Skia itself, and its light read as the judge reads a photograph.
 */
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { render } from '@testing-library/react-native';
import { ProjectorBeam, SHAFT_PEAK, SHAFT_SKSL } from '../ProjectorBeam';

jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useFocusEffect: () => undefined }));

type Node = { type: string; props: Record<string, unknown>; children?: (Node | string)[] | null };
const find = (n: Node | string | null, type: string): Node | null => {
  if (!n || typeof n === 'string') return null;
  if (n.type === type) return n;
  for (const c of n.children ?? []) { const hit = find(c, type); if (hit) return hit; }
  return null;
};

const was = Dimensions.get;
afterEach(() => { Dimensions.get = was; });
function windowOf(width: number, height: number) {
  const real = was.bind(Dimensions);
  Dimensions.get = ((what: 'window' | 'screen') => ({ ...real(what), width, height, fontScale: 1 })) as typeof Dimensions.get;
}
function Beam() {
  const scrollY = useSharedValue(0);
  return <ProjectorBeam scrollY={scrollY} />;
}

// ── The shader, drawn by Skia ────────────────────────────────────────────────

type CK = {
  RuntimeEffect: { Make(sksl: string, onError?: (e: string) => void): { makeShader(u: number[]): unknown } | null };
  MakeSurface(w: number, h: number): { getCanvas(): { drawRect(r: unknown, p: unknown): void; clear(c: unknown): void }; makeImageSnapshot(): { readPixels(x: number, y: number, info: unknown): Uint8Array } };
  Paint: new () => { setShader(s: unknown): void; setColor(c: unknown): void };
  XYWHRect(x: number, y: number, w: number, h: number): unknown;
  Color(r: number, g: number, b: number, a: number): unknown;
  ColorType: { RGBA_8888: unknown }; AlphaType: { Unpremul: unknown }; ColorSpace: { SRGB: unknown };
};
let ck: CK;
// CanvasKit decodes its strings as UTF-16, which the app's own TextDecoder (Expo's) does not
// read: Node's stands in while it is drawn here.
const appDecoder = globalThis.TextDecoder;
beforeAll(async () => {
  globalThis.TextDecoder = (jest.requireActual('util') as typeof import('util')).TextDecoder as unknown as typeof TextDecoder;
  const dir = require.resolve('canvaskit-wasm/bin/canvaskit.js').replace(/canvaskit\.js$/, '');
  const init = jest.requireActual('canvaskit-wasm/bin/canvaskit.js') as (o: { locateFile: (f: string) => string }) => Promise<CK>;
  ck = await init({ locateFile: (f) => dir + f });
}, 30000);
afterAll(() => { globalThis.TextDecoder = appDecoder; });


/** The iPad's page: 560 points of column, 1376 of window, drawn at 2 pixels a point as the iPad draws it. */
const W = 560;
const H = 1376;
const SCALE = 2;
const PW = W * SCALE;
const PH = H * SCALE;
/** The welcome's ink, the ground the shaft lights. */
const INK = 13;

type Red = (x: number, y: number) => number;

/**
 * The shaft drawn over the ink at the iPad's scale, read by pixel: `red`, its brightest channel, for
 * where it begins and how bright it is, and `level`, the mean of its channels, as the judge reads a
 * photograph for edges and bands.
 */
function drawn(swing = 0): { red: Red; level: Red } {
  let error = '';
  const effect = ck.RuntimeEffect.Make(SHAFT_SKSL, (e) => { error = e; });
  if (!effect) throw new Error(`the shaft did not compile: ${error}`);
  const surface = ck.MakeSurface(PW, PH);
  const canvas = surface.getCanvas() as ReturnType<ReturnType<CK['MakeSurface']>['getCanvas']> & { scale(x: number, y: number): void };
  canvas.clear(ck.Color(INK, 11, 9, 1));
  canvas.scale(SCALE, SCALE);
  const paint = new ck.Paint();
  paint.setShader(effect.makeShader([W, H, swing]));
  canvas.drawRect(ck.XYWHRect(0, 0, W, H), paint);
  const px = surface.makeImageSnapshot().readPixels(0, 0, { width: PW, height: PH, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB });
  const at = (x: number, y: number) => (PW * y + x) * 4;
  return {
    red: (x, y) => px[at(x, y)] ?? 0,
    level: (x, y) => ((px[at(x, y)] ?? 0) + (px[at(x, y) + 1] ?? 0) + (px[at(x, y) + 2] ?? 0)) / 3,
  };
}
/** The ink's own level, as the judge reads it. */
const GROUND = (INK + 11 + 9) / 3;

const clamp = (v: number, hi: number) => Math.min(hi - 1, Math.max(0, v));
/** Down a column: each row the mean of 9 pixels across it, the grain averaged away as an eye averages it. */
const down = (red: Red, x = PW / 2) => Array.from({ length: PH }, (_, y) => {
  let sum = 0;
  for (let d = -4; d <= 4; d++) sum += red(clamp(x + d, PW), y);
  return sum / 9;
});
/** Across a row, the same way. */
const across = (red: Red, y: number) => Array.from({ length: PW }, (_, x) => {
  let sum = 0;
  for (let d = -4; d <= 4; d++) sum += red(x, clamp(y + d, PH));
  return sum / 9;
});
/** The largest step between neighbouring 8-pixel stretches: the judge's measure of an edge. */
const largestStep = (levels: number[]) => {
  let step = 0;
  const mean = (a: number, b: number) => levels.slice(a, b).reduce((s, v) => s + v, 0) / (b - a);
  for (let i = 0; i + 16 <= levels.length; i++) step = Math.max(step, Math.abs(mean(i, i + 8) - mean(i + 8, i + 16)));
  return step;
};
/** The judge's band: a run of one colour with all of the 8 pixels before it on one side of its level, all after on the other. */
const longestBand = (raw: number[]) => {
  const side = (a: number, b: number, v: number) => {
    const s = raw.slice(Math.max(0, a), Math.min(raw.length, b));
    if (s.length < 8) return 0;
    return s.every((x) => x < v) ? -1 : s.every((x) => x > v) ? 1 : 0;
  };
  let band = 0;
  for (let start = 0, i = 1; i <= raw.length; i++) {
    if (i < raw.length && (raw[i] ?? NaN) === (raw[start] ?? NaN)) continue;
    const before = side(start - 8, start, raw[start] ?? 0);
    if (before !== 0 && side(i, i + 8, raw[start] ?? 0) === -before) band = Math.max(band, i - start);
    start = i;
  }
  return band;
};
/** The judge's windows (ios-ipad-judge.mjs): down the heart from under the rule to above the button, across at three heights. */
const DOWN: [number, number] = [0.39, 0.83];
/** The heart's rows the judge reads, in pixels. */
const heartRows = (): [number, number] => [Math.round(PH * DOWN[0]), Math.round(PH * DOWN[1])];
const ACROSS = [0.5, 0.65, 0.8];

describe('the projector beam', () => {
  it('on a wide window, is a shaft drawn flat by its shader over the page, the view only flickering', () => {
    windowOf(1032, 1376);
    const tree = render(<Beam />).toJSON() as unknown as Node;
    expect(find(tree, 'ViewManagerAdapter_ExpoLinearGradient')).toBeNull();
    expect(find(tree, 'SkiaRect')?.props).toMatchObject({ x: 0, y: 0, width: W, height: H });
    expect(find(tree, 'SkiaShader')?.props.source).toBeTruthy();
    // Not tilted again as a view: iOS drew only the half of a tilted plane before the page.
    const view = StyleSheet.flatten(tree.props.style as never) as { transform?: unknown };
    expect(view.transform).toBeUndefined();
  });

  it('on a phone, keeps the phone\'s beam, tilted as a view', () => {
    windowOf(402, 874);
    const tree = render(<Beam />).toJSON() as unknown as Node;
    expect(find(tree, 'SkiaRect')).toBeNull();
    expect(find(tree, 'ViewManagerAdapter_ExpoLinearGradient') ?? find(tree, 'LinearGradient') ?? find(tree, 'ExpoLinearGradient')).not.toBeNull();
    const view = StyleSheet.flatten(tree.props.style as never) as { transform?: unknown[] };
    expect(view.transform?.length).toBeGreaterThan(0);
  });

  it('begins under the welcome softly, never in a line, its heart where the approved beam has it', () => {
    const heart = down(drawn().red);
    const peak = Math.max(...heart);
    const lit = heart.findIndex((v) => v > INK + 0.5);
    const half = heart.findIndex((v) => v > INK + (peak - INK) / 2);
    // The approved beam (the mockup shown, 2026-11-14): lit from a third of the way down, its heart
    // under the rule, a little below four tenths, and as bright.
    expect(lit / PH).toBeGreaterThan(0.3);
    expect(lit / PH).toBeLessThan(0.4);
    expect(heart.indexOf(peak) / PH).toBeGreaterThan(0.38);
    expect(heart.indexOf(peak) / PH).toBeLessThan(0.48);
    expect(peak - INK).toBeGreaterThan(SHAFT_PEAK * 200);
    // A light coming up, not a line: tens of points to half its brightness, no row a step above the last.
    expect((half - lit) / SCALE).toBeGreaterThan(20);
    for (let y = 1; y < PH; y++) expect(Math.abs((heart[y] ?? 0) - (heart[y - 1] ?? 0))).toBeLessThan(1.5);
  });

  it('holds no edge where the judge reads it, and falls away before the page\'s sides at every height', () => {
    const { level } = drawn();
    const [from, to] = heartRows();
    expect(largestStep(down(level).slice(from, to))).toBeLessThan(1.5);
    for (const f of [...ACROSS, 0.9, 0.99]) {
      const row = across(level, Math.round(PH * f));
      expect(largestStep(row)).toBeLessThan(1.5);
      // At the page's sides the ground alone: the margin beside it is the same ink.
      expect(row[0] ?? 99).toBeLessThan(GROUND + 0.6);
      expect(row[PW - 1] ?? 99).toBeLessThan(GROUND + 0.6);
    }
  });

  it('holds no band: no run of one colour stands as a stair in its light', () => {
    const { level } = drawn();
    const [from, to] = heartRows();
    expect(longestBand(Array.from({ length: to - from }, (_, i) => level(PW / 2, from + i)))).toBeLessThanOrEqual(4);
    for (const f of ACROSS) {
      const y = Math.round(PH * f);
      expect(longestBand(Array.from({ length: PW / 2 }, (_, i) => level(PW / 4 + i, y)))).toBeLessThanOrEqual(4);
    }
  });

  it('sways to either side with no edge and nothing past the page', () => {
    for (const swing of [-0.1, 0.1].map((s) => (s * 15 * Math.PI) / 180)) {
      const { level } = drawn(swing);
      const [from, to] = heartRows();
      expect(largestStep(down(level).slice(from, to))).toBeLessThan(1.5);
      for (const f of [0.65, 0.9]) {
        const row = across(level, Math.round(PH * f));
        expect(largestStep(row)).toBeLessThan(1.5);
        expect(Math.max(row[0] ?? 99, row[PW - 1] ?? 99)).toBeLessThan(GROUND + 0.6);
      }
    }
  });
});

/**
 * theBeamFallsAwayInsideThePage.test.tsx — the welcome's projector beam on a wide window.
 *
 * The phone's beam, wider than the page, was cut by the page's edges: on a phone those are the
 * screen's, on the iPad two straight lines down the screen (the photographs of ios-launch
 * 43607139446, read by ios-ipad-judge.mjs: a step of 1.75 levels, and one colour for 12 to 17 px).
 * On a wide window it is a shaft inside the page, its light falling away on every side before any
 * edge, drawn in Skia and dithered; the phone keeps its beam.
 */
import React from 'react';
import { Dimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { render } from '@testing-library/react-native';
import { ProjectorBeam, SHAFT_PEAK, shaftStops } from '../ProjectorBeam';

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

describe('the projector beam', () => {
  it('on a wide window, is a shaft inside the page, drawn in Skia, dithered, its light an ellipse falling away', () => {
    windowOf(1032, 1376);
    const tree = render(<Beam />).toJSON() as unknown as Node;
    // The shaft is drawn over a canvas as wide as the phone's beam: 1.5 columns.
    expect(find(tree, 'ViewManagerAdapter_ExpoLinearGradient')).toBeNull();
    const rect = find(tree, 'SkiaRect');
    expect(rect?.props).toMatchObject({ x: 0, y: 0, width: 840, height: 1376, dither: true });
    const light = find(tree, 'SkiaRadialGradient');
    const { colors, positions } = shaftStops();
    expect(light?.props).toMatchObject({ c: { x: 420, y: 1376 * 0.46 }, r: 840 * 0.26, colors, positions });
    // Taller than wide: the ellipse is drawn as a circle stretched about its own heart.
    expect(light?.props.origin).toEqual({ x: 420, y: 1376 * 0.46 });
    expect(light?.props.transform).toEqual([{ scaleY: (1376 * 0.48) / (840 * 0.26) }]);
  });

  it('falls away as a real light does: brightest at its heart, eased to nothing, never a straight fade', () => {
    const { colors, positions } = shaftStops();
    const alpha = colors.map((c) => Number(/,([\d.]+)\)$/.exec(c)?.[1]));
    expect(positions[0]).toBe(0);
    expect(positions[positions.length - 1]).toBe(1);
    expect(alpha[0]).toBeCloseTo(SHAFT_PEAK, 4);
    expect(alpha[alpha.length - 1]).toBe(0);
    // Ever dimmer, and eased: it leaves its heart slowly and arrives at nothing slowly.
    alpha.slice(1).forEach((a, i) => expect(a).toBeLessThan(alpha[i] ?? 0));
    const first = (alpha[0] ?? 0) - (alpha[1] ?? 0);
    const middle = (alpha[5] ?? 0) - (alpha[6] ?? 0);
    const last = (alpha[alpha.length - 2] ?? 0) - (alpha[alpha.length - 1] ?? 0);
    expect(first).toBeLessThan(middle / 3);
    expect(last).toBeLessThan(middle / 3);
  });

  it('on a phone, keeps the phone\'s beam, cut by the screen\'s own edges', () => {
    windowOf(402, 874);
    const tree = render(<Beam />).toJSON() as unknown as Node;
    expect(find(tree, 'SkiaRect')).toBeNull();
    expect(find(tree, 'ViewManagerAdapter_ExpoLinearGradient') ?? find(tree, 'LinearGradient') ?? find(tree, 'ExpoLinearGradient')).not.toBeNull();
  });
});

/**
 * Buster: what he promises, held against the component itself.
 *
 *   • every mood and size has its own picture, drawn at exactly that size
 *   • he arrives only once his picture is loaded and his room is laid out
 *   • short of room he stands smaller, steps aside under half, and comes back
 *   • he moves only while his screen is in front and Reduce Motion is off,
 *     and runs no loop he has no use for
 *   • he is never spoken; what he says (a message) is
 *   • the still Buster draws where no navigator answers: the crash nets
 *   • the eyes come up late, and are the progress a screen reader hears
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { cancelAnimation, ReduceMotion, useReducedMotion, withDelay, withRepeat } from 'react-native-reanimated';
import Buster, { BusterEyes, BusterStill, EYES_AFTER_MS, type BusterPicture } from '../Buster';
import { BUSTER_ART, type BusterArtKey } from '../busterArt';

let mockFocused = true;
let mockNoNavigator = false;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => {
    if (mockNoNavigator) throw new Error('useIsFocused outside a navigator');
    return mockFocused;
  },
}));

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };
/** Every host element drawn, hidden ones included. */
function hosts(json: unknown, out: Node[] = []): Node[] {
  if (!json || typeof json !== 'object') return out;
  if (Array.isArray(json)) { json.forEach((j) => hosts(j, out)); return out; }
  const n = json as Node;
  out.push(n);
  (n.children ?? []).forEach((c) => hosts(c, out));
  return out;
}
const ofType = (json: unknown, type: string) => hosts(json).filter((n) => n.type === type);
const flat = (style: unknown): Record<string, unknown> =>
  Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : ((style as Record<string, unknown>) ?? {});
const layout = (height: number, width = 80) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
/** Both his layers say they have loaded: the picture under his points, and the lids over them where he has points. */
async function loadAll(view: ReturnType<typeof render>) {
  await fireEvent(view.getByTestId('buster-picture', { includeHiddenElements: true }), 'load');
  const over = view.queryByTestId('buster-over', { includeHiddenElements: true });
  if (over) await fireEvent(over, 'load');
}
const pictures = (Object.keys(BUSTER_ART) as BusterArtKey[]).map((key) => {
  const [mood, size] = key.split('-');
  return { key, picture: { mood, size: Number(size) } as BusterPicture };
});

beforeEach(() => {
  mockFocused = true;
  mockNoNavigator = false;
  (useReducedMotion as jest.Mock).mockReturnValue(false);
  (withRepeat as jest.Mock).mockClear();
  (withDelay as jest.Mock).mockClear();
});

describe('Buster', () => {
  it('has a picture for every mood and size, drawn at exactly that size', () => {
    expect(pictures.length).toBeGreaterThanOrEqual(8);
    for (const { key, picture } of pictures) {
      const art = BUSTER_ART[key];
      const view = render(<Buster {...picture} />);
      const image = ofType(view.toJSON(), 'ExpoImage');
      expect(image.map((i) => i.props.source)).toEqual(art.over ? [art.picture, art.over] : [art.picture]);
      expect(Boolean(art.over)).toBe(art.eyes.length > 0); // every picture with points has its lids apart
      // His room is exactly the picture's size; the picture fills the figure that fills it.
      expect(flat(view.getByTestId(`buster-${picture.mood}`, { includeHiddenElements: true }).props.style)).toMatchObject({ width: art.width, height: art.height });
      expect(flat(view.getByTestId('buster-figure', { includeHiddenElements: true }).props.style)).toMatchObject({ height: '100%', aspectRatio: art.width / art.height });
      expect(flat(image[0].props.style)).toMatchObject({ width: '100%', height: '100%' });
      expect(Number.isInteger(art.height)).toBe(true);
    }
  });

  /** His arriving layer's opacity, as last drawn (a re-render reads the shared value again). */
  const shownIn = (view: ReturnType<typeof render>, n: number) => {
    view.rerender(<Buster mood="unimpressed" size={80} style={{ margin: n }} />);
    return flat(view.getByTestId('buster-figure', { includeHiddenElements: true }).props.style).opacity;
  };

  it('lays his lids over his points, as the drawing paints them: picture, points, lids', async () => {
    for (const [still, mood] of [[false, 'suspicious'], [true, 'moved']] as const) {
      const view = render(still ? <BusterStill mood={mood} size={80} /> : <Buster mood={mood} size={80} />);
      if (!still) await fireEvent(view.getByTestId(`buster-${mood}`, { includeHiddenElements: true }), 'layout', layout(110));
      await loadAll(view);
      const order = hosts(view.toJSON()).map((n) => (n.props.testID === 'buster-picture' ? 'picture' : n.props.testID === 'buster-over' ? 'lids' : n.type === 'RNSVGCircle' ? 'point' : null)).filter(Boolean);
      expect([still, [...new Set(order)]]).toEqual([still, ['picture', 'point', 'lids']]);
    }
  });

  it('arrives only once his picture has loaded AND his room is laid out, in either order', async () => {
    // Laid out first, picture later.
    const a = render(<Buster mood="unimpressed" size={80} />);
    expect(shownIn(a, 1)).toBe(0);
    await fireEvent(a.getByTestId('buster-unimpressed', { includeHiddenElements: true }), 'layout', layout(110));
    expect(shownIn(a, 2)).toBe(0); // laid out, but the picture has not said it is loaded
    await fireEvent(a.getByTestId('buster-picture', { includeHiddenElements: true }), 'load');
    expect(shownIn(a, 3)).toBe(0); // the picture, but not yet the lids over his points
    await fireEvent(a.getByTestId('buster-over', { includeHiddenElements: true }), 'load');
    expect(shownIn(a, 4)).toBe(1);

    // Picture first, layout later.
    const b = render(<Buster mood="unimpressed" size={80} />);
    await loadAll(b);
    expect(shownIn(b, 1)).toBe(0); // loaded, but not yet given his place
    await fireEvent(b.getByTestId('buster-unimpressed', { includeHiddenElements: true }), 'layout', layout(110));
    expect(shownIn(b, 2)).toBe(1);
  });

  it('if the picture never says it has loaded, he is shown anyway once laid out (never an invisible Buster)', async () => {
    jest.useFakeTimers();
    try {
      const view = render(<Buster mood="unimpressed" size={80} />);
      await fireEvent(view.getByTestId('buster-unimpressed', { includeHiddenElements: true }), 'layout', layout(110));
      expect(shownIn(view, 1)).toBe(0);
      await act(async () => { jest.advanceTimersByTime(599); });
      expect(shownIn(view, 2)).toBe(0);
      await act(async () => { jest.advanceTimersByTime(1); });
      expect(shownIn(view, 3)).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('on a screen short of room the layout scales him into it, he steps aside under half his height, and comes back when the room does', async () => {
    const view = render(<Buster mood="suspicious" size={80} />);
    const room = view.getByTestId('buster-suspicious', { includeHiddenElements: true });
    const standing = () => flat(view.getByTestId('buster-standing', { includeHiddenElements: true }).props.style);
    const figure = () => flat(view.getByTestId('buster-figure', { includeHiddenElements: true }).props.style);
    const pictures = () => ofType(view.toJSON(), 'ExpoImage');

    // Scaled by the layout itself, in the same frame the room shrinks (no round trip
    // to JavaScript, so he never draws over the words for a frame): the room's whole
    // height at his own proportions, standing on its floor, centred.
    expect(figure()).toMatchObject({ height: '100%', aspectRatio: 80 / 110 });
    expect(standing()).toMatchObject({ position: 'absolute', top: 0, bottom: 0, justifyContent: 'flex-end', alignItems: 'center' });

    await fireEvent(room, 'layout', layout(77)); // 70% of his 110: the keyboard up on a small phone
    expect(standing().opacity).toBeUndefined();

    await fireEvent(room, 'layout', layout(50)); // under half: he steps aside...
    expect(standing().opacity).toBe(0);
    expect(pictures()).toHaveLength(2); // ...hidden, not taken down: both his layers stay decoded

    await fireEvent(room, 'layout', layout(110)); // the keyboard goes: so does his absence
    expect(standing().opacity).toBeUndefined();
    expect(pictures()).toHaveLength(2);
  });

  it('glances and rises by distances that shrink with him, so his points never leave their holes', async () => {
    const view = render(<Buster mood="suspicious" size={80} />);
    const room = view.getByTestId('buster-suspicious', { includeHiddenElements: true });
    /** A transform's value on the layer whose animated style carries it (glance: translateX; rise: translateY). */
    const moved = (key: 'translateX' | 'translateY') => {
      const layer = hosts(view.toJSON()).find((n) => ((flat(n.props.style).transform as Record<string, number>[] | undefined) ?? []).some((t) => key in t));
      return ((flat(layer!.props.style).transform as Record<string, number>[]).find((t) => key in t)!)[key];
    };
    await fireEvent(room, 'layout', layout(110));
    await loadAll(view);
    view.rerender(<Buster mood="suspicious" size={80} style={{ margin: 1 }} />);
    const glance = moved('translateX'), rise = moved('translateY');
    expect(glance).not.toBe(0);
    expect(rise).not.toBe(0);
    // The way he glances is the one measured on the picture (the renderer refuses
    // a glance that takes a point out of its hole): suspicious already looks
    // right, and only the left has room.
    expect(BUSTER_ART['suspicious-80'].glance).toBeLessThan(0);
    expect(glance).toBeCloseTo(80 * BUSTER_ART['suspicious-80'].glance, 5);
    await fireEvent(room, 'layout', layout(66)); // 60%
    view.rerender(<Buster mood="suspicious" size={80} style={{ margin: 2 }} />);
    expect(moved('translateX')).toBeCloseTo(glance * 0.6, 5);
    expect(moved('translateY')).toBeCloseTo(rise * 0.6, 5);
  });

  // Every picture with points, at its full glance: exactly the slide measured on
  // it, no further (twice as far put the points on the cloth on four of them).
  it.each((Object.keys(BUSTER_ART) as BusterArtKey[]).filter((k) => BUSTER_ART[k].eyes.length > 0))('%s glances exactly as far as its points stay in their holes', async (key) => {
    const [mood, size] = [key.slice(0, key.lastIndexOf('-')), Number(key.slice(key.lastIndexOf('-') + 1))];
    const art = BUSTER_ART[key];
    const view = render(<Buster mood={mood as never} size={size as never} />);
    await arrived(view, mood, art.height);
    view.rerender(<Buster mood={mood as never} size={size as never} style={{ margin: 1 }} />);
    const layer = hosts(view.toJSON()).find((n) => ((flat(n.props.style).transform as Record<string, number>[] | undefined) ?? []).some((t) => 'translateX' in t));
    const slid = ((flat(layer!.props.style).transform as Record<string, number>[]).find((t) => 'translateX' in t)!).translateX;
    expect(slid).toBeCloseTo(size * art.glance, 5);
  });

  /** Lays him out whole and loads his picture: he has arrived. */
  async function arrived(view: ReturnType<typeof render>, mood: string, height: number) {
    await fireEvent(view.getByTestId(`buster-${mood}`, { includeHiddenElements: true }), 'layout', layout(height));
    await loadAll(view);
  }

  it('moves only once he can be seen, while his screen is in front and Reduce Motion is off, with no loop he has no use for', async () => {
    // Standing, with brass points: float, sway, blink and glance, but not before he has arrived.
    const a = render(<Buster mood="unimpressed" size={80} />);
    expect(withRepeat).not.toHaveBeenCalled();
    await arrived(a, 'unimpressed', 110);
    expect(withRepeat).toHaveBeenCalledTimes(4);

    (withRepeat as jest.Mock).mockClear();
    await arrived(render(<Buster mood="seated" size={48} />), 'seated', 54); // seated: he does not float or sway
    expect(withRepeat).toHaveBeenCalledTimes(2);

    (withRepeat as jest.Mock).mockClear();
    await arrived(render(<Buster mood="dimmed" size={80} />), 'dimmed', 110); // eyes dark: nothing to blink
    expect(withRepeat).toHaveBeenCalledTimes(2);

    (withRepeat as jest.Mock).mockClear();
    mockFocused = false;
    await arrived(render(<Buster mood="unimpressed" size={80} />), 'unimpressed', 110);
    expect(withRepeat).not.toHaveBeenCalled();

    mockFocused = true;
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    await arrived(render(<Buster mood="unimpressed" size={80} />), 'unimpressed', 110);
    expect(withRepeat).not.toHaveBeenCalled();
  });

  it('stops moving while he has stepped aside, and moves again when he is back', async () => {
    const view = render(<Buster mood="unimpressed" size={80} />);
    await arrived(view, 'unimpressed', 110);
    (withRepeat as jest.Mock).mockClear();
    (cancelAnimation as jest.Mock).mockClear();

    await fireEvent(view.getByTestId('buster-unimpressed', { includeHiddenElements: true }), 'layout', layout(40)); // aside
    expect(cancelAnimation).toHaveBeenCalled();
    expect(withRepeat).not.toHaveBeenCalled();

    await fireEvent(view.getByTestId('buster-unimpressed', { includeHiddenElements: true }), 'layout', layout(110)); // back
    expect(withRepeat).toHaveBeenCalledTimes(4);
  });

  it('draws his brass points where the holes were measured', () => {
    const art = BUSTER_ART['moved-80'];
    const circles = ofType(render(<Buster mood="moved" size={80} />).toJSON(), 'RNSVGCircle');
    // A point and its bulb for each eye.
    expect(circles).toHaveLength(art.eyes.length * 2);
    art.eyes.forEach((e, i) => {
      expect(Number(circles[i * 2].props.cx)).toBeCloseTo(e.x * art.width, 3);
      expect(Number(circles[i * 2].props.cy)).toBeCloseTo(e.y * art.height, 3);
      expect(Number(circles[i * 2].props.r)).toBeCloseTo(e.r * art.width, 3);
    });
  });

  it('is never spoken; the line he says is', () => {
    const view = render(<Buster mood="unimpressed" size={80} message="The archive awaits your identity." />);
    expect(view.queryByTestId('buster-unimpressed')).toBeNull();
    // Hidden on both: iOS reads the first, Android the second; either alone leaves him spoken on the other.
    const room = view.getByTestId('buster-unimpressed', { includeHiddenElements: true });
    expect(room.props.accessibilityElementsHidden).toBe(true);
    expect(room.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(view.getByText('The archive awaits your identity.')).toBeTruthy();
  });
});

describe('BusterStill', () => {
  it('draws where no navigator answers, as the app-wide crash net needs; the living Buster cannot', () => {
    mockNoNavigator = true;
    const view = render(<BusterStill mood="moved" size={80} />);
    expect(view.getByTestId('buster-still-moved', { includeHiddenElements: true })).toBeTruthy();
    expect(withRepeat).not.toHaveBeenCalled();
    // Proof the difference is real: the same question breaks the one that moves.
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Buster mood="moved" size={80} />)).toThrow('outside a navigator');
    (console.error as jest.Mock).mockRestore();
  });

  it('keeps its brass points back until the picture is there, so they never show alone', async () => {
    const view = render(<BusterStill mood="moved" size={80} />);
    expect(ofType(view.toJSON(), 'RNSVGCircle')).toHaveLength(0);
    await fireEvent(view.getByTestId('buster-picture', { includeHiddenElements: true }), 'load');
    expect(ofType(view.toJSON(), 'RNSVGCircle')).toHaveLength(0); // the lids over them are not in yet
    await fireEvent(view.getByTestId('buster-over', { includeHiddenElements: true }), 'load');
    expect(ofType(view.toJSON(), 'RNSVGCircle')).toHaveLength(BUSTER_ART['moved-80'].eyes.length * 2);
  });
});

describe('BusterEyes', () => {
  it('comes up only after a wait, so a quick answer shows nothing new, and the wait holds under Reduce Motion too', () => {
    // Reanimated skips a delay under Reduce Motion unless it is told Never: the
    // wait is a gate, not a motion, so it must be.
    for (const still of [false, true]) {
      (withDelay as jest.Mock).mockClear();
      (useReducedMotion as jest.Mock).mockReturnValue(still);
      render(<BusterEyes />);
      const gate = (withDelay as jest.Mock).mock.calls.find(([ms]) => ms === EYES_AFTER_MS);
      expect([still, gate?.[2]]).toEqual([still, ReduceMotion.Never]);
    }
    expect(EYES_AFTER_MS).toBe(400);
  });

  it('with a label, is the progress a screen reader is told of; without one, stays silent beside the words', () => {
    const labelled = render(<BusterEyes label="Loading record" />);
    const eyes = labelled.getByTestId('buster-eyes');
    expect(eyes.props.accessibilityRole).toBe('progressbar');
    expect(eyes.props.accessibilityLabel).toBe('Loading record');

    const silent = render(<BusterEyes />);
    expect(silent.queryByTestId('buster-eyes')).toBeNull();
    expect(silent.getByTestId('buster-eyes', { includeHiddenElements: true }).props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('pulses only while its screen is in front and Reduce Motion is off', () => {
    render(<BusterEyes />);
    expect(withRepeat).toHaveBeenCalledTimes(2);

    (withRepeat as jest.Mock).mockClear();
    mockFocused = false;
    render(<BusterEyes />);
    expect(withRepeat).not.toHaveBeenCalled();

    mockFocused = true;
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    render(<BusterEyes />);
    expect(withRepeat).not.toHaveBeenCalled();
  });
});

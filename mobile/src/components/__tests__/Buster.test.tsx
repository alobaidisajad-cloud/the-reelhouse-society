/**
 * Buster: what he promises, held against the component itself.
 *
 *   • every mood and size has its own picture, drawn at exactly that size
 *   • he arrives only once his picture is loaded and his room is laid out whole
 *   • on a screen too short for him and its words, he gives up his room
 *   • he moves only while his screen is in front and Reduce Motion is off,
 *     and runs no loop he has no use for
 *   • he is never spoken; what he says (a message) is
 *   • the still Buster draws where no navigator answers: the crash nets
 *   • the eyes come up late, and are the progress a screen reader hears
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { useReducedMotion, withDelay, withRepeat } from 'react-native-reanimated';
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
      const image = ofType(render(<Buster {...picture} />).toJSON(), 'ExpoImage');
      expect(image).toHaveLength(1);
      expect(image[0].props.source).toBe(art.picture);
      expect(flat(image[0].props.style)).toMatchObject({ width: art.width, height: art.height });
      expect(Number.isInteger(art.height)).toBe(true);
    }
  });

  it('arrives only when his picture has loaded and his whole room is laid out', async () => {
    const shown = (json: unknown) => {
      const image = ofType(json, 'ExpoImage')[0];
      // The arriving layer is the one whose style carries an opacity, around the picture.
      const layers = hosts(json).filter((n) => 'opacity' in flat(n.props.style) && hosts(n).includes(image));
      return flat(layers[0].props.style).opacity;
    };
    const view = render(<Buster mood="unimpressed" size={80} />);
    expect(shown(view.toJSON())).toBe(0);

    await fireEvent(view.getByTestId('buster-unimpressed', { includeHiddenElements: true }), 'layout', layout(110));
    view.rerender(<Buster mood="unimpressed" size={80} style={{}} />);
    expect(shown(view.toJSON())).toBe(0); // laid out, but the picture has not said it is loaded

    const image = view.getByTestId('buster-picture', { includeHiddenElements: true });
    await fireEvent(image, 'load');
    view.rerender(<Buster mood="unimpressed" size={80} style={{ margin: 0 }} />);
    expect(shown(view.toJSON())).toBe(1);
  });

  it('on a screen too short for him and its words, gives up his room, and does not come back into it mid-visit', async () => {
    const view = render(<Buster mood="suspicious" size={80} />);
    const room = view.getByTestId('buster-suspicious', { includeHiddenElements: true });
    expect(ofType(view.toJSON(), 'ExpoImage')).toHaveLength(1);

    await fireEvent(room, 'layout', layout(70)); // squeezed below his 110
    expect(ofType(view.toJSON(), 'ExpoImage')).toHaveLength(0);
    expect(flat(view.getByTestId('buster-suspicious', { includeHiddenElements: true }).props.style).height).toBe(0);

    // The room he gave up is not taken back: no flicker in and out as the layout settles.
    await fireEvent(room, 'layout', layout(110));
    expect(ofType(view.toJSON(), 'ExpoImage')).toHaveLength(0);
  });

  it('moves only while his screen is in front and Reduce Motion is off, with no loop he has no use for', () => {
    // Standing, with brass points: float, sway, blink and glance.
    render(<Buster mood="unimpressed" size={80} />);
    expect(withRepeat).toHaveBeenCalledTimes(4);

    (withRepeat as jest.Mock).mockClear();
    render(<Buster mood="seated" size={48} />); // seated: he does not float or sway
    expect(withRepeat).toHaveBeenCalledTimes(2);

    (withRepeat as jest.Mock).mockClear();
    render(<Buster mood="dimmed" size={80} />); // eyes dark: nothing to blink
    expect(withRepeat).toHaveBeenCalledTimes(2);

    (withRepeat as jest.Mock).mockClear();
    mockFocused = false;
    render(<Buster mood="unimpressed" size={80} />);
    expect(withRepeat).not.toHaveBeenCalled();

    mockFocused = true;
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    render(<Buster mood="unimpressed" size={80} />);
    expect(withRepeat).not.toHaveBeenCalled();
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
    expect(view.getByTestId('buster-unimpressed', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
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
    const image = view.getByTestId('buster-picture', { includeHiddenElements: true });
    await fireEvent(image, 'load');
    expect(ofType(view.toJSON(), 'RNSVGCircle')).toHaveLength(BUSTER_ART['moved-80'].eyes.length * 2);
  });
});

describe('BusterEyes', () => {
  it('comes up only after a wait, so a quick answer shows nothing new', () => {
    render(<BusterEyes />);
    expect((withDelay as jest.Mock).mock.calls.some(([ms]) => ms === EYES_AFTER_MS)).toBe(true);
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

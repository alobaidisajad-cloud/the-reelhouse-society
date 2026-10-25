/**
 * theLightRestsOutOfSight.test.ts — a veil's light is drawn while it can be seen (P0.112).
 *
 * The light a photograph's veil carries moved back by the photograph's lift on every frame of a
 * scroll, the whole length of the page: on the stack, the film, the person and the member's file
 * the veil's Skia canvas was drawn again for every frame long after the photograph had gone. Its
 * lift now rests once the hem has risen past the top of any screen it could start on, and an
 * unchanged lift draws nothing. And the room's own light, still under a moving list, is kept as a
 * texture while its screen is in front.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { RoomLight, RoomVeil, heldLift, type VeilStops } from '../RoomLight';

const HEM = 320;
const SCREEN = 800;

describe('the veil\'s light, lifted', () => {
  it('moves back by the whole lift while any of it can show, a pull downward too', () => {
    expect([0, 150, HEM, HEM + SCREEN - 1, -60].map((l) => heldLift(l, HEM, SCREEN))).toEqual([0, 150, HEM, HEM + SCREEN - 1, -60]);
  });

  it('rests once the hem is past the top of any screen it could start on, however far the page goes', () => {
    expect([HEM + SCREEN, HEM + SCREEN + 1, 4000, 40000].map((l) => heldLift(l, HEM, SCREEN))).toEqual([1120, 1120, 1120, 1120]);
  });
});

describe('the veil, drawn', () => {
  // The jest Reanimated runs no reaction by itself: these are run here, as the UI thread would
  // run them on each frame of the scroll.
  const reactions: { prepare: () => unknown; react: (now: unknown, before: unknown) => void; last: unknown }[] = [];
  const frame = () => reactions.forEach((r) => { const now = r.prepare(); r.react(now, r.last); r.last = now; });
  beforeEach(() => {
    reactions.length = 0;
    const { useAnimatedReaction } = jest.requireMock('react-native-reanimated') as { useAnimatedReaction: jest.Mock };
    useAnimatedReaction.mockImplementation((prepare: () => unknown, react: (now: unknown, before: unknown) => void) => {
      reactions.push({ prepare, react, last: null });
    });
  });

  it('carries its light back with the photograph, then leaves the canvas alone once the hem is out of sight', () => {
    const STOPS: VeilStops = [[0, 0], [1, 1]];
    const lifted = { value: 0 };
    const r = render(React.createElement(RoomVeil, { room: 'default', hem: HEM, stops: STOPS, lifted: lifted as never }));
    type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };
    const groups = (n: Node | string | null): Node[] => (!n || typeof n === 'string' ? []
      : [...(n.type === 'SkiaGroup' && n.props.transform ? [n] : []), ...(n.children ?? []).flatMap(groups)]);
    const transform = () => {
      const tree = r.toJSON() as Node | Node[] | null;
      const found = (Array.isArray(tree) ? tree : [tree]).flatMap(groups);
      expect(found).toHaveLength(1);
      return found[0]?.props.transform as { value: unknown };
    };
    const H = Dimensions.get('window').height;

    lifted.value = 200; frame();
    expect(transform().value).toEqual([{ translateY: 200 }]);
    lifted.value = 5000; frame();
    const resting = transform().value;
    expect(resting).toEqual([{ translateY: HEM + H }]);
    // Further down the page: not written again, so not drawn again.
    lifted.value = 6000; frame();
    lifted.value = 9000; frame();
    expect(transform().value).toBe(resting);
  });
});

// The room's light is still and the list over it is not: redrawn under every scrolled frame, it
// cost the Reel a third of its middle frame time. Kept by Android as a texture while its screen is
// in front, and let go behind it, so a deep stack holds one screen's texture (speed lab 39901452779).
describe('the room\'s light, kept', () => {
  const { NavigationContext } = jest.requireActual('expo-router/react-navigation') as typeof import('expo-router/react-navigation');
  const { act } = jest.requireActual('@testing-library/react-native') as typeof import('@testing-library/react-native');
  const cached = (r: ReturnType<typeof render>) => {
    type Node = { props: Record<string, unknown>; children: (Node | string)[] | null };
    const find = (n: Node | string | null): Node | null => (!n || typeof n === 'string' ? null
      : n.props.testID === 'room-light' ? n : (n.children ?? []).map(find).find(Boolean) ?? null);
    const tree = r.toJSON() as Node | Node[] | null;
    return (Array.isArray(tree) ? tree : [tree]).map(find).find(Boolean)?.props.renderToHardwareTextureAndroid;
  };

  it('as a texture while its screen is in front, let go when it is behind, kept again on its return', async () => {
    const heard: Record<string, () => void> = {};
    let focused = true;
    const navigation = {
      isFocused: () => focused,
      addListener: (event: string, fn: () => void) => { heard[event] = fn; return () => { delete heard[event]; }; },
    };
    const r = render(React.createElement(NavigationContext.Provider, { value: navigation as never }, React.createElement(RoomLight, { room: 'default' })));
    expect(cached(r)).toBe(true);
    focused = false;
    await act(async () => { heard.blur?.(); });
    expect(cached(r)).toBe(false);
    focused = true;
    await act(async () => { heard.focus?.(); });
    expect(cached(r)).toBe(true);
  });

  it('outside any navigator (a crash net, a test), kept: nothing is in front of it', () => {
    expect(cached(render(React.createElement(RoomLight, { room: 'default' })))).toBe(true);
  });
});

describe('whether a screen is seen', () => {
  const { renderHook } = jest.requireActual('@testing-library/react-native') as typeof import('@testing-library/react-native');
  const { useScreenSeen } = jest.requireActual('@/src/hooks/useScreenSeen') as typeof import('@/src/hooks/useScreenSeen');

  it('with no navigator around it, seen, and it listens for nothing', async () => {
    const { result } = await renderHook(() => useScreenSeen());
    expect(result.current).toBe(true);
  });

  it('inside one, as the navigator says, from the first draw: a screen opened behind another is not seen', async () => {
    const { NavigationContext } = jest.requireActual('expo-router/react-navigation') as typeof import('expo-router/react-navigation');
    const navigation = { isFocused: () => false, addListener: () => () => {} };
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(NavigationContext.Provider, { value: navigation as never }, children);
    const { result } = await renderHook(() => useScreenSeen(), { wrapper });
    expect(result.current).toBe(false);
  });
});

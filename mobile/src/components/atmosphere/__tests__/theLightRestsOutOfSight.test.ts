/**
 * theLightRestsOutOfSight.test.ts — a veil's light is drawn while it can be seen (P0.112).
 *
 * The light a photograph's veil carries moved back by the photograph's lift on every frame of a
 * scroll, the whole length of the page: on the stack, the film, the person and the member's file
 * the veil's Skia canvas was drawn again for every frame long after the photograph had gone. Its
 * lift now rests once the hem has risen past the top of any screen it could start on, and an
 * unchanged lift draws nothing.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { RoomVeil, heldLift, type VeilStops } from '../RoomLight';

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

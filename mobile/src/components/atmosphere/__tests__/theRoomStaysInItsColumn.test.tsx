/**
 * theRoomStaysInItsColumn.test.tsx — on a wide window, the room's light stays in the page's column.
 *
 * Each page stands in the reading column (560pt), on the house's ink. Its light was once carried
 * across the window, to meet the window's edges; but a screen lays its own grounds over the light in
 * its column (the welcome's wash, beam and vignette), which the light beside the column did not
 * have: the bare light beside the page, the light under them on it, a seam at the column's edge (the
 * iPad's photographs, ios-launch 43545408116). So the light is laid in the column, from its own edge,
 * on every window: a lit page on the dark, the same on every screen.
 */
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { RoomLight, RoomVeil } from '../RoomLight';

type Node = { props: Record<string, unknown>; children: (Node | string)[] | null };

/** Each room light drawn, as the box its pool, floor and corners are painted in. */
function lights(tree: unknown) {
  const found: { left: unknown; width: unknown }[] = [];
  const walk = (n: Node | string | null) => {
    if (!n || typeof n === 'string') return;
    if (n.props.testID === 'room-light') {
      const layer = (n.children ?? []).find((c): c is Node => typeof c !== 'string');
      const st = (layer ? StyleSheet.flatten(layer.props.style as never) : {}) as Record<string, unknown>;
      found.push({ left: st.left, width: st.width });
    }
    (n.children ?? []).forEach(walk);
  };
  (Array.isArray(tree) ? tree : [tree]).forEach((n) => walk(n as Node));
  return found;
}

const was = Dimensions.get;
afterEach(() => { Dimensions.get = was; });
/** The window `width` points wide, as a tablet or a phone has it. */
function windowOf(width: number) {
  const real = was.bind(Dimensions);
  Dimensions.get = ((what: 'window' | 'screen') => ({ ...real(what), width, height: 1000, fontScale: 1 })) as typeof Dimensions.get;
}

it('on a wide window, lays the light in the column, from its own edge, once', () => {
  windowOf(1024);
  const r = render(<RoomLight room="lobby" />);
  expect(lights(r.toJSON())).toEqual([{ left: 0, width: 560 }]);
  r.unmount();
});

it('on a phone, lays it across the phone, which is the column', () => {
  windowOf(390);
  const r = render(<RoomLight room="lobby" />);
  expect(lights(r.toJSON())).toEqual([{ left: 0, width: 390 }]);
  r.unmount();
});

it('lays a photograph\'s veil of light in the column too, where the light it meets is', () => {
  windowOf(1024);
  const r = render(<RoomVeil room="film" hem={300} stops={[[0, 0], [1, 1]]} />);
  // Unspoken, as all the room's light is: found among the views a screen reader is not given.
  const veil = r.getByTestId('room-veil-light', { includeHiddenElements: true });
  const recipe = JSON.parse(String(veil.props.nativeID)) as { W: number; L: number };
  expect({ W: recipe.W, L: recipe.L }).toEqual({ W: 560, L: 0 });
  r.unmount();
});

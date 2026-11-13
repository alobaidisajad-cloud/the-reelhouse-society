/**
 * theRoomFillsAWideWindow.test.tsx — on a window wider than the page, the room's light fills it.
 *
 * Each page stands in the reading column (560pt). Its light was laid at the column's width, so on
 * an iPad it stopped at the column's edges: a lit strip on a dark window (the iPad's photographs,
 * ios-launch 43517908839). The light is now laid at the WINDOW's width: the screen's own, from the
 * window's left edge, clipped by its column; and the same light behind the column, drawn by the
 * route's host (WideRoomHost). Both from one geometry, so they meet with no seam. On a phone the
 * column is the window, and nothing is drawn twice.
 */
import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { render } from '@testing-library/react-native';
import { RoomLight, RoomVeil, WideRoomHost } from '../RoomLight';
import { readingColumn } from '@/src/components/layout/navMetrics';

type Node = { props: Record<string, unknown>; children: (Node | string)[] | null };

/** Each room light drawn, as the box its pool, floor and corners are painted in. */
function lights(tree: unknown) {
  const found: { left: unknown; width: unknown; image: unknown }[] = [];
  const walk = (n: Node | string | null) => {
    if (!n || typeof n === 'string') return;
    if (n.props.testID === 'room-light') {
      const layer = (n.children ?? [])[0] as Node;
      const st = StyleSheet.flatten(layer.props.style as never) as Record<string, unknown>;
      found.push({ left: st.left, width: st.width, image: st.experimental_backgroundImage });
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

const page = (room: React.ReactNode) => (
  <WideRoomHost>
    <View style={readingColumn}>{room}</View>
  </WideRoomHost>
);

it('on a wide window, lights the window behind the column and lays the page\'s light from its left edge', () => {
  windowOf(1024);
  const r = render(page(<RoomLight room="lobby" />));
  const [behind, own] = lights(r.toJSON());
  expect(behind).toMatchObject({ left: 0, width: 1024 });
  expect(own).toMatchObject({ left: -(1024 - 560) / 2, width: 1024 });
  // One light, from one geometry: they meet at the column's edges with no seam.
  expect(own.image).toEqual(behind.image);
  r.unmount();
});

it('on a phone, draws the page\'s light alone, the column\'s own width, from its own edge', () => {
  windowOf(390);
  const r = render(page(<RoomLight room="lobby" />));
  expect(lights(r.toJSON())).toEqual([expect.objectContaining({ left: 0, width: 390 })]);
  r.unmount();
});

it('darkens the window again once the page that lit it goes', () => {
  windowOf(1024);
  const r = render(page(<RoomLight room="lobby" />));
  expect(lights(r.toJSON())).toHaveLength(2);
  r.rerender(page(null));
  expect(lights(r.toJSON())).toHaveLength(0);
  r.unmount();
});

it('lights the window once, by the outer host, when a host stands inside a host', () => {
  windowOf(1024);
  const r = render(<WideRoomHost>{page(<RoomLight room="lobby" />)}</WideRoomHost>);
  expect(lights(r.toJSON()).map((l) => l.left)).toEqual([0, -(1024 - 560) / 2]);
  r.unmount();
});

it('lays a photograph\'s veil of light from the window\'s left edge too, so it meets the room', () => {
  windowOf(1024);
  const r = render(page(<RoomVeil room="film" hem={300} stops={[[0, 0], [1, 1]]} />));
  // Unspoken, as all the room's light is: found among the views a screen reader is not given.
  const veil = r.getByTestId('room-veil-light', { includeHiddenElements: true });
  const recipe = JSON.parse(String(veil.props.nativeID)) as { W: number; L: number };
  expect({ W: recipe.W, L: recipe.L }).toEqual({ W: 1024, L: -(1024 - 560) / 2 });
  r.unmount();
});

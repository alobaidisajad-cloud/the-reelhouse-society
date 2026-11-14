/**
 * aScrimDimsTheWindow.test.tsx — a modal's scrim reaches the window's edges; its sheet stays in the column.
 *
 * A React Native <Modal> lays out in the reading column (InColumn). The room's light now fills the
 * window around the column (WideRoomHost), so a scrim stopped at the column dimmed the page and left
 * the room lit beside it. The scrim InColumn draws, and a modal's own (useWindowFill, InWindow),
 * stand from the window's left edge to its right; on a phone that is the column itself.
 */
import React from 'react';
import { Dimensions, StyleSheet, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { InColumn, InWindow } from '../InColumn';

const was = Dimensions.get;
afterEach(() => { Dimensions.get = was; });
function windowOf(width: number) {
  const real = was.bind(Dimensions);
  Dimensions.get = ((what: 'window' | 'screen') => ({ ...real(what), width, height: 1000, fontScale: 1 })) as typeof Dimensions.get;
}
const boxOf = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

it('on a wide window, dims from edge to edge, in the modal\'s own colour, and closes on a press beyond the column', () => {
  windowOf(1024);
  const onPress = jest.fn();
  const r = render(<InColumn scrim={{ color: 'rgba(0,0,0,0.85)', onPress }}><Text>the sheet</Text></InColumn>);
  const scrim = r.getByTestId('modal-scrim', { includeHiddenElements: true });
  expect(boxOf(scrim)).toMatchObject({ position: 'absolute', top: 0, bottom: 0, left: -232, right: -232, backgroundColor: 'rgba(0,0,0,0.85)' });
  fireEvent.press(scrim);
  expect(onPress).toHaveBeenCalledTimes(1);
  // The sheet itself stays in the column: the column lets the scrim be seen beyond it.
  expect(boxOf(r.getByText('the sheet').parent as never)).toMatchObject({ maxWidth: 560, overflow: 'visible' });
});

it('on a phone, dims the column, which is the window', () => {
  windowOf(390);
  const r = render(<InColumn scrim={{ color: 'rgba(0,0,0,0.85)' }}><Text>the sheet</Text></InColumn>);
  expect(boxOf(r.getByTestId('modal-scrim', { includeHiddenElements: true }))).toMatchObject({ left: 0, right: 0 });
});

it('holds a modal\'s own blur across the window too', () => {
  windowOf(1024);
  const r = render(<InWindow><Text>the blur</Text></InWindow>);
  expect(boxOf(r.getByText('the blur').parent as never)).toMatchObject({ left: -232, right: -232 });
});

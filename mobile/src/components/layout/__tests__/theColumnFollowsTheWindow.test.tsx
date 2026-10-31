/**
 * THE COLUMN FOLLOWS THE WINDOW (P4.33).
 *
 * An iPad turned on its side, a phone unfolded, a Split View dragged wider: the window changes
 * while the app is open, and every layout sized from it must lay out again at once. Each one reads
 * the width through useColumnWidth (aPageIsSizedByItsColumn holds them to it, and holds that none
 * freezes it into a state or a ref), so the hook following the window is every page following it.
 */
import React from 'react';
import { Dimensions, Text } from 'react-native';
import { act, render } from '@testing-library/react-native';

import { READING_MAX, useColumnWidth } from '@/src/components/layout/navMetrics';

const OPENED = Dimensions.get('window');
const setWindow = (width: number, height: number) => {
  Dimensions.set({ window: { ...Dimensions.get('window'), width, height }, screen: { ...Dimensions.get('screen'), width, height } });
};
afterEach(async () => { await act(async () => { setWindow(OPENED.width, OPENED.height); }); });

function Measured() {
  return <Text testID="column">{useColumnWidth()}</Text>;
}

it('lays out again the moment the window changes: a phone, an iPad on its side, a Split View sliver', async () => {
  await act(async () => { setWindow(390, 844); });
  const r = render(<Measured />);
  const width = () => Number(r.getByTestId('column').props.children);
  expect(width()).toBe(390);
  await act(async () => { setWindow(1366, 1024); });
  expect(width()).toBe(READING_MAX);
  await act(async () => { setWindow(320, 1024); });
  expect(width()).toBe(320);
});

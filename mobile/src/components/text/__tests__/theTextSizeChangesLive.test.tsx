/**
 * THE TEXT SIZE, CHANGED WHILE THE APP IS OPEN (P4.40).
 *
 * A member may change the phone's text size with the app open, from Control Centre or the quick
 * settings. Every word must follow at once, not at the next launch: the house Text reads the
 * setting from one live store (useTextScale's useFontScale), never from a value read once.
 * Seen here through what the setting decides on Android: the spacing the house sets for a tracked
 * word, which follows the size.
 */
import React from 'react';
import { Dimensions, Platform, StyleSheet } from 'react-native';
import { act, render } from '@testing-library/react-native';

import { Text } from '@/src/components/text';

const OS = Platform.OS;
beforeAll(() => { Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true }); });
afterAll(() => { Object.defineProperty(Platform, 'OS', { get: () => OS, configurable: true }); });

const setSize = (fontScale: number) => {
  const window = Dimensions.get('window');
  Dimensions.set({ window: { ...window, fontScale }, screen: { ...Dimensions.get('screen'), fontScale } });
};

it('a tracked word follows the text size the moment it changes, and back', async () => {
  await act(async () => { setSize(1); });
  const r = render(<Text style={{ fontSize: 12, letterSpacing: 2 }}>TRACKED</Text>);
  const at = () => StyleSheet.flatten(r.getByText('TRACKED').props.style).letterSpacing;
  const atOne = at();
  await act(async () => { setSize(2); });
  const atTwo = at();
  expect(atTwo).not.toBe(atOne);
  await act(async () => { setSize(1); });
  expect(at()).toBe(atOne);
});

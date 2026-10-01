/**
 * aSheetStaysAboveTheKeyboard.test.tsx — a sheet over a screen rises with the keyboard.
 *
 * The writing room's film and series sheets are drawn over the screen, outside
 * any view that makes room for the keyboard. On iOS nothing moved them, so the
 * film search, focused as it opens at the sheet's foot, sat under the keyboard.
 * On Android the root makes the room (KeyboardRoom), so they keep their rest.
 */
import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { useKeyboardLift } from '../useKeyboardLift';

const was = Platform.OS;
const keyboard = { height: { value: 0 }, state: { value: 0 } };

beforeEach(() => {
  keyboard.height.value = 0;
  (Reanimated.useAnimatedKeyboard as jest.Mock).mockImplementation(() => keyboard);
});
afterEach(() => {
  Platform.OS = was;
  (Reanimated.useAnimatedKeyboard as jest.Mock).mockReset();
});

const padding = async (rest: number, above?: number) => {
  const { result } = await renderHook(() => useKeyboardLift(rest, above));
  return (result.current as { paddingBottom: number }).paddingBottom;
};

describe('on iOS', () => {
  beforeEach(() => { Platform.OS = 'ios'; });

  it('rests on its own padding with no keyboard', async () => {
    expect(await padding(34)).toBe(34);
  });

  it('rises by the keyboard, and the room above it, when one is up', async () => {
    keyboard.height.value = 336;
    expect(await padding(34)).toBe(336);
    expect(await padding(56, 22)).toBe(358);
  });
});

describe('on Android', () => {
  it('keeps its rest: the root already ends at the keyboard', async () => {
    Platform.OS = 'android';
    keyboard.height.value = 336;
    expect(await padding(34, 22)).toBe(34);
  });
});

describe('the sheets that need it take it', () => {
  it('the film and series sheets are lifted', () => {
    const { readFileSync } = jest.requireActual('fs') as typeof import('fs');
    const { join } = jest.requireActual('path') as typeof import('path');
    const { stripComments } = jest.requireActual('@/test-utils/readCode');
    const src = (f: string) => stripComments(readFileSync(join(__dirname, '..', '..', 'components', 'dispatch', f), 'utf8'));
    expect(src('ComposeDesks.tsx')).toMatch(/useKeyboardLift\(bottomInset\)[\s\S]*<Animated\.View style=\{lift\}>\s*<FilmFinder/);
    expect(src('SeriesPicker.tsx')).toMatch(/useKeyboardLift\(bottomInset \+ 22, 22\)[\s\S]*<Animated\.View style=\{\[x\.sheet, lift\]\}>/);
  });
});

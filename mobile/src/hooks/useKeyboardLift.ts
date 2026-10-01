/**
 * useKeyboardLift — a bottom padding that keeps a view above the keyboard.
 *
 * For a sheet drawn over a screen (not an RN Modal, which has its own window and
 * useModalKeyboardPadding): on iOS nothing moves a view for the keyboard, so it
 * rises by the keyboard's height, plus `above` to breathe; on Android the app's
 * root already ends at the keyboard (KeyboardRoom), so it keeps `rest`, its
 * padding with no keyboard (the home indicator's inset, say).
 */
import { Platform } from 'react-native';
import { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

export function useKeyboardLift(rest = 0, above = 0) {
  const keyboard = useAnimatedKeyboard();
  return useAnimatedStyle(() => ({
    paddingBottom: Platform.OS === 'ios' && keyboard.height.value > 0 ? keyboard.height.value + above : rest,
  }));
}

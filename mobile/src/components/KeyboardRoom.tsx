/**
 * The room the keyboard takes, on Android.
 *
 * Every screen here was written for Android's window resize
 * (`softwareKeyboardLayoutMode: "resize"`): the window ended at the keyboard's
 * top edge, so a screen only made its own room on iOS. Edge-to-edge (app.json)
 * ended that resize — the app draws behind the keyboard, and a field, a tool
 * rail or a send button at the foot of a screen sat under it.
 *
 * This is that resize, done once: while the keyboard is up, the app's root ends
 * where the keyboard begins. React Native's keyboard events say when, from a
 * layout listener, so they arrive with system animations off too; Reanimated's
 * height, from the insets animation, follows the keyboard when it changes
 * height while open. The larger of the two is the room: an over-estimate leaves
 * a gap, never a covered field.
 *
 * iOS never resized a window; its screens make their own room. RN `<Modal>`s are
 * windows of their own, with their own room (useModalKeyboardPadding).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import { KeyboardState, runOnJS, useAnimatedKeyboard, useAnimatedReaction } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function KeyboardRoom({ children }: { children: ReactNode }) {
  return Platform.OS === 'android' ? <AndroidRoom>{children}</AndroidRoom> : <>{children}</>;
}

function AndroidRoom({ children }: { children: ReactNode }) {
  // The navigation bar's inset: RN's height stops at it, the keyboard's top does not.
  const { bottom } = useSafeAreaInsets();
  const [said, setSaid] = useState(0);
  const [followed, setFollowed] = useState(0);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (e) => setSaid(e.endCoordinates.height));
    const hidden = Keyboard.addListener('keyboardDidHide', () => { setSaid(0); setFollowed(0); });
    return () => { shown.remove(); hidden.remove(); };
  }, []);

  // Reanimated's height already includes the navigation bar (edge-to-edge).
  const keyboard = useAnimatedKeyboard();
  useAnimatedReaction(
    () => (keyboard.state.value === KeyboardState.OPEN ? keyboard.height.value
      : keyboard.state.value === KeyboardState.CLOSED ? 0 : -1),
    (now, before) => { if (now >= 0 && now !== before) runOnJS(setFollowed)(now); },
  );

  const room = Math.max(said > 0 ? said + bottom : 0, followed);
  return <View style={[styles.room, room > 0 && { paddingBottom: room }]}>{children}</View>;
}

const styles = StyleSheet.create({ room: { flex: 1 } });

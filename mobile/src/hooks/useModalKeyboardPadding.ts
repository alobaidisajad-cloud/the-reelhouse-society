/**
 * useModalKeyboardPadding — THE KEYBOARD LAW, RN-Modal tier.
 * ─────────────────────────────────────────────────────────────
 * React Native <Modal>s live in their own window: Android's
 * softwareKeyboardLayoutMode ("resize") never resizes them (RN sets
 * FLAG_LAYOUT_NO_LIMITS with statusBarTranslucent), and iOS never
 * moves them either. So every input-bearing Modal pads itself, on
 * BOTH platforms, by the exact reported keyboard height.
 *
 * Built on RN's own Keyboard events — they fire process-wide
 * regardless of which window is focused, unlike Reanimated's
 * useAnimatedKeyboard, which tracks the main window's IME insets
 * and is unreliable inside Android Modals.
 *
 * Usage: const kbPad = useModalKeyboardPadding(basePadding);
 *        <Animated.View style={[sheetStyle, kbPad]}>…</Animated.View>
 * `basePadding` is the sheet's resting bottom inset (safe area etc.) —
 * folded in here because this style's paddingBottom overrides earlier ones.
 */
import { useEffect } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';
import { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

export function useModalKeyboardPadding(basePadding: number = 0) {
  const height = useSharedValue(0);

  useEffect(() => {
    // iOS fires the Will* events with the animation duration — track them for
    // a synchronized rise. Android only has Did* events; a short ease reads
    // native there.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: KeyboardEvent) => {
      height.value = withTiming(e.endCoordinates?.height ?? 0, {
        duration: Platform.OS === 'ios' ? (e.duration || 250) : 160,
        easing: Easing.out(Easing.quad),
      });
    };
    const onHide = (e: KeyboardEvent) => {
      height.value = withTiming(0, {
        duration: Platform.OS === 'ios' ? (e?.duration || 250) : 160,
        easing: Easing.out(Easing.quad),
      });
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => { showSub.remove(); hideSub.remove(); };
  }, [height]);

  return useAnimatedStyle(() => ({ paddingBottom: basePadding + height.value }));
}

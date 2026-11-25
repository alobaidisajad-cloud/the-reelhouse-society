/**
 * CentredCard — a card that stands in the middle of a React Native <Modal>.
 *
 * A <Modal> is the whole window, and a card centred in it ran past both ends at
 * the largest text sizes or on a small phone: under the status bar and the home
 * indicator, with its buttons out of reach. This is CentredRoom for a card: a
 * scroll that fills the overlay, its content grown to the room and centred
 * there, and padded the same above and below (useOverlayRoomPadding). A card
 * that fits stands where it always stood; a taller one scrolls.
 *
 * The ground: a press beside the card closes it (onGround). It is drawn inside
 * the scroll, behind the card, so it moves with the card and lies under every
 * finger the card does not; a press on the card reaches only the card. A screen
 * reader is not given it: each card has its own named close.
 *
 * The keyboard: a Modal's window never resizes for it. The scroll's foot rises
 * above the keys (useModalKeyboardHeight), so a field and its button can always
 * be scrolled to, and a tap on them lands while the keyboard is up. And while the
 * keys are up, a card taller than its room shows its foot, where its field's press
 * stands: a scroll that only shrank left the card where it stood, and the emoji
 * panel, taller than the letters, covered the recovery card's SEND RESET LINK at
 * the largest text (the nightly's keyboard probes, 2026-11-13 to -24). Each card
 * that holds a field ends with that field's presses.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useModalKeyboardHeight } from '@/src/hooks/useModalKeyboardPadding';
import { useOverlayRoomKeyboardClearance, useOverlayRoomPadding } from './navMetrics';

export function CentredCard({ onGround, style, children }: {
  /** A press on the ground beside the card; left out where only the card's own buttons close it. */
  onGround?: () => void;
  /** The content's own look: its sides, how it aligns. */
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const room = useOverlayRoomPadding();
  const cleared = useOverlayRoomKeyboardClearance();
  const keyboard = useModalKeyboardHeight();
  const lift = useAnimatedStyle(() => ({ marginBottom: Math.max(0, keyboard.value - cleared) }));
  const scroll = useRef<Animated.ScrollView>(null);
  // Heard as useModalKeyboardHeight hears them: up from the keys' first event, down from their last.
  const keysUp = useRef(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const up = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => { keysUp.current = true; });
    const down = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => { keysUp.current = false; });
    return () => { up.remove(); down.remove(); };
  }, []);
  // The room changed (the keys rose, or changed panel) or the card did: its foot, above the keys.
  const footAboveTheKeys = useCallback(() => {
    if (keysUp.current) scroll.current?.scrollToEnd({ animated: false });
  }, []);
  return (
    <Animated.ScrollView
      ref={scroll}
      onLayout={footAboveTheKeys}
      onContentSizeChange={footAboveTheKeys}
      testID="centred-card"
      style={[s.fill, lift]}
      contentContainerStyle={[s.centre, style, room]}
      showsVerticalScrollIndicator={false}
      overScrollMode="never"
      alwaysBounceVertical={false}
      keyboardShouldPersistTaps="handled"
    >
      {onGround ? (
        <Pressable testID="centred-card-ground" style={StyleSheet.absoluteFill} onPress={onGround}
          accessible={false} importantForAccessibility="no-hide-descendants" />
      ) : null}
      {children}
    </Animated.ScrollView>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  centre: { flexGrow: 1, justifyContent: 'center' },
});

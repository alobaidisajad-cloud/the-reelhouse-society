/**
 * PressableScale — Tactile press-in/out wrapper.
 * Replaces flat activeOpacity with a physical 3D pressure feel.
 * Runs entirely on the UI thread via Reanimated.
 */
import React, { memo, useRef } from 'react';
import { Pressable, ViewStyle, StyleProp, AccessibilityRole, AccessibilityState } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps {
  onPress?: () => void;
  onPressIn?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Scale when pressed in. Default 0.96 for visceral depth */
  pressedScale?: number;
  /** Fire a haptic on press. Can be boolean or specific impact style */
  haptic?: boolean | 'light' | 'medium' | 'heavy' | 'selection';
  disabled?: boolean;
  hitSlop?: null | number | { top?: number; bottom?: number; left?: number; right?: number };
  /** M-04 AUDIT FIX: Delay before onLongPress fires (default 600ms per HIG) */
  delayLongPress?: number;
  /** M-06 AUDIT FIX: Debounce interaction to prevent double-push route flooding */
  debounceMs?: number;
  /** VoiceOver / TalkBack role */
  accessibilityRole?: AccessibilityRole;
  /** VoiceOver / TalkBack label */
  accessibilityLabel?: string;
  /** Additional hint for assistive tech */
  accessibilityHint?: string;
  /** Accessibility state (selected, disabled, etc.) */
  accessibilityState?: AccessibilityState;
  /** Testing identifier for Maestro/E2E */
  testID?: string;
}

function PressableScale({
  onPress,
  onPressIn,
  onLongPress,
  style,
  children,
  pressedScale = 0.96,
  haptic = false,
  disabled = false,
  hitSlop,
  delayLongPress = 600,
  debounceMs = 400,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  testID,
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const lastPressRef = useRef<number>(0);

  // Normalize hitSlop to guarantee 44x44 HIG compliance if partially provided
  const normalizedHitSlop = hitSlop === null ? null : typeof hitSlop === 'number' ? hitSlop : {
    top: hitSlop?.top ?? 15,
    bottom: hitSlop?.bottom ?? 15,
    left: hitSlop?.left ?? 15,
    right: hitSlop?.right ?? 15,
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      testID={testID}
      disabled={disabled}
      hitSlop={normalizedHitSlop}
      delayLongPress={delayLongPress}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState ?? (disabled ? { disabled: true } : undefined)}
      onPressIn={() => {
        // U-01 AUDIT FIX: Scale animation + haptics ALWAYS fire on finger-down,
        // even during debounce cooldown. This prevents "dead button" perception
        // where the button appears completely unresponsive. Only the onPress
        // callback is debounced (see onPress handler below).

        // High stiffness, heavy mass = Celluloid Tension (Mechanical snap)
        scale.value = withSpring(pressedScale, { damping: 18, stiffness: 400, mass: 0.6 });
        
        // Haptics triggered on finger-down (mechanical click emulation)
        if (haptic === 'selection') Haptics.selectionAsync();
        else if (haptic === true || haptic === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        else if (haptic === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        else if (haptic === 'heavy') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        
        onPressIn?.();
      }}
      onPressOut={() => {
        // Returns to identity with a solid, dampened thud
        scale.value = withSpring(1, { damping: 16, stiffness: 350, mass: 0.7 });
      }}
      onPress={() => {
        if (debounceMs > 0) {
          const now = Date.now();
          if (now - lastPressRef.current < debounceMs) return;
          lastPressRef.current = now;
        }
        onPress?.();
      }}
      onLongPress={() => {
        if (haptic && haptic !== 'selection') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }
        onLongPress?.();
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

const MemoizedPressableScale = memo(PressableScale);
MemoizedPressableScale.displayName = 'PressableScale';
export default MemoizedPressableScale;


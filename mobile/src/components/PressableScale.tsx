/**
 * PressableScale — Tactile press-in/out wrapper.
 * Replaces flat activeOpacity with a physical 3D pressure feel.
 * Runs entirely on the UI thread via Reanimated.
 */
import React, { memo, useRef } from 'react';
import {
  Pressable, StyleSheet, ViewStyle, StyleProp, AccessibilityRole, AccessibilityState,
  AccessibilityActionInfo, AccessibilityActionEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import TactileEngine from '../utils/TactileEngine';

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
  /** Delay before onLongPress fires (default 600ms per HIG) */
  delayLongPress?: number;
  /** Debounce interaction to prevent double-push route flooding */
  debounceMs?: number;
  /** VoiceOver / TalkBack role */
  accessibilityRole?: AccessibilityRole;
  /** VoiceOver / TalkBack label */
  accessibilityLabel?: string;
  /** Additional hint for assistive tech */
  accessibilityHint?: string;
  /** Accessibility state (selected, disabled, etc.) */
  accessibilityState?: AccessibilityState;
  /** False, with importantForAccessibility "no", for a ground a screen reader skips. */
  accessible?: boolean;
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
  /** Named actions a screen reader offers, e.g. what a long press opens. */
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
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
  accessible,
  importantForAccessibility,
  accessibilityActions,
  onAccessibilityAction,
  testID,
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const lastPressRef = useRef<number>(0);

  // A halo of 15 on each side the caller leaves out, but only on an axis under
  // the 48pt floor: on a big control a halo only reaches into its neighbour, and
  // both platforms give an overlap to the LATER control. A halo buys a finger
  // reach, never accessibility size (it is not in either platform's
  // accessibility frame): a small control is fixed with minHeight / minWidth.
  const own: ViewStyle = StyleSheet.flatten(style) ?? {};
  const big = (...v: unknown[]) => v.some((n) => typeof n === 'number' && n >= 48);
  const across = big(own.width, own.minWidth) ? 0 : 15;
  const down = big(own.height, own.minHeight) ? 0 : 15;
  const normalizedHitSlop = hitSlop === null ? null : typeof hitSlop === 'number' ? hitSlop : {
    top: hitSlop?.top ?? down,
    bottom: hitSlop?.bottom ?? down,
    left: hitSlop?.left ?? across,
    right: hitSlop?.right ?? across,
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
      accessible={accessible}
      importantForAccessibility={importantForAccessibility}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      onPressIn={() => {
        // Feel on every touch, even inside the debounce: only onPress is debounced.

        // High stiffness, heavy mass = Celluloid Tension (Mechanical snap)
        scale.value = withSpring(pressedScale, { damping: 18, stiffness: 400, mass: 0.6 });
        
        // Haptics triggered on finger-down (mechanical click emulation)
        if (haptic === 'selection') TactileEngine.selection();
        else if (haptic === true || haptic === 'light') TactileEngine.navigate();
        else if (haptic === 'medium') TactileEngine.mutate();
        else if (haptic === 'heavy') TactileEngine.destroy();
        
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
      onLongPress={onLongPress ? () => {
        if (haptic && haptic !== 'selection') {
          TactileEngine.destroy();
        }
        onLongPress();
      } : undefined}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

const MemoizedPressableScale = memo(PressableScale);
MemoizedPressableScale.displayName = 'PressableScale';
export default MemoizedPressableScale;


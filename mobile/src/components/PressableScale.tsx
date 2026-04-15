/**
 * PressableScale — Tactile press-in/out wrapper.
 * Replaces flat activeOpacity with a physical 3D pressure feel.
 * Runs entirely on the UI thread via Reanimated.
 */
import React, { memo } from 'react';
import { Pressable, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  /** Scale when pressed in. Default 0.96 for visceral depth */
  pressedScale?: number;
  /** Fire a haptic on press. Can be boolean or specific impact style */
  haptic?: boolean | 'light' | 'medium' | 'heavy';
  disabled?: boolean;
}

function PressableScale({
  onPress,
  style,
  children,
  pressedScale = 0.96,
  haptic = false,
  disabled = false,
}: PressableScaleProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={() => {
        // High stiffness, heavy mass = Celluloid Tension (Mechanical snap)
        scale.value = withSpring(pressedScale, { damping: 18, stiffness: 400, mass: 0.6 });
        if (haptic === 'heavy') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }}
      onPressOut={() => {
        // Returns to identity with a solid, dampened thud
        scale.value = withSpring(1, { damping: 16, stiffness: 350, mass: 0.7 });
      }}
      onPress={() => {
        if (haptic === true || haptic === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (haptic === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress?.();
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

export default memo(PressableScale);

/**
 * SkeletonPulse — Breathing opacity shimmer for loading states.
 * Uses gentle opacity pulse (0.06 → 0.15 → 0.06) instead of
 * GPU-heavy gradient sweeps. Matches the Preloader ring breathing.
 */
import React, { useEffect } from 'react';
import { ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors } from '@/src/theme/theme';

interface SkeletonPulseProps {
  style?: StyleProp<ViewStyle>;
  /** Base color. Default: colors.ash */
  color?: string;
  /** Width. Default: '100%' */
  width?: number | string;
  /** Height. Default: 12 */
  height?: number;
  /** Border radius. Default: 3 */
  borderRadius?: number;
}

export default function SkeletonPulse({
  style,
  color = 'rgba(42,33,24,0.85)',
  width = '100%',
  height = 12,
  borderRadius = 3,
}: SkeletonPulseProps) {
  const opacity = useSharedValue(0.06);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.18, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.06, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          backgroundColor: color,
          width: width as any,
          height,
          borderRadius,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

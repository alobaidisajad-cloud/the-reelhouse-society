/** A view that fades and rises into place, and is certain to arrive (useArrival). */
import React from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle, type WithTimingConfig } from 'react-native-reanimated';
import { useArrival } from '@/src/hooks/useArrival';

export function Arrive({ name, duration = 600, delay, rise, easing, style, children, ...view }: Omit<ViewProps, 'style'> & {
  /** What arrived, for the E2E report when it had to be set. */
  name: string;
  duration?: number;
  delay?: number;
  /** Points it rises from: 25 from below (FadeInDown's), a negative from above, 0 a fade alone. */
  rise?: number;
  easing?: WithTimingConfig['easing'];
  /** Its own style, which may move too (a sheet that slides as well as arrives). */
  style?: StyleProp<AnimatedStyle<ViewStyle>>;
  children?: React.ReactNode;
}) {
  const arrival = useArrival({ duration, delay, rise, easing, name });
  return <Animated.View {...view} style={[style, arrival]}>{children}</Animated.View>;
}

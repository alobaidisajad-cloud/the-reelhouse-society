/** A view that fades and rises into place, and is certain to arrive (useArrival). */
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { type WithTimingConfig } from 'react-native-reanimated';
import { useArrival } from '@/src/hooks/useArrival';

export function Arrive({ name, duration = 600, delay, rise, easing, style, children }: {
  /** What arrived, for the E2E report when it had to be set. */
  name: string;
  duration?: number;
  delay?: number;
  rise?: number;
  easing?: WithTimingConfig['easing'];
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const arrival = useArrival({ duration, delay, rise, easing, name });
  return <Animated.View style={[style, arrival]}>{children}</Animated.View>;
}

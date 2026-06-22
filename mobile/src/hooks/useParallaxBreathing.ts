import { useEffect } from 'react';
import {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence,
  Easing, interpolate, Extrapolation, useAnimatedScrollHandler, cancelAnimation
} from 'react-native-reanimated';
import { globalScrollY } from '../lib/scrollBridge';
import { useReducedMotion } from './useReducedMotion';

export function useParallaxBreathing() {
  const scrollY = useSharedValue(0);
  const breath = useSharedValue(1.0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Respect the OS "Reduce Motion" setting: skip the ambient breathing pulse
    // and hold the backdrop perfectly still.
    if (reduceMotion) {
      cancelAnimation(breath);
      breath.value = 1.0;
      return;
    }
    // Finite breathing loop (5 cycles ≈ 90s) instead of one-shot withTiming
    // Swapped Easing.sin for organic custom bezier curve mimicking bulb halation
    breath.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 9000, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
        withTiming(1.0, { duration: 9000, easing: Easing.bezier(0.25, 0.1, 0.25, 1) })
      ),
      5, // 5 cycles = 90 seconds of breathing, then idles at 1.0
      true
    );
    return () => cancelAnimation(breath);
  }, [breath, reduceMotion]);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
    // Bridge scroll offset directly on UI-thread for TopNavBar blur/tint interpolation
    globalScrollY.value = event.contentOffset.y;
  });

  // Parallax styles for the backdrop
  const backdropAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 200], [0.35, 0], Extrapolation.CLAMP);
    // Reduce Motion: keep the opacity cross-fade but drop the parallax shift/scale.
    if (reduceMotion) {
      return { transform: [{ translateY: 0 }, { scale: 1 }], opacity };
    }
    const translateY = interpolate(scrollY.value, [0, 400], [0, -150], Extrapolation.CLAMP);
    return {
      transform: [{ translateY }, { scale: breath.value }],
      opacity
    };
  });

  return { scrollY, breath, onScroll, backdropAnimatedStyle };
}

/**
 * useArrival — content fading (and rising) into view, certain to arrive.
 *
 * A mount-time `entering` animation can fail to start and leave what it holds
 * transparent: in the sealed E2E the film's tray and the Darkroom's search
 * were drawn, at opacity 0, invisible. This rises on its own shared value with
 * the same motion as `FadeInDown` (25pt, the system's reduce-motion honoured),
 * and sets it arrived if it has not by the end, saying so to the E2E report.
 */
import { useEffect } from 'react';
import {
  ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming,
  type WithTimingConfig,
} from 'react-native-reanimated';
import { e2eTrace } from '@/src/utils/e2eTrace';

/** How long past its end an arrival may still be under way before it is set arrived. */
export const ARRIVAL_GRACE_MS = 240;
/** FadeInDown's own distance. */
export const ARRIVAL_RISE = 25;

export function useArrival({ duration, delay = 0, rise = ARRIVAL_RISE, easing, name }: {
  duration: number;
  delay?: number;
  /** Points it rises from; 0 for a fade alone. */
  rise?: number;
  easing?: WithTimingConfig['easing'];
  /** What arrived, for the E2E report when it had to be set. */
  name: string;
}) {
  const shown = useSharedValue(0);
  useEffect(() => {
    // An easing key only when one was given: Reanimated copies every key over its defaults,
    // so an undefined one replaces the default easing with nothing and crashes the first frame.
    const timing: WithTimingConfig = { duration, reduceMotion: ReduceMotion.System };
    if (easing) timing.easing = easing;
    shown.value = withDelay(delay, withTiming(1, timing));
    const rescue = setTimeout(() => {
      if (shown.value >= 1) return;
      e2eTrace('arrival.rescued', { name, at: shown.value });
      shown.value = 1;
    }, delay + duration + ARRIVAL_GRACE_MS);
    return () => clearTimeout(rescue);
    // Once, on arrival: the motion is the mount's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * rise }],
  }));
}

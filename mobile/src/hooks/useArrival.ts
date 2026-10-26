/**
 * useArrival — content fading (and rising) into view, certain to arrive.
 *
 * A mount-time `entering` animation can fail to start and leave what it holds
 * transparent: in the sealed E2E the film's tray and the Darkroom's search
 * were drawn, at opacity 0, invisible. This rises on its own shared value with
 * the same motion as `FadeInDown` (25pt, the system's reduce-motion honoured),
 * and sets it arrived if it has not by the end, saying so to the E2E report.
 */
import { useEffect, useState } from 'react';
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
  // Arrived, it is a plain style: a value can reach 1 while its animated style never reaches
  // the view just mounted (the film tray, Sealed E2E run 38790116312), so where it rests never
  // waits on an animation having drawn it.
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    // An easing key only when one was given: Reanimated copies every key over its defaults,
    // so an undefined one replaces the default easing with nothing and crashes the first frame.
    shown.value = withDelay(delay, withTiming(1, easing
      ? { duration, easing, reduceMotion: ReduceMotion.System }
      : { duration, reduceMotion: ReduceMotion.System }));
    const rescue = setTimeout(() => {
      const at = shown.value;
      if (at < 1) {
        e2eTrace('arrival.rescued', { name, at });
        shown.value = 1;
      }
      setArrived(true);
    }, delay + duration + ARRIVAL_GRACE_MS);
    return () => clearTimeout(rescue);
    // Once, on arrival: the motion is the mount's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const arriving = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * rise }],
  }));
  return arrived ? ARRIVED : arriving;
}

/** Where an arrival ends, as a plain style. */
export const ARRIVED = { opacity: 1, transform: [{ translateY: 0 }] } as const;

/** Where an ignition ends, as a plain style. */
export const IGNITED = { opacity: 1, transform: [{ scale: 1 }] } as const;

/**
 * The house's ignition: from nothing, and a touch off its size, to its full self, each time `of`
 * changes. Certain to arrive, as an arrival is: once its time and the grace are past it rests on
 * IGNITED, a plain style, so where it rests never waits on an animated style reaching the view.
 * `lit` is its 0 → 1, for a layer that moves with it; `rests`, whether it has come to rest, for a
 * layer that rests on its own plain style.
 */
export function useIgnition(of: string | number | null, { duration, delay = 0, from, easing, reduceMotion = ReduceMotion.System, name }: {
  duration: number;
  delay?: number;
  /** The scale it ignites from. */
  from: number;
  easing?: WithTimingConfig['easing'];
  reduceMotion?: ReduceMotion;
  /** What ignited, for the E2E report when it had to be set. */
  name: string;
}) {
  const lit = useSharedValue(0);
  const [restsOn, setRestsOn] = useState<string | number | null>(null);
  useEffect(() => {
    lit.set(0);
    lit.set(withDelay(delay, withTiming(1, easing ? { duration, easing, reduceMotion } : { duration, reduceMotion })));
    const rescue = setTimeout(() => {
      const at = lit.get();
      if (at < 1) {
        e2eTrace('arrival.rescued', { name, at });
        lit.set(1);
      }
      setRestsOn(of);
    }, delay + duration + ARRIVAL_GRACE_MS);
    return () => clearTimeout(rescue);
    // Each `of` ignites once; the motion is read when it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [of]);
  const igniting = useAnimatedStyle(() => ({
    opacity: lit.value,
    transform: [{ scale: from + (1 - from) * lit.value }],
  }));
  const rests = restsOn === of;
  return { style: rests ? IGNITED : igniting, lit, rests };
}

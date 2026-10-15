// What animationConfigsAreLiterals.guard must refuse, then what it must pass. Never imported.
import { Easing, ReduceMotion, withDecay, withSpring, withTiming } from 'react-native-reanimated';
import type { EasingFunction, WithTimingConfig } from 'react-native-reanimated';

const makeDecay = () => ({ velocity: 1 });

export function shapes(easing?: EasingFunction, duration = 300) {
  // Refused: a key that can be empty, as the launch crash had it.
  withTiming(1, { duration, easing });
  // Refused: a config built in a variable, as c56597db built it.
  const config: WithTimingConfig = { duration };
  if (easing) config.easing = easing;
  withTiming(1, config);
  // Refused: a conditional whose empty branch still names the key.
  withTiming(1, easing ? { duration, easing } : { duration, easing });
  // Refused: a spread.
  withSpring(1, { ...{ damping: 10 } });
  // Refused: a config made by a call.
  withDecay(makeDecay());
  // Passed: the conditional ef697e38 shipped, each branch narrowed.
  withTiming(1, easing ? { duration, easing, reduceMotion: ReduceMotion.System } : { duration, reduceMotion: ReduceMotion.System });
  // Passed: every key holds a value.
  withTiming(1, { duration: 200, easing: Easing.linear });
  // Passed: no config at all.
  withSpring(1);
}

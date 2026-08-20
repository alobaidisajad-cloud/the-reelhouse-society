/**
 * enter.ts — one entrance, configured once.
 *
 * The Settings page ran THIRTEEN `FadeInDown` builders, none of which checked
 * whether the reader had asked their phone to reduce motion. For anyone with
 * vestibular sensitivity that page is a cascade of sliding cards.
 *
 * Adding `.reduceMotion(...)` to thirteen call sites by hand is not a fix, it is
 * an invitation for the fourteenth to be forgotten. The builder lives here now,
 * so a new section cannot be added without inheriting the setting.
 *
 * `ReduceMotion.System` defers to the OS switch: the animation still runs for
 * everyone else, unchanged.
 */
import { FadeInDown, ReduceMotion } from 'react-native-reanimated';

/** Duration used when a caller does not care; matches what the page already had. */
const DEFAULT_DURATION = 500;

/**
 * A downward fade that respects the reader's motion setting.
 *
 * @param delay  stagger in ms, as the page's cascade already used
 * @param duration  override for the one card that ran longer (the letterhead)
 */
export function enterDown(delay = 0, duration: number = DEFAULT_DURATION) {
  return FadeInDown.duration(duration).delay(delay).reduceMotion(ReduceMotion.System);
}

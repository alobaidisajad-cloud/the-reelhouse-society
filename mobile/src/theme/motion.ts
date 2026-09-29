/**
 * How the house moves.
 *
 * ONE LAW: NOTHING OVERSHOOTS. No springs, no bounce, no rubber: a printed page
 * does not wobble and a members' club does not bounce. Every easing arrives and
 * stops (nothingOvershoots.guard.test.ts holds it across the app). Five
 * durations and two curves, so no screen is tuned alone; leaving is always
 * faster than arriving. Under reduced motion a duration collapses and the state
 * still arrives.
 */
import { Easing } from 'react-native-reanimated';

export const MS = {
  /** A mark taking under the thumb, a press. Below ~100ms reads as instant. */
  strike: 90,
  /** A control changing state; anything leaving. */
  quick: 140,
  /** The default: an entry arriving, a notice replacing another. */
  base: 200,
  /** Something with weight: a sheet rising, a composer taking the screen. */
  considered: 280,
  /** A whole page changing, matched to the navigator. */
  page: 320,
} as const;

/** The two curves (and linear, for tallies: a count that eases looks estimated). */
export const EASE = {
  /** Out-cubic: arrives and stops. The default. */
  in: [0.22, 1, 0.36, 1] as const,
  /** In-cubic: leaves without lingering. */
  out: [0.64, 0, 0.78, 0] as const,
  flat: [0, 0, 1, 1] as const,
};

/** The arriving curve, for withTiming and layout animations. Made when used. */
export const arrive = () => Easing.bezier(...EASE.in);
/** The leaving curve. */
export const leave = () => Easing.bezier(...EASE.out);

/** A mark taking (certify, save, keep): 1 → this → 1 over MS.strike. A pulse, not a spring. */
export const MARK_PULSE = 1.18;

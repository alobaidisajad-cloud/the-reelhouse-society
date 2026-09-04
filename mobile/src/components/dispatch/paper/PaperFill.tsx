/**
 * A ballot's rule, filling.
 * ─────────────────────────────────────────────────────────────────────────────
 * `paperMotion.ts` describes the whole of this page's movement and nothing in
 * the app imported it — the second module in this feature written as design and
 * never wired. Its own note says why that is not neutral: with nothing
 * specified, every screen inherits whatever the navigator and the platform do,
 * and an app assembled that way feels assembled.
 *
 * This is the moment that file singles out:
 *
 *     The ✗ appears at `strike`. The rules then FILL over `considered`,
 *     linear, staggered by 40ms in ballot order. This is the one deliberately
 *     theatrical moment on the page and it has earned it: it happens once per
 *     ballot, it is the result being revealed, and the stagger is what makes a
 *     set of numbers read as a count rather than as a chart appearing.
 *
 * ── SCALE, NOT WIDTH ────────────────────────────────────────────────────────
 * The bar was `width: '42%'`, and the obvious animation is to animate that
 * number. `paperMotion`'s third law forbids it, and is right to: width is a
 * LAYOUT property, so every frame would re-measure on the JS thread — on a page
 * that can hold six of these at once. The bar is laid out at its final width
 * and scaled along X from zero, which runs on the UI thread and never touches
 * layout.
 *
 * `transformOrigin: 'left'` is what makes that a fill rather than a bar growing
 * from its own middle. Without it this reads as a completely different effect
 * and looks like a mistake.
 *
 * ── AND IT ARRIVES EVEN WHEN IT DOES NOT MOVE ───────────────────────────────
 * Under `useReducedMotion` the bar is drawn at its final scale immediately.
 * Nothing is REMOVED for a member who has asked for less motion — the result is
 * still revealed, it simply does not travel.
 */
import { memo, useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { BRASS, BRASS_STOPS } from '@/src/theme/brass';
import { p } from './paperStyles';
import { MS, EASE, STAGGER_MS } from './paperMotion';

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

export const PaperFill = memo(function PaperFill({
  percent, index = 0,
}: {
  /** 0–100. The share of the ballot this option took. */
  percent: number;
  /** Its place in the ballot, which is what the stagger counts. */
  index?: number;
}) {
  const grown = useSharedValue(0);
  const reduced = useReducedMotion();
  // Clamped rather than trusted: a frozen tally that has drifted must not scale
  // a bar past its own track.
  const target = Math.max(0, Math.min(100, percent)) / 100;

  useEffect(() => {
    if (reduced) { grown.value = target; return; }
    grown.value = withDelay(
      index * STAGGER_MS,
      // Linear, because a tally that eases is a tally that looks estimated —
      // and taken from the palette rather than written as `Easing.linear`, so
      // there is one definition of the house's curves and not two.
      withTiming(target, { duration: MS.considered, easing: Easing.bezier(...EASE.flat) }),
    );
  }, [target, index, reduced, grown]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: grown.value }] }));

  return (
    <View style={p.fillTrack}>
      <AnimatedGradient
        colors={BRASS} locations={BRASS_STOPS}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[p.fillBar, { width: '100%', transformOrigin: 'left' }, style]}
      />
    </View>
  );
});

/**
 * A mark taking under the thumb.
 * ─────────────────────────────────────────────────────────────────────────────
 * From `paperMotion.ts`, which specified this and was never imported:
 *
 *     THE MARKS (certify, save)
 *     The icon scales 1 → 1.18 → 1 over `strike`. The scale is on the ICON
 *     only, never the row: growing the row would shift the three marks beside
 *     it, and a control that moves its neighbours when you press it feels
 *     broken however brief it is.
 *
 * ── WHY IT IS TIED TO THE STATE, NOT THE PRESS ──────────────────────────────
 * `PressableScale` already carries the app's press, and firing this on press
 * too would be two animations for one tap. This one fires when the mark
 * actually CHANGES — so it reads as the mark taking rather than as the button
 * acknowledging a touch, and it does not fire on the press that fails.
 *
 * ── AND IT DOES NOT FIRE ON ARRIVAL ─────────────────────────────────────────
 * A page of filings the member has already certified would otherwise pulse
 * twenty hearts on mount. The first render is recorded, not animated.
 */
import { memo, useEffect, useRef, type ReactNode } from 'react';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming,
} from 'react-native-reanimated';

import { MS, EASE, STRIKE_SCALE } from './paperMotion';

export const PaperStrike = memo(function PaperStrike({
  on, children,
}: {
  /** Whether the mark is currently made. The CHANGE is what animates. */
  on?: boolean;
  children: ReactNode;
}) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const seen = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    const first = seen.current === undefined;
    const changed = !first && seen.current !== on;
    seen.current = on;
    if (!changed || reduced) return;
    // Out and back. It returns to exactly 1 — this is a pulse, not a spring,
    // and this app has no bounce anywhere.
    scale.value = withSequence(
      withTiming(STRIKE_SCALE, { duration: MS.strike / 2, easing: Easing.bezier(...EASE.in) }),
      withTiming(1, { duration: MS.strike / 2, easing: Easing.bezier(...EASE.in) }),
    );
  }, [on, reduced, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return <Animated.View style={style}>{children}</Animated.View>;
});

import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
  interpolate,
  Extrapolation,
  SharedValue
} from 'react-native-reanimated';

interface UseFilmAnimationsProps {
  isFocused: boolean;
  /** The skeleton is on screen: only then does its shimmer run. */
  skeleton: boolean;
  scrollY: SharedValue<number>;
  backdropHeight: number;
}

/**
 * Each endless loop runs only while what it moves can be seen: the poster's
 * glow while the page is focused, the shimmer while the skeleton is up. A loop
 * left running keeps the UI thread awake for nothing.
 */
export function useFilmAnimations({ isFocused, skeleton, scrollY, backdropHeight }: UseFilmAnimationsProps) {
  const posterGlowOpacity = useSharedValue(0.6);
  const skeletonOpacity = useSharedValue(0.4);
  const bookmarkScale = useSharedValue(1);

  useEffect(() => {
    if (!isFocused) return;
    posterGlowOpacity.value = withRepeat(
      withTiming(0.8, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1, true
    );
    return () => cancelAnimation(posterGlowOpacity);
  }, [isFocused, posterGlowOpacity]);

  useEffect(() => {
    if (!isFocused || !skeleton) return;
    skeletonOpacity.value = withRepeat(
      withTiming(0.8, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1, true
    );
    return () => cancelAnimation(skeletonOpacity);
  }, [isFocused, skeleton, skeletonOpacity]);

  const posterGlowStyle = useAnimatedStyle(() => ({
    opacity: posterGlowOpacity.value,
  }));

  const skeletonAnimStyle = useAnimatedStyle(() => ({
    opacity: skeletonOpacity.value,
  }));

  const bookmarkAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bookmarkScale.value }],
  }));

  /**
   * ── THE FADE COMPLETES ────────────────────────────────────────────────────
   * The backdrop reaches zero across its own height. The atmosphere belongs to
   * the hero; below it the page is ink, and no body text sits at reduced
   * contrast over a photograph.
   */
  // How far the backdrop has drifted DOWN the screen (the parallax). One value,
  // read by the backdrop's style and, negated, by its veil — whose light must
  // hold still on the screen while the backdrop drifts (see RoomVeil).
  const backdropDrift = useDerivedValue(() =>
    interpolate(scrollY.value, [0, backdropHeight], [0, backdropHeight * 0.4], Extrapolation.CLAMP));
  const backdropLifted = useDerivedValue(() => -backdropDrift.value);

  const backdropAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: backdropDrift.value }],
      opacity: interpolate(scrollY.value, [0, backdropHeight * 0.85], [1, 0], Extrapolation.CLAMP),
    };
  });

  const immersiveAnimatedStyle = useAnimatedStyle(() => {
    const clampY = Math.min(Math.max(scrollY.value - backdropHeight, 0), 50);
    return {
      opacity: interpolate(clampY, [0, 50], [1, 0], Extrapolation.CLAMP)
    };
  });

  /**
   * The header is the exact inverse of the floating back button, over the same
   * fifty points. Written as `1 - immersive` in spirit but computed from the
   * same clamp so the two can never drift apart and leave a window with no way
   * back on screen at all.
   */
  const scrollHeaderStyle = useAnimatedStyle(() => {
    const clampY = Math.min(Math.max(scrollY.value - backdropHeight, 0), 50);
    return {
      opacity: interpolate(clampY, [0, 50], [0, 1], Extrapolation.CLAMP)
    };
  });

  return {
    posterGlowStyle,
    skeletonAnimStyle,
    bookmarkAnimStyle,
    backdropAnimatedStyle,
    backdropLifted,
    immersiveAnimatedStyle,
    scrollHeaderStyle,
    bookmarkScale,
  };
}

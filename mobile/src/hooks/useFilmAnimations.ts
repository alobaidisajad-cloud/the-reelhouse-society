import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
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
  scrollY: SharedValue<number>;
  backdropHeight: number;
}

export function useFilmAnimations({ isFocused, scrollY, backdropHeight }: UseFilmAnimationsProps) {
  const posterGlowOpacity = useSharedValue(0.6);
  const whisperPulse = useSharedValue(0.2);
  const skeletonOpacity = useSharedValue(0.4);
  const bookmarkScale = useSharedValue(1);

  useEffect(() => {
    if (isFocused) {
      posterGlowOpacity.value = withRepeat(
        withTiming(0.8, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        -1, true
      );
      whisperPulse.value = withRepeat(
        withTiming(0.6, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1, true
      );
      skeletonOpacity.value = withRepeat(
        withTiming(0.8, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1, true
      );
    } else {
      cancelAnimation(posterGlowOpacity);
      cancelAnimation(whisperPulse);
      cancelAnimation(skeletonOpacity);
    }

    return () => {
      cancelAnimation(posterGlowOpacity);
      cancelAnimation(whisperPulse);
      cancelAnimation(skeletonOpacity);
    };
  }, [isFocused, posterGlowOpacity, skeletonOpacity, whisperPulse]);

  const posterGlowStyle = useAnimatedStyle(() => ({
    opacity: posterGlowOpacity.value,
  }));

  const whisperPulseStyle = useAnimatedStyle(() => ({
    opacity: whisperPulse.value,
    transform: [{ scale: whisperPulse.value * 0.5 + 1 }]
  }));

  const skeletonAnimStyle = useAnimatedStyle(() => ({
    opacity: skeletonOpacity.value,
  }));

  const bookmarkAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bookmarkScale.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: interpolate(scrollY.value, [0, backdropHeight], [0, backdropHeight * 0.4], Extrapolation.CLAMP) }],
      opacity: interpolate(scrollY.value, [0, backdropHeight * 0.6], [1, 0.3], Extrapolation.CLAMP)
    };
  });

  const immersiveAnimatedStyle = useAnimatedStyle(() => {
    const clampY = Math.min(Math.max(scrollY.value - backdropHeight, 0), 50);
    return {
      opacity: interpolate(clampY, [0, 50], [1, 0], Extrapolation.CLAMP)
    };
  });

  return {
    posterGlowStyle,
    whisperPulseStyle,
    skeletonAnimStyle,
    bookmarkAnimStyle,
    backdropAnimatedStyle,
    immersiveAnimatedStyle,
    skeletonOpacity,
    bookmarkScale,
  };
}

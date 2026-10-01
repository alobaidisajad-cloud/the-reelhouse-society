import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, withTiming, withDelay, SharedValue, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/src/theme/theme';

interface CinematicScrollbarProps {
  scrollY: SharedValue<number>;
  scrollHeight: SharedValue<number>;
  viewHeight: SharedValue<number>;
  isScrolling: SharedValue<boolean>;
  viewY?: SharedValue<number>;
  style?: ViewStyle;
  topInset?: number;
  bottomInset?: number;
}

/**
 * The thumb's height, in one place for the layer that sizes it and the one that moves it:
 * at least 36pt to grab, and never taller than its track, or it would travel backwards.
 */
export function thumbHeight(track: number, content: number): number {
  'worklet';
  return Math.min(Math.max((track / content) * track, 36), track);
}

/** How far the thumb travels down its track: never negative, so never backwards. */
export function thumbTravel(track: number, content: number): number {
  'worklet';
  return Math.max(track - thumbHeight(track, content), 0);
}

export const CinematicScrollbar: React.FC<CinematicScrollbarProps> = ({
  scrollY,
  scrollHeight,
  viewHeight,
  isScrolling,
  viewY,
  style,
  topInset,
  bottomInset,
}) => {
  const insets = useSafeAreaInsets();

  // Layer 1: Appearance (opacity and width-pulse).
  // Runs only when `isScrolling` changes, never per-frame.
  const thumbOpacity = useDerivedValue(() => {
    if (scrollHeight.value <= 0 || viewHeight.value <= 0 || scrollHeight.value <= viewHeight.value) {
      return 0;
    }
    return isScrolling.value
      ? withTiming(1, { duration: 150, easing: Easing.inOut(Easing.ease) })
      : withDelay(600, withTiming(0, { duration: 300, easing: Easing.inOut(Easing.ease) }));
  });

  const thumbScaleX = useDerivedValue(() => {
    return isScrolling.value
      ? withTiming(1, { duration: 150, easing: Easing.out(Easing.ease) })
      : withDelay(150, withTiming(0.6, { duration: 200, easing: Easing.inOut(Easing.ease) }));
  });

  // Layer 2: Geometry (layout properties).
  // Runs only when layout dimensions change, zero layout mutations during scroll.
  const geometryStyle = useAnimatedStyle(() => {
    if (scrollHeight.value <= 0 || viewHeight.value <= 0 || scrollHeight.value <= viewHeight.value) {
      return { opacity: 0 };
    }

    const trackTop = topInset ?? 0;
    const trackBottom = bottomInset ?? 0;
    const trackHeight = viewHeight.value - trackTop - trackBottom;

    if (trackHeight <= 0) return { opacity: 0 };

    const baseHeight = thumbHeight(trackHeight, scrollHeight.value);

    return {
      top: viewY?.value ?? 0,
      height: baseHeight,
      right: Math.max(insets.right, 4),
    };
  });

  // Layer 3: Motion (position and overscroll).
  // Pure math returning pure GPU properties (transform and opacity) every frame.
  const motionStyle = useAnimatedStyle(() => {
    if (scrollHeight.value <= 0 || viewHeight.value <= 0 || scrollHeight.value <= viewHeight.value) {
      return { opacity: 0 };
    }

    const trackTop = topInset ?? 0;
    const trackBottom = bottomInset ?? 0;
    const trackHeight = viewHeight.value - trackTop - trackBottom;

    if (trackHeight <= 0) return { opacity: 0 };

    const heightRatio = trackHeight / scrollHeight.value;
    const baseHeight = thumbHeight(trackHeight, scrollHeight.value);

    const maxScroll = scrollHeight.value - viewHeight.value;
    const maxThumbScroll = thumbTravel(trackHeight, scrollHeight.value);

    let progress = maxScroll > 0 ? scrollY.value / maxScroll : 0;
    let translateY = trackTop + (progress * maxThumbScroll);
    let scaleY = 1;

    // Native iOS Elasticity on overscroll (calculated via GPU-ready scaleY)
    if (scrollY.value < 0) {
      // Overscroll top
      const overscroll = Math.abs(scrollY.value);
      const finalHeight = Math.max(baseHeight - overscroll * heightRatio, 10);
      scaleY = finalHeight / baseHeight;
      translateY = trackTop - (baseHeight - finalHeight) / 2;
    } else if (scrollY.value > maxScroll) {
      // Overscroll bottom
      const overscroll = scrollY.value - maxScroll;
      const finalHeight = Math.max(baseHeight - overscroll * heightRatio, 10);
      scaleY = finalHeight / baseHeight;
      const maxTranslateY = trackTop + maxThumbScroll;
      translateY = maxTranslateY + (baseHeight - finalHeight) / 2;
    }

    return {
      opacity: thumbOpacity.value,
      transform: [
        { translateY },
        { scaleY },
        { scaleX: thumbScaleX.value }
      ]
    };
  });

  return (
    <Animated.View 
      style={[
        styles.track,
        style,
        geometryStyle,
        motionStyle
      ]} 
      pointerEvents="none"
    />
  );
};

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    width: 5, // Base width for scaleX animation (visual width is 5 * scaleX, i.e. 3px to 5px)
    backgroundColor: colors.sepia,
    borderRadius: 2.5,
    zIndex: 999,
    shadowColor: colors.sepia,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 3,
  }
});

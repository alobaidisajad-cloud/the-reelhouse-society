/**
 * SkeletonShimmer — Nitrate Noir themed loading placeholder.
 *
 * A Reanimated-driven linear gradient shimmer that sweeps across
 * placeholder boxes. Dark-to-sepia-to-dark sweep, not the generic
 * grey pulse that every other app uses.
 *
 * Usage:
 *   <SkeletonShimmer width={100} height={150} />
 *   <SkeletonShimmer width="100%" height={44} borderRadius={2} />
 *   <SkeletonShimmer count={4} width={80} height={120} /> // renders 4 side-by-side
 */
import React, { memo, useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
  cancelAnimation,
} from 'react-native-reanimated';


interface SkeletonShimmerProps {
  width: number | string;
  height: number | string;
  borderRadius?: number;
  count?: number;
  gap?: number;
  style?: ViewStyle;
}

const ShimmerBox = memo(function ShimmerBox({
  width,
  height,
  borderRadius = 2,
  style,
}: Omit<SkeletonShimmerProps, 'count' | 'gap'>) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => cancelAnimation(shimmer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.6, 0.3]),
    backgroundColor: `rgba(139, 105, 20, ${interpolate(
      shimmer.value,
      [0, 0.5, 1],
      [0.04, 0.12, 0.04]
    )})`,
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height: height as any,
          borderRadius,
          borderWidth: 1,
          borderColor: 'rgba(139,105,20,0.08)',
          overflow: 'hidden',
        },
        shimmerStyle,
        style,
      ]}
    />
  );
});

export default memo(function SkeletonShimmer({
  width,
  height,
  borderRadius = 2,
  count = 1,
  gap = 8,
  style,
}: SkeletonShimmerProps) {
  if (count === 1) {
    return (
      <ShimmerBox
        width={width}
        height={height}
        borderRadius={borderRadius}
        style={style}
      />
    );
  }

  return (
    <View style={[styles.row, { gap }, style]}>
      {Array.from({ length: count }, (_, i) => (
        <ShimmerBox
          key={i}
          width={width}
          height={height}
          borderRadius={borderRadius}
        />
      ))}
    </View>
  );
});

/**
 * Pre-built skeleton layouts for common ReelHouse patterns.
 */
export const SkeletonPosterRow = memo(function SkeletonPosterRow({
  columns = 4,
  posterHeight = 140,
  posterWidth = 85,
}: {
  columns?: number;
  posterHeight?: number;
  posterWidth?: number;
}) {
  return (
    <View style={styles.row}>
      {Array.from({ length: columns }, (_, i) => (
        <View key={i} style={styles.posterCol}>
          <ShimmerBox width={posterWidth} height={posterHeight} borderRadius={4} />
          <ShimmerBox width={posterWidth * 0.8} height={10} borderRadius={1} style={{ marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
});

export const SkeletonLogCard = memo(function SkeletonLogCard() {
  return (
    <View style={styles.logCard}>
      <ShimmerBox width={60} height={90} borderRadius={4} />
      <View style={styles.logCardContent}>
        <ShimmerBox width="70%" height={14} borderRadius={2} />
        <ShimmerBox width="40%" height={10} borderRadius={2} style={{ marginTop: 8 }} />
        <ShimmerBox width="90%" height={10} borderRadius={2} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  posterCol: {
    alignItems: 'center',
    flex: 1,
  },
  logCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.08)',
    borderRadius: 2,
    marginBottom: 8,
  },
  logCardContent: {
    flex: 1,
    justifyContent: 'center',
  },
});

import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/src/theme/theme';

interface FilmHeroSkeletonProps {
  skeletonAnimStyle: StyleProp<ViewStyle>;
  backdropHeight: number;
}

const POSTER_W = 140;
const POSTER_H = POSTER_W * 1.5;

export const FilmHeroSkeleton = memo(function FilmHeroSkeleton({ skeletonAnimStyle, backdropHeight }: FilmHeroSkeletonProps) {
  return (
    <>
      <View style={[styles.shimmerBackdrop, { height: backdropHeight }]}>
        <Animated.View style={[styles.shimmer, StyleSheet.absoluteFillObject, skeletonAnimStyle]} />
        <LinearGradient colors={['rgba(11,10,8,0.1)', 'rgba(11,10,8,0.6)', colors.ink]} locations={[0, 0.7, 1]} style={StyleSheet.absoluteFill} />
      </View>
      <View style={styles.shimmerContent}>
        <Animated.View style={[styles.shimmer, styles.shimmerPoster, skeletonAnimStyle]} />
        <Animated.View style={[styles.shimmer, styles.shimmerEyebrow, skeletonAnimStyle]} />
        <Animated.View style={[styles.shimmer, styles.shimmerTitle, skeletonAnimStyle]} />
        <Animated.View style={[styles.shimmer, styles.shimmerMeta, skeletonAnimStyle]} />
        <Animated.View style={[styles.shimmer, styles.shimmerCta, skeletonAnimStyle]} />
      </View>
    </>
  );
});

const styles = StyleSheet.create({
  shimmer: { backgroundColor: 'rgba(184,137,26,0.15)' },
  shimmerBackdrop: { backgroundColor: 'rgba(8,6,4,0.98)', position: 'relative' },
  shimmerContent: { marginTop: -80, alignItems: 'center', paddingHorizontal: 20 },
  shimmerPoster: { width: POSTER_W, height: POSTER_H, borderRadius: 6, marginBottom: 16 },
  shimmerEyebrow: { width: 120, height: 10, borderRadius: 2, marginBottom: 10 },
  shimmerTitle: { width: 200, height: 28, borderRadius: 2, marginBottom: 10 },
  shimmerMeta: { width: 160, height: 10, borderRadius: 2, marginBottom: 20 },
  shimmerCta: { width: '100%', height: 48, borderRadius: 2 },
});

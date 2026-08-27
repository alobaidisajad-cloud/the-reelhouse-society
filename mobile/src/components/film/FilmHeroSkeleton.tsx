import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, metrics } from '@/src/theme/theme';
import { STUB_HEIGHT, STUB_PAD_TOP } from './filmStubMetrics';

interface FilmHeroSkeletonProps {
  skeletonAnimStyle: StyleProp<ViewStyle>;
  backdropHeight: number;
  /** So the waiting dock stands off the glass exactly as the real one does. */
  bottomInset: number;
}

const POSTER_W = 140;
const POSTER_H = POSTER_W * 1.5;

/**
 * ── A SKELETON IS A PROMISE ABOUT WHAT IS ARRIVING ──────────────────────────
 * Two things here were promising the page that used to exist:
 *
 *   · a full-width 48pt bar in the content flow, standing in for the CONSOLE
 *     that this pass retired. It drew a control that is never coming.
 *
 *   · `marginTop: -80`, the poster's OLD lift. The page now lifts it 190 into
 *     a shorter backdrop, so the poster landed some 110pt lower here than in
 *     the page that replaced it — a visible jump at the exact moment a member
 *     is watching the screen settle.
 *
 * The lift is read from the same token the page uses, so the two cannot drift
 * again, and the bar becomes what actually arrives: a docked plate.
 */
export const FilmHeroSkeleton = memo(function FilmHeroSkeleton({
  skeletonAnimStyle, backdropHeight, bottomInset,
}: FilmHeroSkeletonProps) {
  return (
    <>
      <View style={[styles.shimmerBackdrop, { height: backdropHeight }]}>
        <Animated.View style={[styles.shimmer, StyleSheet.absoluteFillObject, skeletonAnimStyle]} />
        <LinearGradient colors={['rgba(11,10,8,0.1)', 'rgba(11,10,8,0.6)', colors.ink]} locations={[0, 0.7, 1]} style={StyleSheet.absoluteFill} />
      </View>
      <View style={[styles.shimmerContent, { marginTop: -metrics.posterLift }]}>
        <Animated.View style={[styles.shimmer, styles.shimmerPoster, skeletonAnimStyle]} />
        <Animated.View style={[styles.shimmer, styles.shimmerEyebrow, skeletonAnimStyle]} />
        <Animated.View style={[styles.shimmer, styles.shimmerTitle, skeletonAnimStyle]} />
        <Animated.View style={[styles.shimmer, styles.shimmerMeta, skeletonAnimStyle]} />
      </View>

      {/* The stub's place, held. Docked, the height it will be, so nothing
          moves under the member's thumb when the film resolves. */}
      <View style={[styles.waitingDock, { paddingBottom: Math.max(bottomInset, 16) }]}>
        <Animated.View style={[styles.shimmer, styles.shimmerStub, skeletonAnimStyle]} />
      </View>
    </>
  );
});

const styles = StyleSheet.create({
  shimmer: { backgroundColor: 'rgba(184,137,26,0.15)' },
  shimmerBackdrop: { backgroundColor: 'rgba(8,6,4,0.98)', position: 'relative' },
  // marginTop comes from `metrics.posterLift` at render — the same token the
  // real hero uses, so the poster cannot land in two different places.
  shimmerContent: { alignItems: 'center', paddingHorizontal: 20 },
  shimmerPoster: { width: POSTER_W, height: POSTER_H, borderRadius: 6, marginBottom: 16 },
  shimmerEyebrow: { width: 120, height: 10, borderRadius: 2, marginBottom: 10 },
  shimmerTitle: { width: 200, height: 28, borderRadius: 2, marginBottom: 10 },
  shimmerMeta: { width: 160, height: 10, borderRadius: 2, marginBottom: 20 },
  waitingDock: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 20, paddingTop: STUB_PAD_TOP,
    backgroundColor: 'rgba(8,6,4,0.96)',
    borderTopWidth: 1, borderTopColor: colors.sepiaBorder,
  },
  shimmerStub: { height: STUB_HEIGHT, borderRadius: 2 },
});

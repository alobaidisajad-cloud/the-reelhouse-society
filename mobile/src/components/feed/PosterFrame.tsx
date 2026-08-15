import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';

const TMDB_IMG_W185 = 'https://image.tmdb.org/t/p/w185';
const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

interface Props {
  itemId: string | number;
  filmId: number;
  posterPath: string | null | undefined;
  isPremium: boolean;
  isAuteur: boolean;
  onPress: () => void;
}

/**
 * Film poster with physical embossing, premium shadow, and tactile lighting overlay.
 */
export const PosterFrame = React.memo(function PosterFrame({ itemId, filmId, posterPath, isPremium, isAuteur, onPress }: Props) {
  const posterUri = posterPath ? `${TMDB_IMG_W185}${posterPath}` : null;

  return (
    // Two views, not one. This poster declares a 20pt shadow at 0.7 opacity —
    // the thing that makes it read as stapled to the file rather than printed
    // on it — and it also declared overflow:'hidden' to clip the blurred glow
    // layer below. A layer that masks to its bounds cannot draw a shadow
    // OUTSIDE them, so on iOS that shadow has never existed, while Android
    // drew one anyway from elevation. The outer view carries the shadow; the
    // inner one carries the clip. Same split as the brass Concierge disc.
    <PressableScale onPress={onPress} haptic="heavy" style={s.wrapShadow} accessibilityLabel="View film details">
    <View style={s.wrap}>
      {/* Premium glow shadow layer */}
      {posterUri && (isPremium || isAuteur) && (
        <AnimatedExpoImage
          {...{
            source: { uri: posterUri },
            style: [s.poster, s.premiumShadow, { tintColor: isAuteur ? '#521010' : colors.tarnish }],
            blurRadius: 15,
            cachePolicy: "memory-disk",
            recyclingKey: `blur-${filmId}`,
            placeholder: { blurhash: SEPIA_HASH },
            transition: 100,
          } as Record<string, unknown>}
        />
      )}

      {/* Main poster — or the Society's mark when the archive holds no still */}
      {posterUri ? (
        <AnimatedExpoImage
          {...{
            sharedTransitionTag: `poster-${itemId}-${filmId}`,
            source: { uri: posterUri },
            style: s.poster,
            cachePolicy: "memory-disk",
            recyclingKey: `poster-${filmId}`,
            placeholder: { blurhash: SEPIA_HASH },
            transition: 100,
          } as Record<string, unknown>}
        />
      ) : (
        <View style={s.posterEmpty}>
          <Text style={s.posterEmptyMark}>✦</Text>
        </View>
      )}

      {/* Tactile lighting overlay */}
      <LinearGradient
        colors={['rgba(255,255,255,0.05)', 'transparent', 'rgba(10,7,3,0.8)']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <View style={s.edgeHighlight} pointerEvents="none" />
    </View>
    </PressableScale>
  );
});

const s = StyleSheet.create({
  // The shadow host. Carries the lift and nothing that clips, so the shadow can
  // actually be drawn outside the bounds on iOS.
  wrapShadow: {
    // Index-card scale: the poster is the photo stapled to the file,
    // not the shrine centerpiece.
    width: 74,
    height: 111,
    borderRadius: 3,
    zIndex: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 12,
  },
  // The clip host. The blurred glow layer is scaled to 1.15 and would spill
  // past the frame without this.
  wrap: {
    width: '100%',
    height: '100%',
    borderWidth: 1,
    borderColor: 'rgba(220,166,58,0.4)',
    borderRadius: 3,
    backgroundColor: colors.soot,
    position: 'relative',
    overflow: 'hidden',
  },
  posterEmpty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
  },
  posterEmptyMark: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.sepia,
    opacity: 0.35,
    includeFontPadding: false,
  },
  poster: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  premiumShadow: {
    position: 'absolute',
    transform: [{ scale: 1.15 }],
    opacity: 0.6,
  },
  edgeHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    zIndex: 10,
  },
});

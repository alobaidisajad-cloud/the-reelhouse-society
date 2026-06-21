import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, SEPIA_HASH } from '@/src/theme/theme';
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
    <PressableScale onPress={onPress} haptic="heavy" style={s.wrap} accessibilityLabel="View film details">
      {/* Premium glow shadow layer */}
      {posterUri && (isPremium || isAuteur) && (
        <AnimatedExpoImage
          {...{
            source: { uri: posterUri },
            style: [s.poster, s.premiumShadow, { tintColor: isAuteur ? '#521010' : '#8B6914' }],
            blurRadius: 15,
            cachePolicy: "memory-disk",
            recyclingKey: `blur-${filmId}`,
            placeholder: { blurhash: SEPIA_HASH },
            transition: 100,
          } as Record<string, unknown>}
        />
      )}

      {/* Main poster */}
      {posterUri && (
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
      )}

      {/* Tactile lighting overlay */}
      <LinearGradient
        colors={['rgba(255,255,255,0.05)', 'transparent', 'rgba(10,7,3,0.8)']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <View style={s.edgeHighlight} pointerEvents="none" />
    </PressableScale>
  );
});

const s = StyleSheet.create({
  wrap: {
    width: 140,
    height: 210,
    borderWidth: 1.5,
    borderColor: 'rgba(218,165,32,0.4)',
    borderRadius: 4,
    backgroundColor: colors.soot,
    position: 'relative',
    overflow: 'hidden',
    zIndex: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 25,
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

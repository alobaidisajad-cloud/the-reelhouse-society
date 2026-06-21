import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { fonts, SEPIA_HASH } from '@/src/theme/theme';

const TMDB_IMG_W500 = 'https://image.tmdb.org/t/p/w500';

interface Props {
  editorialHeader: string | null | undefined;
  posterPath: string | null | undefined;
  isPremium: boolean;
}

/**
 * Editorial banner strip at the top of premium / editorial cards.
 * Renders a blurred backdrop (poster fallback) or full editorial image.
 */
export const EditorialBanner = React.memo(function EditorialBanner({ editorialHeader, posterPath, isPremium }: Props) {
  const backdropUri = editorialHeader
    ? `${TMDB_IMG_W500}${editorialHeader}`
    : posterPath
      ? `${TMDB_IMG_W500}${posterPath}`
      : null;

  if (!backdropUri) return null;
  if (!editorialHeader && !isPremium) return null;

  return (
    <View style={s.container}>
      <View style={s.imageWrap}>
        <Image
          source={{ uri: backdropUri }}
          style={[StyleSheet.absoluteFillObject, s.imageStyle, !editorialHeader && s.imageFallback]}
          blurRadius={!editorialHeader ? 15 : 0}
          cachePolicy="memory-disk"
          placeholder={{ blurhash: SEPIA_HASH }}
          contentFit="cover"
          transition={200}
        />
        <LinearGradient colors={['rgba(11,10,8,0.3)', 'rgba(11,10,8,0.95)']} style={StyleSheet.absoluteFillObject} />
        {editorialHeader && (
          <View style={s.badge}><Text style={s.badgeText}>✦ EDITORIAL</Text></View>
        )}
      </View>
      <LinearGradient
        colors={['transparent', 'rgba(196,150,26,0.3)', 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={s.accent}
      />
    </View>
  );
});

const s = StyleSheet.create({
  container: {
    width: '100%',
    height: 100,
    position: 'relative',
  },
  imageWrap: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  imageStyle: {
    resizeMode: 'cover',
  },
  imageFallback: {
    transform: [{ scale: 1.3 }],
    opacity: 0.35,
  },
  accent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  badge: {
    position: 'absolute',
    top: 24,
    left: 24,
    backgroundColor: 'rgba(11,10,8,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.2)',
  },
  badgeText: {
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontFamily: fonts.ui,
    fontSize: 7,
    letterSpacing: 2.2,
    color: 'rgba(218,165,32,0.85)',
  },
});

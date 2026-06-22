/**
 * FilmStripRow — FlashList horizontal poster carousel with tactile card details.
 */
import { memo, useCallback } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { FlashList } from '@shopify/flash-list';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { SectionDivider } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import type { TMDBFilm } from './types';

const TMDB_IMG_W185 = 'https://image.tmdb.org/t/p/w185';
 

const MemoizedBox16 = memo(() => <View style={{ width: 16 }} />);

const FilmCard = memo(function FilmCard({ film, onPress }: { film: TMDBFilm; onPress: (id: number) => void; index?: number }) {
  const { width } = useWindowDimensions();
  const posterWidth = width * 0.29;
  const posterHeight = posterWidth * 1.5;
  const posterUri = film.poster_path ? `${TMDB_IMG_W185}${film.poster_path}` : null;
  return (
    <PressableScale style={[s.filmCard, { width: posterWidth }]} onPress={() => onPress(film.id)}>
      <View style={[s.posterWrap, { width: posterWidth, height: posterHeight }, !posterUri && s.posterEmpty]}>
        {posterUri ? (
          <Image source={{ uri: posterUri }} style={s.posterImg} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={200} />
        ) : (
          <Text style={s.posterPlaceholder}>✦</Text>
        )}
        
        {/* Tactile Overlay Lighting */}
        <LinearGradient 
          colors={['rgba(255,255,255,0.05)', 'transparent', 'rgba(10,7,3,0.8)']} 
          locations={[0, 0.4, 1]} 
          style={StyleSheet.absoluteFillObject} 
          pointerEvents="none" 
        />
        
        {/* Physical Edge Details */}
        <View style={s.posterEdgeHighlight} pointerEvents="none" />
      </View>
    </PressableScale>
  );
}, (prev, next) => prev.film.id === next.film.id);

export const FilmStripRow = memo(function FilmStripRow({ title, label, films }: { title: string; label: string; films: TMDBFilm[] }) {
  const router = useRouter();
  const handlePress = useCallback((filmId: number) => {
    TactileEngine.selection();
    (router.push as any)(`/film/${filmId}` as any);
  }, [router]);

  const renderFilmCard = useCallback(({ item, index }: { item: TMDBFilm; index: number }) => (
    <FilmCard film={item} index={index} onPress={handlePress} />
  ), [handlePress]);

  const filmKeyExtractor = useCallback((item: TMDBFilm, i: number) => `${title}-${item.id}-${i}`, [title]);

  const { width } = useWindowDimensions();
  const posterWidth = width * 0.29;
  const posterHeight = posterWidth * 1.5;

  if (!films || films.length === 0) return null;

  return (
    <Animated.View entering={FadeInDown.duration(600).delay(200)} style={s.filmStripSection}>
      <SectionDivider label={label} />
      <View style={s.stripHeader}>
        <View style={s.stripTitleRow}>
          <View style={s.sectionBeacon} />
          <Text style={s.stripTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
        </View>
      </View>

      <View style={[s.flashListStripWrap, { height: posterHeight + 3 }]}>
        <FlashList
          horizontal
          data={films}
          keyExtractor={filmKeyExtractor}
          renderItem={renderFilmCard}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.stripScroll}
          decelerationRate="normal"
          snapToInterval={posterWidth + 16}
          snapToAlignment="start"
          disableIntervalMomentum={false}
          estimatedItemSize={posterWidth + 16}
          drawDistance={200}
          ItemSeparatorComponent={MemoizedBox16}
        />
      </View>
    </Animated.View>
  );
});

const s = StyleSheet.create({
  filmStripSection: {
    marginBottom: 6,
  },
  stripHeader: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  stripTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionBeacon: {
    width: 3,
    height: 16,
    backgroundColor: colors.sepia,
    borderRadius: 1.5,
    opacity: 0.6,
  },
  stripTitle: {
    fontFamily: fonts.sub,
    fontSize: 16,
    color: colors.parchment,
    letterSpacing: 0.5,
    flex: 1,
  },
  flashListStripWrap: {
  },
  stripScroll: {
    paddingHorizontal: 16,
  },
  filmCard: {
  },
  posterWrap: {
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.12)',
    backgroundColor: colors.ink,
  },
  posterEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'dashed',
    borderColor: 'rgba(139,105,20,0.2)',
  },
  posterImg: {
    width: '100%',
    height: '100%',
  },
  posterPlaceholder: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.sepia,
    opacity: 0.3,
  },
  posterEdgeHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});


MemoizedBox16.displayName = 'MemoizedBox16';
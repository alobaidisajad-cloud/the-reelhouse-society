import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { Film as FilmIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import TactileEngine from '@/src/utils/TactileEngine';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import PressableScale from '@/src/components/PressableScale';
import { SectionErrorBoundary } from '@/src/components/SectionErrorBoundary';

interface SimilarFilm {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
}

interface SimilarCardProps {
  film: SimilarFilm;
  onPress: (id: number) => void;
}

const SimilarCard = memo(function SimilarCard({ film, onPress }: SimilarCardProps) {
  const posterUri = film.poster_path ? tmdb.poster(film.poster_path, 'w185') : null;
  const handlePress = useCallback(() => {
    TactileEngine.selection();
    onPress(film.id);
  }, [onPress, film.id]);

  return (
    <PressableScale onPress={handlePress} style={s.similarCard} accessibilityLabel={`Similar film: ${film.title || film.name}`}>
      {posterUri ? (
        <Image source={{ uri: posterUri }} style={s.similarPoster} cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={50} />
      ) : (
        <View style={[s.similarPoster, s.similarPosterPlaceholder]}>
          <FilmIcon size={16} color={colors.fog} strokeWidth={1} />
        </View>
      )}
      <Text style={s.similarTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{film.title || film.name}</Text>
    </PressableScale>
  );
});

interface FilmSimilarProps {
  similarFilms: SimilarFilm[];
}
const keyExtractor = (item: SimilarFilm, index: number) => `${item.id}-${index}`;

export const FilmSimilar = memo(function FilmSimilar({ similarFilms }: FilmSimilarProps) {
  const router = useRouter();

  const handlePressSimilar = useCallback((id: number) => {
    if (id) (router.push as any)(`/film/${id}` as any);
  }, [router]);

  // Stable render function prevents FlashList full re-renders
  const renderSimilarItem = useCallback(({ item }: { item: SimilarFilm }) => (
    <SimilarCard film={item} onPress={handlePressSimilar} />
  ), [handlePressSimilar]);

  if (!similarFilms || similarFilms.length === 0) return null;

  return (
    <SectionErrorBoundary fallbackMessage="Similar films could not be loaded.">
      <Animated.View style={s.sectionFlush}>
        <View style={s.sectionPadded}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>YOU MAY ALSO LIKE</Text>
            <View style={s.sectionLine} />
          </View>
        </View>
        <View style={s.similarListContainer}>
          <FlashList
            data={similarFilms}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={keyExtractor}
            contentContainerStyle={s.horizontalList}
            estimatedItemSize={110}
            snapToInterval={110}
            snapToAlignment="start"
            decelerationRate="fast"
            renderItem={renderSimilarItem}
          />
        </View>
      </Animated.View>
    </SectionErrorBoundary>
  );
});

const s = StyleSheet.create({
  sectionFlush: { marginBottom: 24, zIndex: 2 },
  sectionPadded: { paddingHorizontal: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  sectionTitle: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 3, color: colors.sepia },
  sectionLine: { flex: 1, height: 1, backgroundColor: 'rgba(139,105,20,0.3)' },
  horizontalList: { paddingHorizontal: 20 },
  
  similarListContainer: { height: 180 },
  similarCard: { width: 100, marginRight: 10 },
  similarPoster: { width: 100, height: 150, borderRadius: 4, marginBottom: 8, backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)' },
  similarPosterPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  similarTitle: { fontFamily: fonts.body, fontSize: 11, color: colors.bone, textAlign: 'center' },
});

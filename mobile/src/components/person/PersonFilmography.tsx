/**
 * PersonFilmography — FilmPosterCard grid item, FilmStripPerforations,
 * and the filmography section header used by the main FlashList.
 */
import { useCallback, memo } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, SEPIA_HASH } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { nav } from '@/src/utils/typedRouter';
import PressableScale from '@/src/components/PressableScale';
import { SectionDivider } from '@/src/components/Decorative';
import { Film as FilmIcon } from 'lucide-react-native';
import { s, st, GRID_COL_STYLES } from '@/src/components/person/personStyles';

const PERF_COUNT = 40;

// ── Interfaces ──────────────────────────────────────────────
interface PersonCredit {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  character?: string;
  job?: string;
}

// ── Film-strip Perforations ──────────────────────────────────
export const FilmStripPerforations = memo(function FilmStripPerforations() {
  return (
    <View style={st.perfRow}>
      {Array.from({ length: PERF_COUNT }).map((_, i) => (
        <View key={i} style={st.perfHole} />
      ))}
    </View>
  );
});

// ── Film Poster Card (grid item) ─────────────────────────────
export const FilmPosterCard = memo(function FilmPosterCard({ film }: { film: PersonCredit }) {
  const posterUri = film.poster_path ? tmdb.poster(film.poster_path, 'w185') : null;

  const handlePress = useCallback(() => {
    nav.push(`/film/${film.id}`);
  }, [film.id]);

  return (
    <PressableScale
      style={st.gridCard}
      onPress={handlePress}
      haptic="selection"
    >
      {posterUri ? (
        <Image
          source={{ uri: posterUri }}
          style={st.gridPoster}
          contentFit="cover"
          cachePolicy="memory-disk"
          placeholder={{ blurhash: SEPIA_HASH }}
          transition={50}
        />
      ) : (
        <View style={[st.gridPoster, st.gridPosterPlaceholder]}>
          <FilmIcon size={16} color={colors.fog} strokeWidth={1} />
        </View>
      )}
      <Text style={st.gridTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{film.title || film.name}</Text>
      <Text style={st.gridYear}>{film.release_date ? film.release_date.slice(0, 4) : 'TBA'}</Text>
    </PressableScale>
  );
});

// ── Filmography Section Header ───────────────────────────────
export const FilmographyHeader = memo(function FilmographyHeader() {
  return (
    <View style={s.section}>
      {/* Gold gradient separator */}
      <LinearGradient
        colors={['transparent', 'rgba(184,137,26,0.35)', 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={s.goldSep}
      />
      <SectionDivider label="COMPLETE FILMOGRAPHY" />
      <Text style={s.sectionSubtitle}>The Full Archive</Text>
    </View>
  );
});

/** Render callback for the main FlashList 3-col grid */
export function renderGridItem({ item, index }: { item: PersonCredit; index: number }) {
  return (
    <View style={GRID_COL_STYLES[index % 3]}>
      <FilmPosterCard film={item} />
    </View>
  );
}

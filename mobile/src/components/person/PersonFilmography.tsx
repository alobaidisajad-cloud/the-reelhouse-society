/**
 * PersonFilmography — THE CANON: the artist's own craft, complete.
 * FilmPosterCard grid item (with the brass SCREENED tick), the
 * film-strip perforations, and the canon section header.
 *
 * The tick is the Hunt made visible: every film the member has logged
 * (and not abandoned) wears the mark — the grid reads like their own
 * marked-up contact sheet of the artist's career.
 */
import { useCallback, memo } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { colors, SEPIA_HASH } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { nav } from '@/src/utils/typedRouter';
import PressableScale from '@/src/components/PressableScale';
import { FilmSectionHeader } from '@/src/components/film/FilmSectionHeader';
import { Film as FilmIcon, Check } from 'lucide-react-native';
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
export const FilmPosterCard = memo(function FilmPosterCard({ film, screened }: { film: PersonCredit; screened?: boolean }) {
  const posterUri = film.poster_path ? tmdb.poster(film.poster_path, 'w185') : null;

  const handlePress = useCallback(() => {
    nav.push(`/film/${film.id}`);
  }, [film.id]);

  return (
    <PressableScale
      style={st.gridCard}
      onPress={handlePress}
      haptic="selection"
      accessibilityLabel={`${film.title || film.name}${screened ? ', screened' : ''}`}
    >
      <View style={st.gridPosterWrap}>
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
        {screened && (
          <View style={st.screenedTick}>
            <Check size={10} color="#DCA63A" strokeWidth={2.5} />
          </View>
        )}
      </View>
      <Text style={st.gridTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{film.title || film.name}</Text>
      <Text style={st.gridYear}>{film.release_date ? film.release_date.slice(0, 4) : 'TBA'}</Text>
    </PressableScale>
  );
});

// ── Canon Section Header ─────────────────────────────────────
export const FilmographyHeader = memo(function FilmographyHeader({ count }: { count: number }) {
  return (
    <View style={s.section}>
      <FilmSectionHeader label={count > 0 ? `THE CANON — ${count} FILMS` : 'THE CANON'} />
    </View>
  );
});

/** Column wrapper for the main FlashList 3-col grid */
export function GridColumn({ index, children }: { index: number; children: React.ReactNode }) {
  return <View style={GRID_COL_STYLES[index % 3]}>{children}</View>;
}

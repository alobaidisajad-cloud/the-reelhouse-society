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
import { View, PixelRatio, useWindowDimensions } from 'react-native';
import { Text } from '@/src/components/text';
import { Image } from 'expo-image';
import { colors, SEPIA_HASH } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { nav } from '@/src/utils/typedRouter';
import PressableScale from '@/src/components/PressableScale';
import { FilmSectionHeader } from '@/src/components/film/FilmSectionHeader';
import { Film as FilmIcon, Check } from 'lucide-react-native';
import { s, st, GRID_COL_STYLES, GRID_TITLE_BOX } from '@/src/components/person/personStyles';
import { displayTextProps } from '@/src/constants/textScaling';
import { useLineScale } from '@/src/hooks/useTextScale';

// A 110pt-wide poster is 330 physical pixels on a 3x screen, which w185 would
// leave to the upscaler; 2x devices are served by w185.
const GRID_POSTER_SIZE = PixelRatio.get() >= 3 ? 'w342' : 'w185';

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
// Each hole is 14 wide with a 6pt gap: as many as the screen is wide, and two
// spare so the row runs past both edges, which is the point.
const PERF_PITCH = 20;
export const FilmStripPerforations = memo(function FilmStripPerforations() {
  const { width } = useWindowDimensions();
  const count = Math.ceil(width / PERF_PITCH) + 2;
  return (
    <View style={st.perfRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={st.perfHole} />
      ))}
    </View>
  );
});

// ── Film Poster Card (grid item) ─────────────────────────────
export const FilmPosterCard = memo(function FilmPosterCard({ film, screened }: { film: PersonCredit; screened?: boolean }) {
  const posterUri = film.poster_path ? tmdb.poster(film.poster_path, GRID_POSTER_SIZE) : null;
  // The title SETS its lineHeight, so its box grows the way a set line does.
  const titleScale = useLineScale(displayTextProps.maxFontSizeMultiplier);

  const handlePress = useCallback(() => {
    nav.push(`/film/${film.id}`);
  }, [film.id]);

  return (
    <PressableScale
      style={st.gridCard}
      onPress={handlePress}
      haptic="selection"
      // Columns sit 10pt apart and rows 18pt, and the later sibling wins an
      // overlap on both platforms: half the real gap is the most either may
      // claim, or the edge of one poster would open the film beside it.
      hitSlop={{ top: 9, bottom: 9, left: 5, right: 5 }}
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
            <Check size={10} color={colors.marqueeGold} strokeWidth={2.5} />
          </View>
        )}
      </View>
      {/* Two lines at a readable size, never one squeezed small. The box is
          two lines tall whatever the title, at the size the phone draws, so a
          wrapped title cannot knock its row out of line nor lose its second
          line at a large setting. */}
      <Text style={[st.gridTitle, { height: GRID_TITLE_BOX * titleScale }]} numberOfLines={2} {...displayTextProps}>{film.title || film.name}</Text>
      <Text style={st.gridYear} {...displayTextProps}>{film.release_date ? film.release_date.slice(0, 4) : 'TBA'}</Text>
    </PressableScale>
  );
});

// ── Canon Section Header ─────────────────────────────────────
export const FilmographyHeader = memo(function FilmographyHeader({ count }: { count: number }) {
  return (
    <View style={s.section}>
      <FilmSectionHeader label={count > 0 ? `THE CANON — ${count} ${count === 1 ? 'FILM' : 'FILMS'}` : 'THE CANON'} />
    </View>
  );
});

/** Column wrapper for the main FlashList 3-col grid */
export function GridColumn({ index, children }: { index: number; children: React.ReactNode }) {
  return <View style={GRID_COL_STYLES[index % 3]}>{children}</View>;
}

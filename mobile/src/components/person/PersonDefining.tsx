/**
 * PersonDefining — DEFINING WORKS, the curated shelf of the artist's file.
 * Drawn from the canon (their own craft only). Ratings speak in reels,
 * never stars — the Society has its own instruments.
 */
import { useCallback, memo } from 'react';
import { View, Text, PixelRatio } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, SEPIA_HASH } from '@/src/theme/theme';
import { tmdb, obscurityScore } from '@/src/lib/tmdb';
import { nav } from '@/src/utils/typedRouter';
import PressableScale from '@/src/components/PressableScale';
import { FilmSectionHeader } from '@/src/components/film/FilmSectionHeader';
import { Film as FilmIcon } from 'lucide-react-native';
import { ObscurityBadge } from '@/src/components/person/PersonOrnaments';
import { s, st } from '@/src/components/person/personStyles';
import { displayTextProps } from '@/src/constants/textScaling';

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

interface PersonDefiningProps {
  definingWorks: PersonCredit[];
}

// A 140pt card is 420 physical pixels on a 3x screen. 2x devices keep w342.
const DEF_POSTER_SIZE = PixelRatio.get() >= 3 ? 'w500' : 'w342';

// ── Defining Work Card ───────────────────────────────────────
const DefiningCard = memo(function DefiningCard({ film }: { film: PersonCredit }) {
  const posterUri = film.poster_path ? tmdb.poster(film.poster_path, DEF_POSTER_SIZE) : null;
  const score = obscurityScore(film);

  const handlePress = useCallback(() => {
    nav.push(`/film/${film.id}`);
  }, [film.id]);

  return (
    <PressableScale
      style={st.defCard}
      onPress={handlePress}
      haptic="selection"
      // The shelf's separator is 12pt, so 6 is the most either card may claim.
      // At the default 15 they overlapped by 18pt and the later card took it.
      hitSlop={{ top: 15, bottom: 15, left: 6, right: 6 }}
      accessibilityLabel={`${film.title || film.name}${film.release_date ? `, ${film.release_date.slice(0, 4)}` : ''}`}
    >
      <View style={st.defPosterWrap}>
        {posterUri ? (
          <Image source={{ uri: posterUri }} style={st.defPoster} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={50} />
        ) : (
          <View style={[st.defPoster, st.defPosterPlaceholder]}>
            <FilmIcon size={20} color={colors.fog} strokeWidth={1} />
          </View>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(10,7,3,0.5)', 'rgba(10,7,3,0.92)']}
          locations={[0, 0.45, 1]}
          style={st.defOverlay}
        >
          <Text style={st.defTitle} numberOfLines={2} {...displayTextProps}>{film.title || film.name}</Text>
          <View style={st.defMetaRow}>
            {/* The five reels used to sit here at 8pt, where they resolved to
                smudges rather than a rating — an instrument you cannot read is
                worse than none. The year and the obscurity mark below already
                say what this card needs to say. The reels keep their meaning on
                surfaces large enough to show them. */}
            <Text style={st.defYear} {...displayTextProps}>{film.release_date ? film.release_date.slice(0, 4) : 'TBA'}</Text>
          </View>
        </LinearGradient>
      </View>
      <View style={st.defBadgeWrap}>
        <ObscurityBadge score={score} />
      </View>
    </PressableScale>
  );
});

// ── Defining Separator ───────────────────────────────────────
const DefiningSeparator = memo(function DefiningSeparator() {
  return <View style={st.defSeparator} />;
});

// ── Main Component ───────────────────────────────────────────
export const PersonDefining = memo(function PersonDefining({
  definingWorks,
}: PersonDefiningProps) {
  const renderDefiningItem = useCallback(({ item }: { item: PersonCredit }) => (
    <DefiningCard film={item} />
  ), []);

  return (
    <View style={s.sectionFlush}>
      <View style={s.sectionPadded}>
        <FilmSectionHeader label="DEFINING WORKS" />
      </View>
      <View style={s.definingWorksWrap}>
        <FlashList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={definingWorks}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={s.definingList}
          ItemSeparatorComponent={DefiningSeparator}
          estimatedItemSize={152}
          snapToInterval={152}
          snapToAlignment="start"
          decelerationRate="fast"
          renderItem={renderDefiningItem}
        />
      </View>
    </View>
  );
});

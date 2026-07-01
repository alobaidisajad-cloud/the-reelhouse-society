/**
 * PersonDefining — Defining works horizontal carousel with DefiningCard
 * and DefiningSeparator sub-components.
 */
import { useCallback, memo } from 'react';
import { View, Text } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, SEPIA_HASH } from '@/src/theme/theme';
import { tmdb, obscurityScore } from '@/src/lib/tmdb';
import { nav } from '@/src/utils/typedRouter';
import PressableScale from '@/src/components/PressableScale';
import { SectionDivider } from '@/src/components/Decorative';
import { Film as FilmIcon, Star } from 'lucide-react-native';
import { ObscurityBadge } from '@/src/components/person/PersonOrnaments';
import { s, st } from '@/app/person/_personStyles';

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

// ── Defining Work Card ───────────────────────────────────────
const DefiningCard = memo(function DefiningCard({ film }: { film: PersonCredit }) {
  const posterUri = film.poster_path ? tmdb.poster(film.poster_path, 'w342') : null;
  const score = obscurityScore(film);

  const handlePress = useCallback(() => {
    nav.push(`/film/${film.id}`);
  }, [film.id]);

  return (
    <PressableScale
      style={st.defCard}
      onPress={handlePress}
      haptic="selection"
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
          <Text style={st.defTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{film.title || film.name}</Text>
          <View style={st.defMetaRow}>
            <Text style={st.defYear}>{film.release_date ? film.release_date.slice(0, 4) : 'TBA'}</Text>
            {film.vote_average !== undefined && film.vote_average > 0 && (
              <View style={st.defRatingRow}>
                <Star size={7} color={colors.sepia} fill={colors.sepia} />
                <Text style={st.defRatingText}>{film.vote_average.toFixed(1)}</Text>
              </View>
            )}
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
        <SectionDivider label="DEFINING WORKS" />
        <Text style={s.sectionSubtitle}>The Legacy</Text>
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

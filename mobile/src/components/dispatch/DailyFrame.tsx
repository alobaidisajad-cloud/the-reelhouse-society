import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight } from 'lucide-react-native';

import { colors, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { SectionHeader } from './DispatchShared';
import { DispatchFilm } from './types';
import { daysSinceEpoch } from './utils';
import { st } from './styles';

const TMDB_IMG_W780 = 'https://image.tmdb.org/t/p/w780';

export const DailyFrame = memo(function DailyFrame({ films }: { films: DispatchFilm[] }) {
  const router = useRouter();
  const day = daysSinceEpoch();
  const withBackdrop = films.filter((f: DispatchFilm) => f.backdrop_path);
  const film = withBackdrop.length > 0 ? withBackdrop[(day + 3) % withBackdrop.length] : null;

  if (!film) return null;

  return (
    <View>
      <SectionHeader title="The Daily Frame" sub="Today's chosen still from the reels." />
      <PressableScale
        style={st.dailyFrameWrap}
        onPress={() => router.push(`/film/${film.id}` as any)}
        pressedScale={0.98}
        haptic
        accessibilityRole="button"
        accessibilityLabel={`Daily frame: ${film.title ?? film.name}`}
      >
        <Image
          source={{ uri: `${TMDB_IMG_W780}${film.backdrop_path}` }}
          style={st.dailyFrameImg}
          contentFit="cover"
          cachePolicy="memory-disk"
          placeholder={{ blurhash: SEPIA_HASH }}
          transition={200}
        />
        <LinearGradient
          colors={['transparent', 'rgba(10,7,3,0.4)', 'rgba(10,7,3,0.95)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={st.dailyFrameCaption}>
          <Text style={st.dailyFrameTitle} numberOfLines={1}>{film.title ?? film.name}</Text>
          <View style={st.dailyFrameMetaRow}>
            <Text style={st.dailyFrameMeta} numberOfLines={1}>{(film.release_date ?? '')?.slice(0, 4)}</Text>
            <View style={st.dailyFrameViewRow}>
              <Text style={st.dailyFrameMeta} numberOfLines={1}>VIEW THIS FILM</Text>
              <ChevronRight size={10} color={colors.sepia} strokeWidth={2} />
            </View>
          </View>
        </View>
      </PressableScale>
    </View>
  );
});

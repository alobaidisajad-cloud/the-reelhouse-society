import { memo, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight } from 'lucide-react-native';
import { storage } from '@/src/stores/mmkv-storage';

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
  const film = useMemo(() => {
    const validFilms = films.filter((f: DispatchFilm) => f.backdrop_path);
    if (validFilms.length === 0) return null;
    
    const lockKey = `daily_frame_${day}`;
    const lockedId = storage.getNumber(lockKey);
    if (lockedId) {
      const f = validFilms.find(f => f.id === lockedId);
      if (f) return f;
    }
    
    const dayOffset = validFilms.length > 1 ? (Math.floor(validFilms.length / 2) || 1) : 0;
    return validFilms[(day + dayOffset) % validFilms.length];
  }, [films, day]);

  useEffect(() => {
    if (film) {
      const lockKey = `daily_frame_${day}`;
      if (storage.getNumber(lockKey) !== film.id) {
        storage.set(lockKey, film.id);
      }
    }
  }, [film, day]);

  if (!film) return null;

  return (
    <View>
      <SectionHeader title="The Daily Frame" sub="Today's chosen still from the reels." />
      <PressableScale
        style={st.dailyFrameWrap}
        onPress={() => (router.push as any)(`/film/${film.id}` as any)}
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

import { memo, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Radio, Star } from 'lucide-react-native';
import { storage } from '@/src/stores/mmkv-storage';

import { colors, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { DispatchFilm } from './types';
import { daysSinceEpoch, volumeNumber, transmissionNum } from './utils';
import { st } from './styles';

const TMDB_IMG_W780 = 'https://image.tmdb.org/t/p/w780';

export const NightlyTransmission = memo(function NightlyTransmission({ films }: { films: DispatchFilm[] }) {
  const router = useRouter();
  const day = daysSinceEpoch();
  const txNum = transmissionNum();

  const film = useMemo(() => {
    const validFilms = films.filter(f => f.backdrop_path);
    if (validFilms.length === 0) return null;
    
    const lockKey = `nightly_tx_${day}`;
    const lockedId = storage.getNumber(lockKey);
    if (lockedId) {
      const f = validFilms.find(f => f.id === lockedId);
      if (f) return f;
    }
    return validFilms[day % validFilms.length];
  }, [films, day]);

  useEffect(() => {
    if (film) {
      const lockKey = `nightly_tx_${day}`;
      if (storage.getNumber(lockKey) !== film.id) {
        storage.set(lockKey, film.id);
      }
    }
  }, [film, day]);

  const scale = useSharedValue(1);
  // Gentle-bound: a soft breath (0.55→1), not a harsh flicker — the live
  // signal stays alive without ever feeling like an annoyance.
  const blink = useSharedValue(0.55);

  useEffect(() => {
    // 30-second continuous ken-burns breathe (a single transform).
    scale.value = withRepeat(
      withTiming(1.08, { duration: 30000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    blink.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(blink);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedImgStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const animatedBlinkStyle = useAnimatedStyle(() => ({ opacity: blink.value }));

  if (!film) return null;

  const backdropUri = film.backdrop_path ? `${TMDB_IMG_W780}${film.backdrop_path}` : null;

  return (
    <PressableScale
      style={st.transmissionWrap}
      onPress={() => (router.push as any)(`/film/${film.id}` as any)}
      pressedScale={0.97}
      haptic="medium"
      accessibilityRole="button"
      accessibilityLabel={`Nightly transmission: ${film.title}`}
    >
      <View style={st.transmissionImageContainer}>
        {backdropUri && (
          <Animated.View style={[StyleSheet.absoluteFillObject, animatedImgStyle]}>
            <Image 
              source={{ uri: backdropUri }} 
              style={StyleSheet.absoluteFillObject} 
              cachePolicy="memory-disk" 
              placeholder={{ blurhash: SEPIA_HASH }} 
              transition={800} 
            />
          </Animated.View>
        )}
        <LinearGradient 
          colors={['transparent', 'rgba(10,7,3,0.5)', 'rgba(10,7,3,0.95)', colors.ink]} 
          locations={[0, 0.4, 0.8, 1]}
          style={StyleSheet.absoluteFillObject} 
        />
        {/* Subtle noise grain could go here but Native performance dictates avoiding massive overlapping arrays. */}
      </View>

      <View style={st.transmissionContent}>
        <View style={st.transmissionSignalRow}>
          <Animated.View style={animatedBlinkStyle}>
            <Radio size={12} color={colors.bloodReel} strokeWidth={2.5} />
          </Animated.View>
          <Text style={st.transmissionSignal}>[ TRANSMISSION LIVE ]</Text>
        </View>
        
        <Text style={st.transmissionTitle} numberOfLines={2}>
          {(film.title ?? '').toUpperCase()}
        </Text>

        <View style={st.transmissionMetaRow}>
          <Text style={st.transmissionMeta} numberOfLines={1}>VOL. {volumeNumber()} · № {txNum}</Text>
          <Star size={7} color={colors.sepia} strokeWidth={2} fill={colors.sepia} />
          <Text style={st.transmissionMeta} numberOfLines={1}>{(film.release_date || '').slice(0, 4)}</Text>
        </View>

        <Text style={st.transmissionExcerpt} numberOfLines={4}>
          {/* eslint-disable-next-line react/no-unescaped-entities */}
          "{film.overview}"
        </Text>

        <View style={st.transmissionFooter}>
          <View style={st.transmissionBullet}>
            <Text style={st.transmissionFooterText} numberOfLines={1}>[ INITIATE VIEWING SEQUENCE ]</Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
});

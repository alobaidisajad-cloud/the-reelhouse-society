/**
 * MarqueeBoard — The hero marquee centerpiece of the Lobby.
 * Includes animated bulbs, tungsten loading state, Ken Burns backdrop, and weekly feature display.
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withDelay,
  Easing, interpolate, Extrapolation, cancelAnimation
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { colors, fonts, effects, SEPIA_HASH } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import { FilmGrain } from '@/src/components/CinematicOverlays';
import { supabase } from '@/src/lib/supabase';
import type { TMDBFilm } from './types';

const TMDB_IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

// ── MARQUEE BULB ──
const MarqueeBulb = memo(function MarqueeBulb({ index }: { index: number }) {
  const glow = useSharedValue(0.6);
  
  useEffect(() => {
    const duration = 2500 + ((index * 750) % 2000); 
    const minGlow = 0.5 + ((index * 0.1) % 0.3);
    
    glow.value = withDelay(
      index * 300,
      withRepeat(
        withSequence(
          withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }),
          withTiming(minGlow, { duration: duration * 1.2, easing: Easing.inOut(Easing.ease) })
        ),
        -1, true
      )
    );
    return () => cancelAnimation(glow);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const style = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scale: interpolate(glow.value, [0.5, 1], [0.9, 1.15], Extrapolation.CLAMP) }],
  }));

  return (
    <Animated.View style={[s.marqueeBulb, style]}>
      <View style={s.marqueeBulbInner} />
    </Animated.View>
  );
});

export const MarqueeBulbRow = memo(function MarqueeBulbRow({ count = 12 }: { count?: number }) {
  const bulbs = useMemo(() => Array.from({ length: count }), [count]);
  return (
    <View style={s.marqueeBulbRow}>
      {bulbs.map((_, i) => <MarqueeBulb key={i} index={i} />)}
    </View>
  );
});

// ── TUNGSTEN IGNITION (Loading State) ──
const TungstenIgnition = memo(function TungstenIgnition() {
  const flicker = useSharedValue(0.1);
  
  useEffect(() => {
    flicker.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 50, easing: Easing.linear }),
        withTiming(0.2, { duration: 100, easing: Easing.linear }),
        withTiming(0.9, { duration: 40 }),
        withTiming(0.1, { duration: 300 }),
        withTiming(0.6, { duration: 100, easing: Easing.linear }),
        withTiming(0.15, { duration: 800 })
      ), -1, false
    );
    return () => cancelAnimation(flicker);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  useEffect(() => {
     const interval = setInterval(() => {
         if (flicker.value > 0.5) {
             Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
         }
     }, 400); 
     return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: flicker.value }));

  return (
    <View style={s.marqueeBoard}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 140 }}>
         <Text style={[s.marqueeEyebrow, { opacity: 0.5 }]}>WARMING UP THE ARC LAMP...</Text>
         <Animated.View style={[{ width: '80%', height: 2, backgroundColor: '#FFD700', marginTop: 16, ...effects.glowSepia }, animStyle]} />
      </View>
    </View>
  );
});

// ── MAIN MARQUEE BOARD ──
export const MarqueeBoard = memo(function MarqueeBoard({ film }: { film: TMDBFilm | null }) {
  const router = useRouter();
  const [localCount, setLocalCount] = useState(0);

  const kenBurns = useSharedValue(1);
  useEffect(() => {
    if (film) {
      kenBurns.value = withRepeat(
         withSequence(
             withTiming(1.05, { duration: 15000, easing: Easing.inOut(Easing.ease) }),
             withTiming(1, { duration: 15000, easing: Easing.inOut(Easing.ease) })
         ), -1, true
      );
    }
    return () => cancelAnimation(kenBurns);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [film]);

  const bgStyle = useAnimatedStyle(() => ({
      transform: [{ scale: kenBurns.value }]
  }));

  useEffect(() => {
    if (!film?.id) return;
    let isMounted = true;
    supabase.from('logs').select('id', { count: 'exact', head: true }).eq('film_id', film.id)
      .then(({ count }) => { if (isMounted) setLocalCount(count ?? 0); });
    return () => { isMounted = false; };
  }, [film?.id]);

  const globalCount = film?.vote_count ?? 0;
  const reviewText = localCount > 0
    ? `${localCount} SOCIETY REVIEW${localCount === 1 ? '' : 'S'}`
    : globalCount > 0 
      ? (globalCount > 100 ? `${Math.floor(globalCount / 100) * 100}+ GLOBAL RATINGS` : `${globalCount} GLOBAL RATINGS`)
      : 'AWAITING RATINGS';

  if (!film) return (
    <View style={s.marqueeShell}>
      <MarqueeBulbRow count={8} />
      <TungstenIgnition />
      <MarqueeBulbRow count={8} />
    </View>
  );

  const posterBg = film.poster_path ? `${TMDB_IMG_W500}${film.poster_path}` : null;

  return (
    <PressableScale
      style={s.marqueeShell}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push(`/film/${film.id}` as any); }}
    >
      <MarqueeBulbRow count={8} />

      <View style={s.marqueeBoard}>
        {posterBg && (
          <AnimatedExpoImage
            source={{ uri: posterBg }}
            style={[s.marqueeBgImg, bgStyle]}
            blurRadius={Platform.OS === 'ios' ? 15 : 10}
            cachePolicy="memory-disk"
            placeholder={{ blurhash: SEPIA_HASH }}
            transition={1200}
            contentFit="cover"
          />
        )}
        <LinearGradient
          colors={['rgba(14,11,8,0.3)', 'rgba(14,11,8,0.7)', 'rgba(14,11,8,0.95)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          colors={['rgba(196,150,26,0.12)', 'transparent']}
          locations={[0, 1]}
          style={s.marqueeSpotlight}
        />

        <View style={s.marqueeContent}>
          <Text style={s.marqueeEyebrow}>✦ THE WEEKLY FEATURE ✦</Text>
          <Text style={s.marqueeLoreSub}>As decreed by the Programming Committee</Text>

          <View style={s.marqueeTitleWrap}>
            <Text style={s.marqueeTitle} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.6}>
              {(film.title ?? 'REELHOUSE').toUpperCase()}
            </Text>
          </View>

          <View style={s.marqueeRule} />

          <View style={s.marqueeMetaRow}>
            {film.release_date && (
              <View style={s.marqueeYearPill}>
                <Text style={s.marqueeYearText}>{film.release_date.slice(0, 4)}</Text>
              </View>
            )}
            <ReelRating rating={Math.round(film.vote_average ?? 0) / 2} size={14} />
          </View>
          <Text style={s.marqueeReviewCount}>{reviewText}</Text>
        </View>
        <FilmGrain />
      </View>

      <MarqueeBulbRow count={8} />
    </PressableScale>
  );
});

const s = StyleSheet.create({
  marqueeShell: {
    marginHorizontal: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.18)',
    overflow: 'hidden',
    backgroundColor: 'rgba(14,11,8,0.9)',
  },
  marqueeBoard: {
    minHeight: 180,
    overflow: 'hidden',
    position: 'relative',
  },
  marqueeBgImg: {
    ...StyleSheet.absoluteFillObject,
  },
  marqueeSpotlight: {
    position: 'absolute',
    top: 0,
    left: '20%',
    right: '20%',
    height: '60%',
    borderBottomLeftRadius: 200,
    borderBottomRightRadius: 200,
  },
  marqueeContent: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    flex: 1,
    justifyContent: 'center',
  },
  marqueeEyebrow: {
    fontFamily: fonts.ui,
    fontSize: 9,
    letterSpacing: 3,
    color: colors.sepia,
    textAlign: 'center',
    marginBottom: 2,
    ...effects.textGlowSepia,
  },
  marqueeLoreSub: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.fog,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  marqueeTitleWrap: {
    alignItems: 'center',
    marginBottom: 8,
  },
  marqueeTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.parchment,
    textAlign: 'center',
    lineHeight: 34,
    ...effects.textGlowSepia,
  },
  marqueeRule: {
    height: 1,
    backgroundColor: colors.sepia,
    marginVertical: 10,
    opacity: 0.3,
  },
  marqueeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 4,
  },
  marqueeYearPill: {
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.3)',
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  marqueeYearText: {
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.sepia,
  },
  marqueeReviewCount: {
    fontFamily: fonts.ui,
    fontSize: 8,
    letterSpacing: 2.5,
    color: colors.fog,
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.7,
  },
  marqueeBulbRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(14,11,8,0.95)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139,105,20,0.1)',
  },
  marqueeBulb: {
    width: 8,
    height: 8,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(218,165,32,0.08)',
  },
  marqueeBulbInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
});

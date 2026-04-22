import { useEffect, useCallback, useState, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, Dimensions, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  FadeInDown, FadeInUp, FadeIn, SharedValue,
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming,
  withDelay, Easing, interpolate, Extrapolation, interpolateColor, useAnimatedScrollHandler,
  useAnimatedReaction, runOnJS
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';

import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { useNotificationStore } from '@/src/stores/social';
import { tmdb } from '@/src/lib/tmdb';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts, effects, SEPIA_HASH } from '@/src/theme/theme';
import { SectionDivider, ReelRating } from '@/src/components/Decorative';
import QuickActionsFAB from '@/src/components/QuickActionsFAB';
import Buster from '@/src/components/Buster';
import PressableScale from '@/src/components/PressableScale';
import { setScrollY } from '@/src/utils/scrollBridge';
import { FilmGrain, Vignette } from '@/src/components/CinematicOverlays';

const MemoizedBox16 = memo(() => <View style={{ width: 16 }} />);

/** Lightweight TMDB film shape used across the home screen */
interface TMDBFilm {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  overview?: string;
  media_type?: string;
  popularity?: number;
}

/** Shape of a featured log row from supabase */
interface FeaturedLog {
  id: string;
  film_id: number;
  film_title: string;
  poster_path: string | null;
  rating: number;
  review: string;
  status: string;
  watched_with: string | null;
  pull_quote: string | null;
  drop_cap: boolean;
  editorial_header: string | null;
  is_autopsied: boolean;
  autopsy: string | null;
  created_at: string;
  user_id: string;
  profiles: { username: string; role: string; avatar_url?: string | null } | Array<{ username: string; role: string; avatar_url?: string | null }> | null;
}

interface PulseActivity {
  id: string;
  user: string;
  userRole: string;
  film: { id: number; title: string; poster_path: string | null };
  rating: number;
  text: string;
  dropCap: boolean;
  pullQuote: string;
  watchedWith: string | null;
  is_autopsied: boolean;
  autopsy: string | null;
  editorialHeader?: string | null;
  time: string;
}


const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);
const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

const TMDB_IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const TMDB_IMG_W780 = 'https://image.tmdb.org/t/p/w780';
const TMDB_IMG_W185 = 'https://image.tmdb.org/t/p/w185';
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ══════════════════════════════════════════════════════════════
//  PROJECTOR BEAM ATMOSPHERICS (Welcome Screen)
// ══════════════════════════════════════════════════════════════
const ProjectorBeam = memo(function ProjectorBeam({ scrollY }: { scrollY: SharedValue<number> }) {
  const beamSwing = useSharedValue(0.1);
  const flicker = useSharedValue(0.8);

  useEffect(() => {
    // Subtle, slow physical sweep of a projector
    beamSwing.value = withRepeat(
      withSequence(
        withTiming(-0.1, { duration: 8000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.1, { duration: 8000, easing: Easing.inOut(Easing.sin) })
      ), -1, true
    );
    // Micro-flickers like an old arc lamp
    flicker.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 150 }),
        withTiming(0.85, { duration: 100 }),
        withTiming(0.95, { duration: 250 }),
        withTiming(0.7, { duration: 50 }),
        withTiming(0.9, { duration: 1200 }),
      ), -1, false
    );
  }, []);

  const style = useAnimatedStyle(() => {
    // Aggressive GPU Culling: eject completely when scrolled past hero section
    const isCulled = scrollY.value > Dimensions.get('window').height;
    if (isCulled) return { transform: [{ translateY: -3000 }], opacity: 0 };
    
    return {
      opacity: flicker.value,
      transform: [
        { perspective: 400 },
        { rotateX: '55deg' },
        { rotateZ: `${beamSwing.value * 15}deg` },
        { scaleY: 1.5 },
        { translateY: -100 }
      ],
    };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, style, { alignItems: 'center', zIndex: 0 }]} pointerEvents="none">
      <LinearGradient
        colors={['rgba(218,165,32,0.15)', 'rgba(196,150,26,0.06)', 'transparent']}
        locations={[0, 0.4, 0.9]}
        style={{ width: SCREEN_W * 1.5, height: SCREEN_H, borderTopLeftRadius: SCREEN_W, borderTopRightRadius: SCREEN_W }}
      />
    </Animated.View>
  );
});

// ══════════════════════════════════════════════════════════════
//  FILM TICKER — Scrolling ticker at the very top
// ══════════════════════════════════════════════════════════════
const FilmTicker = memo(function FilmTicker({ films }: { films: TMDBFilm[] }) {
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const [contentWidth, setContentWidth] = useState(0);

  useEffect(() => {
    if (contentWidth === 0 || films.length === 0) return;
    translateX.value = withRepeat(
      withTiming(-contentWidth, { duration: contentWidth * 30, easing: Easing.linear }),
      -1, false
    );
    // Suppress layout shift by keeping ticker blacked out until math ensures smooth tracking natively
    opacity.value = withDelay(400, withTiming(1, { duration: 1000, easing: Easing.out(Easing.quad) }));
  }, [contentWidth, films.length]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const maskStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (films.length === 0) return null;

  return (
    <Animated.View style={[s.tickerWrap, maskStyle]}>
      <LinearGradient
        colors={['rgba(10,7,3,0.95)', 'rgba(10,7,3,0.7)', 'rgba(10,7,3,0.95)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Animated.View style={[s.tickerTrack, animStyle]}>
        <View style={{ flexDirection: 'row' }} onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}>
          {films.map((f, i) => (
            <View key={`tick-1-${f.id}-${i}`} style={s.tickerItem}>
              <Text style={s.tickerTitle}>
                {(f.title ?? f.name ?? '').toUpperCase()}
              </Text>
              <Text style={s.tickerDot}>✦</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row' }}>
          {films.map((f, i) => (
            <View key={`tick-2-${f.id}-${i}`} style={s.tickerItem}>
              <Text style={s.tickerTitle}>
                {(f.title ?? f.name ?? '').toUpperCase()}
              </Text>
              <Text style={s.tickerDot}>✦</Text>
            </View>
          ))}
        </View>
      </Animated.View>
      <LinearGradient colors={[colors.ink, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.tickerEdge, { left: 0 }]} />
      <LinearGradient colors={['transparent', colors.ink]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.tickerEdge, { right: 0 }]} />
    </Animated.View>
  );
});

// ══════════════════════════════════════════════════════════════
//  MARQUEE BULB — Single animated theater light
// ══════════════════════════════════════════════════════════════
const MarqueeBulb = memo(function MarqueeBulb({ index }: { index: number }) {
  const glow = useSharedValue(0.6);
  
  useEffect(() => {
    // Warm Tungsten Organic Throb
    // Create a unique but deterministic pulse so the board never synchronizes into an 'alarm'
    const duration = 2500 + ((index * 750) % 2000); 
    const minGlow = 0.5 + ((index * 0.1) % 0.3);
    
    glow.value = withDelay(
      index * 300,
      withRepeat(
        withSequence(
          withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }),
          withTiming(minGlow, { duration: duration * 1.2, easing: Easing.inOut(Easing.ease) })
        ),
        -1, true // true ensures it gently reverses back and forth like a breathing ember
      )
    );
  }, []);

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

const MarqueeBulbRow = memo(function MarqueeBulbRow({ count = 12 }: { count?: number }) {
  const bulbs = useMemo(() => Array.from({ length: count }), [count]);
  return (
    <View style={s.marqueeBulbRow}>
      {bulbs.map((_, i) => <MarqueeBulb key={i} index={i} />)}
    </View>
  );
});

// ══════════════════════════════════════════════════════════════
//  DIEGETIC TUNGSTEN IGNITION (Loading State)
// ══════════════════════════════════════════════════════════════
const TungstenIgnition = memo(function TungstenIgnition() {
  const flicker = useSharedValue(0.1);
  
  useEffect(() => {
    flicker.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 50, easing: Easing.step0 }),
        withTiming(0.2, { duration: 100, easing: Easing.step0 }),
        withTiming(0.9, { duration: 40 }),
        withTiming(0.1, { duration: 300 }),
        withTiming(0.6, { duration: 100, easing: Easing.step0 }),
        withTiming(0.15, { duration: 800 })
      ), -1, false
    );
  }, []);
  
  useEffect(() => {
     // A faint mechanical vibration syncing roughly with the arc sputter
     const interval = setInterval(() => {
         if (flicker.value > 0.5) {
             Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
         }
     }, 400); 
     return () => clearInterval(interval);
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

// ══════════════════════════════════════════════════════════════
//  MARQUEE BOARD — The hero centerpiece
// ══════════════════════════════════════════════════════════════
const MarqueeBoard = memo(function MarqueeBoard({ film }: { film: TMDBFilm | null }) {
  const router = useRouter();
  const [localCount, setLocalCount] = useState(0);

  // Ken burns animation for backdrop poster
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
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push(`/film/${film.id}`); }}
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
          colors={[
            'rgba(14,11,8,0.3)',
            'rgba(14,11,8,0.7)',
            'rgba(14,11,8,0.95)',
          ]}
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

// ══════════════════════════════════════════════════════════════
//  FILM STRIP ROW — FlashList horizontally scrolling posters
// ══════════════════════════════════════════════════════════════
const FilmCard = memo(function FilmCard({ film, onPress, index = 0 }: { film: TMDBFilm; onPress: () => void; index?: number }) {
  const posterUri = film.poster_path ? `${TMDB_IMG_W185}${film.poster_path}` : null;
  return (
    <PressableScale style={s.filmCard} onPress={onPress}>
      <View style={[s.posterWrap, !posterUri && s.posterEmpty]}>
        {posterUri ? (
          <Image source={{ uri: posterUri }} style={s.posterImg} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={200} />
        ) : (
          <Text style={s.posterPlaceholder}>✦</Text>
        )}
        
        {/* Tactile Overlay Lighting */}
        <LinearGradient 
          colors={['rgba(255,255,255,0.05)', 'transparent', 'rgba(10,7,3,0.8)']} 
          locations={[0, 0.4, 1]} 
          style={StyleSheet.absoluteFillObject} 
          pointerEvents="none" 
        />
        
        {/* Physical Edge Details */}
        <View style={s.posterEdgeHighlight} pointerEvents="none" />
      </View>
    </PressableScale>
  );
}, (prev, next) => prev.film.id === next.film.id);

const FilmStripRow = memo(function FilmStripRow({ title, label, films }: { title: string; label: string; films: TMDBFilm[] }) {
  const router = useRouter();
  const handlePress = useCallback((filmId: number) => {
    Haptics.selectionAsync();
    router.push(`/film/${filmId}`);
  }, [router]);

  const renderFilmCard = useCallback(({ item, index }: { item: TMDBFilm; index: number }) => (
    <FilmCard film={item} index={index} onPress={() => handlePress(item.id)} />
  ), [handlePress]);

  const filmKeyExtractor = useCallback((item: TMDBFilm, i: number) => `${title}-${item.id}-${i}`, [title]);

  if (!films || films.length === 0) return null;

  return (
    <Animated.View entering={FadeInDown.duration(600).delay(200)} style={s.filmStripSection}>
      <SectionDivider label={label} />
      <View style={s.stripHeader}>
        <View style={s.stripTitleRow}>
          <View style={s.sectionBeacon} />
          <Text style={s.stripTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
        </View>
      </View>

      <View style={s.flashListStripWrap}>
        <FlashList
          horizontal
          data={films}
          keyExtractor={filmKeyExtractor}
          renderItem={renderFilmCard}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.stripScroll}
          decelerationRate="normal"
          snapToInterval={115 + 16}
          snapToAlignment="start"
          disableIntervalMomentum={false}
          estimatedItemSize={131}
          drawDistance={200}
          ItemSeparatorComponent={MemoizedBox16}
        />
      </View>
    </Animated.View>
  );
});

// ════════════════════════════════════════════════════════════════
//  SHIMMER RULE (Reusable 1px pulsing gradient border)
// ════════════════════════════════════════════════════════════════
const ShimmerRule = memo(() => {
    const shimmer = useSharedValue(-1);
    useEffect(() => {
       shimmer.value = withRepeat(
         withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
         -1, false
       );
    }, []);
    const shimmerStyle = useAnimatedStyle(() => ({
       transform: [{ translateX: interpolate(shimmer.value, [-1, 1], [-100, 300]) }]
    }));
    return (
       <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1.5, backgroundColor: 'rgba(139,105,20,0.1)', overflow: 'hidden' }}>
          <Animated.View style={[{ width: 60, height: '100%' }, shimmerStyle]}>
             <LinearGradient colors={['transparent', 'rgba(218,165,32,0.8)', 'transparent']} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFillObject} />
          </Animated.View>
       </View>
    );
});

// ══════════════════════════════════════════════════════════════
//  FEATURED CRITIQUE
// ══════════════════════════════════════════════════════════════
function FeaturedCritiqueInner({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const router = useRouter();
  const [featured, setFeatured] = useState<FeaturedLog | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data: featuredLog } = await supabase
          .rpc('get_featured_critique')
          .select('id, film_id, film_title, poster_path, rating, review, status, watched_with, pull_quote, drop_cap, editorial_header, is_autopsied, autopsy, created_at, user_id, profiles!logs_user_id_fkey(username, role, avatar_url)')
          .single();

        if (featuredLog && isMounted) setFeatured(featuredLog as FeaturedLog);
      } catch {}
    })();
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  if (!featured) return null;

  const username = Array.isArray(featured.profiles) ? featured.profiles[0]?.username : featured.profiles?.username ?? 'SOCIETY';
  const role = Array.isArray(featured.profiles) ? featured.profiles[0]?.role : featured.profiles?.role;

  const pulseItem: PulseActivity = {
      id: featured.id,
      user: username,
      userRole: role,
      film: { id: featured.film_id, title: featured.film_title, poster_path: featured.poster_path },
      rating: featured.rating,
      text: featured.review,
      dropCap: featured.drop_cap,
      pullQuote: featured.pull_quote ?? '',
      watchedWith: featured.watched_with,
      is_autopsied: featured.is_autopsied,
      autopsy: featured.autopsy,
      editorialHeader: featured.editorial_header,
      time: timeAgo(featured.created_at)
  };

  return (
    <Animated.View entering={FadeInDown.duration(700).delay(300)} style={s.critiqueSection}>
      <SectionDivider label="THE LEAD STORY" />

      <View style={s.critiqueHeaderRow}>
        <LinearGradient colors={[colors.sepia, colors.flicker]} style={s.sectionAccentBar} />
        <View>
          <Text style={s.sectionTitle}>Featured Critique</Text>
          <Text style={s.sectionLoreSub}>Handpicked by the Editorial Tribunal</Text>
        </View>
      </View>

      <View style={s.critiqueCardWrap}>
         <PulseCardItem act={pulseItem} isFeatured={true} />
      </View>

      <PressableScale style={s.critiqueSubmitBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); router.push('/log-modal'); }}>
        <Text style={s.critiqueSubmitText}>✦ FILE A DISPATCH ✦</Text>
        <ShimmerRule />
      </PressableScale>
    </Animated.View>
  );
}
const FeaturedCritique = memo(FeaturedCritiqueInner);

// ════════════════════════════════════════════════════════════════
//  EXTERNAL PULSE CARD (For FlashList)
// ════════════════════════════════════════════════════════════════
const PulseCardItem = memo(function PulseCardItem({ act, isFeatured = false }: { act: PulseActivity, isFeatured?: boolean }) {
  const router = useRouter();

  const isArchivist = act.userRole === 'archivist';
  const isAuteur = act.userRole === 'auteur';
  const isPremium = isArchivist || isAuteur || act.pullQuote;
  const accentColor = isAuteur ? 'rgba(180,45,45,0.7)' : isArchivist ? 'rgba(196,150,26,0.7)' : 'rgba(139,105,20,0.3)';
  const reviewStripped = (act.text ?? '').replace(/<(p|div|br)[^>]*>/gi, ' ').replace(/<[^>]+>/g, '').trim();
  const truncReview = reviewStripped.length > 100 ? reviewStripped.slice(0, 100) + '…' : reviewStripped;
  const firstUnicodeChar = reviewStripped ? Array.from(reviewStripped)[0] : '';
  const remainingReviewText = truncReview.slice(firstUnicodeChar.length);
  const posterUri = act.film?.poster_path ? `${TMDB_IMG_W185}${act.film.poster_path}` : null;

  const museumBreathe = useSharedValue(0.4);
  useEffect(() => {
    if (isFeatured) {
       museumBreathe.value = withRepeat(
          withSequence(
             withTiming(0.8, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
             withTiming(0.4, { duration: 4000, easing: Easing.inOut(Easing.ease) })
          ), -1, true
       );
    }
  }, [isFeatured]);
  const museumStyle = useAnimatedStyle(() => ({ opacity: museumBreathe.value }));

  return (
    <View style={[s.pulseCardOuter, isFeatured && { width: '100%' }]}>
      <View style={[s.pulseCard, isPremium && s.pulsePremium, isAuteur && s.pulseCardAuteur, isFeatured && s.pulseFeaturedMuseum]}>
        
        {isFeatured && (
           <Animated.View style={[StyleSheet.absoluteFillObject, { zIndex: -1 }, museumStyle]}>
              <View style={{ flex: 1, borderWidth: 1.5, borderColor: colors.sepia, borderRadius: 2, ...effects.glowSepia }} />
           </Animated.View>
        )}
        
        {/* ── PREMIUM EDITORIAL / ATMOSPHERIC HEADER ── */}
        {act.editorialHeader ? (
          <View style={s.editorialBanner}>
            <Image source={{ uri: `${TMDB_IMG_W780}${act.editorialHeader}` }} style={s.editorialBannerImg} blurRadius={2} cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={300} />
            <LinearGradient colors={['rgba(11,10,8,0.2)', 'transparent', 'rgba(18,14,9,0.95)']} locations={[0, 0.3, 1]} style={StyleSheet.absoluteFillObject} />
            <View style={s.editorialBadge}>
              <Text style={s.editorialBadgeText}>✦ EDITORIAL</Text>
            </View>
          </View>
        ) : isPremium && posterUri ? (
          <View style={s.premiumBanner}>
            <Image source={{ uri: posterUri }} style={s.premiumBannerImg} blurRadius={12} cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={300} />
            <LinearGradient colors={['rgba(11,10,8,0.4)', 'rgba(18,14,9,0.98)']} style={StyleSheet.absoluteFillObject} />
          </View>
        ) : null}

        <View style={s.pulseCardHeader}>
          <PressableScale style={s.pulseUserRow} onPress={() => { Haptics.selectionAsync(); router.push(`/user/${act.user}`); }} haptic="light">
            <View style={[s.pulseAvatar, { borderColor: accentColor }]}>
              <Buster size={14} mood={act.rating >= 4 ? 'smiling' : 'neutral'} />
            </View>
            <View style={[s.pulseUserTextWrap, { flexShrink: 1 }]}>
              <Text style={s.pulseUsername} numberOfLines={1}>@{act.user}</Text>
              <Text style={s.pulseTime} numberOfLines={1}>{act.time}</Text>
            </View>
            {isArchivist && <View style={s.badgeArchivist}><Text style={s.badgeText}>✦ ARCHIVIST</Text></View>}
            {isAuteur && <View style={s.badgeAuteur}><Text style={[s.badgeText, { color: colors.ink }]}>★ AUTEUR</Text></View>}
          </PressableScale>
        </View>

        <View style={s.pulseCardContent}>
          {posterUri && (
            <PressableScale style={s.pulsePosterWrap} onPress={() => { Haptics.selectionAsync(); router.push(`/film/${act.film?.id}`); }}>
               <Image source={{ uri: posterUri }} style={s.pulsePoster} cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={200} />
               <LinearGradient colors={['transparent', 'rgba(10,7,3,0.4)']} style={StyleSheet.absoluteFillObject} />
            </PressableScale>
          )}
          <View style={s.pulseContentFlex}>
            <PressableScale onPress={() => { Haptics.selectionAsync(); router.push(`/film/${act.film?.id}`); }} haptic="light">
              <Text style={s.pulseFilmTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{act.film?.title}</Text>
            </PressableScale>
            
            <PressableScale onPress={() => { Haptics.selectionAsync(); router.push(`/log/${act.id}`); }} haptic="light" style={{ flexShrink: 1 }}>
              {act.rating > 0 && (
                <View style={s.pulseRatingWrap}>
                  <ReelRating rating={act.rating} size={11} />
                </View>
              )}
              {act.pullQuote ? (
                <View style={s.pullQuoteWrap}>
                  <Text style={s.pullQuoteText} numberOfLines={3}>« {act.pullQuote.replace(/^[«"']+|[»"']+$/g, '').trim()} »</Text>
                </View>
              ) : act.dropCap && truncReview ? (
                <View style={s.dropCapRow}>
                  <Text style={s.dropCapLetter}>
                    {firstUnicodeChar}
                  </Text>
                  <Text style={[s.pulseReview, s.dropCapBody]} numberOfLines={3}>
                    {remainingReviewText}
                  </Text>
                </View>
              ) : truncReview ? (
                <Text style={s.pulseReview} numberOfLines={3}>"{truncReview}"</Text>
              ) : null}
              {act.watchedWith && (
                <Text style={s.pulseWatchedWith} numberOfLines={1} ellipsizeMode="tail">♡ WITH <Text style={s.pulseWatchedWithName}>{act.watchedWith.toUpperCase()}</Text></Text>
              )}
              {act.is_autopsied && (
                <Text style={s.pulseAutopsyTag}>✦ AUTOPSY ENCLOSED</Text>
              )}
              {/* ── Elegant "read more" cue ── */}
              <View style={s.pulseReadMoreRow}>
                <View style={s.pulseReadMoreRule} />
                <Text style={s.pulseReadMoreText}>OPEN FULL LOG ›</Text>
              </View>
            </PressableScale>
          </View>
        </View>
        <FilmGrain />
      </View>
    </View>
  );
}, (prev, next) => prev.act.id === next.act.id);

// ════════════════════════════════════════════════════════════════
//  PULSE PHYSICS: Cover-Flow Wrap
// ════════════════════════════════════════════════════════════════
const PULSE_ITEM_SIZE = SCREEN_W * 0.82 + 16;
const AnimatedPulseWrapper = memo(function AnimatedPulseWrapper({ item, index, scrollX }: { item: PulseActivity; index: number; scrollX: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * PULSE_ITEM_SIZE,
      index * PULSE_ITEM_SIZE,
      (index + 1) * PULSE_ITEM_SIZE,
    ];
    const scale = interpolate(scrollX.value, inputRange, [0.94, 1, 0.94], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.5, 1, 0.5], Extrapolation.CLAMP);
    
    // Z-Axis Vinyl Fanning Physics
    const rotateY = interpolate(scrollX.value, inputRange, [12, 0, -12], Extrapolation.CLAMP);

    return { 
       transform: [
         { perspective: 1200 },
         { scale }, 
         { rotateY: `${rotateY}deg` }
       ], 
       opacity 
    };
  });

  return (
    <Animated.View style={style}>
      <PulseCardItem act={item} />
    </Animated.View>
  );
});

// ════════════════════════════════════════════════════════════════
//  HAUNTED EMPTY STATE: Buster Ghost Float
// ════════════════════════════════════════════════════════════════
const GhostEmptyState = () => {
  const float = useSharedValue(0);
  const [mood, setMood] = useState<'sleeping' | 'surprised'>('sleeping');
  
  useEffect(() => {
    float.value = withRepeat(
       withSequence(
         withTiming(-6, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
         withTiming(6, { duration: 2500, easing: Easing.inOut(Easing.sin) })
       ), -1, true
    );
  }, []);
  
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: float.value }] }));

  const handlePoke = () => {
     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
     setMood('surprised');
     setTimeout(() => setMood('sleeping'), 1500);
  };

  return (
      <PressableScale onPress={handlePoke} style={{ alignItems: 'center', marginBottom: 16 }}>
          <Animated.View style={style}>
             <Buster mood={mood} size={54} />
          </Animated.View>
      </PressableScale>
  );
};

// ══════════════════════════════════════════════════════════════
//  SOCIAL PULSE — FlashList horizontal scrolling
// ══════════════════════════════════════════════════════════════
function SocialPulseSectionInner({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const user = useAuthStore(s => s.user);
  const [activities, setActivities] = useState<PulseActivity[]>([]);

  const isAuteur = user?.role === 'auteur';
  const pulseAccent = isAuteur ? colors.bloodReel : colors.sepia;
  const pulseGradient = isAuteur ? [colors.bloodReel, 'rgba(125,31,31,0.6)'] as const : [colors.sepia, colors.flicker] as const;

  const scrollX = useSharedValue(0);
  const onScrollPulse = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data } = await supabase
        .from('logs')
        .select('id, film_id, film_title, poster_path, rating, review, status, watched_with, pull_quote, drop_cap, is_autopsied, autopsy, created_at, user_id, profiles!logs_user_id_fkey(username, role)')
        .neq('review', '')
        .not('review', 'is', null)
        .order('created_at', { ascending: false })
        .limit(6);

      if (data && isMounted) {
        setActivities(data.map((log: FeaturedLog) => ({
          id: log.id,
          user: (Array.isArray(log.profiles) ? log.profiles[0]?.username : log.profiles?.username) ?? 'cinephile',
          userRole: (Array.isArray(log.profiles) ? log.profiles[0]?.role : log.profiles?.role) ?? 'cinephile',
          film: { id: log.film_id, title: log.film_title, poster_path: log.poster_path },
          rating: log.rating,
          text: log.review,
          dropCap: log.drop_cap,
          pullQuote: log.pull_quote ?? '',
          watchedWith: log.watched_with,
          is_autopsied: log.is_autopsied,
          autopsy: log.autopsy,
          time: timeAgo(log.created_at),
        })));
      }
    })();
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  const renderItem = useCallback(({ item, index }: { item: PulseActivity, index: number }) => (
    <AnimatedPulseWrapper item={item} index={index} scrollX={scrollX} />
  ), [scrollX]);

  if (activities.length === 0) {
    return (
      <Animated.View entering={FadeInDown.duration(600)} style={s.pulseSection}>
        <SectionDivider label="LIVE FROM THE FOYER" />
        <View style={s.pulseHeaderRow}>
          <LinearGradient colors={pulseGradient} style={[s.sectionAccentBar, isAuteur && { shadowColor: pulseAccent }]} />
          <View>
            <Text style={s.sectionTitle}>The Pulse</Text>
            <Text style={s.sectionLoreSub}>Dispatches from your fellow members</Text>
          </View>
        </View>
        <View style={[s.pulseEmpty, isAuteur && { borderTopColor: 'rgba(180,45,45,0.08)', borderBottomColor: 'rgba(180,45,45,0.05)', backgroundColor: 'rgba(125,31,31,0.02)' }]}>
          <GhostEmptyState />
          <Text style={s.pulseEmptyTitle}>The screening room is dark.</Text>
          <Text style={s.pulseEmptySub}>When a member logs their first film, it will appear here.</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(600).delay(400)} style={s.pulseSection}>
      <SectionDivider label="THE TELEGRAPH" />
      <View style={s.pulseHeaderRow}>
        <LinearGradient colors={pulseGradient} style={[s.sectionAccentBar, isAuteur && { shadowColor: pulseAccent }]} />
        <View>
          <Text style={s.sectionTitle}>The Pulse</Text>
          <Text style={s.sectionLoreSub}>Live logs from the Society.</Text>
        </View>
      </View>

      <View style={s.flashListPulseWrap}>
        <FlashList
            horizontal
            data={activities}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.pulseScrollContent}
            decelerationRate="normal"
            snapToInterval={PULSE_ITEM_SIZE}
            snapToAlignment="start"
            disableIntervalMomentum={false}
            onScroll={onScrollPulse}
            scrollEventThrottle={16}
            estimatedItemSize={PULSE_ITEM_SIZE}
            drawDistance={200}
            ItemSeparatorComponent={MemoizedBox16}
        />
      </View>
    </Animated.View>
  );
}
const SocialPulseSection = memo(SocialPulseSectionInner);

// ── Utility ──
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'MOMENTS AGO';
  if (mins < 60) return mins === 1 ? '1 MIN. AGO' : `${mins} MIN. AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs === 1 ? '1 HR. AGO' : `${hrs} HRS. AGO`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return days === 1 ? '1 DAY AGO' : `${days} DAYS AGO`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

// ════════════════════════════════════════════════════════════════
//  VELVET ROPE CTA (Unauthenticated)
// ════════════════════════════════════════════════════════════════
const VelvetRopeCTA = memo(() => {
    const router = useRouter();
    const shimmer = useSharedValue(-1);

    useEffect(() => {
       shimmer.value = withRepeat(
         withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
         -1, false
       );
    }, []);

    const shimmerStyle = useAnimatedStyle(() => ({
       transform: [{ translateX: interpolate(shimmer.value, [-1, 1], [-50, 200]) }]
    }));

    return (
       <PressableScale
          style={s.ctaSecondaryNoir}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); router.push('/login'); }}
       >
          <Text style={[s.ctaSecondaryNoirText, { textDecorationLine: 'none' }]} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.7}>ALREADY A MEMBER?</Text>
          <ShimmerRule />
       </PressableScale>
    );
});

// ════════════════════════════════════════════════════════════════
//  BRASS SHEEN (For Primary Call to Action)
// ════════════════════════════════════════════════════════════════
const BrassSheen = memo(() => {
    const sheen = useSharedValue(-2);
    useEffect(() => {
       sheen.value = withRepeat(
         withTiming(2, { duration: 4000, easing: Easing.inOut(Easing.quad) }),
         -1, false
       );
    }, []);
    const sheenStyle = useAnimatedStyle(() => ({
       transform: [{ translateX: interpolate(sheen.value, [-2, 2], [-200, 300]) }]
    }));
    return (
       <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' }}>
          <Animated.View style={[{ width: '150%', height: '100%', opacity: 0.15 }, sheenStyle]}>
             <LinearGradient colors={['transparent', '#FFF', 'transparent']} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFillObject} />
          </Animated.View>
       </View>
    );
});

// ════════════════════════════════════════════════════════════════
//  MAIN SCREEN: THE LOBBY
// ════════════════════════════════════════════════════════════════
export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const fetchLogs = useFilmStore(s => s.fetchLogs);
  const fetchEndorsements = useFilmStore(s => s.fetchEndorsements);
  const setupRealtime = useNotificationStore(s => s.setupRealtime);
  const fetchNotifications = useNotificationStore(s => s.fetchNotifications);
  const router = useRouter();

  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // ── React Query: MMKV-cached lobby data (instant cold start) ──
  const { data: trendingData } = useQuery({
    queryKey: ['lobby', 'trending'],
    queryFn: async () => {
      const res = await tmdb.trending('week');
      const films = (res?.results ?? []).slice(0, 10) as TMDBFilm[];
      // Prefetch poster images for instant visual rendering
      films.filter(f => f.poster_path).slice(0, 8)
        .forEach(f => Image.prefetch(`${TMDB_IMG_W185}${f.poster_path}`).catch(() => {}));
      return films;
    },
    staleTime: 10 * 60 * 1000,  // 10 min fresh window
  });

  const { data: topRatedData } = useQuery({
    queryKey: ['lobby', 'topRated'],
    queryFn: async () => {
      const res = await tmdb.topRated();
      return (res?.results ?? []).slice(0, 10) as TMDBFilm[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const trending = trendingData ?? [];
  const topRated = topRatedData ?? [];

  // Parallax Scroll Tracking & Breathing Atmospherics
  const scrollY = useSharedValue(0);
  const breath = useSharedValue(1.0);

  useEffect(() => {
    breath.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 18000, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0, { duration: 18000, easing: Easing.inOut(Easing.sin) })
      ), -1, true
    );
  }, []);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  
  // Parallax styles for the backdrop
  const backdropAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(scrollY.value, [0, 400], [0, -150], Extrapolation.CLAMP);
    const opacity = interpolate(scrollY.value, [0, 200], [0.35, 0], Extrapolation.CLAMP);
    return {
      transform: [{ translateY }, { scale: breath.value }],
      opacity
    };
  });

  const NAV_HEIGHT = 44 + 12;
  const topPad = insets.top + NAV_HEIGHT + 12;

  useEffect(() => {
    if (isAuthenticated) {
      fetchLogs();
      fetchEndorsements();
      fetchNotifications();
      const cleanup = setupRealtime();
      return () => { if (cleanup) cleanup(); };
    }
  }, [isAuthenticated]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await queryClient.invalidateQueries({ queryKey: ['lobby'] });
    setRefreshTrigger(t => t + 1);
    if (isAuthenticated) await fetchLogs();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRefreshing(false);
  }, [queryClient, isAuthenticated, fetchLogs]);

  const heroFilm = trending[0] ?? null;

  // ── Unauthenticated: The Velvet Room Welcome ──
  if (!isAuthenticated) {
    return (
      <View style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <LinearGradient
          colors={[colors.ink, 'rgba(12, 9, 5, 0.98)', colors.soot]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        
        {/* Dynamic Scene Atmospherics */}
        <ProjectorBeam scrollY={scrollY} />
        <FilmGrain />
        <Vignette />
        
        {/* 0-Overlap Strict Layout Constraints */}
        <View style={s.welcomeRootFlex}>
          
          {/* Top Half: Cinematic Typography */}
          <View style={s.welcomeTopHalf}>
            <Animated.View entering={FadeInDown.duration(1200)} style={s.welcomeHeader}>
              <Text style={s.welcomeEyebrow}>WELCOME TO</Text>
              <Text style={s.welcomeTitle} accessibilityRole="header" adjustsFontSizeToFit numberOfLines={3} minimumFontScale={0.5}>
                {'THE\nREELHOUSE\nSOCIETY'}
              </Text>

              <View style={s.welcomeEstRow}>
                <View style={s.welcomeEstLine} />
                <Text style={s.welcomeEstText}>EST. 1924</Text>
                <View style={s.welcomeEstLine} />
              </View>

              <Text style={s.welcomeTagline} adjustsFontSizeToFit numberOfLines={4} minimumFontScale={0.7}>
                {'A secret fellowship for the devoted cinephile.\nTrack every screening. Avoid the algorithmic gaze.\nKeep the record alive.'}
              </Text>

              <View style={s.societyRuleRow}>
                <LinearGradient colors={['transparent', colors.sepia]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.societyRuleLine} />
                <Text style={s.societyRuleText} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.7}>✦ ARCHIVAL ACCESS ONLY ✦</Text>
                <LinearGradient colors={[colors.sepia, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.societyRuleLine} />
              </View>
            </Animated.View>
          </View>

          {/* Bottom Half: Tactile CTAs */}
          <View style={s.welcomeBottomHalf}>
            <View style={s.welcomeCtaContainer}>
              <PressableScale
                style={s.ctaPrimaryNoir}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); router.push('/login'); }}
              >
                <BrassSheen />
                {/* Physical embedded metal plate effect */}
                <View style={s.ctaPrimaryNoirInner}>
                  <Text style={s.ctaPrimaryNoirText} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.7}>✦ SEEK ADMISSION ✦</Text>
                </View>
                {/* Glowing edge rule */}
                <LinearGradient colors={['rgba(218,165,32,0.8)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.ctaGlowLine} />
              </PressableScale>
              
              <View>
                <VelvetRopeCTA />
              </View>
            </View>
          </View>

        </View>
      </View>
    );
  }

  const hasTriggeredHaptic = useSharedValue(false);
  useAnimatedReaction(() => scrollY.value, (y) => {
      // Haptically lock in the refresh action
      if (y < -80 && !hasTriggeredHaptic.value) {
         hasTriggeredHaptic.value = true;
         runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Heavy);
      } else if (y > -20 && hasTriggeredHaptic.value) {
         hasTriggeredHaptic.value = false;
      }
  });

  const pullAnimStyle = useAnimatedStyle(() => {
     let rotVal = interpolate(scrollY.value, [0, -120], [0, 360], Extrapolation.CLAMP);
     if (refreshing) { rotVal = rotVal + 30; } // Optional: A separate infinite rotation could go here if refreshing=true
     
     const scale = interpolate(scrollY.value, [0, -80], [0.3, 1], Extrapolation.CLAMP);
     const opacity = refreshing ? 1 : interpolate(scrollY.value, [-30, -70], [0, 1], Extrapolation.CLAMP);
     
     return {
        opacity,
        transform: [
          { translateY: 100 },
          { scale },
          { rotateZ: `${rotVal}deg` }
        ]
     };
  });

  // ── Authenticated: The Nitrate Lobby ──
  return (
    <View style={s.container}>
      <LinearGradient colors={[colors.ink, 'rgba(10,7,3,0.98)', colors.soot]} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFillObject} />

      {/* Mechanical Diegetic Spooler (Hidden behind the scroll view, revealed via pull-to-refresh) */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', zIndex: 0 }, pullAnimStyle]} pointerEvents="none">
         <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.sepia, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.sepia, ...effects.glowSepia }} />
         </View>
      </Animated.View>

      {/* Parallax Hero Backdrop */}
      {heroFilm?.backdrop_path && (
        <Animated.View style={[s.heroBackdropWrap, backdropAnimatedStyle]}>
          <Image
            source={{ uri: `${TMDB_IMG_W780}${heroFilm.backdrop_path}` }}
            style={s.heroBackdrop}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <LinearGradient
            colors={['rgba(10,7,3,0.1)', 'rgba(10,7,3,0.7)', colors.ink]}
            locations={[0, 0.65, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <LinearGradient
            colors={['rgba(196,150,26,0.05)', 'transparent', 'transparent']}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      )}

      <AnimatedScrollView
        contentContainerStyle={[s.scrollContent, { paddingTop: topPad }]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={handleRefresh} 
            tintColor="transparent"
            colors={['transparent']}
            progressBackgroundColor="transparent"
            progressViewOffset={topPad} 
          />
        }
      >
        <FilmTicker films={trending} />

        <Animated.View entering={FadeIn.duration(800)} style={s.heroSection}>
          <Text style={s.heroEyebrow}>NOW ENTERING</Text>
          <Text style={s.heroWelcome} accessibilityRole="header" adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.5}>The Lobby</Text>
          <View style={s.heroRuleRow}>
            <LinearGradient colors={['transparent', colors.sepia]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.heroRuleGradient} />
            <Text style={s.heroRuleDot}>✦</Text>
            <LinearGradient colors={[colors.sepia, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.heroRuleGradient} />
          </View>
        </Animated.View>

        <View style={s.marqueeWrap}>
          <MarqueeBoard film={heroFilm} />
        </View>

        <FilmStripRow title="On The Marquee" label="NOW SHOWING" films={trending} />
        
        <SocialPulseSection refreshTrigger={refreshTrigger} />
        
        <FeaturedCritique refreshTrigger={refreshTrigger} />
        
        <FilmStripRow title="The Canon" label="ESSENTIAL ARCHIVES" films={topRated} />

        <View style={s.lobbyFooter}>
          <View style={s.lobbyFooterRule} />
          <Image source={require('../../assets/images/reelhouse-logo.png')} style={s.lobbyFooterLogo} contentFit="contain" />
          <View style={s.lobbyFooterBusterWrap}><Buster size={26} mood="sleeping" /></View>
          <Text style={s.lobbyFooterText}>THE REELHOUSE SOCIETY</Text>
          <Text style={s.lobbyFooterSub}>Est. 1924 · The Society is watching.</Text>
          <Text style={s.lobbyFooterWhisper}>The projection booth never closes.</Text>
          <View style={s.lobbyFooterRule} />
        </View>
      </AnimatedScrollView>

      {/* Global Atmospherics over everything EXCEPT UI elements that need hard touches */}
      {/* We use pointerEvents="none" so buttons remain perfectly clickable */}
      <FilmGrain />

      <QuickActionsFAB />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
//  ULTRA-PREMIUM STYLES (NITRATE NOIR +)
// ════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  scrollContent: { paddingBottom: 150 }, // More breathing room at end of scroll

  // ── Film Ticker ──
  tickerWrap: {
    height: 32, overflow: 'hidden', marginBottom: 24, marginTop: 12,
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: 'rgba(139,105,20,0.2)',
  },
  tickerTrack: { flexDirection: 'row', alignItems: 'center', height: 32 },
  tickerItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 32 },
  tickerDot: { fontSize: 8, color: colors.sepia, opacity: 0.6 },
  tickerTitle: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 3, color: colors.bone, opacity: 0.8 },
  tickerEdge: { position: 'absolute', top: 0, bottom: 0, width: 80, zIndex: 2 },

  // ── Welcome (Unauthenticated) strict layout ──
  welcomeRootFlex: { flex: 1, zIndex: 10, paddingHorizontal: 32 },
  welcomeTopHalf: { flex: 0.55, justifyContent: 'flex-end', alignItems: 'center' },
  welcomeBottomHalf: { flex: 0.45, justifyContent: 'center', alignItems: 'center' },
  
  welcomeHeader: { alignItems: 'center' },
  welcomeEyebrow: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 8, color: colors.sepia, marginBottom: 12, opacity: 0.7 },
  welcomeTitle: {
    fontFamily: fonts.display, fontSize: 38, color: colors.parchment,
    textAlign: 'center', lineHeight: 46, ...effects.textGlowSepia, textShadowRadius: 20,
  },
  welcomeEstRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16, marginBottom: 8 },
  welcomeEstLine: { width: 36, height: 1, backgroundColor: colors.sepia, opacity: 0.4 },
  welcomeEstText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 6, color: colors.sepia, opacity: 0.6 },
  welcomeTagline: {
    fontFamily: fonts.sub, fontSize: 12, color: colors.bone, textAlign: 'center',
    lineHeight: 22, fontStyle: 'italic', opacity: 0.8, marginTop: 16, letterSpacing: 0.3,
  },
  societyRuleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24, opacity: 0.4, paddingHorizontal: 4 },
  societyRuleLine: { flex: 1, height: 1 },
  societyRuleText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 5, color: colors.sepia },
  
  welcomeCtaContainer: { width: '100%', maxWidth: 360, alignItems: 'center', gap: 24 },
  
  ctaPrimaryNoir: {
    backgroundColor: '#1E1911', width: '100%', borderRadius: 6,
    borderWidth: 1, borderColor: '#3A2E1C',
    position: 'relative', overflow: 'hidden', padding: 3,
    ...effects.shadowPrimary,
  },
  ctaPrimaryNoirInner: {
    backgroundColor: '#0D0A07', borderRadius: 4,
    paddingVertical: 18, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#1F180E',
  },
  ctaPrimaryNoirText: { fontFamily: fonts.uiBold, fontSize: 13, letterSpacing: 5, color: colors.flicker },
  ctaGlowLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, opacity: 0.8 },
  
  ctaSecondaryNoir: { paddingVertical: 12, paddingHorizontal: 24 },
  ctaSecondaryNoirText: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 3, color: colors.bone, opacity: 0.6, textDecorationLine: 'underline' },

  // ── Hero Section (Engraved Cinematic) ──
  heroSection: { alignItems: 'center', paddingHorizontal: 16, marginBottom: 40, marginTop: 10 },
  heroEyebrow: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 12, color: colors.sepia, opacity: 0.6, marginBottom: 6, fontWeight: '700' },
  heroWelcome: { 
    fontFamily: fonts.display, fontSize: 34, color: '#F2ECD8', 
    ...effects.textGlowSepia, textShadowRadius: 25, textShadowColor: 'rgba(196,150,26, 0.4)',
    letterSpacing: 2
  },
  heroRuleRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 18, opacity: 0.8 },
  heroRuleGradient: { width: 80, height: StyleSheet.hairlineWidth },
  heroRuleDot: { fontSize: 12, color: colors.sepia, opacity: 0.7 },

  heroBackdropWrap: { position: 'absolute', top: 0, left: 0, right: 0, height: 600, zIndex: 0 },
  heroBackdrop: { width: '100%', height: '100%', opacity: 1 },

  // ── Marquee Board ──
  marqueeWrap: { paddingHorizontal: 18, marginBottom: 16, zIndex: 1 },
  marqueeShell: { marginBottom: 16 },
  marqueeBulbRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, marginVertical: 6 },
  marqueeBulb: { width: 10, height: 10, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  marqueeBulbInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFD700', ...effects.glowSepia },
  marqueeBoard: {
    borderWidth: 3, borderColor: '#3A2E1C', borderRadius: 6,
    paddingVertical: 36, paddingHorizontal: 24,
    overflow: 'hidden', position: 'relative',
    backgroundColor: '#050402',
    ...effects.shadowPrimary,
  },
  marqueeBgImg: {
    ...StyleSheet.absoluteFillObject,
    contentFit: 'cover', opacity: 0.35,
  },
  marqueeSpotlight: { position: 'absolute', top: 0, left: '5%', right: '5%', height: '80%' },
  marqueeContent: { position: 'relative', zIndex: 1, alignItems: 'center' },
  marqueeEyebrow: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 8, color: colors.flicker, marginBottom: 10, ...effects.textGlowFlicker },
  marqueeLoreSub: { fontFamily: fonts.bodyItalic, fontSize: 10, color: colors.fog, opacity: 0.8, marginBottom: 20, letterSpacing: 0.5 },
  marqueeTitleWrap: { paddingHorizontal: 8 },
  marqueeTitle: {
    fontFamily: fonts.display, fontSize: 36, color: '#F2ECD8', textAlign: 'center', lineHeight: 42,
    ...effects.textGlowSepia, textShadowRadius: 15,
  },
  marqueeRule: { width: 80, height: StyleSheet.hairlineWidth, backgroundColor: colors.sepia, marginVertical: 22, opacity: 0.6 },
  marqueeMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'center' },
  marqueeYearPill: {
    backgroundColor: 'rgba(58,50,40,0.7)', paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 4, borderWidth: 1, borderColor: 'rgba(139,105,20,0.4)',
  },
  marqueeYearText: { fontFamily: fonts.sub, fontSize: 12, color: colors.bone },
  marqueeReviewCount: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 3, color: colors.sepia, opacity: 0.8, marginTop: 14, marginBottom: 4 },
  shimmer: { backgroundColor: 'rgba(139,105,20,0.1)', borderRadius: 4, alignSelf: 'center' },

  // ── Film Strip Row (FlashList) ──
  filmStripSection: { marginBottom: 36, marginTop: 24 },
  sectionBeacon: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.sepia, ...effects.glowSepia },
  stripHeader: { paddingHorizontal: 20, marginBottom: 16, marginTop: 4 },
  stripTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stripTitle: { fontFamily: fonts.mono, fontSize: 13, letterSpacing: 8, color: '#E4DFCC', fontWeight: '700' },
  flashListStripWrap: { height: 172 + 12, width: '100%' }, // Poster Height + padding/shadows
  stripScroll: { paddingHorizontal: 20 },
  filmCard: { width: 115 },
  posterWrap: {
    width: 115, height: 172, borderRadius: 6,
    borderWidth: 1, borderColor: '#3A2E1C',
    overflow: 'hidden', ...effects.shadowPrimary,
    backgroundColor: '#050402',
  },
  posterEdgeHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
  },
  posterEmpty: { backgroundColor: 'rgba(18,14,9,0.7)', justifyContent: 'center', alignItems: 'center' },
  posterPlaceholder: { fontFamily: fonts.display, color: colors.sepia, fontSize: 24, opacity: 0.5 },
  posterImg: { width: '100%', height: '100%' },

  // ── Shared Section Styles ──
  sectionAccentBar: { width: 3, height: 32, borderRadius: 2 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 2 },
  sectionLoreSub: { fontFamily: fonts.bodyItalic, fontSize: 10, color: colors.fog, opacity: 0.5, letterSpacing: 0.3 },

  // ── Featured Critique ──
  critiqueSection: { paddingHorizontal: 20, marginTop: 16, marginBottom: 32 },
  critiqueHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  critiqueCardWrap: { marginHorizontal: 0 },
  critiqueSubmitBtn: {
    backgroundColor: 'rgba(18,14,9,0.95)', marginTop: 12, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8,
    overflow: 'hidden', ...effects.shadowSurface,
  },
  critiqueSubmitText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 3, color: colors.sepia },

  // ── Social Pulse (FlashList) ──
  pulseSection: { marginTop: 16, marginBottom: 36 },
  pulseHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, marginBottom: 16 },
  pulseEmpty: {
    marginHorizontal: 20, backgroundColor: 'rgba(18,14,9,0.85)', borderLeftWidth: 3,
    borderLeftColor: 'rgba(139,105,20,0.3)', borderRadius: 6, padding: 32, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.1)',
  },
  pulseEmptyGlyph: { fontSize: 32, color: colors.sepia, opacity: 0.3, marginBottom: 14 },
  pulseEmptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, opacity: 0.8, marginBottom: 8 },
  pulseEmptySub: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, opacity: 0.5, fontStyle: 'italic', textAlign: 'center', lineHeight: 20 },

  flashListPulseWrap: { height: 310, width: '100%' },
  pulseScrollContent: { paddingHorizontal: 20, paddingBottom: 16 },
  pulseCardOuter: { width: SCREEN_W * 0.82 },
  pulseCard: {
    backgroundColor: 'rgba(8,6,4,0.98)', // Obsidian Glass
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.5)',
    borderRadius: 4, overflow: 'hidden', minHeight: 260,
    elevation: 25, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.8, shadowRadius: 30,
  },
  pulsePremium: {
    borderColor: 'rgba(139,105,20,0.3)',
    backgroundColor: 'rgba(10,8,4,1)',
  },
  pulseFeaturedMuseum: {
    borderColor: 'rgba(218,165,32,0.6)', 
    borderWidth: 1.5,
    elevation: 8, shadowColor: colors.sepia, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 15,
  },
  pulseCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.15)',
  },
  pulseUserRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pulseAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.ash, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pulseUserTextWrap: { flex: 1, justifyContent: 'center' },
  pulseUsername: { fontFamily: fonts.uiMedium, fontSize: 11, letterSpacing: 1.5, color: colors.parchment },
  pulseTime: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog, marginTop: 2 },
  pulseCardContent: { flexDirection: 'row', gap: 16, padding: 16, paddingBottom: 24 },
  pulsePosterWrap: {
    width: 60, height: 90, borderRadius: 4, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.25)', ...effects.shadowPrimary,
  },
  pulsePoster: { width: '100%', height: '100%', contentFit: 'cover' },
  pulseFilmTitle: { fontFamily: fonts.sub, fontSize: 13, color: colors.parchment, marginBottom: 6, letterSpacing: 0.5 },
  pulseReview: { fontFamily: fonts.body, fontSize: 11, color: colors.bone, fontStyle: 'italic', opacity: 0.9, paddingBottom: 6, includeFontPadding: false },
  pulseWatchedWith: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.fog, marginTop: 8 },
  pullQuoteWrap: { paddingLeft: 10, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.sepia, marginBottom: 6 },
  pullQuoteText: { fontFamily: fonts.display, fontSize: 14, fontStyle: 'italic', color: colors.sepia, paddingBottom: 6, includeFontPadding: false, lineHeight: 20 },
  pulseReadMoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(139,105,20,0.15)' },
  pulseReadMoreRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(139,105,20,0.1)' },
  pulseReadMoreText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2.5, color: colors.sepia, opacity: 0.6 },

  // Extracted Overrides
  pulseCardAuteur: { backgroundColor: 'rgba(12,5,5,1)', borderColor: 'rgba(125,31,31,0.25)' },
  pulseContentFlex: { flex: 1 },
  pulseRatingWrap: { marginBottom: 8 },
  dropCapRow: { flexDirection: 'row', alignItems: 'flex-start' },
  dropCapLetter: { fontFamily: fonts.display, fontSize: 36, color: colors.sepia, lineHeight: 36, marginRight: 8, marginTop: -4, ...effects.textShadowDeep },
  dropCapBody: { flex: 1, paddingTop: 2 },
  shimmerTrack: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, overflow: 'hidden', zIndex: 5 },
  shimmerSlider: { width: '200%', height: '100%', flexDirection: 'row' },
  shimmerGradient: { width: '100%', height: '100%' },

  // Editorial Banners
  editorialBanner: { width: '100%', height: 90, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.2)' },
  editorialBannerImg: { width: '100%', height: '100%', opacity: 0.6 },
  editorialBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(18,14,9,0.7)', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(196,150,26,0.3)' },
  editorialBadgeText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 4, color: 'rgba(218,165,32,0.9)' },
  premiumBanner: { width: '100%', height: 60, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.15)' },
  premiumBannerImg: { width: '100%', height: '150%', top: '-25%', opacity: 0.45 },

  // Badges
  badgeArchivist: { backgroundColor: 'rgba(196,150,26,0.1)', borderWidth: 1, borderColor: 'rgba(196,150,26,0.3)', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  badgeAuteur: { backgroundColor: '#DAA520', borderWidth: 1, borderColor: 'rgba(139,105,20,0.4)', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2.5, color: colors.sepia },
  pulseWatchedWithName: { color: colors.bone },
  pulseAutopsyTag: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: 'rgba(180,45,45,0.9)', marginTop: 4, marginBottom: 8 },

  // Lobby Footer
  lobbyFooter: { alignItems: 'center', paddingTop: 40, paddingBottom: 40, paddingHorizontal: 40 },
  lobbyFooterRule: { width: 60, height: StyleSheet.hairlineWidth, backgroundColor: colors.sepia, opacity: 0.3 },
  lobbyFooterBusterWrap: { marginTop: 10 },
  lobbyFooterLogo: { width: 32, height: 32, opacity: 0.4, marginVertical: 18 },
  lobbyFooterText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 7, color: colors.sepia, opacity: 0.45, marginBottom: 6 },
  lobbyFooterSub: { fontFamily: fonts.sub, fontSize: 10, color: colors.fog, opacity: 0.45, fontStyle: 'italic', marginBottom: 10 },
  lobbyFooterWhisper: { fontFamily: fonts.bodyItalic, fontSize: 9, color: colors.fog, opacity: 0.3, fontStyle: 'italic', marginBottom: 18, letterSpacing: 1 },
});

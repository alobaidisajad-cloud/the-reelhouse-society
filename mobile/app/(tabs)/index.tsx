import { useEffect, useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, RefreshControl, useWindowDimensions
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  FadeInDown, FadeIn,
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence,
  Easing, interpolate, Extrapolation, useAnimatedScrollHandler,
  cancelAnimation
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { useNotificationStore } from '@/src/stores/notificationStore';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts, effects } from '@/src/theme/theme';
import QuickActionsFAB from '@/src/components/QuickActionsFAB';
import Buster from '@/src/components/Buster';
import PressableScale from '@/src/components/PressableScale';
import { globalScrollY } from '@/src/lib/scrollBridge';
import { FilmGrain, Vignette } from '@/src/components/CinematicOverlays';
import FrozenTab from '@/src/components/layout/FrozenTab';
import { CinematicScrollView } from '@/src/components/layout/CinematicScrollView';

// Extracted Architectural Components
import type { TMDBFilm } from '@/src/components/home/types';
import { ProjectorBeam } from '@/src/components/home/ProjectorBeam';
import { FilmTicker } from '@/src/components/home/FilmTicker';
import { MarqueeBoard } from '@/src/components/home/MarqueeBoard';
import { FilmStripRow } from '@/src/components/home/FilmStripRow';
import { FeaturedCritique } from '@/src/components/home/FeaturedCritique';
import { SocialPulseSection } from '@/src/components/home/SocialPulse';
import { VelvetRopeCTA, BrassSheen } from '@/src/components/home/VelvetRopeCTA';

const TMDB_IMG_W185 = 'https://image.tmdb.org/t/p/w185';
const TMDB_IMG_W780 = 'https://image.tmdb.org/t/p/w780';

// ════════════════════════════════════════════════════════════════
//  MAIN SCREEN: THE LOBBY
// ════════════════════════════════════════════════════════════════
export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
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
  const scrollHeight = useSharedValue(0);
  const viewHeight = useSharedValue(0);
  const isScrolling = useSharedValue(false);
  const breath = useSharedValue(1.0);

  useEffect(() => {
    // Finite breathing loop (5 cycles ≈ 90s) instead of one-shot withTiming
    breath.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 9000, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0, { duration: 9000, easing: Easing.inOut(Easing.sin) }),
      ),
      5,   // 5 cycles = 90 seconds of breathing, then idles at 1.0
      true
    );
    return () => cancelAnimation(breath);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      scrollHeight.value = event.contentSize.height;
      viewHeight.value = event.layoutMeasurement.height;
      // Bridge scroll offset to UI-thread for TopNavBar blur/tint interpolation
      globalScrollY.value = event.contentOffset.y;
    },
    onBeginDrag: () => {
      isScrolling.value = true;
    },
    onEndDrag: (event) => {
      isScrolling.value = false;
    },
    onMomentumBegin: () => {
      isScrolling.value = true;
    },
    onMomentumEnd: () => {
      isScrolling.value = false;
    }
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
  }, [isAuthenticated, fetchLogs, fetchEndorsements, fetchNotifications, setupRealtime]);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      // Removed redundant queryClient.invalidateQueries({ queryKey: ['lobby'] })
      // SocialPulse and FeaturedCritique use raw Supabase calls, not React Query —
      // they only respond to refreshTrigger. The invalidation was hitting no observers.
      setRefreshTrigger(t => t + 1);
      if (isAuthenticated) await fetchLogs();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      if (__DEV__) console.warn('[Lobby] Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, isAuthenticated, fetchLogs]);

  const heroFilm = trending[0] ?? null;

  // ── (Removed custom haptic to let the OS RefreshControl sync cleanly) ──

  const pullAnimStyle = useAnimatedStyle(() => {
     let rotVal = interpolate(scrollY.value, [0, -120], [0, 360], Extrapolation.CLAMP);
     if (refreshing) { rotVal = rotVal + 30; }
     
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

  // ── Unauthenticated: The Velvet Room Welcome ──
  if (!isAuthenticated) {
    return (
      <FrozenTab>
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
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); router.push('/login' as any); }}
                accessibilityRole="button"
                accessibilityLabel="Seek admission — sign up or log in"
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
      </FrozenTab>
    );
  }

  // ── Authenticated: The Nitrate Lobby ──
  return (
    <FrozenTab>
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
        <Animated.View style={[s.heroBackdropWrap, { height: windowHeight * 0.65 }, backdropAnimatedStyle]}>
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

      <CinematicScrollView
        scrollMetrics={{ scrollY, scrollHeight, viewHeight, isScrolling }}
        topInset={topPad}
        bottomInset={insets.bottom + 49}
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
      </CinematicScrollView>

      {/* Global Atmospherics over everything EXCEPT UI elements that need hard touches */}
      {/* We use pointerEvents="none" so buttons remain clickable */}
      <FilmGrain />

      <QuickActionsFAB />
    </View>
    </FrozenTab>
  );
}

// ════════════════════════════════════════════════════════════════
//  ULTRA-PREMIUM STYLES (NITRATE NOIR +)
// ════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  scrollContent: { paddingBottom: 150 }, // More breathing room at end of scroll

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

  heroBackdropWrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 0 },
  heroBackdrop: { width: '100%', height: '100%', opacity: 1 },

  marqueeWrap: { paddingHorizontal: 18, marginBottom: 16, zIndex: 1 },

  // Lobby Footer
  lobbyFooter: { alignItems: 'center', paddingTop: 40, paddingBottom: 40, paddingHorizontal: 40 },
  lobbyFooterRule: { width: 60, height: StyleSheet.hairlineWidth, backgroundColor: colors.sepia, opacity: 0.3 },
  lobbyFooterBusterWrap: { marginTop: 10 },
  lobbyFooterLogo: { width: 32, height: 32, opacity: 0.4, marginVertical: 18 },
  lobbyFooterText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 7, color: colors.sepia, opacity: 0.45, marginBottom: 6 },
  lobbyFooterSub: { fontFamily: fonts.sub, fontSize: 10, color: colors.fog, opacity: 0.45, fontStyle: 'italic', marginBottom: 10 },
  lobbyFooterWhisper: { fontFamily: fonts.bodyItalic, fontSize: 9, color: colors.fog, opacity: 0.3, fontStyle: 'italic', marginBottom: 18, letterSpacing: 1 },
});

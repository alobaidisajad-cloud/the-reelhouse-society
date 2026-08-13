import { useEffect, useCallback, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, RefreshControl, ScrollView, useWindowDimensions
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
import TactileEngine from '@/src/utils/TactileEngine';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';

import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { useNotificationStore } from '@/src/stores/notificationStore';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts, effects } from '@/src/theme/theme';
import QuickActionsFAB from '@/src/components/QuickActionsFAB';
import Buster from '@/src/components/Buster';
import PressableScale from '@/src/components/PressableScale';
import { globalScrollY } from '@/src/lib/scrollBridge';
import { Vignette } from '@/src/components/CinematicOverlays';
import FrozenTab from '@/src/components/layout/FrozenTab';
import { CinematicScrollView } from '@/src/components/layout/CinematicScrollView';
import { SocietySeal } from '@/src/components/auth/SocietySeal';

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

// ── The house knows the hour — the programme whisper under the hero rule ──
// One Date read per render; a still string, never a shout.
function getProgrammeWhisper(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'the morning screening begins';
  if (h >= 12 && h < 17) return 'the matinée is in session';
  if (h >= 17 && h < 22) return "tonight's programme is underway";
  return 'the midnight reel is spinning';
}

// ════════════════════════════════════════════════════════════════
//  MAIN SCREEN: THE LOBBY
// ════════════════════════════════════════════════════════════════
export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  // Re-tap the active tab icon → smoothly scroll the Lobby to the top.
  const scrollRef = useRef<any>(null);
  useScrollToTop(scrollRef);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  // Deterministic title sizing — adjustsFontSizeToFit is unreliable with
  // explicit line breaks (wraps "REELHOUSE" mid-word on narrow screens instead
  // of shrinking). Rye glyphs run ~0.75em wide; "REELHOUSE" is 9 chars.
  const welcomeTitleSize = Math.min(38, Math.floor((windowWidth - 64) / (9 * 0.75)));
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const fetchLogs = useFilmStore(s => s.fetchLogs);
  const fetchEndorsements = useFilmStore(s => s.fetchEndorsements);
  const setupRealtime = useNotificationStore(s => s.setupRealtime);
  const fetchNotifications = useNotificationStore(s => s.fetchNotifications);
  const router = useRouter();

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

  // The Canon. `tmdb.canon()` rather than `topRated()` — see the note on the
  // helper: top_rated ranks by raw average, so it was serving 2026 releases
  // under a heading that promises "the films that built the medium".
  const { data: canonData } = useQuery({
    queryKey: ['lobby', 'canon'],
    queryFn: async () => {
      const res = await tmdb.canon();
      return (res?.results ?? []).slice(0, 10) as TMDBFilm[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const trending = trendingData ?? [];
  const canon = canonData ?? [];

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
  // Mirror the TopNavBar's Math.max(insets.top, 20) floor — see reels.tsx.
  const topPad = Math.max(insets.top, 20) + NAV_HEIGHT + 12;

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
      TactileEngine.destroy();
      // Removed redundant queryClient.invalidateQueries({ queryKey: ['lobby'] })
      // SocialPulse and FeaturedCritique use raw Supabase calls, not React Query —
      // they only respond to refreshTrigger. The invalidation was hitting no observers.
      setRefreshTrigger(t => t + 1);
      if (isAuthenticated) await fetchLogs();
      TactileEngine.mutate();
    } catch (error) {
      if (__DEV__) console.warn('[Lobby] Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  }, [isAuthenticated, fetchLogs]);

  const heroFilm = trending[0] ?? null;

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
        <Vignette />

        {/* 0-Overlap layout: a scroll container can never push content off the
            top of the screen — small displays scroll instead of clipping the
            seal into the status bar. */}
        <ScrollView
          style={s.welcomeRootFlex}
          contentContainerStyle={s.welcomeScrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        >

          {/* Top: Cinematic Typography */}
          <View style={s.welcomeTopHalf}>
            <Animated.View entering={FadeInDown.duration(1200)} style={s.welcomeHeader}>
              {/* The Society's mark ignites at the front door — clamped so
                  small screens never crowd. */}
              <View style={s.welcomeSealWrap}>
                <SocietySeal size={Math.min(104, Math.round(windowHeight * 0.15))} />
              </View>
              <Text style={s.welcomeEyebrow}>WELCOME TO</Text>
              <Text style={[s.welcomeTitle, { fontSize: welcomeTitleSize, lineHeight: Math.round(welcomeTitleSize * 1.21) }]} accessibilityRole="header">
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

          {/* Bottom: Tactile CTAs */}
          <View style={s.welcomeBottomHalf}>
            <View style={s.welcomeCtaContainer}>
              <PressableScale
                style={s.ctaPrimaryNoir}
                onPress={() => { TactileEngine.destroy(); router.push('/login' as any); }}
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

        </ScrollView>
      </View>
      </FrozenTab>
    );
  }

  // ── Authenticated: The Nitrate Lobby ──
  return (
    <FrozenTab>
    <View style={s.container}>
      <LinearGradient colors={[colors.ink, 'rgba(10,7,3,0.98)', colors.soot]} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFillObject} />

      {/* Parallax Hero Backdrop */}
      {heroFilm?.backdrop_path && (
        <Animated.View style={[s.heroBackdropWrap, { height: windowHeight * 0.65 }, backdropAnimatedStyle]}>
          <Image
            source={{ uri: `${TMDB_IMG_W780}${heroFilm.backdrop_path}` }}
            style={s.heroBackdrop}
            contentFit="cover"
            cachePolicy="memory-disk" transition={150}
          />
          <LinearGradient
            colors={['rgba(10,7,3,0.28)', 'rgba(10,7,3,0.7)', colors.ink]}
            locations={[0, 0.65, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <LinearGradient
            colors={['rgba(184,137,26,0.05)', 'transparent', 'transparent']}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      )}

      <CinematicScrollView
        ref={scrollRef}
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
            tintColor={colors.sepia}
            colors={[colors.sepia]}
            progressBackgroundColor={colors.ink}
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
          {/* The programme whisper — single reserved line, cannot wrap or shift */}
          <Text style={s.heroWhisper} numberOfLines={1}>{getProgrammeWhisper()}</Text>
        </Animated.View>

        <View style={s.marqueeWrap}>
          <MarqueeBoard film={heroFilm} />
        </View>

        {/* The marquee presents film #1 — the strip carries the rest of the
            programme (2–10) so the feature never appears twice in a row. */}
        <FilmStripRow title="Now Showing" label="THE PROGRAMME" films={trending.slice(1)} lore="What the world is screening this week" />

        {/* Newspaper order: the Lead Story before the wire — and horizontal
            rails now alternate with static content down the whole page. */}
        <FeaturedCritique refreshTrigger={refreshTrigger} />

        <SocialPulseSection refreshTrigger={refreshTrigger} />

        <FilmStripRow title="The Canon" label="ESSENTIAL ARCHIVES" films={canon} lore="The films that built the medium" />

        {/* The sign-off. One whisper, not two — "Est. 1924" is lore that already
            appears in eleven other files, and repeating it here made the closing
            line share its moment. Buster sits at 40 rather than 26: the house
            convention uses 14–24 for inline glyphs and 40–80 for Buster as a
            presence, and standing alone under the mark he is a presence. */}
        <View style={s.lobbyFooter}>
          <View style={s.lobbyFooterRule} />
          <Image source={require('../../assets/images/reelhouse-logo.png')} style={s.lobbyFooterLogo} contentFit="contain" />
          <View style={s.lobbyFooterBusterWrap}><Buster size={40} mood="sleeping" /></View>
          <Text style={s.lobbyFooterWhisper}>The projection booth never closes.</Text>
          <View style={s.lobbyFooterRule} />
        </View>
      </CinematicScrollView>

      {/* Passing scrollY lets the button step aside while you read downward. It
          floated over an AUTEUR badge and the ESSENTIAL ARCHIVES heading before.
          Safe to hide because the top bar carries its own Add Log button. */}
      <QuickActionsFAB scrollY={scrollY} />
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
  welcomeRootFlex: { flex: 1, zIndex: 10 },
  // flexGrow (not fixed flex halves) + scroll: content can compress spacing on
  // small screens or scroll, but can never overflow off the top of the screen.
  welcomeScrollContent: { flexGrow: 1, paddingHorizontal: 32, paddingVertical: 12, justifyContent: 'space-evenly' },
  welcomeTopHalf: { justifyContent: 'center', alignItems: 'center' },
  welcomeBottomHalf: { justifyContent: 'center', alignItems: 'center', paddingTop: 24 },

  welcomeHeader: { alignItems: 'center' },
  welcomeSealWrap: { alignItems: 'center', marginBottom: 14 },
  welcomeEyebrow: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 7, color: colors.sepia, marginBottom: 12, opacity: 0.75 },
  welcomeTitle: {
    fontFamily: fonts.display, fontSize: 38, color: colors.parchment,
    textAlign: 'center', lineHeight: 46, ...effects.textGlowSepia, textShadowRadius: 20,
  },
  welcomeEstRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16, marginBottom: 8 },
  welcomeEstLine: { width: 36, height: 1, backgroundColor: colors.sepia, opacity: 0.4 },
  welcomeEstText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 5, color: colors.sepia, opacity: 0.65 },
  welcomeTagline: {
    fontFamily: fonts.sub, fontSize: 12, color: colors.bone, textAlign: 'center',
    lineHeight: 22, fontStyle: 'italic', opacity: 0.8, marginTop: 16, letterSpacing: 0.3,
  },
  societyRuleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24, opacity: 0.4, paddingHorizontal: 4 },
  societyRuleLine: { flex: 1, height: 1 },
  societyRuleText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 4, color: colors.sepia },
  
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
  ctaPrimaryNoirText: { fontFamily: fonts.sub, fontSize: 13, letterSpacing: 4, color: colors.flicker },
  ctaGlowLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, opacity: 0.8 },
  
  // ── Hero Section (Engraved Cinematic) ──
  // Rhythm: every section-to-section gap on the page resolves to 36px.
  heroSection: { alignItems: 'center', paddingHorizontal: 16, marginBottom: 36, marginTop: 10 },
  heroEyebrow: {
    // 0.6 measured 2.90:1. 0.85 gives 4.78:1. The shadow below helps over a
    // bright still, but it cannot rescue a base contrast under the large-text floor.
    fontFamily: fonts.sub, fontSize: 11, letterSpacing: 12, color: colors.sepia, opacity: 0.85, marginBottom: 6,
    // Sits over the feature backdrop — soft dark shadow keeps it legible on a bright still.
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
  },
  heroWelcome: {
    fontFamily: fonts.display, fontSize: 34, color: colors.silverScreen, letterSpacing: 2,
    // Dark shadow (not a sepia glow) so "The Lobby" reads over any feature backdrop.
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 12,
  },
  heroRuleRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 18, opacity: 0.8 },
  heroRuleGradient: { width: 80, height: StyleSheet.hairlineWidth },
  heroRuleDot: { fontSize: 12, color: colors.sepia, opacity: 0.7 },
  heroWhisper: {
    fontFamily: fonts.bodyItalic,
    fontSize: 10,
    lineHeight: 15,
    color: colors.fog,
    // 0.65 measured 3.36:1 against ink; 0.80 gives 4.58:1 and clears AA. This is
    // the line that changes with the hour — a signature detail, and one that
    // should be readable rather than merely atmospheric. It also sits over the
    // feature backdrop, so the figure is the floor rather than a guarantee; the
    // shadow below carries it over a bright still.
    opacity: 0.8,
    letterSpacing: 0.5,
    marginTop: 10,
    textAlign: 'center',
    // Sits over the feature backdrop — same legibility shadow as the hero.
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  heroBackdropWrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 0 },
  heroBackdrop: { width: '100%', height: '100%', opacity: 1 },

  marqueeWrap: { paddingHorizontal: 18, marginBottom: 16, zIndex: 1 },

  // Lobby Footer
  lobbyFooter: { alignItems: 'center', paddingTop: 40, paddingBottom: 40, paddingHorizontal: 40 },
  lobbyFooterRule: { width: 60, height: StyleSheet.hairlineWidth, backgroundColor: colors.sepia, opacity: 0.3 },
  lobbyFooterBusterWrap: { marginTop: 10 },
  lobbyFooterLogo: { width: 32, height: 32, opacity: 0.4, marginVertical: 18 },
  // `lobbyFooterText` removed — it was already orphaned before this pass, with
  // no JSX referencing it.
  // `lobbyFooterSub` removed with the "Est. 1924 · The Society is watching." line.
  // 0.30 measured 1.58:1 against ink — effectively invisible outdoors. 0.60 gives
  // 3.02:1. Deliberately NOT taken to 4.5: this is a closing flourish, and making
  // it prominent would flatten the fade-to-black the footer is built around.
  // Legible, still a whisper.
  lobbyFooterWhisper: { fontFamily: fonts.bodyItalic, fontSize: 9, color: colors.fog, opacity: 0.6, fontStyle: 'italic', marginBottom: 18, letterSpacing: 1 },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';

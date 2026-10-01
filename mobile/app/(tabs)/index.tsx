import { useEffect, useCallback, useState, useRef } from 'react';
import { View, StyleSheet, RefreshControl, ScrollView, useWindowDimensions } from 'react-native';
import { Text } from '@/src/components/text';
import { useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TactileEngine from '@/src/utils/TactileEngine';
import { useQueryClient } from '@tanstack/react-query';
import { useScrollToTop } from '@react-navigation/native';

import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { useNotificationStore } from '@/src/stores/notificationStore';
import { colors, fonts, effects } from '@/src/theme/theme';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import PressableScale from '@/src/components/PressableScale';
import { globalScrollY } from '@/src/lib/scrollBridge';
import { Vignette } from '@/src/components/CinematicOverlays';
import FrozenTab from '@/src/components/layout/FrozenTab';
import { CinematicScrollView } from '@/src/components/layout/CinematicScrollView';
import { SocietySeal } from '@/src/components/auth/SocietySeal';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';

import { ProjectorBeam } from '@/src/components/home/ProjectorBeam';
import { VelvetRopeCTA, BrassSheen } from '@/src/components/home/VelvetRopeCTA';
import { NAV_ROW_MIN_H, navTopPadding, tabBarHeight } from '@/src/components/layout/navMetrics';
import { EDGE_LIT, WASH } from '@/src/theme/light';
import { useScreenReady } from '@/src/hooks/useScreenReady';
import { REFRESH_FAILED } from '@/src/components/EmptyStates';
import { LobbyWall } from '@/src/components/lobby/LobbyWall';
import { LIVE_LOBBY_READS, useProgramme } from '@/src/components/lobby/wallRead';
import reelToast from '@/src/utils/reelToast';
import { nav } from '@/src/utils/typedRouter';
import { Arrive } from '@/src/components/Arrive';
import { captureError } from '@/src/lib/sentry';
import { isNetworkError } from '@/src/utils/networkError';

/** Between the front door's two buttons; each one's reach toward the other is half of it. */
const CTA_GAP = 24;

/** Every Lobby read is under ['lobby', ...], so a pull can ask for all of them at once. */
const LOBBY = ['lobby'] as const;

// ════════════════════════════════════════════════════════════════
//  MAIN SCREEN: THE LOBBY
// ════════════════════════════════════════════════════════════════
export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  // Re-tap the active tab icon → smoothly scroll the Lobby to the top.
  const scrollRef = useRef<any>(null);
  useScrollToTop(scrollRef);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  // The title is sized, not shrunk to fit: with line breaks, shrink-to-fit wraps
  // "REELHOUSE" mid-word. Its widest line, measured from Rye, must fit at the
  // largest size the text allows (displayTextProps, 1.2x): 38pt at 393, 37 at 375.
  const RYE_REELHOUSE_EM = 6.507;   // measured from the font file, not estimated
  const TITLE_SPARE = 18;           // width the title leaves free, beyond the page's margins
  const welcomeTitleSize = Math.min(
    38,
    Math.floor((windowWidth - 64 - TITLE_SPARE) / (RYE_REELHOUSE_EM * 1.2))
  );
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const fetchLogs = useFilmStore(s => s.fetchLogs);
  const fetchEndorsements = useFilmStore(s => s.fetchEndorsements);
  const setupRealtime = useNotificationStore(s => s.setupRealtime);
  const fetchNotifications = useNotificationStore(s => s.fetchNotifications);

  const [refreshing, setRefreshing] = useState(false);

  // The wall's reads persist, so a cold start shows the last wall; ready when the programme is.
  const queryClient = useQueryClient();
  const programme = useProgramme(isAuthenticated);
  const readyMark = useScreenReady(isAuthenticated ? 'lobby' : 'welcome', !isAuthenticated || !programme.isPending);

  // Scroll tracking: the top bar's blur and tint follow the page.
  const scrollY = useSharedValue(0);
  const scrollHeight = useSharedValue(0);
  const viewHeight = useSharedValue(0);
  const isScrolling = useSharedValue(false);

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
  
  const NAV_HEIGHT = NAV_ROW_MIN_H + 12;
  // The bar's own top padding: with no inset it still pads (navMetrics).
  const topPad = navTopPadding(insets.top) + NAV_HEIGHT + 12;

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
      // The wall, always: it is the house's own page. The programme only if
      // out of date, or missing — which a failed read is.
      await Promise.all([
        queryClient.refetchQueries({
          queryKey: LOBBY, type: 'active',
          predicate: (q) => LIVE_LOBBY_READS.includes(String(q.queryKey[1])) || q.isStale(),
        }),
        isAuthenticated ? fetchLogs() : undefined,
      ]);
      // A pull that reached nothing leaves the page as it was, and says so.
      const unanswered = queryClient.getQueryCache().findAll({ queryKey: LOBBY, type: 'active' })
        .some((q) => q.state.status === 'error' && q.state.data !== undefined);
      if (unanswered) reelToast.error(REFRESH_FAILED);
      else TactileEngine.mutate();
    } catch (error) {
      // Said as any pull that reached nothing is, and reported when it was not the wire.
      if (!isNetworkError(error)) captureError(error, { where: 'lobby.refresh' });
      reelToast.error(REFRESH_FAILED);
    } finally {
      setRefreshing(false);
    }
  }, [isAuthenticated, fetchLogs, queryClient]);

  // ── Unauthenticated: The Velvet Room Welcome ──
  if (!isAuthenticated) {
    return (
      <FrozenTab>
      <View style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <RoomLight room="lobby" />
        {readyMark}
        <LinearGradient
          colors={[colors.ink, 'rgba(13,11,9,0.98)', colors.soot]}
          locations={[0, 0.4, 1]}
          style={[StyleSheet.absoluteFillObject, WASH]}
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
            <Arrive name="welcome.header" duration={1200} style={s.welcomeHeader}>
              {/* The Society's mark ignites at the front door — clamped so
                  small screens never crowd. */}
              <View style={s.welcomeSealWrap}>
                <SocietySeal size={Math.min(104, Math.round(windowHeight * 0.15))} />
              </View>
              <Text style={s.welcomeEyebrow}>WELCOME TO</Text>
              {/* The 1.2 cap is what the size above is measured against. */}
              <Text
                {...displayTextProps}
                style={[s.welcomeTitle, { fontSize: welcomeTitleSize, lineHeight: Math.round(welcomeTitleSize * 1.21) }]}
                accessibilityRole="header"
              >
                {'THE\nREELHOUSE\nSOCIETY'}
              </Text>

              {/* Six lines: two of its sentences wrap even at 1x, so four cut the last off. */}
              <Text {...scaledTextProps} style={s.welcomeTagline} adjustsFontSizeToFit numberOfLines={6} minimumFontScale={0.7}>
                {'A secret fellowship for the devoted cinephile.\nTrack every screening. Avoid the algorithmic gaze.\nKeep the record alive.'}
              </Text>

              <View style={s.societyRuleRow}>
                <LinearGradient colors={['transparent', colors.sepia]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.societyRuleLine} />
                <Text style={s.societyRuleText} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.7}>✦ ARCHIVAL ACCESS ONLY ✦</Text>
                <LinearGradient colors={[colors.sepia, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.societyRuleLine} />
              </View>
            </Arrive>
          </View>

          {/* A spacer, not space-evenly, which pushes tall content past the top, out of reach. */}
          <View style={s.welcomeSpacer} />

          {/* Bottom: Tactile CTAs */}
          <View style={s.welcomeBottomHalf}>
            <View style={s.welcomeCtaContainer}>
              {/* The SIGN-UP door: it names its form, or '/login' opens sign-in. */}
              <PressableScale
                style={s.ctaPrimaryNoir}
                // the second door stands CTA_GAP below: each reaches half of it, no more
                hitSlop={{ top: CTA_GAP / 2, bottom: CTA_GAP / 2 }}
                onPress={() => { TactileEngine.destroy(); nav.push('/login', { action: 'signup' }); }}
                accessibilityRole="button"
                accessibilityLabel="Seek admission — request membership"
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

  // ── Authenticated: the Lobby wall ──
  // A wall of bills under the Lobby's own lamp. Nothing on it moves.
  return (
    <FrozenTab>
    <View style={s.container}>
      <RoomLight room="lobby" />
      {readyMark}
      {/* The page's own fade, house to card, as a wash so the lamp shows through. */}
      <LinearGradient colors={[colors.ink, 'rgba(13,11,9,0.98)', colors.soot]} locations={[0, 0.4, 1]} style={[StyleSheet.absoluteFillObject, WASH]} />

      <CinematicScrollView
        ref={scrollRef}
        scrollMetrics={{ scrollY, scrollHeight, viewHeight, isScrolling }}
        topInset={topPad}
        bottomInset={tabBarHeight(insets.bottom)}
        contentContainerStyle={{ paddingTop: topPad, paddingBottom: tabBarHeight(insets.bottom) + 24 }}
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
        <LobbyWall />
      </CinematicScrollView>
    </View>
    </FrozenTab>
  );
}

// ════════════════════════════════════════════════════════════════
//  ULTRA-PREMIUM STYLES (NITRATE NOIR +)
// ════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },

  // ── Welcome (Unauthenticated) strict layout ──
  welcomeRootFlex: { flex: 1, zIndex: 10 },
  // Grows, and scrolls when tall: fixed top padding, never space pushed off the top.
  welcomeScrollContent: { flexGrow: 1, paddingHorizontal: 32, paddingTop: 24, paddingBottom: 12, justifyContent: 'flex-start' },
  welcomeSpacer: { flex: 1, minHeight: 24 },
  welcomeTopHalf: { justifyContent: 'center', alignItems: 'center' },
  welcomeBottomHalf: { justifyContent: 'center', alignItems: 'center', paddingTop: 24 },

  welcomeHeader: { alignItems: 'center' },
  welcomeSealWrap: { alignItems: 'center', marginBottom: 14 },
  welcomeEyebrow: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 7, color: colors.sepia, marginBottom: 12 },
  welcomeTitle: {
    fontFamily: fonts.display, fontSize: 38, color: colors.parchment,
    textAlign: 'center', lineHeight: 46, ...effects.textGlowSepia, textShadowRadius: 20,
  },
  welcomeTagline: {
    fontFamily: fonts.sub, fontSize: 12, color: colors.fog, textAlign: 'center',
    lineHeight: 22, fontStyle: 'italic', marginTop: 16, letterSpacing: 0.3,
  },
  societyRuleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24, opacity: 0.4, paddingHorizontal: 4 },
  societyRuleLine: { flex: 1, height: 1 },
  societyRuleText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 4, color: colors.sepia },
  
  welcomeCtaContainer: { width: '100%', maxWidth: 360, alignItems: 'center', gap: CTA_GAP },
  
  ctaPrimaryNoir: { ...EDGE_LIT,
    backgroundColor: colors.soot, width: '100%', borderRadius: 6,
    borderWidth: 1, borderColor: '#3A2E1C',
    position: 'relative', overflow: 'hidden', padding: 3,
    ...effects.shadowPrimary, ...effects.flat,
  },
  ctaPrimaryNoirInner: {
    backgroundColor: colors.ink, borderRadius: 4,
    paddingVertical: 18, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#1F180E',
  },
  ctaPrimaryNoirText: { fontFamily: fonts.sub, fontSize: 13, letterSpacing: 4, color: colors.flicker },
  ctaGlowLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, opacity: 0.8 },
  
  // ── (the member Lobby's styles live with the wall: src/components/lobby) ──
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';

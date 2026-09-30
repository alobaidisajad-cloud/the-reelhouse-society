import { useEffect, useCallback, useState, useRef } from 'react';
import { View, StyleSheet, RefreshControl, ScrollView, useWindowDimensions } from 'react-native';
import { Text } from '@/src/components/text';
import Animated, { FadeInDown, useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TactileEngine from '@/src/utils/TactileEngine';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
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

// Extracted Architectural Components
import { ProjectorBeam } from '@/src/components/home/ProjectorBeam';
import { VelvetRopeCTA, BrassSheen } from '@/src/components/home/VelvetRopeCTA';
import { NAV_ROW_MIN_H, navTopPadding, tabBarHeight } from '@/src/components/layout/navMetrics';
import { EDGE_LIT, WASH } from '@/src/theme/light';
import { useScreenReady } from '@/src/hooks/useScreenReady';
import { REFRESH_FAILED } from '@/src/components/EmptyStates';
import { LobbyWall } from '@/src/components/lobby/LobbyWall';
import { LIVE_LOBBY_READS, useProgramme } from '@/src/components/lobby/wallRead';
import reelToast from '@/src/utils/reelToast';

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
  // Deterministic title sizing — adjustsFontSizeToFit is unreliable with
  // explicit line breaks (wraps "REELHOUSE" mid-word instead of shrinking).
  //
  // The 0.75em/char estimate this used was very nearly right: measured out of
  // Rye_400Regular.ttf, "REELHOUSE" is 6.507em total, ~0.723em/char. At 38pt
  // that is 265pt inside 329pt and it FITS. What broke it was not the constant
  // but the thing the formula never accounted for — Dynamic Type. Solving
  // 6.507 * 38 * scale + 18 > 329 puts the wrap at 1.26x, which is roughly
  // where a device with larger text sits, and is why it breaks in production
  // and not in a simulator at default size.
  //
  // So the width budget is divided by the cap the text actually declares
  // (displayTextProps, 1.2x) and the letterSpacing is subtracted rather than
  // ignored — it does not scale with the font. That yields 38pt on a 393pt
  // screen and 37pt on a 375pt one, where a bare 1.2x cap alone would still
  // have wrapped.
  const RYE_REELHOUSE_EM = 6.507;   // measured from the font file, not estimated
  const TITLE_LETTER_SPACING = 2;   // welcomeTitle.letterSpacing, 9 glyphs
  const welcomeTitleSize = Math.min(
    38,
    Math.floor((windowWidth - 64 - TITLE_LETTER_SPACING * 9) / (RYE_REELHOUSE_EM * 1.2))
  );
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const fetchLogs = useFilmStore(s => s.fetchLogs);
  const fetchEndorsements = useFilmStore(s => s.fetchEndorsements);
  const setupRealtime = useNotificationStore(s => s.setupRealtime);
  const fetchNotifications = useNotificationStore(s => s.fetchNotifications);
  const router = useRouter();

  const [refreshing, setRefreshing] = useState(false);

  // ── The wall's reads: kept on the phone (the persisted query cache), so a
  // cold start shows the last wall at once. The Lobby is ready to be seen when
  // the programme has answered — the wall's own reads hang their still shapes
  // until then, so nothing jumps.
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
  // The zero-inset floor comes FROM the bar now rather than being copied — see
  // navMetrics.ts and the longer note in reels.tsx.
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
      if (__DEV__) console.warn('[Lobby] Refresh failed:', error);
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
            <Animated.View entering={FadeInDown.duration(1200)} style={s.welcomeHeader}>
              {/* The Society's mark ignites at the front door — clamped so
                  small screens never crowd. */}
              <View style={s.welcomeSealWrap}>
                <SocietySeal size={Math.min(104, Math.round(windowHeight * 0.15))} />
              </View>
              <Text style={s.welcomeEyebrow}>WELCOME TO</Text>
              {/* displayTextProps is what makes the size budget above real —
                  without a declared cap the multiplier is unbounded and the
                  arithmetic is guessing. The 1.21 lineHeight ratio also clears
                  that 1.2 cap, so the glyphs cannot outgrow their own line box. */}
              <Text
                {...displayTextProps}
                style={[s.welcomeTitle, { fontSize: welcomeTitleSize, lineHeight: Math.round(welcomeTitleSize * 1.21) }]}
                accessibilityRole="header"
              >
                {'THE\nREELHOUSE\nSOCIETY'}
              </Text>

              {/* The "EST. 1924" rule stood here. Fourth page carrying it; it is
                  lore, not furniture, and the name above already says 1924. */}

              {/* 12pt in a 22pt line box. The generous ratio makes this look
                  safe, and I first cleared it on exactly that reasoning — but
                  UNCAPPED means unbounded, and iOS accessibility sizes run well
                  past 1.83x. Capped at 1.35 it can never outgrow the box. */}
              {/* Six, not four. Measured in Special Elite (0.626em/char) the
                  first two sentences are 352pt and 391pt against a 329pt slot,
                  so they wrap to two lines EVEN AT 1.0x — five lines in total,
                  and numberOfLines={4} cut the last one off. "Keep the record
                  alive." has never rendered, on any device, at any text size. */}
              <Text {...scaledTextProps} style={s.welcomeTagline} adjustsFontSizeToFit numberOfLines={6} minimumFontScale={0.7}>
                {'A secret fellowship for the devoted cinephile.\nTrack every screening. Avoid the algorithmic gaze.\nKeep the record alive.'}
              </Text>

              <View style={s.societyRuleRow}>
                <LinearGradient colors={['transparent', colors.sepia]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.societyRuleLine} />
                <Text style={s.societyRuleText} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.7}>✦ ARCHIVAL ACCESS ONLY ✦</Text>
                <LinearGradient colors={[colors.sepia, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.societyRuleLine} />
              </View>
            </Animated.View>
          </View>

          {/* A spacer, not justifyContent. `space-evenly` on a scroll content
              container distributes NEGATIVE free space too — when the content
              is taller than the viewport it is pushed off BOTH ends, and a
              ScrollView cannot scroll above its origin. That is why the seal
              and "WELCOME TO" were unreachable rather than merely off-screen.
              A flex spacer expands to the same gap when everything fits and
              collapses to zero when it does not. */}
          <View style={s.welcomeSpacer} />

          {/* Bottom: Tactile CTAs */}
          <View style={s.welcomeBottomHalf}>
            <View style={s.welcomeCtaContainer}>
              {/* This is the SIGN-UP button and it opened the SIGN-IN form.
                  Both gate CTAs pushed a bare '/login', which defaults to
                  isLogin=true — so the largest button on the front door asked a
                  brand-new visitor to identify themselves as an existing member,
                  and the real signup was reachable only through a small link at
                  the bottom of that form. The `action` param already existed and
                  auth-callback/reset-password both use it; the gate was the one
                  caller that omitted it. The old accessibility label ("sign up
                  or log in") papered over the ambiguity rather than fixing it. */}
              <PressableScale
                style={s.ctaPrimaryNoir}
                onPress={() => { TactileEngine.destroy(); (router.push as any)({ pathname: '/login', params: { action: 'signup' } }); }}
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
  // A wall of bills under the Lobby's own lamp. Nothing on it moves: the old
  // marquee's breathing backdrop and its parallax are gone with it.
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
        contentContainerStyle={[s.scrollContent, { paddingTop: topPad, paddingBottom: tabBarHeight(insets.bottom) + 24 }]}
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
  scrollContent: { paddingBottom: 150 }, // More breathing room at end of scroll

  // ── Welcome (Unauthenticated) strict layout ──
  welcomeRootFlex: { flex: 1, zIndex: 10 },
  // flexGrow (not fixed flex halves) + scroll: content can compress spacing on
  // small screens or scroll, but can never overflow off the top of the screen.
  // paddingTop 24, not 12. With flex-start all the free space now collects in
  // the spacer between the two halves, so the old symmetric breathing room
  // above the seal went to zero. This is fixed padding rather than distributed
  // space, so unlike `space-evenly` it cannot push content off the top when
  // the content is tall — which was the whole bug.
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
  
  welcomeCtaContainer: { width: '100%', maxWidth: 360, alignItems: 'center', gap: 24 },
  
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

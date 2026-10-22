import TactileEngine from '@/src/utils/TactileEngine';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Film, X } from 'lucide-react-native';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '@/src/components/text';

import { ReelRating } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import { useOfflineAware } from '@/src/hooks/useOfflineAware';
import { tmdb } from '@/src/lib/tmdb';
import { computeYearStats, fetchYearLogs, YearStats } from '@/src/services/YearInCinemaService';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { safeAreaHeight, useBottomEdge, useOverlayTop } from '@/src/components/layout/navMetrics';
import { WASH } from '@/src/theme/light';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import { BusterEyes } from '@/src/components/Buster';
import TryAgain from '@/src/components/TryAgain';
import { nav } from '@/src/utils/typedRouter';
import { Arrive } from '@/src/components/Arrive';

type SlideType = 'intro' | 'total' | 'verdict' | 'rhythm' | 'top' | 'outro';

// Chrome shared by the loading / error / empty states. Module-level so it
// keeps a stable identity and never remounts its subtree between renders.
/** Between the slides' footer and the home indicator's edge. */
const FOOTER_GAP = 16;

function StateShell({ closeTop, children }: { closeTop: number; children: React.ReactNode }) {
  return (
    <View style={s.container}>
      <RoomLight room="member" />
      <LinearGradient colors={['#1a1510', colors.ink, '#0D0B09']} locations={[0, 0.5, 1]} style={[StyleSheet.absoluteFillObject, WASH]} />
      {children}
      <PressableScale style={[s.closeBtn, { top: closeTop }]} onPress={() => nav.back()} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="light" accessibilityRole="button" accessibilityLabel="Close Year in Cinema">
        <X size={24} color={colors.bone} />
      </PressableScale>
    </View>
  );
}

// ── The film gate: sprocket perforations down both edges of every frame ──
function FilmEdges() {
  const holes = Array.from({ length: 16 });
  return (
    <>
      <View style={s.edgeLeft} pointerEvents="none">
        {holes.map((_, i) => <View key={i} style={s.edgeHole} />)}
      </View>
      <View style={s.edgeRight} pointerEvents="none">
        {holes.map((_, i) => <View key={i} style={s.edgeHole} />)}
      </View>
    </>
  );
}

export default function YearInCinemaScreen() {
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const edge = useBottomEdge();
  // The close button floats over the slides: an overlay's top (navMetrics).
  const closeTop = useOverlayTop();
  const { isOffline } = useOfflineAware();
  const { width, height } = useWindowDimensions();

  const currentYear = new Date().getFullYear();
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [stats, setStats] = useState<YearStats | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!user?.id) { setPhase('error'); return; }
    const myReq = ++reqId.current;
    setPhase('loading');
    try {
      const logs = await fetchYearLogs(user.id, currentYear);
      if (myReq !== reqId.current) return; // a newer load supersedes this one
      setStats(computeYearStats(logs, currentYear));
      setPhase('ready');
    } catch {
      if (myReq !== reqId.current) return;
      setPhase('error');
    }
  }, [user?.id, currentYear]);

  useEffect(() => { load(); }, [load]);

  // The story adapts to the data — no hollow slides for stats you don't have.
  const slides = useMemo<SlideType[]>(() => {
    if (!stats) return [];
    const list: SlideType[] = ['intro', 'total'];
    if (stats.ratedCount > 0) list.push('verdict');
    list.push('rhythm');
    if (stats.topFilms.length > 0) list.push('top');
    list.push('outro');
    return list;
  }, [stats]);

  const slideHeight = safeAreaHeight(height, insets);

  const renderSlide = useCallback(({ item, index }: { item: SlideType; index: number }) => {
    const isActive = currentIndex === index;
    if (!stats) return null;

    return (
      <View style={[s.slide, { width, height: slideHeight }]}>
        <LinearGradient colors={['#1a1510', colors.ink, '#0D0B09']} locations={[0, 0.5, 1]} style={[StyleSheet.absoluteFillObject, WASH]} />
        {/* Filmic vertical vignette — depth without a flat grey wash */}
        <LinearGradient colors={['rgba(0,0,0,0.4)', 'transparent', 'rgba(0,0,0,0.55)']} locations={[0, 0.5, 1]} style={[StyleSheet.absoluteFillObject, WASH]} pointerEvents="none" />
        <FilmEdges />

        {/* Content region — flex:1, centred, can never reach the footer */}
        <View style={s.contentRegion}>
          {isActive && item === 'intro' && (
            <Arrive name="year-in-cinema-1" duration={700} style={s.centerBox}>
              <Text style={s.eyebrow}>YOUR RHYTHM IN</Text>
              <Text style={s.hugeYear} numberOfLines={1} adjustsFontSizeToFit>{stats.year}</Text>
              <Text style={s.sub}>An analysis of your cinematic footprint over the last cycle.</Text>
            </Arrive>
          )}

          {isActive && item === 'total' && (
            <Arrive name="year-in-cinema-2" duration={700} style={s.centerBox}>
              <Text style={s.number} numberOfLines={1} adjustsFontSizeToFit>{stats.total}</Text>
              <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit>Films Logged</Text>
              <Text style={s.sub}>
                {stats.total === 1
                  ? 'A single reel so far this year.'
                  : `That is roughly ${stats.perMonth.toFixed(1)} entries a month.`}
              </Text>
            </Arrive>
          )}

          {isActive && item === 'verdict' && (
            <Arrive name="year-in-cinema-3" duration={700} style={s.centerBox}>
              <Text style={s.number} numberOfLines={1} adjustsFontSizeToFit>{stats.avgRating?.toFixed(1)}</Text>
              <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit>Your Verdict</Text>
              <View style={s.verdictStars}><ReelRating rating={stats.avgRating ?? 0} size={20} /></View>
              <Text style={s.sub}>Your average mark across {stats.ratedCount} rated {stats.ratedCount === 1 ? 'film' : 'films'}.</Text>
            </Arrive>
          )}

          {isActive && item === 'rhythm' && (
            <Arrive name="year-in-cinema-4" duration={700} style={s.leftBox}>
              <Text style={s.title}>Your Rhythm</Text>
              <Text style={s.subLeft}>Your most active viewing months.</Text>
              <View style={s.rankingWrap}>
                {stats.topMonths.map((d, i) => (
                  <Arrive key={d.month} name="year-in-cinema-5" duration={600} delay={i * 140} style={s.rankingRow}>
                    <Text style={s.rankNum}>{i + 1}</Text>
                    <Text style={s.rankName} numberOfLines={1}>{d.month}</Text>
                    <Text style={s.rankCount}>{d.count} {d.count === 1 ? 'FILM' : 'FILMS'}</Text>
                  </Arrive>
                ))}
              </View>
            </Arrive>
          )}

          {isActive && item === 'top' && (
            <Arrive name="year-in-cinema-6" duration={700} style={s.leftBox}>
              <Text style={s.title}>Highest Rated</Text>
              <Text style={s.subLeft}>The masterworks you marked highest.</Text>
              <View style={s.topWrap}>
                {stats.topFilms.map((f, i) => (
                  <Arrive key={f.id} name="year-in-cinema-7" duration={600} delay={i * 140} style={s.topCard}>
                    {f.poster ? (
                      <Image source={{ uri: tmdb.poster(f.poster, 'w342') }} style={s.topPoster} cachePolicy="memory-disk" transition={150} />
                    ) : (
                      <View style={[s.topPoster, s.topPosterBlank]}>
                        <Film size={18} color={colors.sepia} />
                      </View>
                    )}
                    <View style={s.topInfo}>
                      <Text style={s.topTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{f.title}</Text>
                      <ReelRating rating={f.rating} size={13} />
                    </View>
                  </Arrive>
                ))}
              </View>
            </Arrive>
          )}

          {isActive && item === 'outro' && (
            <Arrive name="year-in-cinema-8" duration={700} style={s.centerBox}>
              <View style={s.badge}><Text style={s.badgeText}>PROJECTION COMPLETED</Text></View>
              <Text style={s.title} numberOfLines={2} adjustsFontSizeToFit>The Archive Awaits</Text>
              <Text style={s.sub}>Keep feeding the projector, @{user?.username}.</Text>
            </Arrive>
          )}
        </View>

        {/* Footer — its own region; the film-strip paginator can never overlap content */}
        {isActive && (
          <Arrive name="year-in-cinema-9" duration={300} rise={0} style={[s.footer, { paddingBottom: edge + FOOTER_GAP }]}>
            <View style={s.paginator}>
              {slides.map((_, i) => (
                <View key={i} style={[s.frame, i === currentIndex && s.frameActive]} />
              ))}
            </View>
          </Arrive>
        )}
      </View>
    );
  }, [currentIndex, width, slideHeight, stats, slides, user, edge]);

  if (phase === 'loading') {
    return (
      <StateShell closeTop={closeTop}>
        <View style={s.stateBox}>
          <BusterEyes />
          <Text style={s.stateEyebrow}>THE PROJECTOR WARMS</Text>
          <Text style={s.stateTitle}>Developing your year…</Text>
        </View>
      </StateShell>
    );
  }

  if (phase === 'error') {
    return (
      <StateShell closeTop={closeTop}>
        <View style={s.stateBox}>
          <Text style={s.stateTitle}>{isOffline ? 'Your year awaits a\nconnection' : 'The projector jammed'}</Text>
          <Text style={s.stateSub}>{isOffline ? 'Reconnect to develop this year’s reel.' : 'The reel slipped the gate. Try once more.'}</Text>
          <TryAgain onPress={load} style={s.retrySpace} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} />
        </View>
      </StateShell>
    );
  }

  // Ready but the year is genuinely empty — an invitation, not a hollow story.
  if (!stats || stats.total === 0) {
    return (
      <StateShell closeTop={closeTop}>
        <View style={s.stateBox}>
          <FilmEdges />
          <Text style={s.blankGlyph}>▦</Text>
          <Text style={s.stateTitle}>A Blank Reel</Text>
          <Text style={s.stateSub}>You haven&apos;t logged a film in {currentYear} yet. Every reel starts with a single frame.</Text>
          <PressableScale style={s.ctaBtn} onPress={() => nav.push('/log-modal')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} haptic="medium" accessibilityRole="button" accessibilityLabel="Log your first film">
            <Text style={s.ctaText}>LOG YOUR FIRST FILM</Text>
          </PressableScale>
        </View>
      </StateShell>
    );
  }

  return (
    <View style={s.container}>
      <RoomLight room="member" />
      {/* Six pages at most, each exactly the phone's width: a plain pager. A recycling list
          laid its pages out wider than the phone, and each page's words stood off it
          (the route walk, 2026-10-21: a blank year). */}
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          if (index !== currentIndex) {
            TactileEngine.selection();
            setCurrentIndex(index);
          }
        }}
      >
        {slides.map((item, index) => <Fragment key={`${item}-${index}`}>{renderSlide({ item, index })}</Fragment>)}
      </ScrollView>
      <PressableScale style={[s.closeBtn, { top: closeTop }]} onPress={() => nav.back()} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="light" accessibilityRole="button" accessibilityLabel="Close Year in Cinema">
        <X size={24} color={colors.bone} />
      </PressableScale>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  closeBtn: { position: 'absolute', right: 20, zIndex: 100, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  slide: { flex: 1 },

  // Film gate edges
  edgeLeft: { position: 'absolute', left: 6, top: 0, bottom: 0, width: 12, justifyContent: 'space-around', alignItems: 'center' },
  edgeRight: { position: 'absolute', right: 6, top: 0, bottom: 0, width: 12, justifyContent: 'space-around', alignItems: 'center' },
  edgeHole: { width: 6, height: 9, borderRadius: 1.5, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.sepiaBorder },

  // Content region (flex) + footer region — separated so nothing overlaps
  contentRegion: { flex: 1, justifyContent: 'center', paddingHorizontal: 34 },
  centerBox: { alignItems: 'center' },
  leftBox: { alignItems: 'flex-start' },

  eyebrow: { fontFamily: fonts.sub, fontSize: 12, letterSpacing: 6, color: colors.sepia, marginBottom: 12 },
  hugeYear: { fontFamily: fonts.display, fontSize: 78, color: colors.parchment, lineHeight: 88, marginBottom: 14, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10 },
  number: { fontFamily: fonts.display, fontSize: 92, color: colors.sepia, lineHeight: 100, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 8 },
  title: { fontFamily: fonts.display, fontSize: 36, color: colors.bone, marginBottom: 14, lineHeight: 42 },
  sub: { fontFamily: fonts.body, fontSize: 15, color: colors.fog, textAlign: 'center', lineHeight: 23 },
  subLeft: { fontFamily: fonts.body, fontSize: 14, color: colors.fog, lineHeight: 22, marginBottom: 4 },
  verdictStars: { marginBottom: 16, marginTop: 2 },

  // Rhythm
  rankingWrap: { width: '100%', marginTop: 32 },
  rankingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18, borderBottomWidth: 1, borderBottomColor: colors.sepiaSubtle, paddingBottom: 14 },
  rankNum: { fontFamily: fonts.display, fontSize: 30, color: colors.sepia, width: 40 },
  rankName: { flex: 1, fontFamily: fonts.sub, fontSize: 19, color: colors.parchment },
  rankCount: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.fog },

  // Top films — compact, bounded so 3 always fit the smallest screen
  topWrap: { width: '100%', marginTop: 26 },
  topCard: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, backgroundColor: 'rgba(13,11,9,0.4)', borderRadius: 2, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  topPoster: { width: 52, height: 78, borderRadius: 2, marginRight: 14, backgroundColor: colors.soot },
  topPosterBlank: { alignItems: 'center', justifyContent: 'center' },
  topInfo: { flex: 1 },
  topTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.parchment, marginBottom: 8 },

  // Outro
  badge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.sepiaFaint, borderWidth: 1, borderColor: colors.sepiaBorder, marginBottom: 22 },
  badgeText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.sepia },

  // Footer / film-strip paginator
  footer: { alignItems: 'center', paddingTop: 8 },
  paginator: { flexDirection: 'row', gap: 5 },
  frame: { width: 18, height: 12, borderRadius: 1, borderWidth: 1, borderColor: colors.sepiaBorder, backgroundColor: 'transparent' },
  frameActive: { backgroundColor: colors.sepia, borderColor: colors.sepia },

  // Loading / error / empty states
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  stateEyebrow: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 4, color: colors.sepia, marginTop: 8 },
  stateTitle: { fontFamily: fonts.display, fontSize: 30, color: colors.parchment, textAlign: 'center', lineHeight: 36 },
  stateSub: { fontFamily: fonts.body, fontSize: 14, color: colors.fog, textAlign: 'center', lineHeight: 22 },
  blankGlyph: { fontFamily: fonts.display, fontSize: 30, color: colors.sepiaSubtle, marginBottom: 4 },
  retrySpace: { marginTop: 12 },
  ctaBtn: { marginTop: 12, backgroundColor: colors.sepia, borderRadius: 3, paddingVertical: 13, paddingHorizontal: 28 },
  ctaText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.ink },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';

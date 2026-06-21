import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Film, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { ReelRating } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import { tmdb } from '@/src/lib/tmdb';
import { useAuthStore } from '@/src/stores/auth';
import { useLogStore } from '@/src/stores/films';
import { colors, fonts } from '@/src/theme/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Static slide definitions (module-scope to avoid re-creation on every render) ──
const SLIDES = [
  { type: 'intro' },
  { type: 'total' },
  { type: 'rhythm' },
  { type: 'top' },
  { type: 'outro' },
];



export default function YearInCinemaScreen() {
  const logs = useLogStore(s => s.logs);
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const { width, height } = useWindowDimensions();

  const stats = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const yearLogs = logs.filter(l => {
      const d = l.watchedDate || l.createdAt;
      return d && new Date(d).getFullYear() === currentYear;
    });

    const total = yearLogs.length;
    const rated = yearLogs.filter(l => l.rating > 0);
    const avgRating = rated.length > 0 ? (rated.reduce((acc: number, l: any) => acc + l.rating, 0) / rated.length).toFixed(1) : '—';
    
    // Monthly Viewing Rhythm
    const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthsMap: Record<string, number> = {};
    yearLogs.forEach((l: any) => {
      const d = l.watchedDate || l.createdAt;
      if (!d) return;
      const month = MONTH_NAMES[new Date(d).getMonth()];
      monthsMap[month] = (monthsMap[month] || 0) + 1;
    });
    const topMonths = Object.entries(monthsMap).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // Highest Rated
    const topFilms = [...rated].sort((a,b) => b.rating - a.rating).slice(0, 3);

    return { year: currentYear, total, avgRating, topMonths, topFilms };
  }, [logs]);



  // FIX #1: Stable renderItem reference — prevents stale currentIndex closure in FlashList recycled cells
  const renderSlide = useCallback(({ item, index }: { item: { type: string }; index: number }) => {
    const isActive = currentIndex === index;

    return (
      <View style={[s.slide, { width, height: height - insets.top - insets.bottom }]}>
        <LinearGradient 
          colors={['#1a1510', colors.ink, '#0A0703']} 
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFillObject} 
        />
        <View style={s.grainOverlay} />

        <View style={s.slideContent}>
          {isActive && item.type === 'intro' && (
            <Animated.View entering={FadeInDown.duration(800).springify()} style={s.centerBox}>
              <Text style={s.eyebrow}>YOUR RHYTHM IN</Text>
              <Text style={s.hugeYear}>{stats.year}</Text>
              <Text style={s.sub}>An analysis of your cinematic footprint over the last cycle.</Text>
            </Animated.View>
          )}

          {isActive && item.type === 'total' && (
            <Animated.View entering={FadeInDown.duration(800).springify()} style={s.centerBox}>
              <Text style={s.number}>{stats.total}</Text>
              <Text style={s.title}>Films Logged</Text>
              <Text style={s.sub}>That averages to roughly {(stats.total / 12).toFixed(1)} entries per month.</Text>
            </Animated.View>
          )}

          {isActive && item.type === 'rhythm' && (
            <Animated.View entering={FadeInDown.duration(800).springify()} style={[s.contentBox, { paddingTop: Math.max(insets.top + 20, 60) }]}>
              <Text style={s.title}>Your Rhythm</Text>
              <Text style={s.sub}>Your most active viewing months of the year.</Text>
              <View style={s.rankingWrap}>
                {stats.topMonths.map((d, i) => (
                  <Animated.View key={d[0]} entering={FadeInDown.delay(i * 200)} style={s.rankingRow}>
                    <Text style={s.rankNum}>{i + 1}</Text>
                    <Text style={s.rankName}>{d[0]}</Text>
                    <Text style={s.rankCount}>{d[1]} films</Text>
                  </Animated.View>
                ))}
              </View>
            </Animated.View>
          )}

          {isActive && item.type === 'top' && (
            <Animated.View entering={FadeInDown.duration(800).springify()} style={[s.contentBox, { paddingTop: Math.max(insets.top + 20, 60) }]}>
              <Text style={s.title}>Highest Rated</Text>
              <Text style={s.sub}>The masterworks you certified perfectly.</Text>
              <View style={s.topFilmsWrap}>
                {stats.topFilms.length === 0 ? <Text style={s.sub}>No rated films this year.</Text> : null}
                {stats.topFilms.map((f, i) => (
                  <Animated.View key={f.id} entering={FadeInDown.delay(i * 200)} style={s.topFilmCard}>
                    {f.poster ? (
                      <Image source={{ uri: tmdb.poster(f.poster, 'w342') }} style={s.topPoster} cachePolicy="memory-disk" />
                    ) : (
                      <LinearGradient 
                        colors={['rgba(196,150,26,0.06)', 'rgba(11,10,8,0.95)']} 
                        style={[s.topPoster, { justifyContent: 'center', alignItems: 'center' }]}
                      >
                        <Film size={20} color={colors.sepia} opacity={0.3} />
                      </LinearGradient>
                    )}
                    <View style={s.topFilmInfo}>
                      <Text style={s.topFilmTitle} numberOfLines={2}>{f.title}</Text>
                      <ReelRating rating={f.rating / 2} size={14} />
                    </View>
                  </Animated.View>
                ))}
              </View>
            </Animated.View>
          )}

          {isActive && item.type === 'outro' && (
            <Animated.View entering={FadeInDown.duration(800).springify()} style={s.centerBox}>
              <View style={s.badgeWrap}>
                <Text style={s.badgeLabel}>PROJECTION COMPLETED</Text>
              </View>
              <Text style={s.title}>The Archive Awaits</Text>
              <Text style={s.sub}>Keep feeding the projector, @{user?.username}.</Text>
            </Animated.View>
          )}
        </View>

        {isActive && (
          <Animated.View entering={FadeIn} style={s.bottomRow}>
             <PressableScale style={s.navBtn} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => { router.back(); }} haptic="light" accessibilityRole="button" accessibilityLabel="Exit Year in Cinema">
                <Text style={s.navText}>EXIT</Text>
             </PressableScale>
             <View style={s.paginator}>
               {SLIDES.map((_, i) => (
                 <View key={i} style={[s.pageDot, i === currentIndex && s.pageDotActive]} />
               ))}
             </View>
             {/* FIX #5: Removed dead ternary — both branches were identical */}
             <View style={{ width: 40 }} />
          </Animated.View>
        )}
      </View>
    );
  }, [currentIndex, width, height, insets, stats, user]);

  return (
    <View style={s.container}>
      <FlashList
        data={SLIDES}
        keyExtractor={(_, i) => `slide-${i}`}
        horizontal
        pagingEnabled
        estimatedItemSize={width}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          if (index !== currentIndex) {
            Haptics.selectionAsync();
            setCurrentIndex(index);
          }
        }}
        renderItem={renderSlide}
      />
      <PressableScale style={[s.globalCloseBtn, { top: insets.top + 10 }]} onPress={() => router.back()} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="light" accessibilityRole="button" accessibilityLabel="Close Year in Cinema">
        <X size={24} color={colors.bone} />
      </PressableScale>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  globalCloseBtn: { position: 'absolute', right: 20, zIndex: 100, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  slide: { flex: 1 },
  grainOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(139,105,20,0.03)' },
  slideContent: { flex: 1, padding: 30, justifyContent: 'center' },
  centerBox: { alignItems: 'center' },
  contentBox: { alignItems: 'flex-start' },
  
  eyebrow: { fontFamily: fonts.uiBold, fontSize: 12, letterSpacing: 6, color: colors.sepia, marginBottom: 12 },
  hugeYear: { fontFamily: fonts.display, fontSize: 80, color: colors.parchment, lineHeight: 90, marginBottom: 16, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10 },
  
  title: { fontFamily: fonts.display, fontSize: 40, color: colors.bone, marginBottom: 16, lineHeight: 46 },
  sub: { fontFamily: fonts.body, fontSize: 16, color: colors.fog, textAlign: 'center', lineHeight: 24, paddingHorizontal: 20 },
  number: { fontFamily: fonts.display, fontSize: 100, color: colors.sepia, lineHeight: 110, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 8 },
  
  rankingWrap: { width: '100%', marginTop: 40 },
  rankingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.2)', paddingBottom: 16 },
  rankNum: { fontFamily: fonts.display, fontSize: 32, color: colors.sepia, width: 40 },
  rankName: { flex: 1, fontFamily: fonts.sub, fontSize: 20, color: colors.parchment },
  rankCount: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.fog },
  
  topFilmsWrap: { width: '100%', marginTop: 30 },
  topFilmCard: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, backgroundColor: 'rgba(10, 7, 3, 0.4)', borderRadius: 2, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  topPoster: { width: 60, height: 90, borderRadius: 2, marginRight: 16 },
  topFilmInfo: { flex: 1 },
  topFilmTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginBottom: 8 },
  
  badgeWrap: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(139,105,20,0.1)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.4)', marginBottom: 24 },
  badgeLabel: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 3, color: colors.sepia },
  
  bottomRow: { position: 'absolute', bottom: 40, left: 30, right: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paginator: { flexDirection: 'row', gap: 6 },
  pageDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)' },
  pageDotActive: { backgroundColor: colors.sepia },
  navBtn: { padding: 10 },
  navText: { fontFamily: fonts.uiBold, fontSize: 11, letterSpacing: 2, color: colors.fog },
});

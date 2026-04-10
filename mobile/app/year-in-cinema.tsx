import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, FlatList, TouchableOpacity, Platform } from 'react-native';
import Animated, { FadeInDown, FadeIn, Layout } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { X, ChevronRight, Play } from 'lucide-react-native';

import { useFilmStore } from '@/src/stores/films';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { ReelRating } from '@/src/components/Decorative';

const { width, height } = Dimensions.get('window');
const blurhash = 'L87n_O~q00_300E1t7Rj00%#RjV@';

export default function YearInCinemaScreen() {
  const router = useRouter();
  const { logs } = useFilmStore();
  const { user } = useAuthStore();
  const [currentIndex, setCurrentIndex] = useState(0);

  const stats = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const yearLogs = logs.filter(l => {
      const d = l.watchedDate || l.createdAt;
      return d && new Date(d).getFullYear() === currentYear;
    });

    const total = yearLogs.length;
    const rated = yearLogs.filter(l => l.rating > 0);
    const avgRating = rated.length > 0 ? (rated.reduce((acc, l) => acc + l.rating, 0) / rated.length).toFixed(1) : '—';
    
    // Top Directors
    const directorsMap: Record<string, number> = {};
    yearLogs.forEach(l => {
      if (l.director) directorsMap[l.director] = (directorsMap[l.director] || 0) + 1;
    });
    const topDirectors = Object.entries(directorsMap).sort((a,b) => b[1] - a[1]).slice(0, 3);

    // Highest Rated
    const topFilms = [...rated].sort((a,b) => b.rating - a.rating).slice(0, 3);

    return { year: currentYear, total, avgRating, topDirectors, topFilms };
  }, [logs]);

  const slides = [
    { type: 'intro' },
    { type: 'total' },
    { type: 'directors' },
    { type: 'top' },
    { type: 'outro' },
  ];

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Let flatlist snap
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.back();
    }
  };

  const renderSlide = ({ item, index }: { item: any; index: number }) => {
    const isActive = currentIndex === index;

    return (
      <View style={[s.slide, { width, height }]}>
        <LinearGradient 
          colors={['#1a1510', colors.ink, '#0A0703']} 
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFillObject} 
        />
        <View style={s.grainOverlay} />

        <TouchableOpacity 
          style={StyleSheet.absoluteFillObject} 
          activeOpacity={1} 
          onPress={() => {
            // Invisible touch areas for left/right tap if wanted
          }} 
        />

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

          {isActive && item.type === 'directors' && (
            <Animated.View entering={FadeInDown.duration(800).springify()} style={s.contentBox}>
              <Text style={s.title}>The Auteurs</Text>
              <Text style={s.sub}>Your most explored directors of the year.</Text>
              <View style={s.rankingWrap}>
                {stats.topDirectors.map((d, i) => (
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
            <Animated.View entering={FadeInDown.duration(800).springify()} style={s.contentBox}>
              <Text style={s.title}>Highest Rated</Text>
              <Text style={s.sub}>The masterworks you certified perfectly.</Text>
              <View style={s.topFilmsWrap}>
                {stats.topFilms.length === 0 ? <Text style={s.sub}>No rated films this year.</Text> : null}
                {stats.topFilms.map((f, i) => (
                  <Animated.View key={f.id} entering={FadeInDown.delay(i * 200)} style={s.topFilmCard}>
                    {f.poster ? (
                      <Image source={{ uri: tmdb.poster(f.poster, 'w342') }} style={s.topPoster} />
                    ) : (
                      <View style={[s.topPoster, { backgroundColor: colors.ash }]} />
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
             <TouchableOpacity style={s.navBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}>
                <Text style={s.navText}>EXIT</Text>
             </TouchableOpacity>
             <View style={s.paginator}>
               {slides.map((_, i) => (
                 <View key={i} style={[s.pageDot, i === currentIndex && s.pageDotActive]} />
               ))}
             </View>
             {currentIndex === slides.length - 1 ? (
               <View style={{ width: 40 }} />
             ) : (
               <View style={{ width: 40 }} />
             )}
          </Animated.View>
        )}
      </View>
    );
  };

  return (
    <View style={s.container}>
      <FlatList
        data={slides}
        keyExtractor={(_, i) => `slide-${i}`}
        horizontal
        pagingEnabled
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
      <TouchableOpacity style={s.globalCloseBtn} onPress={() => router.back()}>
        <X size={24} color={colors.bone} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  globalCloseBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, right: 20, zIndex: 100, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  slide: { flex: 1 },
  grainOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(139,105,20,0.03)' },
  slideContent: { flex: 1, padding: 30, justifyContent: 'center' },
  centerBox: { alignItems: 'center' },
  contentBox: { alignItems: 'flex-start', paddingTop: 60 },
  
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

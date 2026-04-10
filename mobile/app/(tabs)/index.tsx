import { useEffect, useCallback, useState, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  Image, TouchableOpacity, Dimensions, Platform,
} from 'react-native';
import Animated, {
  FadeInDown, FadeInUp, FadeIn,
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming,
  withDelay, Easing, interpolate, Extrapolation, interpolateColor,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { useNotificationStore } from '@/src/stores/social';
import { tmdb } from '@/src/lib/tmdb';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts, effects } from '@/src/theme/theme';
import { SectionDivider, ReelRating } from '@/src/components/Decorative';
import QuickActionsFAB from '@/src/components/QuickActionsFAB';
import Buster from '@/src/components/Buster';
import { ActivityCard, FeedItem } from '@/src/components/feed/ActivityCard';

const TMDB_IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const TMDB_IMG_W780 = 'https://image.tmdb.org/t/p/w780';
const TMDB_IMG_W185 = 'https://image.tmdb.org/t/p/w185';
const { width: SCREEN_W } = Dimensions.get('window');

// ══════════════════════════════════════════════════════════════
//  FILM TICKER — Scrolling ticker at the very top (web parity)
// ══════════════════════════════════════════════════════════════
const FilmTicker = memo(function FilmTicker({ films }: { films: any[] }) {
  const translateX = useSharedValue(0);
  const ITEM_W = 200;
  const TOTAL_W = films.length * ITEM_W;

  useEffect(() => {
    if (films.length === 0) return;
    translateX.value = withRepeat(
      withTiming(-TOTAL_W, { duration: films.length * 5000, easing: Easing.linear }),
      -1, false
    );
  }, [films.length]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (films.length === 0) return null;

  // Double the items for seamless loop
  const doubled = [...films, ...films];

  return (
    <View style={s.tickerWrap}>
      <LinearGradient
        colors={['rgba(10,7,3,0.95)', 'rgba(10,7,3,0.7)', 'rgba(10,7,3,0.95)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Animated.View style={[s.tickerTrack, { width: TOTAL_W * 2 }, animStyle]}>
        {doubled.map((f, i) => (
          <View key={`tick-${i}`} style={[s.tickerItem, { width: ITEM_W }]}>
            <Text style={s.tickerDot}>✦</Text>
            <Text style={s.tickerTitle} numberOfLines={1}>
              {(f.title || '').toUpperCase()}
            </Text>
            {f.release_date && (
              <Text style={s.tickerYear}>({f.release_date.slice(0, 4)})</Text>
            )}
          </View>
        ))}
      </Animated.View>
      {/* Edge fades */}
      <LinearGradient
        colors={[colors.ink, 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[s.tickerEdge, { left: 0 }]}
      />
      <LinearGradient
        colors={['transparent', colors.ink]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[s.tickerEdge, { right: 0 }]}
      />
    </View>
  );
});

// ══════════════════════════════════════════════════════════════
//  MARQUEE BULB — Single animated theater light
// ══════════════════════════════════════════════════════════════
const MarqueeBulb = memo(function MarqueeBulb({ index }: { index: number }) {
  const glow = useSharedValue(0.25);
  useEffect(() => {
    glow.value = withDelay(
      index * 150,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.25, { duration: 700, easing: Easing.inOut(Easing.quad) })
        ),
        -1, true
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scale: interpolate(glow.value, [0.25, 1], [0.8, 1.2], Extrapolation.CLAMP) }],
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
//  MARQUEE BOARD — The hero centerpiece
// ══════════════════════════════════════════════════════════════
function MarqueeBoard({ film }: { film: any }) {
  const router = useRouter();
  const [localCount, setLocalCount] = useState(0);

  useEffect(() => {
    if (!film?.id) return;
    supabase.from('logs').select('*', { count: 'exact', head: true }).eq('film_id', film.id)
      .then(({ count }) => setLocalCount(count || 0));
  }, [film?.id]);

  const reviewText = localCount > 0
    ? `${localCount} SOCIETY REVIEW${localCount === 1 ? '' : 'S'}`
    : `${Math.round((film?.vote_count || 0) / 100) * 100}+ GLOBAL RATINGS`;

  if (!film) return (
    <View style={s.marqueeShell}>
      <MarqueeBulbRow count={12} />
      <View style={s.marqueeBoard}>
        <View style={[s.shimmer, { width: '40%', height: 8 }]} />
        <View style={[s.shimmer, { width: '70%', height: 24, marginTop: 8 }]} />
        <View style={[s.shimmer, { width: '55%', height: 12, marginTop: 8 }]} />
      </View>
      <MarqueeBulbRow count={12} />
    </View>
  );

  const posterBg = film.poster_path ? `${TMDB_IMG_W500}${film.poster_path}` : null;

  return (
    <TouchableOpacity
      style={s.marqueeShell}
      activeOpacity={0.85}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push(`/film/${film.id}`); }}
    >
      <MarqueeBulbRow count={12} />

      <View style={s.marqueeBoard}>
        {/* Background poster (blurred) */}
        {posterBg && (
          <Image
            source={{ uri: posterBg }}
            style={s.marqueeBgImg}
            blurRadius={Platform.OS === 'ios' ? 20 : 14}
          />
        )}
        {/* Deep vignette */}
        <LinearGradient
          colors={[
            'rgba(10,7,3,0.20)',
            'rgba(10,7,3,0.45)',
            'rgba(10,7,3,0.75)',
            'rgba(10,7,3,0.90)',
          ]}
          locations={[0, 0.35, 0.7, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Spotlight from above — cinematic projector beam */}
        <LinearGradient
          colors={['rgba(196,150,26,0.08)', 'transparent']}
          locations={[0, 1]}
          style={s.marqueeSpotlight}
        />

        {/* Content */}
        <View style={s.marqueeContent}>
          <Text style={s.marqueeEyebrow}>✦ MAIN FEATURE ✦</Text>

          <View style={s.marqueeTitleWrap}>
            <Text style={s.marqueeTitle} numberOfLines={3}>
              {(film.title || 'REELHOUSE').toUpperCase()}
            </Text>
          </View>

          {/* Decorative rule */}
          <View style={s.marqueeRule} />

          <View style={s.marqueeMetaRow}>
            {film.release_date && (
              <View style={s.marqueeYearPill}>
                <Text style={s.marqueeYearText}>{film.release_date.slice(0, 4)}</Text>
              </View>
            )}
            <ReelRating rating={Math.round((film.vote_average || 0) / 2)} size={13} />
          </View>
          <Text style={s.marqueeReviewCount}>{reviewText}</Text>
        </View>
      </View>

      <MarqueeBulbRow count={12} />
    </TouchableOpacity>
  );
}

// ══════════════════════════════════════════════════════════════
//  FILM STRIP ROW — Horizontal scrolling poster strip
// ══════════════════════════════════════════════════════════════
const FilmCard = memo(function FilmCard({ film, onPress }: { film: any; onPress: () => void }) {
  const posterUri = film.poster_path ? `${TMDB_IMG_W185}${film.poster_path}` : null;
  return (
    <TouchableOpacity style={s.filmCard} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.posterWrap, !posterUri && s.posterEmpty]}>
        {posterUri ? (
          <Image source={{ uri: posterUri }} style={s.posterImg} />
        ) : (
          <Text style={s.posterPlaceholder}>✦</Text>
        )}
        {/* Subtle poster overlay for depth */}
        <LinearGradient
          colors={['transparent', 'rgba(10,7,3,0.4)']}
          locations={[0.7, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
      <Text style={s.filmTitle} numberOfLines={2}>{film.title}</Text>
      {film.release_date && (
        <Text style={s.filmYear}>{film.release_date.slice(0, 4)}</Text>
      )}
    </TouchableOpacity>
  );
});

const FilmStripRow = memo(function FilmStripRow({ title, label, films }: { title: string; label: string; films: any[] }) {
  const router = useRouter();
  if (!films || films.length === 0) return null;

  return (
    <Animated.View entering={FadeInDown.duration(600).delay(200)} style={s.filmStripSection}>
      <SectionDivider label={label} />

      <View style={s.stripHeader}>
        <View style={s.stripTitleRow}>
          <View style={s.sectionBeacon} />
          <Text style={s.stripTitle}>{title}</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.stripScroll}
        decelerationRate="fast"
      >
        {films.map((f) => (
          <FilmCard
            key={`${title}-${f.id}`}
            film={f}
            onPress={() => { Haptics.selectionAsync(); router.push(`/film/${f.id}`); }}
          />
        ))}
      </ScrollView>
    </Animated.View>
  );
});

// ══════════════════════════════════════════════════════════════
//  FEATURED CRITIQUE — Hottest dispatch from the last 24h
// ══════════════════════════════════════════════════════════════
function FeaturedCritique() {
  const router = useRouter();
  const [featured, setFeatured] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: hotLogs } = await supabase
          .from('logs')
          .select('id, film_id, film_title, poster_path, rating, review, status, watched_with, pull_quote, drop_cap, editorial_header, is_autopsied, autopsy, created_at, user_id, profiles!logs_user_id_fkey(username, role, avatar_url)')
          .not('review', 'is', null)
          .neq('review', '')
          .gt('rating', 0)
          .gte('created_at', twentyFourHoursAgo)
          .order('created_at', { ascending: false })
          .limit(20);

        if (hotLogs && hotLogs.length > 0) {
          const logIds = hotLogs.map((l: any) => l.id);
          const [endorseResult, commentResult] = await Promise.all([
            supabase.from('interactions').select('target_log_id').eq('type', 'endorse_log').in('target_log_id', logIds),
            supabase.from('log_comments').select('log_id').in('log_id', logIds),
          ]);
          const engagement: Record<string, number> = {};
          (endorseResult.data || []).forEach((e: any) => { engagement[e.target_log_id] = (engagement[e.target_log_id] || 0) + 1; });
          (commentResult.data || []).forEach((c: any) => { engagement[c.log_id] = (engagement[c.log_id] || 0) + 1; });

          const sorted = [...hotLogs].sort((a: any, b: any) => {
            const engA = engagement[a.id] || 0;
            const engB = engagement[b.id] || 0;
            if (engB !== engA) return engB - engA;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          setFeatured(sorted[0]);
        } else {
          const { data: fallback } = await supabase
            .from('logs')
            .select('id, film_id, film_title, poster_path, rating, review, status, watched_with, pull_quote, drop_cap, editorial_header, is_autopsied, autopsy, created_at, user_id, profiles!logs_user_id_fkey(username, role, avatar_url)')
            .not('review', 'is', null)
            .neq('review', '')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (fallback) setFeatured(fallback);
        }
      } catch {}
    })();
  }, []);

  if (!featured) return null;

  const username = Array.isArray(featured.profiles) ? featured.profiles[0]?.username : featured.profiles?.username || 'SOCIETY';
  const role = Array.isArray(featured.profiles) ? featured.profiles[0]?.role : featured.profiles?.role;
  const avatar_url = Array.isArray(featured.profiles) ? featured.profiles[0]?.avatar_url : featured.profiles?.avatar_url;

  const activityItem: FeedItem = {
    ...featured,
    username,
    role,
    avatar_url
  };

  return (
    <Animated.View entering={FadeInDown.duration(700).delay(300)} style={s.critiqueSection}>
      <SectionDivider label="PICK OF THE WEEK" />

      <View style={[s.critiqueHeaderRow, { paddingHorizontal: 16 }]}>
        <LinearGradient colors={[colors.sepia, colors.flicker]} style={s.sectionAccentBar} />
        <View>
          <Text style={s.sectionEyebrow}>PICK OF THE WEEK</Text>
          <Text style={s.sectionTitle}>Featured Critique</Text>
        </View>
      </View>

      <View style={{ marginHorizontal: -12 }}>
         <ActivityCard item={activityItem} index={0} />
      </View>

      <TouchableOpacity style={[s.critiqueActionBtn, { backgroundColor: 'rgba(14,11,8,0.95)', marginHorizontal: 16, marginTop: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)', ...effects.shadowSurface, alignItems: 'center' }]} onPress={() => router.push('/log-modal')}>
        <Text style={[s.critiqueActionText, { color: colors.sepia }]}>
          SUBMIT A CRITIQUE
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ══════════════════════════════════════════════════════════════
//  SOCIAL PULSE — Live dispatches from the Society
// ══════════════════════════════════════════════════════════════
function SocialPulseSection() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [activities, setActivities] = useState<any[]>([]);

  const isAuteur = user?.role === 'auteur' || (user as any)?.role === 'god';
  const pulseAccent = isAuteur ? colors.bloodReel : colors.sepia;
  const pulseGradient = isAuteur ? [colors.bloodReel, 'rgba(125,31,31,0.6)'] as const : [colors.sepia, colors.flicker] as const;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('logs')
        .select('id, film_id, film_title, poster_path, rating, review, status, watched_with, pull_quote, drop_cap, is_autopsied, autopsy, created_at, user_id, profiles!logs_user_id_fkey(username, role)')
        .neq('review', '')
        .not('review', 'is', null)
        .order('created_at', { ascending: false })
        .limit(6);

      if (data) {
        setActivities(data.map((log: any) => ({
          id: log.id,
          user: log.profiles?.username || 'cinephile',
          userRole: log.profiles?.role || 'cinephile',
          film: { id: log.film_id, title: log.film_title, poster_path: log.poster_path },
          rating: log.rating,
          text: log.review,
          dropCap: log.drop_cap,
          pullQuote: log.pull_quote || '',
          watchedWith: log.watched_with,
          is_autopsied: log.is_autopsied,
          autopsy: log.autopsy,
          time: timeAgo(log.created_at),
        })));
      }
    })();
  }, []);

  if (activities.length === 0) {
    return (
      <Animated.View entering={FadeInDown.duration(600)} style={s.pulseSection}>
        <SectionDivider label="LIVE FROM THE FOYER" />
        <View style={s.pulseHeaderRow}>
          <LinearGradient colors={pulseGradient} style={[s.sectionAccentBar, isAuteur && { shadowColor: pulseAccent }]} />
          <View>
            <Text style={s.sectionEyebrow}>LIVE FROM THE FOYER</Text>
            <Text style={s.sectionTitle}>The Pulse</Text>
          </View>
        </View>
        <View style={[s.pulseEmpty, isAuteur && { borderTopColor: 'rgba(180,45,45,0.08)', borderBottomColor: 'rgba(180,45,45,0.05)', backgroundColor: 'rgba(125,31,31,0.02)' }]}>
          <Text style={[s.pulseEmptyGlyph, { color: pulseAccent }]}>◉</Text>
          <Text style={s.pulseEmptyTitle}>The screening room is dark.</Text>
          <Text style={s.pulseEmptySub}>When a member logs their first film, it will appear here.</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(600).delay(400)} style={s.pulseSection}>
      <SectionDivider label="LIVE FROM THE FOYER" />
      <View style={s.pulseHeaderRow}>
        <LinearGradient colors={pulseGradient} style={[s.sectionAccentBar, isAuteur && { shadowColor: pulseAccent }]} />
        <View>
          <Text style={s.sectionEyebrow}>LIVE FROM THE FOYER</Text>
          <Text style={s.sectionTitle}>The Pulse</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SCREEN_W * 0.82 + 14}
        decelerationRate="fast"
        contentContainerStyle={s.pulseScrollContent}
      >
        {activities.map((act) => (
          <PulseCardItem key={act.id} act={act} />
        ))}
      </ScrollView>
    </Animated.View>
  );
}

// ── Utility ──
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'JUST NOW';
  if (mins < 60) return `${mins}M AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}H AGO`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}D AGO`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

// ════════════════════════════════════════════════════════════════
//  EXTERNAL PULSE CARD
// ════════════════════════════════════════════════════════════════
function PulseCardItem({ act }: { act: any }) {
  const router = useRouter();

  const isArchivist = act.userRole === 'archivist';
  const isAuteur = act.userRole === 'auteur';
  const isPremium = isArchivist || isAuteur || act.pullQuote;
  const accentColor = isAuteur ? 'rgba(180,45,45,0.5)' : isArchivist ? 'rgba(196,150,26,0.5)' : 'rgba(139,105,20,0.3)';
  const reviewStripped = (act.text || '').replace(/<[^>]+>/g, '');
  const truncReview = reviewStripped.length > 110 ? reviewStripped.slice(0, 110) + '…' : reviewStripped;
  const posterUri = act.film?.poster_path ? `${TMDB_IMG_W185}${act.film.poster_path}` : null;

  const effectProgress = useSharedValue(0);
  const shimmerProgress = useSharedValue(0);

  useEffect(() => {
    if (isPremium) {
      effectProgress.value = withRepeat(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
      shimmerProgress.value = withRepeat(
        withTiming(1, { duration: 3000, easing: Easing.linear }),
        -1,
        false
      );
    }
  }, [isPremium]);

  const animatedBorderStyle = useAnimatedStyle(() => {
    if (!isPremium) return {};
    const colorBorder = interpolateColor(
      effectProgress.value,
      [0, 1],
      isAuteur ? ['rgba(125,31,31,0.45)', 'rgba(180,45,45,0.7)'] : ['rgba(196,150,26,0.45)', 'rgba(218,165,32,0.7)']
    );
    return { borderLeftColor: colorBorder as any };
  });

  const animatedShimmerStyle = useAnimatedStyle(() => {
    return { transform: [{ translateX: shimmerProgress.value * 400 - 200 }] };
  });

  const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

  return (
    <View style={{ width: SCREEN_W * 0.82, marginRight: 14 }}>
      <AnimatedTouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push(`/film/${act.film?.id}`)}
        style={[s.pulseCard, { borderLeftColor: accentColor, width: '100%', marginRight: 0 }, isAuteur && { backgroundColor: 'rgba(25,10,10,0.98)' }, animatedBorderStyle]}
      >
        {isAuteur && (
          <LinearGradient colors={['rgba(125,31,31,0.08)', 'transparent']} start={{x: 0, y: 0}} end={{x: 0.5, y: 0.5}} style={StyleSheet.absoluteFillObject} />
        )}
        
        {/* Animated Shimmer Line */}
        {isPremium && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, overflow: 'hidden', zIndex: 5 }}>
            <Animated.View style={[{ width: '200%', height: '100%', flexDirection: 'row' }, animatedShimmerStyle]}>
              <LinearGradient
                colors={
                  isAuteur 
                  ? ['transparent', 'rgba(180,45,45,0.8)', 'rgba(220,80,80,1)', 'rgba(180,45,45,0.8)', 'transparent']
                  : ['transparent', 'rgba(196,150,26,0.8)', 'rgba(218,165,32,1)', 'rgba(196,150,26,0.8)', 'transparent']
                }
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ width: '100%', height: '100%' }}
              />
            </Animated.View>
          </View>
        )}

        {/* ── PREMIUM EDITORIAL / ATMOSPHERIC HEADER ── */}
        {act.editorialHeader ? (
          <View style={{ width: '100%', height: 80, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.15)' }}>
            <Image source={{ uri: `${TMDB_IMG_W780}${act.editorialHeader}` }} style={{ width: '100%', height: '100%', opacity: 0.55 }} blurRadius={2} />
            <LinearGradient colors={['rgba(11,10,8,0.2)', 'transparent', 'rgba(18,14,9,0.9)']} locations={[0, 0.3, 1]} style={StyleSheet.absoluteFillObject} />
            <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(11,10,8,0.55)', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(196,150,26,0.2)' }}>
              <Text style={{ fontFamily: fonts.ui, fontSize: 8, letterSpacing: 3, color: 'rgba(218,165,32,0.85)' }}>✦ EDITORIAL</Text>
            </View>
          </View>
        ) : isPremium && posterUri ? (
          <View style={{ width: '100%', height: 50, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.1)' }}>
            <Image source={{ uri: posterUri }} style={{ width: '100%', height: '150%', top: '-25%', opacity: 0.4 }} blurRadius={10} />
            <LinearGradient colors={['rgba(11,10,8,0.3)', 'rgba(18,14,9,0.95)']} style={StyleSheet.absoluteFillObject} />
          </View>
        ) : null}

        <View style={s.pulseCardHeader}>
          <View style={s.pulseUserRow}>
            <View style={[s.pulseAvatar, { borderColor: accentColor, backgroundColor: colors.ash, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }]}>
              <Buster size={14} mood={act.rating >= 4 ? 'smiling' : 'neutral'} />
            </View>
            <View>
              <Text style={s.pulseUsername}>@{act.user}</Text>
              <Text style={s.pulseTime}>{act.time}</Text>
            </View>
            {isArchivist && <View style={s.badgeArchivist}><Text style={s.badgeText}>✦ ARCHIVIST</Text></View>}
            {isAuteur && <View style={s.badgeAuteur}><Text style={[s.badgeText, { color: colors.ink }]}>★ AUTEUR</Text></View>}
          </View>
        </View>

        <View style={s.pulseCardContent}>
          {posterUri && (
            <View style={s.pulsePosterWrap}>
              <Image source={{ uri: posterUri }} style={s.pulsePoster} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.pulseFilmTitle} numberOfLines={1}>{act.film?.title}</Text>
            {act.rating > 0 && (
              <View style={{ marginBottom: 6 }}>
                <ReelRating rating={act.rating} size={10} />
              </View>
            )}
            {act.pullQuote ? (
              <View style={s.pullQuoteWrap}>
                <Text style={s.pullQuoteText} numberOfLines={2}>« {act.pullQuote} »</Text>
              </View>
            ) : act.dropCap && truncReview ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <Text style={{ fontFamily: fonts.display, fontSize: 32, color: colors.sepia, lineHeight: 32, marginRight: 6, marginTop: -2, textShadowColor: 'rgba(139,105,20,0.2)', textShadowOffset: {width:0, height:2}, textShadowRadius: 4 }}>
                  {reviewStripped.charAt(0)}
                </Text>
                <Text style={[s.pulseReview, { flex: 1, paddingTop: 2 }]} numberOfLines={3}>
                  {truncReview.slice(1)}
                </Text>
              </View>
            ) : truncReview ? (
              <Text style={s.pulseReview} numberOfLines={3}>"{truncReview}"</Text>
            ) : null}
            {act.watchedWith && (
              <Text style={s.pulseWatchedWith}>♡ WITH <Text style={{ color: colors.bone }}>{act.watchedWith.toUpperCase()}</Text></Text>
            )}
          </View>
        </View>
      </AnimatedTouchableOpacity>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
//  MAIN SCREEN: THE LOBBY
// ════════════════════════════════════════════════════════════════
export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuthStore();
  const { fetchLogs, fetchEndorsements } = useFilmStore();
  const { setupRealtime, fetchNotifications } = useNotificationStore();
  const router = useRouter();

  const [refreshing, setRefreshing] = useState(false);
  const [trending, setTrending] = useState<any[]>([]);
  const [topRated, setTopRated] = useState<any[]>([]);

  // Dynamic top padding: safe area + nav bar height + breathing room
  const NAV_HEIGHT = 44 + 12; // navContent minHeight + blur paddingBottom
  const topPad = insets.top + NAV_HEIGHT + 12;

  const loadLobbyData = useCallback(async () => {
    try {
      const [trendRes, topRes] = await Promise.all([
        tmdb.trending('week'),
        tmdb.topRated(),
      ]);
      setTrending((trendRes?.results || []).slice(0, 10));
      setTopRated((topRes?.results || []).slice(0, 10));
    } catch {}
  }, []);

  useEffect(() => {
    loadLobbyData();
    if (isAuthenticated) {
      fetchLogs();
      fetchEndorsements();
      fetchNotifications();
      const cleanup = setupRealtime();
      return () => { if (cleanup) cleanup(); };
    }
  }, [isAuthenticated]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadLobbyData();
    if (isAuthenticated) await fetchLogs();
    setRefreshing(false);
  }, [loadLobbyData, isAuthenticated, fetchLogs]);

  const heroFilm = trending[0];

  // ── Unauthenticated: Grand Welcome ──
  if (!isAuthenticated) {
    return (
      <View style={s.container}>
        <LinearGradient
          colors={[colors.ink, 'rgba(10, 7, 3, 0.98)', colors.soot]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[s.welcomeWrap, { paddingTop: topPad }]}>
          <Animated.View entering={FadeInDown.duration(1000)} style={s.welcomeHeader}>

            <Text style={s.welcomeEyebrow}>WELCOME TO</Text>
            <Text style={s.welcomeTitle}>{'THE\nREELHOUSE\nSOCIETY'}</Text>
            <View style={s.welcomeRule} />
            <Text style={s.welcomeTagline}>{'Track every film you watch.\nDiscover cinema you\'ve never heard of.'}</Text>

            <View style={s.societyRuleRow}>
              <LinearGradient colors={['transparent', colors.sepia]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.societyRuleLine} />
              <Text style={s.societyRuleText}>✦ THE SOCIETY ✦</Text>
              <LinearGradient colors={[colors.sepia, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.societyRuleLine} />
            </View>

            <Text style={s.welcomeClimax}>Join the Society.</Text>

          </Animated.View>

          <Animated.View entering={FadeInUp.duration(800).delay(400)}>
            <TouchableOpacity style={s.ctaPrimary} onPress={() => router.push('/login')}>
              <Text style={s.ctaPrimaryText}>✦ JOIN THE SOCIETY</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ctaSecondary} onPress={() => router.push('/login')}>
              <Text style={s.ctaSecondaryText}>ENTER</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    );
  }

  // ── Authenticated: The Lobby ──
  return (
    <View style={s.container}>
      {/* Background gradient — always behind everything */}
      <LinearGradient
        colors={[colors.ink, 'rgba(10,7,3,0.98)', colors.soot]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Full-bleed hero backdrop image — positioned BELOW the nav */}
      {heroFilm?.backdrop_path && (
        <View style={[s.heroBackdropWrap, { top: topPad - 12 }]}>
          <Image
            source={{ uri: `${TMDB_IMG_W780}${heroFilm.backdrop_path}` }}
            style={s.heroBackdrop}
          />
          <LinearGradient
            colors={['rgba(10,7,3,0.1)', 'rgba(10,7,3,0.55)', colors.ink]}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Warm spotlight glow */}
          <LinearGradient
            colors={['rgba(196,150,26,0.06)', 'transparent', 'transparent']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
      )}

      <ScrollView
        contentContainerStyle={[s.scrollContent, { paddingTop: topPad }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.sepia}
            progressViewOffset={topPad}
          />
        }
      >
        {/* Film Ticker */}
        <FilmTicker films={trending} />

        {/* Hero welcome text */}
        <Animated.View entering={FadeIn.duration(800)} style={s.heroSection}>
          <Text style={s.heroEyebrow}>NOW ENTERING</Text>
          <Text style={s.heroWelcome}>The Lobby</Text>
          <View style={s.heroRuleRow}>
            <View style={s.heroRuleLine} />
            <Text style={s.heroRuleDot}>✦</Text>
            <View style={s.heroRuleLine} />
          </View>
        </Animated.View>

        {/* The Marquee Board */}
        <View style={s.marqueeWrap}>
          <MarqueeBoard film={heroFilm} />
        </View>

        {/* ─── On The Marquee (Trending) ─── */}
        <FilmStripRow
          title="On The Marquee"
          label="NOW SHOWING"
          films={trending}
        />

        {/* ─── The Pulse ─── */}
        <SocialPulseSection />

        {/* ─── Featured Critique ─── */}
        <FeaturedCritique />

        {/* ─── The Canon ─── */}
        <FilmStripRow
          title="The Canon"
          label="ESSENTIAL VIEWING"
          films={topRated}
        />

        {/* Bottom breathing room */}
        <View style={{ height: 80 }} />
      </ScrollView>

      <QuickActionsFAB />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
//  STYLES
// ════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  scrollContent: { paddingBottom: 120 },

  // ── Film Ticker ──
  tickerWrap: {
    height: 28, overflow: 'hidden', marginBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139,105,20,0.15)',
  },
  tickerTrack: { flexDirection: 'row', alignItems: 'center', height: 28 },
  tickerItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  tickerDot: { fontSize: 7, color: colors.sepia, opacity: 0.5 },
  tickerTitle: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.bone, opacity: 0.7 },
  tickerYear: { fontFamily: fonts.ui, fontSize: 8, color: colors.fog, opacity: 0.5 },
  tickerEdge: { position: 'absolute', top: 0, bottom: 0, width: 40, zIndex: 2 },

  // ── Welcome (Unauthenticated) ──
  welcomeWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  welcomeHeader: { alignItems: 'center', marginBottom: 40 },
  welcomeEyebrow: { fontFamily: fonts.body, fontSize: 10, letterSpacing: 6, color: colors.sepia, marginBottom: 8, opacity: 0.6 },
  welcomeTitle: { fontFamily: fonts.display, fontSize: 36, color: colors.parchment, textAlign: 'center', lineHeight: 46 },
  welcomeRule: { width: 60, height: 1, backgroundColor: colors.sepia, marginVertical: 16, opacity: 0.4 },
  welcomeTagline: { fontFamily: fonts.sub, fontSize: 13, color: colors.bone, textAlign: 'center', lineHeight: 22, fontStyle: 'italic' },
  welcomeClimax: { fontFamily: fonts.display, fontSize: 26, color: colors.sepia, marginTop: 12, ...effects.textGlowSepia },
  societyRuleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16, opacity: 0.35 },
  societyRuleLine: { flex: 1, height: 1 },
  societyRuleText: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 3, color: colors.sepia },
  ctaPrimary: {
    backgroundColor: 'rgba(139, 105, 20, 0.95)', borderRadius: 3, paddingVertical: 16, paddingHorizontal: 40,
    alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(242, 232, 160, 0.35)',
    ...effects.shadowSurface, ...effects.glowSepia,
  },
  ctaPrimaryText: { fontFamily: fonts.uiMedium, fontSize: 12, letterSpacing: 2.5, color: colors.ink, fontWeight: '700' },
  ctaSecondary: {
    backgroundColor: 'rgba(10, 7, 3, 0.4)',
    borderWidth: 1, borderColor: 'rgba(139, 105, 20, 0.25)', borderRadius: 3, paddingVertical: 14, paddingHorizontal: 36,
    alignItems: 'center', ...effects.shadowPrimary,
  },
  ctaSecondaryText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 4, color: colors.bone, ...effects.textGlowSepia },

  // ── Hero Section ──
  heroSection: { alignItems: 'center', paddingHorizontal: 16, marginBottom: 16 },
  heroEyebrow: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 5, color: colors.sepia, opacity: 0.5, marginBottom: 4 },
  heroWelcome: { fontFamily: fonts.display, fontSize: 28, color: colors.parchment, ...effects.textGlowSepia },
  heroRuleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  heroRuleLine: { width: 30, height: StyleSheet.hairlineWidth, backgroundColor: colors.sepia, opacity: 0.4 },
  heroRuleDot: { fontSize: 8, color: colors.sepia, opacity: 0.4 },

  heroBackdropWrap: {
    position: 'absolute', left: 0, right: 0, height: 380, zIndex: 0,
  },
  heroBackdrop: {
    width: '100%', height: '100%', resizeMode: 'cover', opacity: 0.45,
  },

  // ── Marquee Board ──
  marqueeWrap: { paddingHorizontal: 16, marginBottom: 8, zIndex: 1 },
  marqueeShell: { marginBottom: 8 },
  marqueeBulbRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginVertical: 5 },
  marqueeBulb: { width: 8, height: 8, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  marqueeBulbInner: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.sepia, ...effects.glowSepia },
  marqueeBoard: {
    borderWidth: 2, borderColor: colors.sepia, borderRadius: 6,
    paddingVertical: 32, paddingHorizontal: 24,
    overflow: 'hidden', position: 'relative',
    backgroundColor: 'rgba(10,7,3,0.65)',
    ...effects.shadowSurface,
  },
  marqueeBgImg: {
    ...StyleSheet.absoluteFillObject,
    resizeMode: 'cover', opacity: 0.45,
    transform: [{ scale: 1.15 }],
  },
  marqueeSpotlight: {
    position: 'absolute', top: 0, left: '15%', right: '15%', height: '60%',
  },
  marqueeContent: { position: 'relative', zIndex: 1, alignItems: 'center' },
  marqueeEyebrow: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 4, color: colors.flicker, marginBottom: 14, ...effects.textGlowFlicker },
  marqueeTitleWrap: { paddingHorizontal: 4 },
  marqueeTitle: {
    fontFamily: fonts.display, fontSize: 30, color: colors.parchment, textAlign: 'center', lineHeight: 38,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 4,
  },
  marqueeRule: { width: 40, height: 1, backgroundColor: colors.sepia, marginVertical: 14, opacity: 0.5 },
  marqueeMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  marqueeYearPill: {
    backgroundColor: 'rgba(58,50,40,0.6)', paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 3, borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
  },
  marqueeYearText: { fontFamily: fonts.sub, fontSize: 12, color: colors.bone },
  marqueeReviewCount: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2.5, color: colors.sepia, opacity: 0.6, marginTop: 10 },
  shimmer: { backgroundColor: 'rgba(139,105,20,0.08)', borderRadius: 2, alignSelf: 'center' },

  // ── Film Strip ──
  filmStripSection: { marginBottom: 28, marginTop: 12 },
  sectionBeacon: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.sepia, ...effects.glowSepia },
  stripHeader: { paddingHorizontal: 16, marginBottom: 14, marginTop: 4 },
  stripTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stripTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment },
  stripScroll: { paddingHorizontal: 16, gap: 14 },
  filmCard: { width: 115 },
  posterWrap: {
    width: 115, height: 172, borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(139,105,20,0.15)',
    marginBottom: 8, overflow: 'hidden',
    ...effects.shadowPrimary,
  },
  posterEmpty: { backgroundColor: colors.ash, justifyContent: 'center', alignItems: 'center' },
  posterPlaceholder: { fontFamily: fonts.display, color: colors.fog, fontSize: 20 },
  posterImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  filmTitle: { fontFamily: fonts.sub, fontSize: 10, color: colors.bone, lineHeight: 14 },
  filmYear: { fontFamily: fonts.ui, fontSize: 8, color: colors.fog, opacity: 0.6, marginTop: 1 },

  // ── Shared Section Styles ──
  sectionAccentBar: { width: 3, height: 30, borderRadius: 2 },
  sectionEyebrow: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 4, color: colors.sepia, opacity: 0.6 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment },
  sectionSubtext: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, opacity: 0.7, marginBottom: 20, paddingLeft: 16, fontStyle: 'italic', lineHeight: 18 },

  // ── Featured Critique ──
  critiqueSection: { paddingHorizontal: 16, marginTop: 8, marginBottom: 20 },
  critiqueHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  critiqueCard: {
    backgroundColor: 'rgba(14,11,8,0.95)',
    borderLeftWidth: 3, borderWidth: 1, borderColor: 'rgba(139,105,20,0.08)',
    borderRadius: 8, padding: 20, overflow: 'hidden', position: 'relative',
    ...effects.shadowSurface,
  },
  critiquePremium: { borderColor: 'rgba(139,105,20,0.15)' },
  shimmerLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, zIndex: 2 },
  critiqueQuoteMark: { position: 'absolute', top: 4, left: 6, fontFamily: fonts.display, fontSize: 64, color: colors.sepia, opacity: 0.06, lineHeight: 64 },
  critiqueInner: { flexDirection: 'row', gap: 16, marginTop: 6 },
  critiquePosterWrap: {
    width: 80, height: 120, borderRadius: 4, overflow: 'hidden', borderWidth: 1,
    backgroundColor: colors.soot, position: 'relative',
    ...effects.shadowPrimary,
  },
  critiquePoster: { width: '100%', height: '100%', resizeMode: 'cover' },
  critiquePosterGlow: { position: 'absolute', top: -10, left: '10%', right: '10%', height: 12 },
  critiqueTextWrap: { flex: 1 },
  critiqueFilmTitle: { fontFamily: fonts.sub, fontSize: 12, color: colors.sepia, letterSpacing: 0.5, marginBottom: 6, opacity: 0.9 },
  critiqueReviewText: { fontFamily: fonts.bodyItalic, fontSize: 13, color: colors.parchment, lineHeight: 21, opacity: 0.95, ...effects.textShadowDeep },
  critiqueFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12,
    paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(139,105,20,0.15)',
  },
  critiqueAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  critiqueAuthor: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.bone },
  critiqueActions: {
    flexDirection: 'row', justifyContent: 'space-around', marginTop: 18,
    paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(139,105,20,0.1)',
  },
  critiqueActionBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  critiqueActionText: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 2, color: colors.parchment },

  // ── Badges ──
  badgeArchivist: {
    backgroundColor: 'rgba(196,150,26,0.08)', borderWidth: 1, borderColor: 'rgba(196,150,26,0.25)',
    borderRadius: 2, paddingHorizontal: 5, paddingVertical: 1,
  },
  badgeAuteur: {
    backgroundColor: '#DAA520', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    borderRadius: 2, paddingHorizontal: 5, paddingVertical: 1,
  },
  badgeText: { fontFamily: fonts.ui, fontSize: 6, letterSpacing: 2, color: colors.sepia },

  // ── Social Pulse ──
  pulseSection: { marginTop: 8, marginBottom: 20 },
  pulseHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginBottom: 8 },
  pulseEmpty: {
    marginHorizontal: 16, backgroundColor: 'rgba(14,11,8,0.7)', borderLeftWidth: 2,
    borderLeftColor: 'rgba(139,105,20,0.15)', borderRadius: 8, padding: 28, alignItems: 'center',
  },
  pulseEmptyGlyph: { fontSize: 28, color: colors.sepia, opacity: 0.2, marginBottom: 12 },
  pulseEmptyTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.parchment, opacity: 0.65, marginBottom: 6 },
  pulseEmptySub: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, opacity: 0.45, fontStyle: 'italic', textAlign: 'center', lineHeight: 18 },

  pulseScrollContent: { paddingHorizontal: 16, gap: 14 },
  pulseCard: {
    width: SCREEN_W * 0.82, backgroundColor: 'rgba(14,11,8,0.95)',
    borderLeftWidth: 3, borderWidth: 1, borderColor: 'rgba(139,105,20,0.08)',
    borderRadius: 8, overflow: 'hidden', ...effects.shadowSurface,
  },
  pulseCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,105,20,0.12)',
  },
  pulseUserRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pulseAvatar: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(42,33,24,0.5)', borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  pulseAvatarText: { fontFamily: fonts.uiBold, fontSize: 10, color: colors.sepia },
  pulseUsername: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 1, color: colors.parchment },
  pulseTime: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.fog, marginTop: 1 },
  pulseCardContent: { flexDirection: 'row', gap: 12, padding: 14 },
  pulsePosterWrap: {
    width: 52, height: 78, borderRadius: 3, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(139,105,20,0.15)',
    ...effects.shadowPrimary,
  },
  pulsePoster: { width: '100%', height: '100%', resizeMode: 'cover' },
  pulseFilmTitle: { fontFamily: fonts.sub, fontSize: 14, color: colors.parchment, marginBottom: 4 },
  pulseReview: { fontFamily: fonts.body, fontSize: 11, color: colors.bone, fontStyle: 'italic', lineHeight: 17, opacity: 0.85 },
  pulseWatchedWith: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.5, color: colors.fog, marginTop: 6 },
  pullQuoteWrap: { paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: 'rgba(218,165,32,0.6)', marginBottom: 4 },
  pullQuoteText: { fontFamily: fonts.display, fontSize: 11, fontStyle: 'italic', color: '#DAA520', lineHeight: 16, ...effects.textGlowSepia },
});

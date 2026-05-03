/**
 * SocialPulseSection — Horizontal scrolling feed of recent society reviews.
 * Uses FlashList with cover-flow physics (3D rotation + scale on scroll).
 */
import { memo, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  FadeInDown, SharedValue,
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming,
  Easing, interpolate, Extrapolation, cancelAnimation, useAnimatedScrollHandler
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, fonts, effects, SEPIA_HASH } from '@/src/theme/theme';
import { SectionDivider, ReelRating } from '@/src/components/Decorative';
import { MoreHorizontal } from 'lucide-react-native';
import { FilmGrain } from '@/src/components/CinematicOverlays';
import PressableScale from '@/src/components/PressableScale';
import Buster from '@/src/components/Buster';
import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';
import type { FeaturedLog, PulseActivity } from './types';
import { timeAgo } from './types';

const TMDB_IMG_W185 = 'https://image.tmdb.org/t/p/w185';
const TMDB_IMG_W780 = 'https://image.tmdb.org/t/p/w780';
 
const MemoizedBox16 = memo(() => <View style={{ width: 16 }} />);

// ── PULSE CARD ITEM ──
export const PulseCardItem = memo(function PulseCardItem({ act, isFeatured = false }: { act: PulseActivity, isFeatured?: boolean }) {
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
  const { width } = useWindowDimensions();

  const [isMuted, setIsMuted] = useState(false);

  const handleReport = useCallback(() => {
    Alert.alert(
      "Report & Mute",
      "Hide this log and report the author to the Society?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Report", 
          style: "destructive", 
          onPress: async () => {
             Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
             setIsMuted(true);
             if (act.user_id) {
               await supabase.from('user_reports').insert({
                  reported_id: act.user_id,
                  log_id: act.id,
                  reason: 'Inappropriate content'
               });
             }
          }
        }
      ]
    );
  }, [act.id, act.user_id]);

  const museumBreathe = useSharedValue(0.4);
  useEffect(() => {
    if (isFeatured) {
       museumBreathe.value = withRepeat(
          withSequence(
             withTiming(0.8, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
             withTiming(0.4, { duration: 4000, easing: Easing.inOut(Easing.ease) })
          ), 30, true
       );
    }
    return () => cancelAnimation(museumBreathe);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFeatured]);
  const museumStyle = useAnimatedStyle(() => ({ opacity: museumBreathe.value }));

  if (isMuted) return null;

  return (
    <View style={[s.pulseCardOuter, { width: width * 0.82 }, isFeatured && { width: '100%' }]}>
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
          <PressableScale style={s.pulseUserRow} onPress={() => { router.push(`/user/${act.user}` as any); }} haptic="light">
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
          <PressableScale onPress={handleReport} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <MoreHorizontal size={16} color={colors.fog} opacity={0.4} />
          </PressableScale>
        </View>

        <View style={s.pulseCardContent}>
          {posterUri && (
            <PressableScale style={s.pulsePosterWrap} onPressIn={() => { if(posterUri) Image.prefetch(posterUri); }} onPress={() => { router.push(`/film/${act.film?.id}` as any); }}>
               <Image source={{ uri: posterUri }} style={s.pulsePoster} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={200} />
               <LinearGradient colors={['transparent', 'rgba(10,7,3,0.4)']} style={StyleSheet.absoluteFillObject} />
            </PressableScale>
          )}
          <View style={s.pulseContentFlex}>
            <PressableScale onPressIn={() => { if(posterUri) Image.prefetch(posterUri); }} onPress={() => { router.push(`/film/${act.film?.id}` as any); }} haptic="light">
              <Text style={s.pulseFilmTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{act.film?.title}</Text>
            </PressableScale>
            
            <PressableScale onPress={() => { router.push(`/log/${act.id}` as any); }} haptic="light" style={{ flexShrink: 1 }}>
              {act.rating > 0 && (
                <View style={s.pulseRatingWrap}>
                  <ReelRating rating={act.rating} size={11} />
                </View>
              )}
              {act.status === 'abandoned' && (
                <View style={s.abandonedBadge}>
                  <Text style={s.abandonedText}>
                     ABANDONED{act.abandoned_reason ? ` — ${act.abandoned_reason.toUpperCase()}` : ''}
                  </Text>
                </View>
              )}
              {act.pullQuote ? (
                <View style={s.pullQuoteWrap}>
                  <Text style={s.pullQuoteText} numberOfLines={3}>« {act.pullQuote.replace(/^[«"']+|[»"']+$/g, '').trim()} »</Text>
                </View>
              ) : act.dropCap && truncReview ? (
                <View style={s.dropCapRow}>
                  <Text style={s.dropCapLetter}>{firstUnicodeChar}</Text>
                  <Text style={[s.pulseReview, s.dropCapBody]} numberOfLines={3}>{remainingReviewText}</Text>
                </View>
              ) : truncReview ? (
                <Text style={s.pulseReview} numberOfLines={3}>&quot;{truncReview}&quot;</Text>
              ) : null}
              {act.watchedWith && (
                <Text style={s.pulseWatchedWith} numberOfLines={1} ellipsizeMode="tail">♡ WITH <Text style={s.pulseWatchedWithName}>{act.watchedWith.toUpperCase()}</Text></Text>
              )}
              {act.is_autopsied && (
                <Text style={s.pulseAutopsyTag}>✦ AUTOPSY ENCLOSED</Text>
              )}
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

// ── ANIMATED PULSE WRAPPER (Cover-Flow Physics) ──
const AnimatedPulseWrapper = memo(function AnimatedPulseWrapper({ item, index, scrollX }: { item: PulseActivity; index: number; scrollX: SharedValue<number> }) {
  const { width } = useWindowDimensions();
  const PULSE_ITEM_SIZE = width * 0.82 + 16;

  const style = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * PULSE_ITEM_SIZE,
      index * PULSE_ITEM_SIZE,
      (index + 1) * PULSE_ITEM_SIZE,
    ];
    const scale = interpolate(scrollX.value, inputRange, [0.94, 1, 0.94], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.5, 1, 0.5], Extrapolation.CLAMP);
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

// ── GHOST EMPTY STATE ──
const GhostEmptyState = () => {
  const float = useSharedValue(0);
  const [mood, setMood] = useState<'sleeping' | 'peeking'>('sleeping');
  
  useEffect(() => {
    float.value = withRepeat(
       withSequence(
         withTiming(-6, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
         withTiming(6, { duration: 2500, easing: Easing.inOut(Easing.sin) })
       ), 30, true
    );
    return () => cancelAnimation(float);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: float.value }] }));

  const handlePoke = () => {
     Haptics.impactAsync((Haptics as any).ImpactFeedbackStyle?.Heavy || 'heavy');
     setMood('peeking');
     setTimeout(() => setMood('sleeping'), 1500);
  };

  return (
      <PressableScale onPress={handlePoke} style={{ alignItems: 'center', marginBottom: 16 } as any}>
          <Animated.View style={style}>
             <Buster mood={mood} size={54} />
          </Animated.View>
      </PressableScale>
  );
};

// ── MAIN SOCIAL PULSE SECTION ──
function SocialPulseSectionInner({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const { width } = useWindowDimensions();
  const PULSE_ITEM_SIZE = width * 0.82 + 16;

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
      try {
        const { data } = await supabase
          .from('logs')
          .select('id, film_id, film_title, poster_path, rating, review, status, abandoned_reason, watched_with, pull_quote, drop_cap, editorial_header, is_autopsied, autopsy, created_at, user_id, profiles!logs_user_id_fkey(username, role)')
          .neq('review', '')
          .not('review', 'is', null)
          .order('created_at', { ascending: false })
          .limit(6);

      if (data && isMounted) {
        setActivities(data.map((log: FeaturedLog) => ({
          id: log.id,
          user_id: log.user_id,
          user: (Array.isArray(log.profiles) ? log.profiles[0]?.username : log.profiles?.username) ?? 'cinephile',
          userRole: (Array.isArray(log.profiles) ? log.profiles[0]?.role : log.profiles?.role) ?? 'cinephile',
          film: { id: log.film_id, title: log.film_title, poster_path: log.poster_path },
          rating: log.rating,
          text: log.review,
          dropCap: log.drop_cap,
          pullQuote: log.pull_quote ?? '',
          status: log.status,
          abandoned_reason: log.abandoned_reason,
          watchedWith: log.watched_with,
          is_autopsied: log.is_autopsied,
          autopsy: log.autopsy,
          editorialHeader: log.editorial_header ?? null,
          time: timeAgo(log.created_at),
        })));
      }
      } catch (error) {
        if (__DEV__) console.warn('[SocialPulse] Fetch failed:', error);
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
export const SocialPulseSection = memo(SocialPulseSectionInner);

// ── Styles ──
const s = StyleSheet.create({
  pulseSection: { marginTop: 16, marginBottom: 36 },
  pulseHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, marginBottom: 16 },
  sectionAccentBar: { width: 3, height: 32, borderRadius: 2 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 2 },
  sectionLoreSub: { fontFamily: fonts.bodyItalic, fontSize: 10, color: colors.fog, opacity: 0.5, letterSpacing: 0.3 },
  pulseEmpty: {
    marginHorizontal: 20, backgroundColor: 'rgba(18,14,9,0.85)', borderLeftWidth: 3,
    borderLeftColor: 'rgba(139,105,20,0.3)', borderRadius: 6, padding: 32, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.1)',
  },
  pulseEmptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, opacity: 0.8, marginBottom: 8 },
  pulseEmptySub: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, opacity: 0.5, fontStyle: 'italic', textAlign: 'center', lineHeight: 20 },
  flashListPulseWrap: { height: 310, width: '100%' },
  pulseScrollContent: { paddingHorizontal: 20, paddingBottom: 16 },
  pulseCardOuter: { },
  pulseCard: {
    backgroundColor: 'rgba(8,6,4,0.98)',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.5)',
    borderRadius: 4, overflow: 'hidden', minHeight: 260,
    elevation: 25, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.8, shadowRadius: 30,
  },
  pulsePremium: { borderColor: 'rgba(139,105,20,0.3)', backgroundColor: 'rgba(10,8,4,1)' },
  pulseFeaturedMuseum: {
    borderColor: 'rgba(218,165,32,0.6)', borderWidth: 1.5,
    elevation: 8, shadowColor: colors.sepia, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 15,
  },
  pulseCardAuteur: { backgroundColor: 'rgba(12,5,5,1)', borderColor: 'rgba(125,31,31,0.25)' },
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
  pulsePoster: { width: '100%', height: '100%' },
  pulseContentFlex: { flex: 1 },
  pulseFilmTitle: { fontFamily: fonts.sub, fontSize: 13, color: colors.parchment, marginBottom: 6, letterSpacing: 0.5 },
  pulseRatingWrap: { marginBottom: 8 },
  pulseReview: { fontFamily: fonts.body, fontSize: 11, color: colors.bone, fontStyle: 'italic', opacity: 0.9, paddingBottom: 6, includeFontPadding: false },
  pulseWatchedWith: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.fog, marginTop: 8 },
  pulseWatchedWithName: { color: colors.bone },
  pulseAutopsyTag: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: 'rgba(180,45,45,0.9)', marginTop: 4, marginBottom: 8 },
  pullQuoteWrap: { paddingLeft: 10, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.sepia, marginBottom: 6 },
  pullQuoteText: { fontFamily: fonts.display, fontSize: 14, fontStyle: 'italic', color: colors.sepia, paddingBottom: 6, includeFontPadding: false, lineHeight: 20 },
  dropCapRow: { flexDirection: 'row', alignItems: 'flex-start' },
  dropCapLetter: { fontFamily: fonts.display, fontSize: 36, color: colors.sepia, lineHeight: 36, marginRight: 8, marginTop: -4, ...effects.textShadowDeep },
  dropCapBody: { flex: 1, paddingTop: 2 },
  pulseReadMoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(139,105,20,0.15)' },
  pulseReadMoreRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(139,105,20,0.1)' },
  pulseReadMoreText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2.5, color: colors.sepia, opacity: 0.6 },
  editorialBanner: { width: '100%', height: 90, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.2)' },
  editorialBannerImg: { width: '100%', height: '100%', opacity: 0.6 },
  editorialBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(18,14,9,0.7)', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(196,150,26,0.3)' },
  editorialBadgeText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 4, color: 'rgba(218,165,32,0.9)' },
  premiumBanner: { width: '100%', height: 60, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.15)' },
  premiumBannerImg: { width: '100%', height: '150%', top: '-25%', opacity: 0.45 },
  badgeArchivist: { backgroundColor: 'rgba(196,150,26,0.1)', borderWidth: 1, borderColor: 'rgba(196,150,26,0.3)', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  badgeAuteur: { backgroundColor: '#DAA520', borderWidth: 1, borderColor: 'rgba(139,105,20,0.4)', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2.5, color: colors.sepia },
  abandonedBadge: {
    marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(125,31,31,0.1)', paddingHorizontal: 6, paddingVertical: 4,
    borderRadius: 4, borderWidth: 1, borderColor: 'rgba(125,31,31,0.3)', alignSelf: 'flex-start',
  },
  abandonedText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.bloodReel },
});


MemoizedBox16.displayName = 'MemoizedBox16';
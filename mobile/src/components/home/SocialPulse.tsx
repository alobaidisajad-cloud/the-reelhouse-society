/**
 * SocialPulseSection — Horizontal scrolling feed of recent society reviews.
 * Uses FlashList with cover-flow physics (3D rotation + scale on scroll).
 */
import { memo, useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  FadeInDown, SharedValue,
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming,
  Easing, interpolate, Extrapolation, cancelAnimation, useAnimatedScrollHandler
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { colors, fonts } from '@/src/theme/theme';
import { SectionDivider } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import Buster from '@/src/components/Buster';
import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';
import type { FeaturedLog, PulseActivity } from './types';
import { timeAgo } from './types';
import { isAuteurPlusTier } from '@/src/utils/tier';

// ── PULSE CARD ITEM (consolidated from standalone PulseCardItem.tsx) ──
import { PulseCardItem } from './PulseCardItem';
 
const MemoizedBox16 = memo(() => <View style={{ width: 16 }} />);
export { PulseCardItem };

// ── ANIMATED PULSE WRAPPER (Cover-Flow Physics) ──
const AnimatedPulseWrapper = memo(function AnimatedPulseWrapper({ item, index, scrollX, itemSize, cardWidth }: { item: PulseActivity; index: number; scrollX: SharedValue<number>; itemSize: number; cardWidth: number }) {
  const style = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * itemSize,
      index * itemSize,
      (index + 1) * itemSize,
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
      <PulseCardItem act={item} cardWidth={cardWidth} />
    </Animated.View>
  );
});

// ── GHOST EMPTY STATE ──
const GhostEmptyState = memo(() => {
  const float = useSharedValue(0);
  const [mood, setMood] = useState<'sleeping' | 'peeking'>('sleeping');
  const pokeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  useEffect(() => {
    float.value = withRepeat(
       withSequence(
         withTiming(-6, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
         withTiming(6, { duration: 2500, easing: Easing.inOut(Easing.sin) })
       ), 30, true
    );
    return () => {
      cancelAnimation(float);
      if (pokeTimer.current) clearTimeout(pokeTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: float.value }] }));

  const handlePoke = () => {
     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
     setMood('peeking');
     if (pokeTimer.current) clearTimeout(pokeTimer.current);
     pokeTimer.current = setTimeout(() => setMood('sleeping'), 1500);
  };

  return (
      <PressableScale onPress={handlePoke} style={{ alignItems: 'center', marginBottom: 16 } as any}>
          <Animated.View style={style}>
             <Buster mood={mood} size={54} />
          </Animated.View>
      </PressableScale>
  );
});
GhostEmptyState.displayName = 'GhostEmptyState';

// ── MAIN SOCIAL PULSE SECTION ──
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);
const pulseKeyExtractor = (item: PulseActivity) => item.id;

function SocialPulseSectionInner({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const { width } = useWindowDimensions();
  const PULSE_ITEM_SIZE = width * 0.82 + 16;

  const user = useAuthStore(s => s.user);

  const isAuteur = isAuteurPlusTier(user);
  const pulseAccent = isAuteur ? colors.bloodReel : colors.sepia;
  const pulseGradient = isAuteur ? [colors.bloodReel, 'rgba(125,31,31,0.6)'] as const : [colors.sepia, colors.flicker] as const;

  const scrollX = useSharedValue(0);
  const onScrollPulse = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['socialPulse', refreshTrigger],
    queryFn: async () => {
        const { data, error } = await supabase
          .from('logs')
          .select('id, film_id, film_title, poster_path, rating, review, status, abandoned_reason, watched_with, pull_quote, drop_cap, editorial_header, is_autopsied, autopsy, created_at, user_id, profiles!logs_user_id_fkey(username, role)')
          .neq('review', '')
          .not('review', 'is', null)
          .order('created_at', { ascending: false })
          .limit(6);

        if (error) {
          if (__DEV__) console.warn('[SocialPulse] Fetch failed:', error);
          return [];
        }

        if (!data) return [];
        
        return data.map((log: FeaturedLog) => ({
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
        }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const renderItem = useCallback(({ item, index }: { item: PulseActivity, index: number }) => (
    <AnimatedPulseWrapper item={item} index={index} scrollX={scrollX} itemSize={PULSE_ITEM_SIZE} cardWidth={width * 0.82} />
  ), [scrollX, PULSE_ITEM_SIZE, width]);

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
        <AnimatedFlashList
            horizontal
            data={activities}
            keyExtractor={pulseKeyExtractor as any}
            renderItem={renderItem as any}
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
  flashListPulseWrap: { height: 390, width: '100%' },
  pulseScrollContent: { paddingHorizontal: 20, paddingBottom: 16 },
});


MemoizedBox16.displayName = 'MemoizedBox16';
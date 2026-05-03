/**
 * FeaturedCritique — The lead story/featured log section on the Lobby.
 */
import { memo, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeInDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  Easing, interpolate, cancelAnimation
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { colors, fonts, effects } from '@/src/theme/theme';
import { SectionDivider } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import { supabase } from '@/src/lib/supabase';
import type { FeaturedLog, PulseActivity } from './types';
import { timeAgo } from './types';
import { PulseCardItem } from './SocialPulse';

// ── SHIMMER RULE ──
 
const ShimmerRule = memo(() => {
    const shimmer = useSharedValue(-1);
    useEffect(() => {
       shimmer.value = withRepeat(
         withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
         -1, false
       );
       return () => cancelAnimation(shimmer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const shimmerStyle = useAnimatedStyle(() => ({
       transform: [{ translateX: interpolate(shimmer.value, [-1, 1], [-100, 300]) }]
    }));
    return (
       <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1.5, backgroundColor: 'rgba(139,105,20,0.1)', overflow: 'hidden' }}>
          <Animated.View style={[{ width: 60, height: '100%' }, shimmerStyle]}>
             <LinearGradient colors={['transparent', 'rgba(218,165,32,0.8)', 'transparent']} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFillObject} />
          </Animated.View>
       </View>
    );
});

// ── FEATURED CRITIQUE ──
function FeaturedCritiqueInner({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const router = useRouter();
  const [featured, setFeatured] = useState<FeaturedLog | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data: featuredLog } = await supabase
          .rpc('get_featured_critique')
          .select('id, film_id, film_title, poster_path, rating, review, status, abandoned_reason, watched_with, pull_quote, drop_cap, editorial_header, is_autopsied, autopsy, created_at, user_id, profiles!logs_user_id_fkey(username, role, avatar_url)')
          .single();

        if (featuredLog && isMounted) setFeatured(featuredLog as FeaturedLog);
      } catch (e: unknown) {
        if (__DEV__) console.error('[FeaturedCritique] Sync error:', e);
      }
    })();
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  if (!featured) return null;

  const username = (Array.isArray(featured.profiles) ? featured.profiles[0]?.username : featured.profiles?.username) ?? 'SOCIETY';
  const role = (Array.isArray(featured.profiles) ? featured.profiles[0]?.role : featured.profiles?.role) ?? 'cinephile';

  const pulseItem: PulseActivity = {
      id: featured.id,
      user: username,
      userRole: role,
      film: { id: featured.film_id, title: featured.film_title, poster_path: featured.poster_path },
      rating: featured.rating,
      text: featured.review,
      dropCap: featured.drop_cap,
      pullQuote: featured.pull_quote ?? '',
      status: featured.status,
      abandoned_reason: featured.abandoned_reason,
      watchedWith: featured.watched_with,
      is_autopsied: featured.is_autopsied,
      autopsy: featured.autopsy,
      editorialHeader: featured.editorial_header,
      time: timeAgo(featured.created_at)
  };

  return (
    <Animated.View entering={FadeInDown.duration(700).delay(300)} style={s.critiqueSection}>
      <SectionDivider label="THE LEAD STORY" />

      <View style={s.critiqueHeaderRow}>
        <LinearGradient colors={[colors.sepia, colors.flicker]} style={s.sectionAccentBar} />
        <View>
          <Text style={s.sectionTitle}>Featured Critique</Text>
          <Text style={s.sectionLoreSub}>Handpicked by the Editorial Tribunal</Text>
        </View>
      </View>

      <View style={s.critiqueCardWrap}>
         <PulseCardItem act={pulseItem} isFeatured={true} />
      </View>

      <PressableScale style={s.critiqueSubmitBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); router.push('/log-modal' as any); }}>
        <Text style={s.critiqueSubmitText}>✦ FILE A DISPATCH ✦</Text>
        <ShimmerRule />
      </PressableScale>
    </Animated.View>
  );
}

export const FeaturedCritique = memo(FeaturedCritiqueInner);

const s = StyleSheet.create({
  critiqueSection: { paddingHorizontal: 20, marginTop: 16, marginBottom: 32 },
  critiqueHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  sectionAccentBar: { width: 3, height: 32, borderRadius: 2 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 2 },
  sectionLoreSub: { fontFamily: fonts.bodyItalic, fontSize: 10, color: colors.fog, opacity: 0.5, letterSpacing: 0.3 },
  critiqueCardWrap: { marginHorizontal: 0 },
  critiqueSubmitBtn: {
    backgroundColor: 'rgba(18,14,9,0.95)', marginTop: 12, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8,
    overflow: 'hidden', ...effects.shadowSurface,
  },
  critiqueSubmitText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 3, color: colors.sepia },
});


ShimmerRule.displayName = 'ShimmerRule';
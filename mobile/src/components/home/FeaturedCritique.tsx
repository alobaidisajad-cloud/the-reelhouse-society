/**
 * FeaturedCritique — The lead story/featured log section on the Lobby.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { memo, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  FadeInDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Easing, interpolate, cancelAnimation
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { colors, fonts, effects } from '@/src/theme/theme';
import { SectionDivider } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import { supabase } from '@/src/lib/supabase';
import { filterContentByBlocks } from '@/src/utils/filterContentByBlocks';
import type { FeaturedLog, PulseActivity } from './types';
import { timeAgo } from './types';
import { PulseCardItem } from './PulseCardItem';
import { ShimmerRule } from './VelvetRopeCTA';

// ── FEATURED CRITIQUE ──
function FeaturedCritiqueInner({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const router = useRouter();
  const { data: featured } = useQuery({
    queryKey: ['featuredCritique', refreshTrigger],
    queryFn: async () => {
        const { data: featuredLog, error } = await supabase
          .rpc('get_featured_critique')
          .select('id, film_id, film_title, poster_path, rating, review, status, abandoned_reason, watched_with, pull_quote, drop_cap, editorial_header, is_autopsied, autopsy, created_at, user_id, profiles!logs_user_id_fkey(username, role, avatar_url)')
          .single();

        if (error) {
          if (__DEV__) console.error('[FeaturedCritique] Sync error:', error);
          return null;
        }
        const log = featuredLog as FeaturedLog;
        // Don't surface a featured critique authored by a blocked/muted user (HOOK-8).
        if (log?.user_id && filterContentByBlocks([log], (l) => l.user_id ?? '').length === 0) {
          return null;
        }
        return log;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!featured) return null;

  const username = (Array.isArray(featured.profiles) ? featured.profiles[0]?.username : featured.profiles?.username) ?? 'SOCIETY';
  const role = (Array.isArray(featured.profiles) ? featured.profiles[0]?.role : featured.profiles?.role) ?? 'cinephile';

  const pulseItem: PulseActivity = {
      id: featured.id,
      user_id: featured.user_id,
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

      <PressableScale style={s.critiqueSubmitBtn} onPress={() => { TactileEngine.destroy(); (router.push as any)('/log-modal' as any); }}>
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

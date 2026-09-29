/**
 * FeaturedCritique — The lead story/featured log section on the Lobby.
 * The Lobby reads it (lobbyReads.ts) and hands it here: this only draws.
 */
import { memo, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';
import { colors, fonts, effects } from '@/src/theme/theme';
import { SectionDivider } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import type { FeaturedLog, PulseActivity } from './types';
import { timeAgo } from './types';
import { PulseCardItem } from './PulseCardItem';
import { ShimmerRule } from './VelvetRopeCTA';
import { EDGE_LIT } from '@/src/theme/light';

// ── FEATURED CRITIQUE ──
function FeaturedCritiqueInner({ featured }: { featured: FeaturedLog | null | undefined }) {
  const router = useRouter();
  // Report-and-mute folds the Lead Story away immediately.
  const [mutedId, setMutedId] = useState<string | null>(null);
  const handleMute = useCallback((id: string) => setMutedId(id), []);

  if (!featured || featured.id === mutedId) return null;

  const username = (Array.isArray(featured.profiles) ? featured.profiles[0]?.username : featured.profiles?.username) ?? 'SOCIETY';
  const role = (Array.isArray(featured.profiles) ? featured.profiles[0]?.role : featured.profiles?.role) ?? 'cinephile';
  const avatarUrl = (Array.isArray(featured.profiles) ? featured.profiles[0]?.avatar_url : featured.profiles?.avatar_url) ?? null;

  const pulseItem: PulseActivity = {
      id: featured.id,
      user_id: featured.user_id,
      user: username,
      userRole: role,
      userAvatar: avatarUrl,
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
      is_spoiler: featured.is_spoiler ?? false,
      editorialHeader: featured.editorial_header,
      time: timeAgo(featured.created_at)
  };

  return (
    <Animated.View entering={FadeInDown.duration(700).delay(300)} style={s.critiqueSection}>
      <SectionDivider label="THE LEAD STORY" />

      <View style={s.critiqueHeaderRow}>
        <LinearGradient colors={[colors.sepia, colors.flicker]} style={s.sectionAccentBar} />
        {/* The rest of the row, so the line under the title wraps at large
            type on a narrow phone instead of running off it. */}
        <View style={s.critiqueHeaderText}>
          <Text style={s.sectionTitle} accessibilityRole="header">Featured Critique</Text>
          <Text style={s.sectionLoreSub}>Handpicked by the Editorial Tribunal</Text>
        </View>
      </View>

      <View style={s.critiqueCardWrap}>
         <PulseCardItem act={pulseItem} isFeatured={true} onMute={handleMute} />
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
  // Rhythm: 16 + the next divider's 20 = the page-wide 36px section gap.
  critiqueSection: { paddingHorizontal: 20, marginBottom: 16 },
  critiqueHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  sectionAccentBar: { width: 3, height: 32, borderRadius: 2 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 2 },
  // 0.5 was 2.44:1 on ink; 0.8 gave 4.59:1. See the note in SocialPulse — this
  // style is duplicated verbatim across three Lobby sections.
  // Solid fogQuiet now: a word no longer borrows its contrast from the ground behind it.
  sectionLoreSub: { fontFamily: fonts.bodyItalic, fontSize: 10, color: colors.fogQuiet, letterSpacing: 0.3 },
  critiqueHeaderText: { flex: 1 },
  critiqueCardWrap: { marginHorizontal: 0 },
  critiqueSubmitBtn: { ...EDGE_LIT,
    backgroundColor: colors.soot, marginTop: 12, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.3)',
    alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8,
    overflow: 'hidden', ...effects.shadowSurface, ...effects.flat,
  },
  critiqueSubmitText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 3, color: colors.sepia },
});


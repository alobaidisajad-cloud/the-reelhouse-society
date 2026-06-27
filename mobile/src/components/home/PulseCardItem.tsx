import React, { memo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, Platform } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming,
  Easing, cancelAnimation
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { nav } from '@/src/utils/typedRouter';
import { useIsFocused } from '@react-navigation/native';
import TactileEngine from '@/src/utils/TactileEngine';
import { colors, fonts, effects, SEPIA_HASH } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import { MoreHorizontal } from 'lucide-react-native';
import { FilmGrain } from '@/src/components/CinematicOverlays';
import PressableScale from '@/src/components/PressableScale';
import SpoilerVeil from '@/src/components/SpoilerVeil';
import Buster from '@/src/components/Buster';
import { useReportUser } from '@/src/hooks/useReportUser';
import type { PulseActivity } from './types';
import { isAuteurPlusTier, isArchivistPlusTier } from '@/src/utils/tier';

const TMDB_IMG_W185 = 'https://image.tmdb.org/t/p/w185';
const TMDB_IMG_W780 = 'https://image.tmdb.org/t/p/w780';

const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

const EditorialBanner = memo(function EditorialBanner({ uri }: { uri: string }) {
  return (
    <View style={s.editorialBanner}>
      <Image source={{ uri }} style={s.editorialBannerImg} blurRadius={2} cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={300} />
      <LinearGradient colors={['rgba(11,10,8,0.2)', 'transparent', 'rgba(18,14,9,0.95)']} locations={[0, 0.3, 1]} style={StyleSheet.absoluteFillObject} />
      <View style={s.editorialBadge}>
        <Text style={s.editorialBadgeText}>✦ EDITORIAL</Text>
      </View>
    </View>
  );
});

const PremiumBanner = memo(function PremiumBanner({ uri }: { uri: string }) {
  return (
    <View style={s.premiumBanner}>
      <Image source={{ uri }} style={s.premiumBannerImg} blurRadius={12} cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={300} />
      <LinearGradient colors={['rgba(11,10,8,0.4)', 'rgba(18,14,9,0.98)']} style={StyleSheet.absoluteFillObject} />
    </View>
  );
});

const MuseumBreather = memo(function MuseumBreather() {
  const isFocused = useIsFocused();
  const museumBreathe = useSharedValue(0.4);

  useEffect(() => {
    if (isFocused) {
       museumBreathe.value = withRepeat(
          withSequence(
             withTiming(0.8, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
             withTiming(0.4, { duration: 4000, easing: Easing.inOut(Easing.ease) })
          ), -1, true
       );
    } else {
       cancelAnimation(museumBreathe);
    }
    return () => cancelAnimation(museumBreathe);
  }, [isFocused, museumBreathe]);

  const museumStyle = useAnimatedStyle(() => ({ opacity: museumBreathe.value }));

  return (
     <Animated.View style={[StyleSheet.absoluteFillObject, { zIndex: -1 }, museumStyle]}>
        <View style={{ flex: 1, borderWidth: 1.5, borderColor: colors.sepia, borderRadius: 2, ...effects.glowSepia }} />
     </Animated.View>
  );
});

export const PulseCardItem = memo(function PulseCardItem({ act, isFeatured = false, cardWidth, onMute }: { act: PulseActivity, isFeatured?: boolean, cardWidth?: number, onMute?: (id: string) => void }) {

  const reportMutation = useReportUser();

  const isArchivist = isArchivistPlusTier(act.userRole) && !isAuteurPlusTier(act.userRole);
  const isAuteur = isAuteurPlusTier(act.userRole);
  const isPremium = isArchivist || isAuteur || act.pullQuote;
  const accentColor = isAuteur ? 'rgba(180,45,45,0.7)' : isArchivist ? 'rgba(184,137,26,0.7)' : 'rgba(184,137,26,0.3)';
  const reviewStripped = (act.text ?? '').replace(/<(p|div|br)[^>]*>/gi, ' ').replace(/<[^>]+>/g, '').trim();
  const truncReview = reviewStripped.length > 100 ? reviewStripped.slice(0, 100) + '…' : reviewStripped;
  const cleanForDropCap = reviewStripped.replace(/^[^a-zA-Z0-9]+/g, '');
  const firstUnicodeChar = cleanForDropCap ? Array.from(cleanForDropCap)[0] : '';
  const remainingReviewText = truncReview.slice(reviewStripped.indexOf(firstUnicodeChar) + firstUnicodeChar.length).trim();
  const posterUri = act.film?.poster_path ? `${TMDB_IMG_W185}${act.film.poster_path}` : null;

  const handleReport = useCallback(() => {
    if (reportMutation.isPending) return;
    Alert.alert(
      "Report & Mute",
      "Hide this log and report the author to the Society?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Report", 
          style: "destructive", 
          onPress: () => {
             TactileEngine.selection();
             onMute?.(act.id);
             if (act.user_id) {
               reportMutation.mutate({ reported_id: act.user_id, log_id: act.id });
             }
          }
        }
      ]
    );
  }, [act.id, act.user_id, reportMutation, onMute]);

  return (
    <View style={[s.pulseCardOuter, cardWidth ? { width: cardWidth } : { width: '82%' }, isFeatured && { width: '100%' }]}>
      <View style={[s.pulseCard, isPremium && s.pulsePremium, isAuteur && s.pulseCardAuteur, isFeatured && s.pulseFeaturedMuseum]}>
        
        {isFeatured && <MuseumBreather />}
        
        {act.editorialHeader ? (
          <EditorialBanner uri={`${TMDB_IMG_W780}${act.editorialHeader}`} />
        ) : isPremium && posterUri ? (
          <PremiumBanner uri={posterUri} />
        ) : null}

        <View style={s.pulseCardHeader}>
          <PressableScale style={s.pulseUserRow} onPress={() => { nav.push(`/user/${act.user}`); }} haptic="light" accessibilityLabel={`View profile of @${act.user}`}>
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
          <PressableScale onPress={handleReport} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}} accessibilityLabel="Report and mute">
            <MoreHorizontal size={16} color={colors.fog} opacity={0.4} />
          </PressableScale>
        </View>

        <PressableScale onPress={() => { nav.push(`/log/${act.id}`); }} haptic="light" style={s.pulseCardContentPressable} accessibilityLabel={`Open full log for ${act.film?.title}`}>
          <View style={s.pulseCardContent}>
             {posterUri && (
              <PressableScale style={s.pulsePosterWrap} onPressIn={() => { if(posterUri) Image.prefetch(posterUri).catch(() => {}); }} onPress={() => { if(act.film?.id) nav.push(`/film/${act.film.id}`); }} accessibilityLabel={`${act.film?.title} poster`}>
                 <AnimatedExpoImage {...({ sharedTransitionTag: `poster-${act.id}-${act.film?.id}` } as Record<string, string>)} source={{ uri: posterUri }} style={s.pulsePoster} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={200} />
                 <LinearGradient colors={['transparent', 'rgba(10,7,3,0.4)']} style={StyleSheet.absoluteFillObject} />
              </PressableScale>
            )}
            <View style={s.pulseContentFlex}>
              <PressableScale onPressIn={() => { if(posterUri) Image.prefetch(posterUri).catch(() => {}); }} onPress={() => { if(act.film?.id) nav.push(`/film/${act.film.id}`); }} haptic="light" accessibilityLabel={`Go to ${act.film?.title}`}>
                <Text style={s.pulseFilmTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{act.film?.title}</Text>
              </PressableScale>
              
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
              {/* COMP-SPOILER-1: veil flagged critiques on the Pulse card. */}
              <SpoilerVeil isSpoiler={act.is_spoiler} revealKey={act.id} compact>
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
              </SpoilerVeil>
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
            </View>
          </View>
        </PressableScale>
        <FilmGrain />
      </View>
    </View>
  );
}, (prev, next) => prev.act.id === next.act.id && prev.isFeatured === next.isFeatured);

const s = StyleSheet.create({
  pulseCardOuter: { },
  pulseCardContentPressable: { },
  pulseCard: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.5)',
    borderRadius: 4, overflow: 'hidden', minHeight: 260,
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.8, shadowRadius: 30,
    ...Platform.select({ android: { elevation: 0 } })
  },
  pulsePremium: { borderColor: 'rgba(184,137,26,0.3)', backgroundColor: 'rgba(10,8,4,1)' },
  pulseFeaturedMuseum: {
    borderColor: 'rgba(218,165,32,0.6)', borderWidth: 1.5,
    shadowColor: colors.sepia, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 15,
    ...Platform.select({ android: { elevation: 0 } })
  },
  pulseCardAuteur: { backgroundColor: 'rgba(12,5,5,1)', borderColor: 'rgba(125,31,31,0.25)' },
  pulseCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.15)',
  },
  pulseUserRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pulseAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.ash, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pulseUserTextWrap: { flex: 1, justifyContent: 'center' },
  pulseUsername: { fontFamily: fonts.uiMedium, fontSize: 11, letterSpacing: 1.5, color: colors.parchment, includeFontPadding: false },
  pulseTime: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog, marginTop: 2, includeFontPadding: false },
  pulseCardContent: { flexDirection: 'row', gap: 16, padding: 16, paddingBottom: 24 },
  pulsePosterWrap: {
    width: 60, height: 90, borderRadius: 4, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.25)', ...effects.shadowPrimary,
  },
  pulsePoster: { width: '100%', height: '100%' },
  pulseContentFlex: { flex: 1 },
  pulseFilmTitle: { fontFamily: fonts.sub, fontSize: 13, color: colors.parchment, marginBottom: 6, letterSpacing: 0.5, includeFontPadding: false },
  pulseRatingWrap: { marginBottom: 8 },
  pulseReview: { fontFamily: fonts.body, fontSize: 11, color: colors.bone, fontStyle: 'italic', opacity: 0.9, paddingBottom: 6, includeFontPadding: false },
  pulseWatchedWith: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.fog, marginTop: 8, includeFontPadding: false },
  pulseWatchedWithName: { color: colors.bone, includeFontPadding: false },
  pulseAutopsyTag: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: 'rgba(180,45,45,0.9)', marginTop: 4, marginBottom: 8, includeFontPadding: false },
  pullQuoteWrap: { paddingLeft: 10, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.sepia, marginBottom: 6 },
  pullQuoteText: { fontFamily: fonts.display, fontSize: 14, fontStyle: 'italic', color: colors.sepia, paddingBottom: 6, includeFontPadding: false, lineHeight: 20 },
  dropCapRow: { flexDirection: 'row', alignItems: 'flex-start' },
  dropCapLetter: { fontFamily: fonts.display, fontSize: 36, color: colors.sepia, lineHeight: 36, marginRight: 8, marginTop: -4, includeFontPadding: false, ...effects.textShadowDeep },
  dropCapBody: { flex: 1, paddingTop: 2 },
  pulseReadMoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(184,137,26,0.15)' },
  pulseReadMoreRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(184,137,26,0.1)' },
  pulseReadMoreText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2.5, color: colors.sepia, opacity: 0.6, includeFontPadding: false },
  editorialBanner: { width: '100%', height: 90, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.2)' },
  editorialBannerImg: { width: '100%', height: '100%', opacity: 0.6 },
  editorialBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(18,14,9,0.7)', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(184,137,26,0.3)' },
  editorialBadgeText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 4, color: 'rgba(218,165,32,0.9)', includeFontPadding: false },
  premiumBanner: { width: '100%', height: 60, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.15)' },
  premiumBannerImg: { width: '100%', height: '150%', top: '-25%', opacity: 0.45 },
  badgeArchivist: { backgroundColor: 'rgba(184,137,26,0.1)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.3)', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  badgeAuteur: { backgroundColor: '#DAA520', borderWidth: 1, borderColor: 'rgba(184,137,26,0.4)', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2.5, color: colors.sepia, includeFontPadding: false },
  abandonedBadge: {
    marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(125,31,31,0.1)', paddingHorizontal: 6, paddingVertical: 4,
    borderRadius: 4, borderWidth: 1, borderColor: 'rgba(125,31,31,0.3)', alignSelf: 'flex-start',
  },
  abandonedText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.bloodReel, includeFontPadding: false },
});

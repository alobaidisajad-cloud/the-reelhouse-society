import React, { useCallback, useState, useMemo } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ImageBackground } from 'react-native';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, interpolateColor } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useFilmStore } from '@/src/stores/films';
import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';
import ShareToLoungeModal from '@/src/components/ShareToLoungeModal';
import { colors, fonts, effects } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import reelToast from '@/src/utils/reelToast';

import { Heart, MessageSquare, Edit3, Bookmark, MessageCircle } from 'lucide-react-native';

const TMDB_IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const TMDB_IMG_W185 = 'https://image.tmdb.org/t/p/w185';
const AnimatedView = Animated.createAnimatedComponent(View);

export interface FeedItem {
  id: string;
  username: string;
  avatar_url?: string;
  role?: string;
  film_title: string;
  film_id: number;
  poster_path: string | null;
  rating: number;
  review: string | null;
  status: string;
  created_at: string;
  year?: number;
  editorial_header?: string | null;
  pull_quote?: string | null;
  drop_cap?: boolean;
  watched_with?: string | null;
  is_autopsied?: boolean;
  autopsy?: any;
}

export function ActivityCard({ item, index }: { item: FeedItem; index: number }) {
  const router = useRouter();
  const posterUri = item.poster_path ? `${TMDB_IMG_W185}${item.poster_path}` : null;
  const isArchivist = item.role === 'archivist';
  const isAuteur = item.role === 'auteur';
  const isPremium = isArchivist || isAuteur || item.editorial_header || item.pull_quote;
  
  const backdropUri = item.editorial_header ? `${TMDB_IMG_W500}${item.editorial_header}` : item.poster_path ? `${TMDB_IMG_W500}${item.poster_path}` : null;
  
  const [autopsyOpen, setAutopsyOpen] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  
  // ── Animated Premium Effects ──
  const effectProgress = useSharedValue(0);
  const shimmerProgress = useSharedValue(0);

  React.useEffect(() => {
    if (isPremium || isAuteur) {
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
  }, [isPremium, isAuteur]);

  const animatedBorderStyle = useAnimatedStyle(() => {
    if (!isPremium && !isAuteur) return {};
    const colorBorder = interpolateColor(
      effectProgress.value,
      [0, 1],
      isAuteur ? ['rgba(125,31,31,0.45)', 'rgba(180,45,45,0.7)'] : ['rgba(196,150,26,0.45)', 'rgba(218,165,32,0.7)']
    );
    return {
      borderLeftColor: colorBorder,
    };
  });

  const animatedShimmerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: shimmerProgress.value * 400 - 200 }],
    };
  });

  // ── Store hooks ──
  const { hasEndorsed, toggleEndorse, _watchlistIndex, addToWatchlist, removeFromWatchlist } = useFilmStore();
  const { user: currentUser } = useAuthStore();

  // ── Derived state ──
  const endorsed = hasEndorsed(item.id);
  const timeAgo = getTimeAgo(item.created_at);
  const isOwner = currentUser?.username === item.username;
  const isLoungeEligible = currentUser && ['archivist', 'auteur'].includes((currentUser as any).role);
  const filmSaved = !!_watchlistIndex[item.film_id];

  // ── CERTIFY (Endorse) ──
  const handleCertify = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleEndorse(item.id);
  }, [item.id, toggleEndorse]);

  // ── CRITIQUE (Navigate to log detail for comments) ──
  const handleCritique = useCallback(() => {
    Haptics.selectionAsync();
    router.push(`/log/${item.id}`);
  }, [item.id, router]);

  // ── SAVE / EDIT ──
  const handleSaveOrEdit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isOwner) {
      // Owner can edit their log
      router.push({
        pathname: '/log-modal',
        params: {
          filmId: String(item.film_id),
          editLogId: item.id,
          filmTitle: item.film_title,
          posterPath: item.poster_path || '',
        },
      });
    } else {
      // Non-owner: toggle watchlist save
      if (filmSaved) {
        removeFromWatchlist(item.film_id);
        reelToast.success('Removed from watchlist');
      } else {
        addToWatchlist({
          id: item.film_id,
          title: item.film_title,
          poster_path: item.poster_path,
          release_date: item.year ? `${item.year}-01-01` : undefined,
        });
        reelToast.success('Saved to watchlist ✦');
      }
    }
  }, [isOwner, item, filmSaved, addToWatchlist, removeFromWatchlist, router]);

  // ── LOUNGE (Share to Lounge) ──
  const handleLounge = useCallback(() => {
    if (!isLoungeEligible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      reelToast.error('Archivist or Auteur tier required to share to The Lounge.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowShareModal(true);
  }, [isLoungeEligible]);

  return (
    <AnimatedView entering={FadeInUp.duration(500).delay(Math.min(index * 60, 300))} style={[s.card, isPremium && s.cardPremium, isAuteur && s.cardAuteur, effects.shadowPrimary, animatedBorderStyle]}>
      
      {/* ── Top Shimmer Line for Premium / Auteur ── */}
      {(isPremium || isAuteur) && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, overflow: 'hidden', zIndex: 5 }}>
          <AnimatedView style={[{ width: '200%', height: '100%', flexDirection: 'row' }, animatedShimmerStyle]}>
            <LinearGradient
              colors={[
                'transparent',
                isAuteur ? 'rgba(180,45,45,0.8)' : 'rgba(218,165,32,0.8)',
                isAuteur ? 'rgba(220,80,80,1)' : 'rgba(242,232,160,1)',
                isAuteur ? 'rgba(180,45,45,0.8)' : 'rgba(218,165,32,0.8)',
                'transparent'
              ]}
              start={{x: 0, y: 0}} end={{x: 1, y: 0}}
              style={{ width: '100%', height: '100%' }}
            />
          </AnimatedView>
        </View>
      )}

      {/* ── Ultra-Premium Gradient Background ── */}
      <LinearGradient 
        colors={isAuteur ? ['rgba(40,18,18,0.7)', 'rgba(14,5,5,0.95)'] : ['rgba(15, 12, 10, 0.95)', 'rgba(5, 4, 3, 0.98)']} 
        locations={[0, 1]} 
        style={StyleSheet.absoluteFillObject} 
      />
      {/* ── Radial Highlights ── */}
      {(isPremium || isAuteur) && (
        <>
          <LinearGradient colors={[isAuteur ? 'rgba(125,31,31,0.08)' : 'rgba(139,105,20,0.08)', 'transparent']} start={{x: 0, y: 0}} end={{x: 0.5, y: 0.5}} style={StyleSheet.absoluteFillObject} />
          <LinearGradient colors={[isAuteur ? 'rgba(125,31,31,0.04)' : 'rgba(139,105,20,0.04)', 'transparent']} start={{x: 1, y: 1}} end={{x: 0.5, y: 0.5}} style={StyleSheet.absoluteFillObject} />
        </>
      )}
      
      {/* ── EDITORIAL HEADER STRIP (Matches Web) ── */}
      {(item.editorial_header || (isPremium && item.poster_path)) && (
        <View style={s.editorialHeaderContainer}>
          <ImageBackground 
            source={{ uri: backdropUri as string }} 
            style={s.editorialHeaderImage} 
            imageStyle={[s.editorialHeaderImageStyle, !item.editorial_header && { transform: [{ scale: 1.3 }], opacity: 0.35 }]}
            blurRadius={!item.editorial_header ? 15 : 0}
          >
            <LinearGradient colors={['rgba(11,10,8,0.3)', 'rgba(11,10,8,0.95)']} style={StyleSheet.absoluteFillObject} />
            {item.editorial_header && (
               <View style={s.editorialBadge}><Text style={s.editorialBadgeText}>✦ EDITORIAL</Text></View>
            )}
          </ImageBackground>
          {/* Golden bottom border accent */}
          <LinearGradient 
             colors={['transparent', 'rgba(196,150,26,0.3)', 'transparent']} 
             start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} 
             style={s.editorialHeaderAccent} 
          />
        </View>
      )}

      {/* ── CARD BODY (Dual-Column layout matching Web) ── */}
      <View style={s.cardBody}>
        
        {/* LEFT COLUMN: Poster with Scanlines & Stamp */}
        <TouchableOpacity onPress={() => router.push(`/film/${item.film_id}`)} activeOpacity={0.8} style={s.posterWrap}>
          {posterUri && (isPremium || isAuteur) && (
            <Image 
              source={{ uri: posterUri }} 
              style={[s.cardPoster, { position: 'absolute', transform: [{ scale: 1.15 }], opacity: 0.6, tintColor: isAuteur ? '#521010' : '#8B6914' }]} 
              blurRadius={15} 
            />
          )}
          {posterUri && (
            <Image source={{ uri: posterUri }} style={s.cardPoster} />
          )}
        </TouchableOpacity>

        {/* RIGHT COLUMN: Content */}
        <View style={s.cardInfo}>
          <TouchableOpacity onPress={() => router.push(`/log/${item.id}`)} activeOpacity={0.8}>
            {/* User Row */}
            <View style={s.inlineUserRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                <TouchableOpacity onPress={() => router.push(`/user/${item.username}`)} activeOpacity={0.7}>
                  <Text style={s.cardUsername}>@{item.username.toUpperCase()}</Text>
                </TouchableOpacity>
                {isArchivist && <Text style={s.badgeArchivist}>✦ ARCHIVIST</Text>}
                {isAuteur && <Text style={s.badgeAuteur}>★ AUTEUR</Text>}
              </View>
              <Text style={s.cardTimestamp}>{timeAgo}</Text>
            </View>

            {/* Title + Year */}
            <View style={s.titleRow}>
              <Text style={s.cardTitle}>{item.film_title}</Text>
              {item.year && <Text style={s.cardYear}>{item.year}</Text>}
            </View>

            {/* Rating */}
            {item.rating > 0 && <View style={{ marginBottom: 12, alignItems: 'center' }}><ReelRating rating={item.rating} size={15} /></View>}
            
            {/* Review / Pull Quote */}
            {item.pull_quote ? (
              <View style={[s.pullQuoteWrap, isAuteur && s.pullQuoteWrapAuteur, isPremium && !isAuteur && s.pullQuoteWrapPremium]}>
                <Text style={[s.pullQuote, isAuteur && s.pullQuoteAuteur, isPremium && !isAuteur && s.pullQuotePremium]}>
                  « {item.pull_quote} »
                </Text>
              </View>
            ) : item.drop_cap && item.review ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <Text style={[[s.cardReview, { fontFamily: fonts.display, fontSize: 44, color: colors.sepia, lineHeight: 46, marginRight: 8, marginTop: -4, textShadowColor: 'rgba(139,105,20,0.2)', textShadowOffset: {width:0, height:2}, textShadowRadius: 8 }]]}>
                  {item.review.replace(/<[^>]+>/g, '').trim().charAt(0)}
                </Text>
                <Text style={[s.cardReview, { flex: 1, paddingTop: 4 }]} numberOfLines={6}>
                  {item.review.replace(/<[^>]+>/g, '').trim().slice(1)}
                </Text>
              </View>
            ) : item.review ? (
              <Text style={s.cardReview} numberOfLines={6}>{item.review.replace(/<[^>]+>/g, '').trim()}</Text>
            ) : null}

            {item.watched_with && (
              <Text style={s.watchedWith}>
                ♡ WITH <Text style={{ color: colors.bone }}>{item.watched_with.toUpperCase()}</Text>
              </Text>
            )}
          </TouchableOpacity>

          {/* ════════════════════════════════════════════════════ */}
          {/*  ACTION DECK — 4-Button Grid (Web: grid 4×1fr, gap 1px) */}
          {/* Web: background rgba(139,105,20,0.15), border 1px solid rgba(139,105,20,0.2), borderRadius 6px */}
          {/* Web button: padding 1rem 0 = 16px 0, gap 0.5rem = 8px, font 0.45rem = 7.2px, ls 0.15em = 1.08px */}
          {/* ════════════════════════════════════════════════════ */}
          <View style={s.actionDeck}>
            {/* CERTIFY */}
            <TouchableOpacity style={s.actionBtn} onPress={handleCertify} activeOpacity={0.6}>
              <Heart size={16} strokeWidth={2} color={endorsed ? colors.sepia : colors.fog} fill={endorsed ? colors.sepia : 'transparent'} />
              <Text style={[s.actionLabel, endorsed && s.actionLabelCertified]}>{endorsed ? 'CERTIFIED' : 'CERT'}</Text>
            </TouchableOpacity>

            {/* CRITIQUE */}
            <TouchableOpacity style={s.actionBtn} onPress={handleCritique} activeOpacity={0.6}>
              <MessageSquare size={16} strokeWidth={2} color={colors.fog} />
              <Text style={s.actionLabel}>CRITIQUE</Text>
            </TouchableOpacity>

            {/* SAVE / EDIT */}
            <TouchableOpacity style={s.actionBtn} onPress={handleSaveOrEdit} activeOpacity={0.6}>
              {isOwner ? (
                <Edit3 size={16} strokeWidth={2} color={colors.fog} />
              ) : (
                <Bookmark size={16} strokeWidth={2} color={filmSaved ? colors.sepia : colors.fog} fill={filmSaved ? colors.sepia : 'transparent'} />
              )}
              <Text style={[s.actionLabel, !isOwner && filmSaved && s.actionLabelCertified]}>{isOwner ? 'EDIT' : filmSaved ? 'SAVED' : 'SAVE'}</Text>
            </TouchableOpacity>

            {/* LOUNGE */}
            <TouchableOpacity style={s.actionBtn} onPress={handleLounge} activeOpacity={0.6}>
              <MessageCircle size={16} strokeWidth={2} color={isLoungeEligible ? colors.fog : colors.ash} />
              <Text style={[s.actionLabel, !isLoungeEligible && s.actionIconLocked]}>LOUNGE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── AUTOPSY (Full-width in Feed matches Web) ── */}
      {(item.is_autopsied || item.autopsy) && (
        <View style={{ paddingHorizontal: 16 }}>
           <TouchableOpacity 
              onPress={() => { Haptics.selectionAsync(); setAutopsyOpen(!autopsyOpen); }} 
              activeOpacity={0.7} 
              style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: 'rgba(11,10,8,0.95)', borderRadius: 4, borderWidth: 1, borderColor: 'rgba(139,105,20,0.25)', borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: -1 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <AnimatedView style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.sepia, shadowColor: 'rgba(139,105,20,0.6)', shadowOffset: {width:0, height:0}, shadowRadius: 8, shadowOpacity: 1 }} />
                <Text style={{ fontFamily: fonts.display, fontSize: 12, letterSpacing: 2.5, color: colors.parchment }}>THE AUTOPSY</Text>
                <Text style={{ fontFamily: fonts.ui, fontSize: 7, letterSpacing: 3, color: colors.sepia, opacity: 0.6 }}>CONFIDENTIAL</Text>
              </View>
              <Text style={{ fontFamily: fonts.ui, fontSize: 8, color: colors.fog, transform: [{ rotate: autopsyOpen ? '180deg' : '0deg' }] }}>▼</Text>
           </TouchableOpacity>

           {autopsyOpen && (
             <AnimatedView entering={FadeInUp.duration(300)} style={s.autopsyCard}>
               <View style={{ gap: 20 }}>
                 {[
                    { key: 'story', label: 'STORY', value: item.autopsy?.story !== undefined ? item.autopsy.story : item.autopsy?.screenplay || 0 },
                    { key: 'script', label: 'SCRIPT / DIALOGUE', value: item.autopsy?.script !== undefined ? item.autopsy.script : item.autopsy?.screenplay || 0 },
                    { key: 'acting', label: 'ACTING & CHARACTER', value: item.autopsy?.acting || item.autopsy?.direction || 0 },
                    { key: 'cinematography', label: 'CINEMATOGRAPHY', value: item.autopsy?.cinematography || 0 },
                    { key: 'editing', label: 'EDITING & PACING', value: item.autopsy?.editing !== undefined ? item.autopsy.editing : item.autopsy?.pacing || 0 },
                    { key: 'sound', label: 'SOUND DESIGN & SCORE', value: item.autopsy?.sound || 0 },
                 ].map(stat => (
                   <View key={stat.key}>
                     <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
                       <Text style={s.autopsyLabel}>{stat.label}</Text>
                       <Text style={s.autopsyValue}>{stat.value === 10 ? '10.0' : parseFloat(String(stat.value)).toFixed(1)}</Text>
                     </View>
                     <View style={s.autopsyTrack}>
                       <LinearGradient colors={[colors.sepia, '#5a430d']} style={[s.autopsyFill, { width: `${(stat.value / 10) * 100}%` }]} start={{x:0, y:0}} end={{x:0, y:1}} />
                     </View>
                   </View>
                 ))}
               </View>
             </AnimatedView>
           )}
        </View>
      )}
      {/* ── Share to Lounge Modal ── */}
      <ShareToLoungeModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        filmTitle={item.film_title}
        filmId={String(item.film_id)}
        posterPath={item.poster_path}
      />
    </AnimatedView>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'JUST NOW';
  if (mins < 60) return `${mins}m AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h AGO`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d AGO`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w AGO`;
}

const s = StyleSheet.create({
  // Web: isolation isolate, overflow hidden
  card: {
    backgroundColor: colors.ink,
    marginHorizontal: 12,
    marginBottom: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.2)',
    overflow: 'hidden',
    position: 'relative',
  },
  // Web: borderColor rgba(196,150,26,0.3)
  cardPremium: {
    borderColor: 'rgba(196,150,26,0.3)',
    backgroundColor: 'rgba(20,15,5,0.98)',
  },
  // Web: borderColor rgba(125,31,31,0.2)
  cardAuteur: {
    borderColor: 'rgba(125,31,31,0.2)',
    backgroundColor: 'rgba(25,10,10,0.98)',
  },
  shimmerLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(196,150,26,0.5)',
    zIndex: 10,
  },
  shimmerLineAuteur: {
    backgroundColor: 'rgba(180,45,45,0.5)',
  },
  cardBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.1,
    zIndex: 0,
  },
  cardBackdropImage: {
    opacity: 0.4,
  },
  editorialHeaderContainer: {
    width: '100%',
    height: 100,
    position: 'relative',
  },
  editorialHeaderImage: {
    width: '100%',
    height: '100%',
  },
  editorialHeaderImageStyle: {
    resizeMode: 'cover',
  },
  editorialHeaderAccent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  // Web: top 1.5rem=24px, left 1.5rem=24px, fontSize 0.45rem=7.2px, ls 0.3em=2.16px, bg rgba(11,10,8,0.5), border 1px rgba(196,150,26,0.2), borderRadius 2px, padding 0.4rem 0.85rem = 6.4px 13.6px
  editorialBadge: {
    position: 'absolute',
    top: 24,
    left: 24,
    backgroundColor: 'rgba(11,10,8,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.2)',
  },
  // Web: fontSize 0.45rem=7.2px, letterSpacing 0.3em=2.16px, color rgba(218,165,32,0.85)
  editorialBadgeText: {
    fontFamily: fonts.ui,
    fontSize: 7,
    letterSpacing: 2.2,
    color: 'rgba(218,165,32,0.85)',
  },

  // User Row
  cardUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,105,20,0.1)',
    zIndex: 1,
  },
  cardUserClick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.soot,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.3)',
  },
  cardAvatarPremium: {
    borderColor: 'rgba(218,165,32,0.8)',
    backgroundColor: 'rgba(139,105,20,0.1)',
  },
  cardAvatarText: {
    fontFamily: fonts.display,
    fontSize: 14,
    color: colors.parchment,
  },
  // Web: fontSize 0.75rem=12px, letterSpacing 0.15em=1.8px, color var(--sepia), textTransform uppercase
  cardUsername: {
    fontFamily: fonts.ui,
    fontSize: 12,
    letterSpacing: 1.8,
    color: colors.sepia,
    textTransform: 'uppercase',
  },
  // Web: justifyContent space-between, paddingBottom 1.5rem=24px
  inlineUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  // Web: fontSize 0.4rem=6.4px, padding 0.1rem 0.5rem = 1.6px 8px
  badgeArchivist: {
    fontFamily: fonts.ui,
    fontSize: 6.5,
    letterSpacing: 1,
    color: colors.sepia,
    backgroundColor: 'rgba(139,105,20,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 2,
  },
  badgeAuteur: {
    fontFamily: fonts.ui,
    fontSize: 6.5,
    letterSpacing: 1,
    color: colors.ink,
    backgroundColor: '#DAA520',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 2,
  },
  // Web: fontSize 0.65rem=10.4px, letterSpacing 0.2em=2.08px, color var(--fog)
  cardTimestamp: {
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.fog,
  },
  stampBadge: {
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.3)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(139,105,20,0.05)',
  },
  stampText: {
    fontFamily: fonts.ui,
    fontSize: 8,
    letterSpacing: 2,
    color: colors.sepia,
  },

  // Web: padding IS_TOUCH 1.5rem 1rem = 24px 16px, gap 1.5rem = 24px
  cardBody: {
    flexDirection: 'column',
    alignItems: 'center',
    padding: 16,
    paddingTop: 24,
    gap: 24,
    zIndex: 1,
  },
  // Web: width 140px, height 210px, borderRadius 2px, border 1px rgba(139,105,20,0.3), boxShadow 0 20px 40px rgba(0,0,0,0.8)
  posterWrap: {
    width: 140,
    height: 210,
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.3)',
    borderRadius: 2,
    backgroundColor: colors.soot,
    position: 'relative',
    overflow: 'hidden',
    zIndex: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 12,
  },
  cardPoster: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    position: 'absolute',
  },
  societyStamp: {
    position: 'absolute',
    bottom: -10,
    right: -15,
    transform: [{ rotate: '-8deg' }],
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  societyStampBox: {
    borderWidth: 2,
    borderColor: 'rgba(196,150,26,0.8)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(20,15,5,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
  },
  stampReviewText: {
    fontFamily: fonts.display,
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.sepia,
  },
  stampSocietyText: {
    fontFamily: fonts.ui,
    fontSize: 5,
    letterSpacing: 2,
    color: 'rgba(139,105,20,0.7)',
  },
  cardInfo: {
    width: '100%',
    justifyContent: 'flex-start',
  },
  titleRow: {
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  // Web mobile: fontSize clamp(2rem,8vw,2.75rem) ≈ 32px on 390px viewport, lineHeight 1.1, textShadow 0 4px 12px rgba(0,0,0,0.5)
  cardTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.parchment,
    lineHeight: 31,
    marginBottom: 4,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  // Web: fontSize 0.75rem=12px, letterSpacing 0.3em=3.6px, color var(--fog), marginTop 0.5rem=8px
  cardYear: {
    fontFamily: fonts.ui,
    fontSize: 12,
    letterSpacing: 3.6,
    color: colors.fog,
    marginTop: 8,
  },
  cardMeta: {
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.fog,
    marginBottom: 8,
  },
  // Web: padding 1.5rem = 24px, textAlign center
  pullQuoteWrap: {
    marginVertical: 4,
    paddingVertical: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  pullQuoteWrapPremium: {},
  pullQuoteWrapAuteur: {},
  // Web: fontSize clamp(1.2rem,5vw,1.6rem) ≈ 20px, lineHeight 1.35, color var(--sepia), fontStyle italic, textShadow 0 2px 12px rgba(139,105,20,0.15)
  pullQuote: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontStyle: 'italic',
    color: colors.sepia,
    lineHeight: 27,
    textAlign: 'center',
    textShadowColor: 'rgba(139,105,20,0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  pullQuotePremium: {
    color: 'rgba(218,165,32,0.9)',
  },
  pullQuoteAuteur: {
    color: 'rgba(180,45,45,0.9)',
  },
  // Web mobile: fontSize 0.95rem=15.2px, lineHeight 1.85 → 15.2*1.85=28.12, color var(--bone), opacity 0.9
  cardReview: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.bone,
    lineHeight: 28,
    opacity: 0.9,
  },
  watchedWith: {
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.sepia,
    marginTop: 8,
  },

  // Web ACTION DECK: grid 4×1fr, gap 1px, bg rgba(139,105,20,0.15), border 1px rgba(139,105,20,0.2), borderRadius 6px
  actionDeck: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.2)',
    backgroundColor: 'rgba(139,105,20,0.15)',
    borderRadius: 6,
    overflow: 'hidden',
    zIndex: 1,
    padding: 1,
    gap: 1,
  },
  // Web button: padding 1rem 0 = 16px 0, gap 0.5rem = 8px, bg var(--ink)
  actionBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.ink,
    borderRadius: 4,
  },
  // Web: fontSize 0.45rem=7.2px, letterSpacing 0.15em=1.08px, color inherited (fog default)
  actionLabel: {
    fontFamily: fonts.ui,
    fontSize: 7,
    letterSpacing: 1.1,
    color: colors.fog,
  },
  actionLabelCertified: {
    color: colors.sepia,
  },
  actionIconLocked: {
    color: colors.ash,
  },

  // Web AUTOPSY: bg linear-gradient(135deg, rgba(11,10,8,0.95), rgba(25,20,12,0.95)), border 1px rgba(139,105,20,0.25), borderRadius 4px, padding 0.75rem 1rem = 12px 16px
  autopsyCard: {
    backgroundColor: colors.ink,
    padding: 20,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.ash,
    borderTopWidth: 0,
    marginTop: -2,
    paddingTop: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  // Web: fontSize matches micro scale
  autopsyLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.fog },
  autopsyValue: { fontFamily: fonts.display, fontSize: 16, lineHeight: 18, color: colors.parchment, opacity: 0.85, letterSpacing: 1 },
  autopsyTrack: { width: '100%', height: 6, backgroundColor: colors.soot, borderRadius: 1, borderWidth: 1, borderColor: 'rgba(10, 7, 3, 0.8)', overflow: 'hidden' },
  autopsyFill: { height: '100%' },
});

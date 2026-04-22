import React, { useCallback, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ImageBackground } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, interpolateColor, SharedValue, interpolate, Extrapolation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { DeviceEventEmitter, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useFilmStore } from '@/src/stores/films';
import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts, effects, SEPIA_HASH } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import reelToast from '@/src/utils/reelToast';
import PressableScale from '@/src/components/PressableScale';
import { ActionDeck } from './ActionDeck';
import { AutopsyView } from './AutopsyView';

const TMDB_IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const TMDB_IMG_W185 = 'https://image.tmdb.org/t/p/w185';
const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

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
  autopsy?: Record<string, number>;
}

export const ActivityCard = React.memo(function ActivityCard({ item, index, parentScrollY }: { item: FeedItem; index: number; parentScrollY?: SharedValue<number> }) {
  const router = useRouter();
  const posterUri = item.poster_path ? `${TMDB_IMG_W185}${item.poster_path}` : null;
  const isArchivist = item.role === 'archivist';
  const isAuteur = item.role === 'auteur';
  const isPremium = isArchivist || isAuteur || item.editorial_header || item.pull_quote;
  
  const backdropUri = item.editorial_header ? `${TMDB_IMG_W500}${item.editorial_header}` : item.poster_path ? `${TMDB_IMG_W500}${item.poster_path}` : null;
  
  // ── Store hooks ──
  const { hasEndorsed, toggleEndorse, _watchlistIndex, addToWatchlist, removeFromWatchlist } = useFilmStore();
  const { user: currentUser } = useAuthStore();

  // ── 3D Gyroscopic Parallax Engine ──
  const { height: windowHeight } = Dimensions.get('window');
  const ITEM_HEIGHT = 450;
  const parallaxStyle = useAnimatedStyle(() => {
    if (!parentScrollY) return {};
    
    // Math to track card passing projection lens
    const cardCenterY = index * ITEM_HEIGHT + (ITEM_HEIGHT / 2);
    const viewportCenterY = parentScrollY.value + (windowHeight / 2);
    const distance = cardCenterY - viewportCenterY;
    
    // Cylindrical peeling logic
    const rotateX = interpolate(distance, [-windowHeight, 0, windowHeight], [15, 0, -15], Extrapolation.CLAMP);
    const scale = interpolate(Math.abs(distance), [0, windowHeight], [1, 0.95], Extrapolation.CLAMP);
    
    return {
      transform: [
        { perspective: 1200 },
        { rotateX: `${rotateX}deg` },
        { scale }
      ]
    };
  });

  // ── Derived state ──
  const endorsed = hasEndorsed(item.id);
  const timeAgo = getTimeAgo(item.created_at);
  const isOwner = currentUser?.username === item.username;
  const isLoungeEligible = currentUser && ['archivist', 'auteur'].includes(currentUser.role ?? '');
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
          posterPath: item.poster_path ?? '',
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
    <View style={{ zIndex: index }}>
      <AnimatedView style={[s.card, isPremium && s.cardPremium, isAuteur && s.cardAuteur, parallaxStyle]}>

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
          <View style={[s.editorialHeaderImage, { overflow: 'hidden' }]}>
            <Image
              source={{ uri: backdropUri as string }} 
              style={[StyleSheet.absoluteFillObject, s.editorialHeaderImageStyle, !item.editorial_header && { transform: [{ scale: 1.3 }], opacity: 0.35 }]}
              blurRadius={!item.editorial_header ? 15 : 0}
              cachePolicy="memory-disk"
              placeholder={{ blurhash: SEPIA_HASH }}
              contentFit="cover"
              transition={200}
            />
            <LinearGradient colors={['rgba(11,10,8,0.3)', 'rgba(11,10,8,0.95)']} style={StyleSheet.absoluteFillObject} />
            {item.editorial_header && (
               <View style={s.editorialBadge}><Text style={s.editorialBadgeText}>✦ EDITORIAL</Text></View>
            )}
          </View>
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
        
        {/* LEFT COLUMN: Poster with Physical Embossing */}
        <PressableScale onPress={() => { DeviceEventEmitter.emit('reelhouse:projection-mark'); router.push(`/film/${item.film_id}`); }} haptic="heavy" style={s.posterWrap}>
          {posterUri && (isPremium || isAuteur) && (
            <AnimatedExpoImage 
              source={{ uri: posterUri }} 
              style={[s.cardPoster, { position: 'absolute', transform: [{ scale: 1.15 }], opacity: 0.6, tintColor: isAuteur ? '#521010' : '#8B6914' }]} 
              blurRadius={15}
              cachePolicy="memory-disk"
              recyclingKey={`blur-${item.film_id}`}
              placeholder={{ blurhash: SEPIA_HASH }}
              transition={100}
            />
          )}
          {posterUri && (
            <AnimatedExpoImage 
              sharedTransitionTag={`poster-${item.film_id}`}
              source={{ uri: posterUri }} 
              style={s.cardPoster} 
              cachePolicy="memory-disk" 
              recyclingKey={`poster-${item.film_id}`} 
              placeholder={{ blurhash: SEPIA_HASH }} 
              transition={100} 
            />
          )}

          {/* Tactile Overlay Lighting */}
          <LinearGradient 
            colors={['rgba(255,255,255,0.05)', 'transparent', 'rgba(10,7,3,0.8)']} 
            locations={[0, 0.4, 1]} 
            style={StyleSheet.absoluteFillObject} 
            pointerEvents="none" 
          />
          {/* Physical Edge Details */}
          <View style={s.posterEdgeHighlight} pointerEvents="none" />
        </PressableScale>

        {/* RIGHT COLUMN: Content */}
        <View style={s.cardInfo}>
          {/* User Row */}
          <View style={s.inlineUserRow}>
            <View style={s.userRowInner}>
              <TouchableOpacity onPress={() => { Haptics.selectionAsync(); router.push(`/user/${item.username}`); }} activeOpacity={0.7} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={s.cardAvatar} cachePolicy="memory-disk" />
                ) : (
                  <View style={s.cardAvatar}><Text style={s.cardAvatarText}>{item.username.charAt(0).toUpperCase()}</Text></View>
                )}
                <Text style={s.cardUsername} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>@{item.username.toUpperCase()}</Text>
              </TouchableOpacity>
              {isArchivist && <Text style={s.badgeArchivist} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>✦ ARCHIVIST</Text>}
              {isAuteur && <Text style={s.badgeAuteur} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>★ AUTEUR</Text>}
            </View>
            <Text style={s.cardTimestamp} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{timeAgo}</Text>
          </View>

          {/* Title + Year */}
          <View style={s.titleRow}>
            <TouchableOpacity onPress={() => { Haptics.selectionAsync(); router.push(`/film/${item.film_id}`); }} activeOpacity={0.7} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} style={{ flexShrink: 1 }}>
              <Text style={s.cardTitle} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.85}>{item.film_title}</Text>
            </TouchableOpacity>
            {item.year && <Text style={s.cardYear}>{item.year}</Text>}
          </View>

          {/* Rating */}
          <TouchableOpacity onPress={() => { Haptics.selectionAsync(); router.push(`/log/${item.id}`); }} activeOpacity={0.8} style={{ flexShrink: 1, width: '100%' }}>
            {item.rating > 0 && <View style={s.ratingWrap}><ReelRating rating={item.rating} size={15} /></View>}
            
            {/* Review / Pull Quote */}
            {item.pull_quote && (
              <View style={[s.pullQuoteWrap, isAuteur && s.pullQuoteWrapAuteur, isPremium && !isAuteur && s.pullQuoteWrapPremium]}>
                <Text style={[s.pullQuote, isAuteur && s.pullQuoteAuteur, isPremium && !isAuteur && s.pullQuotePremium]}>
                  « {item.pull_quote} »
                </Text>
              </View>
            )}
            
            {item.review && (() => {
              const cleanReview = item.review.replace(/<(p|div|br)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').trim();
              if (!cleanReview) return null;
              return (
                <Text style={[s.cardReview, item.drop_cap && { lineHeight: undefined }]} numberOfLines={8}>
                  {item.drop_cap ? (
                    <Text style={s.dropCapLetter}>{cleanReview.charAt(0)}</Text>
                  ) : null}
                  <Text style={item.drop_cap ? { lineHeight: 24 } : undefined}>
                    {item.drop_cap ? cleanReview.slice(1) : cleanReview}
                  </Text>
                </Text>
              );
            })()}
            {item.review && item.review.replace(/<[^>]+>/g, '').trim().length > 200 && (
              <View style={{ marginTop: 6 }}>
                <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.sepia, textDecorationLine: 'underline', textDecorationColor: 'rgba(139,105,20,0.3)' }}>Read more</Text>
              </View>
            )}

            {item.watched_with && (
              <Text style={s.watchedWith} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                ♡ WITH <Text style={s.watchedWithName}>{item.watched_with.toUpperCase()}</Text>
              </Text>
            )}
          </TouchableOpacity>

          <View style={{ marginTop: 24, width: '100%' }}>
            <ActionDeck
              itemId={item.id}
              filmId={item.film_id}
              filmTitle={item.film_title}
              posterPath={item.poster_path}
              year={item.year}
              ownerUsername={item.username}
            />
          </View>
        </View>
      </View>

      <AutopsyView isAutopsied={item.is_autopsied} autopsy={item.autopsy} />
      </AnimatedView>
    </View>
  );
});

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
    backgroundColor: 'rgba(8,6,4,0.98)', // Deep Obsidian Glass
    marginHorizontal: 12,
    marginBottom: 24,
    borderRadius: 4, 
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.5)',
    overflow: 'hidden',
    position: 'relative',
    elevation: 25, // Massive mechanical weight
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
  },
  // Archibald (Editorial Desk)
  cardPremium: {
    borderColor: 'rgba(139,105,20,0.3)',
    backgroundColor: 'rgba(10,8,4,1)',
  },
  // Auteur (Classified Dossier)
  cardAuteur: {
    borderColor: 'rgba(125,31,31,0.25)',
    backgroundColor: 'rgba(12,5,5,1)',
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
  // --- Scrubber Illusions ---
  sprocketStrip: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    opacity: 0.15,
    zIndex: 1,
  },
  sprocketHole: {
    width: 2,
    height: 4,
    backgroundColor: '#000',
    borderRadius: 1,
  },
  cutMarker: {
    position: 'absolute',
    right: 0,
    top: -2,
    bottom: -2,
    width: 3,
    backgroundColor: colors.bone,
    shadowColor: colors.sepia,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
    borderRadius: 2,
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
    fontSize: 6,
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
    padding: 28, // Expanding dossier boundaries
    paddingTop: 40,
    gap: 32, // More breath between poster and title
    zIndex: 1,
  },
  // Scaled down poster gracefully
  posterWrap: {
    width: 140, // Was 140
    height: 210, // Was 210
    borderWidth: 1.5,
    borderColor: 'rgba(218,165,32,0.4)',
    borderRadius: 4,
    backgroundColor: colors.soot,
    position: 'relative',
    overflow: 'hidden',
    zIndex: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 25,
  },
  cardPoster: {
    width: '100%',
    height: '100%',
    contentFit: 'cover',
    position: 'absolute',
  },
  posterEdgeHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 6, zIndex: 10
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
  // Title is explicitly scaled down to look elegant
  cardTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: '#F2ECD8',
    lineHeight: 32,
    marginBottom: 4,
    textAlign: 'center',
    textShadowColor: 'rgba(196,150,26, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
  },
  cardYear: {
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 4,
    color: colors.fog,
    marginTop: 6,
  },
  cardMeta: {
    fontFamily: fonts.ui,
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.fog,
    marginBottom: 6,
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
  pullQuote: {
    fontFamily: fonts.display,
    fontSize: 17,
    fontStyle: 'italic',
    color: colors.sepia,
    lineHeight: 24,
    textAlign: 'center',
    paddingBottom: 8,
    includeFontPadding: false,
    textShadowColor: 'rgba(139,105,20,0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  pullQuotePremium: {
    color: 'rgba(218,165,32,0.9)',
  },
  pullQuoteAuteur: {
    color: 'rgba(180,45,45,0.9)',
  },
  cardReview: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.bone,
    lineHeight: 22,
    opacity: 0.9,
    paddingBottom: 8,
    includeFontPadding: false,
    marginTop: 12,
    marginBottom: 8,
  },
  dropCapLetter: {
    fontFamily: fonts.display,
    fontSize: 48,
    color: colors.parchment,
    lineHeight: 48,
    marginRight: 6,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  watchedWith: {
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.sepia,
    marginTop: 16,
    marginBottom: 8,
  },

  // Nitrate Noir ACTION DECK: physical engraved layout
  actionDeck: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: 'rgba(139,105,20,0.25)',
    backgroundColor: 'rgba(18,14,9,0.9)',
    borderRadius: 6,
    overflow: 'hidden',
    zIndex: 1,
    padding: 2,
    gap: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.7, shadowRadius: 10, elevation: 20
  },
  // physical inner pill cut
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(10,8,5,1)', // physical inset
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

  // ── Extracted Inline Styles (Performance: created once at module load) ──
  shimmerContainer: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, overflow: 'hidden', zIndex: 5 } as const,
  shimmerView: { width: '200%', height: '100%', flexDirection: 'row' } as const,
  shimmerGradient: { width: '100%', height: '100%' } as const,
  userRowInner: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 } as const,
  ratingWrap: { marginBottom: 12, alignItems: 'center' } as const,
  dropCapRow: { flexDirection: 'row', alignItems: 'flex-start' } as const,
  dropCapLetter: { fontFamily: fonts.display, fontSize: 34, color: colors.sepia, lineHeight: 36, marginRight: 6, marginTop: -2, textShadowColor: 'rgba(139,105,20,0.2)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  dropCapBody: { flex: 1, paddingTop: 4 },
  autopsySectionWrap: { paddingHorizontal: 16 },
  autopsyToggle: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: 'rgba(11,10,8,0.95)', borderRadius: 4, borderWidth: 1, borderColor: 'rgba(139,105,20,0.25)', borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: -1 } as const,
  autopsyToggleContent: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' } as const,
  autopsyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.sepia, shadowColor: 'rgba(139,105,20,0.6)', shadowOffset: { width: 0, height: 0 }, shadowRadius: 8, shadowOpacity: 1 },
  autopsyTitle: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 2.5, color: colors.parchment },
  autopsyConfidential: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 3, color: colors.sepia, opacity: 0.6 },
  autopsyStatsGap: { gap: 20 },
  autopsyStatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 } as const,
  autopsyArrowBase: { fontFamily: fonts.ui, fontSize: 8, color: colors.fog },
  watchedWithName: { color: colors.bone },
  autopsyToggleBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: 'rgba(11,10,8,0.95)', borderRadius: 4, borderWidth: 1, borderColor: 'rgba(139,105,20,0.25)', borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: -1 } as const,
  autopsyChevron: { fontFamily: fonts.ui, fontSize: 8, color: colors.fog },
  autopsyChevronOpen: { transform: [{ rotate: '180deg' }] },
  autopsyInner: { gap: 20 },
  autopsyBarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 } as const,
});

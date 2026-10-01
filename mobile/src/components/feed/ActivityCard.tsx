/**
 * ActivityCard — the archive index card of The Living Record.
 * ───────────────────────────────────────────────────────────
 * Reading order, the archivist's order:
 *   who filed it (ledger row, tier-ruled)
 *   → what film (poster left · title/year/verdict right)
 *   → the prose (full card width)
 *   → the stamp bar (CERT / CRITIQUE / SAVE / LOUNGE)
 *   → THE AUTOPSY strip, when one is filed.
 *
 * THE CONFIDENTIAL BACK: autopsied cards TURN OVER — a 420ms weighted
 * flip (pure timing curve, mathematically incapable of bounce) reveals
 * the craft examination on the card's reverse. The back is absolute-
 * filled over the front, so card height NEVER changes: the feed never
 * moves. The back mounts lazily on first flip; flip state resets when
 * FlashList recycles the row onto a different log. Reduce-motion users
 * get a plain crossfade.
 */
import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { View, StyleSheet, AccessibilityInfo, PixelRatio } from 'react-native';
import { Text } from '@/src/components/text';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { nav } from '@/src/utils/typedRouter';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing, interpolate,
  useReducedMotion,
} from 'react-native-reanimated';
import { colors, fonts, SEPIA_HASH, effects } from '@/src/theme/theme';
import { displayTextProps } from '@/src/constants/textScaling';
import PressableScale from '@/src/components/PressableScale';
import { ActionDeck } from './ActionDeck';
import { AutopsyStrip, AutopsyBack, hasRatedAutopsy } from './AutopsyView';
import { ReviewContent, VerdictBlock } from './ReviewContent';
import { UserAttributionRow } from './UserAttributionRow';
import { PosterFrame } from './PosterFrame';
import { isAuteurPlusTier, isArchivistPlusTier } from '@/src/utils/tier';
import { timeAgo } from '@/src/utils/timeAgo';

// Single source of truth: Zod schema
import type { FeedItem } from '@/src/schemas/feed.schema';
import { EDGE_LIT, WASH } from '@/src/theme/light';

// The banner spans ~326pt: 978 pixels on a 3x screen, which a 500px image fills at half detail.
const TMDB_IMG_EDITORIAL = `https://image.tmdb.org/t/p/${PixelRatio.get() >= 3 ? 'w780' : 'w500'}`;
export type { FeedItem };

// The flip law: heavy card stock — acceleration off the fingertip,
// a firm damped landing. A timing curve cannot overshoot.
const FLIP_MS = 420;
const FLIP_EASING = Easing.bezier(0.33, 0, 0.15, 1);
const CROSSFADE_MS = 250;

/** The card's own washes, thinned: a card is paper on the lit page, not a hole in it. */
const SHELL = WASH;

const ActivityCardShell = ({ children, isPremium, isAuteur }: { children: React.ReactNode, isPremium: boolean, isAuteur: boolean }) => {
  return (
    <>
      <LinearGradient
        colors={isAuteur ? ['rgba(40,18,18,0.7)', 'rgba(14,5,5,0.95)'] : ['rgba(30,25,20,0.95)', 'rgba(6,5,4,0.98)']}
        locations={[0, 1]}
        style={[StyleSheet.absoluteFillObject, SHELL]}
      />
      {(isPremium || isAuteur) && (
        <>
          <LinearGradient colors={[isAuteur ? colors.crimsonFaint : colors.sepiaFaint, 'transparent']} start={{x: 0, y: 0}} end={{x: 0.5, y: 0.5}} style={[StyleSheet.absoluteFillObject, SHELL]} />
          <LinearGradient colors={[isAuteur ? 'rgba(180,45,45,0.04)' : 'rgba(184,137,26,0.04)', 'transparent']} start={{x: 1, y: 1}} end={{x: 0.5, y: 0.5}} style={[StyleSheet.absoluteFillObject, SHELL]} />
        </>
      )}
      {children}
    </>
  );
};

/** The editorial banner: only the tribunal's pick wears the crown. */
const ActivityEditorialHeader = React.memo(({ backdropUri }: { backdropUri: string }) => {
  return (
    <View style={s.editorialHeaderContainer}>
      <View style={s.editorialHeaderImageWrap}>
        <Image
          source={{ uri: backdropUri }}
          style={StyleSheet.absoluteFillObject}
          recyclingKey={backdropUri}
          cachePolicy="memory-disk"
          placeholder={{ blurhash: SEPIA_HASH }}
          contentFit="cover"
          transition={200}
        />
        <LinearGradient colors={['rgba(13,11,9,0.3)', 'rgba(13,11,9,0.95)']} style={StyleSheet.absoluteFillObject} />
        <View style={s.editorialBadge}><Text style={s.editorialBadgeText}>✦ EDITORIAL</Text></View>
      </View>
      <LinearGradient
         colors={['transparent', 'rgba(184,137,26,0.3)', 'transparent']}
         start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
         style={s.editorialHeaderAccent}
      />
    </View>
  );
});
ActivityEditorialHeader.displayName = 'ActivityEditorialHeader';

export const ActivityCard = React.memo(function ActivityCard({ item, index, onFilmPress }: { item: FeedItem; index: number; onFilmPress?: () => void }) {
  const reducedMotion = useReducedMotion();
  const isArchivist = isArchivistPlusTier(item.role);
  const isAuteur = isAuteurPlusTier(item.role);
  const isPremium = isArchivist || isAuteur || !!item.editorial_header || !!item.pull_quote;

  const autopsyStats = (item.autopsy ?? undefined) as Record<string, number> | undefined;
  // Only filed scores count: an all-zero autopsy does not turn the card over.
  const hasAutopsy = !!item.is_autopsied && hasRatedAutopsy(autopsyStats);

  const editorialUri = item.editorial_header ? `${TMDB_IMG_EDITORIAL}${item.editorial_header}` : null;

  // The shared timeAgo: past a month it gives the date, never "104w AGO".
  const relativeTime = useMemo(() => timeAgo(item.created_at), [item.created_at]);

  // ── The confidential back ──
  const [flipped, setFlipped] = useState(false);
  const [backMounted, setBackMounted] = useState(false);
  const flip = useSharedValue(0);

  // FlashList recycling: a flipped card must never leak onto another log.
  useEffect(() => {
    setFlipped(false);
    setBackMounted(false);
    flip.value = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const turnOver = useCallback(() => {
    setBackMounted(true);
    setFlipped(true);
    flip.value = withTiming(1, { duration: reducedMotion ? CROSSFADE_MS : FLIP_MS, easing: FLIP_EASING });
    AccessibilityInfo.announceForAccessibility('Autopsy revealed');
  }, [flip, reducedMotion]);

  const turnBack = useCallback(() => {
    setFlipped(false);
    flip.value = withTiming(0, { duration: reducedMotion ? CROSSFADE_MS : FLIP_MS, easing: FLIP_EASING });
    AccessibilityInfo.announceForAccessibility('Returned to the log');
  }, [flip, reducedMotion]);

  // No animated zIndex (on Fabric it races FlashList's commits): opacity shows a face,
  // pointerEvents routes the touch, and the back is simply drawn after the front.
  const frontStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return { opacity: 1 - flip.value, transform: [] };
    }
    return {
      opacity: flip.value < 0.5 ? 1 : 0,
      transform: [
        { perspective: 1000 },
        { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` },
      ],
    };
  });

  const backStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return { opacity: flip.value, transform: [] };
    }
    return {
      opacity: flip.value >= 0.5 ? 1 : 0,
      transform: [
        { perspective: 1000 },
        { rotateY: `${interpolate(flip.value, [0, 1], [-180, 0])}deg` },
      ],
    };
  });

  const handleFilmPress = useCallback(() => {
    // Host screens already standing on the film (the archive page) override
    // this so the poster never stacks a duplicate film page.
    if (onFilmPress) return onFilmPress();
    nav.push(`/film/${item.film_id}`);
  }, [item.film_id, onFilmPress]);

  const handleUserPress = useCallback(() => {
    nav.push(`/user/${item.username}`);
  }, [item.username]);

  const handleLogPress = useCallback(() => {
    nav.push(`/log/${item.id}`);
  }, [item.id]);

  return (
    <View style={{ zIndex: index }}>
      {/* Rasterized only at rest: cheap in a scroll, never redrawn per frame of the flip. */}
      {/* The outer view casts the lift; the inner one clips, and a clip hides a shadow. */}
      <View style={[s.cardShadow, isAuteur && s.cardShadowAuteur]}>
      <View style={[s.card, isPremium && s.cardPremium, isAuteur && s.cardAuteur]} shouldRasterizeIOS={!flipped}>
        {/* ── FRONT of the card ── */}
        <Animated.View
          style={backMounted ? frontStyle : undefined}
          pointerEvents={flipped ? 'none' : 'auto'}
          accessibilityElementsHidden={flipped}
          importantForAccessibility={flipped ? 'no-hide-descendants' : 'auto'}
        >
          <ActivityCardShell isPremium={isPremium} isAuteur={isAuteur}>
            {editorialUri && <ActivityEditorialHeader backdropUri={editorialUri} />}

            {/* The ledger — who filed it */}
            <View style={s.ledgerWrap}>
              <UserAttributionRow
                username={item.username}
                avatarUrl={item.avatar_url}
                role={item.role}
                timeAgo={relativeTime}
                onUserPress={handleUserPress}
              />
            </View>

            {/* The film row — poster stapled left, identity right */}
            <View style={s.filmRow}>
              <PosterFrame filmId={item.film_id} filmTitle={item.film_title} posterPath={item.poster_path} isPremium={isPremium} isAuteur={isAuteur} onPress={handleFilmPress} />
              <View style={s.filmMeta}>
                <PressableScale onPress={handleFilmPress} hitSlop={{ top: 12, bottom: 5, left: 15, right: 15 }} haptic="selection" pressedScale={0.96}>
                  <Text {...displayTextProps} style={s.cardTitle} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7}>{item.film_title}</Text>
                </PressableScale>
                {item.year != null && <Text style={s.cardYear}>{item.year}</Text>}
                <VerdictBlock item={item} />
              </View>
            </View>

            {/* The critique — full card width, proper line length */}
            <View style={s.proseWrap}>
              <ReviewContent item={item} isPremium={isPremium} isAuteur={isAuteur} onPress={handleLogPress} />
            </View>

            {/* The stamp bar */}
            <View style={st.actionDeckWrap}>
              <ActionDeck
                itemId={item.id}
                filmId={item.film_id}
                filmTitle={item.film_title}
                posterPath={item.poster_path ?? null}
                year={item.year ?? undefined}
                ownerUsername={item.username}
                ownerId={item.user_id}
                certifyCount={item.certify_count}
                critiqueCount={item.critique_count}
              />
            </View>

            {hasAutopsy && <AutopsyStrip onTurnOver={turnOver} />}
          </ActivityCardShell>
        </Animated.View>

        {/* ── BACK of the card (lazy — pays nothing until first flip) ── */}
        {backMounted && hasAutopsy && (
          <Animated.View
            style={[StyleSheet.absoluteFillObject, s.backFace, backStyle]}
            pointerEvents={flipped ? 'auto' : 'none'}
            accessibilityElementsHidden={!flipped}
            importantForAccessibility={flipped ? 'auto' : 'no-hide-descendants'}
          >
            <AutopsyBack autopsy={autopsyStats} username={item.username} onReturn={turnBack} />
          </Animated.View>
        )}
      </View>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  // The shadow host: the rail margins, and on iOS the lift. Nothing here clips.
  cardShadow: {
    // One rail: 16px, aligned with the header, tabs, and chips above.
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 4,
    ...effects.flat,
  },
  // Only an Auteur card lifts, in its own crimson; every other card lies flat on the lit house.
  cardShadowAuteur: {
    shadowColor: colors.bloodReel,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
  },
  // The clip host: the paper, the border, and the mask the reverse face turns inside.
  card: { ...EDGE_LIT,
    backgroundColor: colors.soot,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.4)',
    overflow: 'hidden',
    position: 'relative',
    // Android's lift, on the painted view; shadowColor tints it (API 28+), here transparent.
    elevation: 12,
    ...effects.flat,
  },
  cardPremium: {
    borderColor: 'rgba(184,137,26,0.3)',
    backgroundColor: colors.ink,
  },
  cardAuteur: { ...EDGE_LIT,
    borderColor: colors.crimsonBorder,
    backgroundColor: colors.sootAuteur,
    // The Android lift in crimson, as cardShadowAuteur casts it on iOS.
    shadowColor: colors.bloodReel,
  },
  backFace: {
    backgroundColor: colors.ink,
    borderRadius: 3,
    overflow: 'hidden',
  },

  // ── Editorial (the crown — true editorial only) ──
  editorialHeaderContainer: {
    width: '100%',
    height: 100,
    position: 'relative',
  },
  editorialHeaderImageWrap: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  editorialHeaderAccent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  editorialBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(13,11,9,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.sepiaBorder,
  },
  editorialBadgeText: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.marqueeGold,
    includeFontPadding: false,
  },

  // ── Index card zones ──
  ledgerWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    zIndex: 1,
  },
  filmRow: {
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 14,
    zIndex: 1,
  },
  filmMeta: {
    flex: 1,
    paddingTop: 2,
  },
  proseWrap: {
    paddingHorizontal: 16,
    zIndex: 1,
  },
  cardTitle: {
    fontFamily: fonts.display,
    fontSize: 19,
    color: colors.silverScreen,
    lineHeight: 24,
    textShadowColor: colors.sepiaGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
    includeFontPadding: false,
  },
  cardYear: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 2.4,
    color: colors.fog,
    marginTop: 5,
    marginBottom: 6,
    includeFontPadding: false,
  },
});

const st = StyleSheet.create({
  actionDeckWrap: { marginTop: 14, width: '100%', zIndex: 1 },
});

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
import { View, Text, StyleSheet, DeviceEventEmitter, AccessibilityInfo } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing, interpolate,
  useReducedMotion,
} from 'react-native-reanimated';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { ActionDeck } from './ActionDeck';
import { AutopsyStrip, AutopsyBack } from './AutopsyView';
import { ReviewContent, VerdictBlock } from './ReviewContent';
import { UserAttributionRow } from './UserAttributionRow';
import { PosterFrame } from './PosterFrame';
import { isAuteurPlusTier, isArchivistPlusTier } from '@/src/utils/tier';

// Single source of truth: Zod schema
import type { FeedItem } from '@/src/schemas/feed.schema';

const TMDB_IMG_W500 = 'https://image.tmdb.org/t/p/w500';
export type { FeedItem };

// The flip law: heavy card stock — acceleration off the fingertip,
// a firm damped landing. A timing curve cannot overshoot.
const FLIP_MS = 420;
const FLIP_EASING = Easing.bezier(0.33, 0, 0.15, 1);
const CROSSFADE_MS = 250;

const ActivityCardShell = ({ children, isPremium, isAuteur }: { children: React.ReactNode, isPremium: boolean, isAuteur: boolean }) => {
  return (
    <>
      <LinearGradient
        colors={isAuteur ? ['rgba(40,18,18,0.7)', 'rgba(14,5,5,0.95)'] : ['rgba(15, 12, 10, 0.95)', 'rgba(5, 4, 3, 0.98)']}
        locations={[0, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      {(isPremium || isAuteur) && (
        <>
          <LinearGradient colors={[isAuteur ? 'rgba(125,31,31,0.08)' : 'rgba(184,137,26,0.08)', 'transparent']} start={{x: 0, y: 0}} end={{x: 0.5, y: 0.5}} style={StyleSheet.absoluteFillObject} />
          <LinearGradient colors={[isAuteur ? 'rgba(125,31,31,0.04)' : 'rgba(184,137,26,0.04)', 'transparent']} start={{x: 1, y: 1}} end={{x: 0.5, y: 0.5}} style={StyleSheet.absoluteFillObject} />
        </>
      )}
      {children}
    </>
  );
};

/**
 * True editorial banner only — the tribunal's pick wears the crown.
 * (The old automatic blurred-poster billboard on every premium log is
 * retired: tiers speak through washes, glow, crest, and the ledger rule.)
 */
const ActivityEditorialHeader = React.memo(({ backdropUri }: { backdropUri: string }) => {
  return (
    <View style={s.editorialHeaderContainer}>
      <View style={s.editorialHeaderImageWrap}>
        <Image
          source={{ uri: backdropUri }}
          style={StyleSheet.absoluteFillObject}
          cachePolicy="memory-disk"
          placeholder={{ blurhash: SEPIA_HASH }}
          contentFit="cover"
          transition={200}
        />
        <LinearGradient colors={['rgba(11,10,8,0.3)', 'rgba(11,10,8,0.95)']} style={StyleSheet.absoluteFillObject} />
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

export const ActivityCard = React.memo(function ActivityCard({ item, index }: { item: FeedItem; index: number }) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const isArchivist = isArchivistPlusTier(item.role);
  const isAuteur = isAuteurPlusTier(item.role);
  const isPremium = isArchivist || isAuteur || !!item.editorial_header || !!item.pull_quote;

  const autopsyStats = (item.autopsy ?? undefined) as Record<string, number> | undefined;
  const hasAutopsy = !!item.is_autopsied && !!autopsyStats && Object.keys(autopsyStats).length > 0;

  const editorialUri = item.editorial_header ? `${TMDB_IMG_W500}${item.editorial_header}` : null;

  const timeAgo = useMemo(() => getTimeAgo(item.created_at), [item.created_at]);

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

  const frontStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return { opacity: 1 - flip.value, transform: [] };
    }
    return {
      opacity: 1,
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
      opacity: 1,
      transform: [
        { perspective: 1000 },
        { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` },
      ],
    };
  });

  const handleFilmPress = useCallback(() => {
    DeviceEventEmitter.emit('reelhouse:projection-mark');
    (router.push as any)(`/film/${item.film_id}` as any);
  }, [router, item.film_id]);

  const handleUserPress = useCallback(() => {
    (router.push as any)(`/user/${item.username}` as any);
  }, [router, item.username]);

  const handleLogPress = useCallback(() => {
    (router.push as any)(`/log/${item.id}` as any);
  }, [router, item.id]);

  return (
    <View style={{ zIndex: index }}>
      <View style={[s.card, isPremium && s.cardPremium, isAuteur && s.cardAuteur]} shouldRasterizeIOS>
        {/* ── FRONT of the card ── */}
        <Animated.View
          style={frontStyle}
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
                timeAgo={timeAgo}
                onUserPress={handleUserPress}
              />
            </View>

            {/* The film row — poster stapled left, identity right */}
            <View style={s.filmRow}>
              <PosterFrame itemId={item.id} filmId={item.film_id} posterPath={item.poster_path} isPremium={isPremium} isAuteur={isAuteur} onPress={handleFilmPress} />
              <View style={s.filmMeta}>
                <PressableScale onPress={handleFilmPress} hitSlop={st.hitSlop} haptic="selection" pressedScale={0.96}>
                  <Text style={s.cardTitle} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7}>{item.film_title}</Text>
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
  card: {
    backgroundColor: 'rgba(8,6,4,0.98)',
    // One rail: 16px, aligned with the header, tabs, and chips above.
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.4)',
    overflow: 'hidden',
    position: 'relative',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
  },
  cardPremium: {
    borderColor: 'rgba(184,137,26,0.3)',
    backgroundColor: 'rgba(10,8,4,1)',
  },
  cardAuteur: {
    borderColor: colors.crimsonBorder,
    backgroundColor: 'rgba(12,5,5,1)',
  },
  backFace: {
    backgroundColor: '#0B0806',
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
    backgroundColor: 'rgba(11,10,8,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.25)',
  },
  editorialBadgeText: {
    fontFamily: fonts.sub,
    fontSize: 7,
    letterSpacing: 2.5,
    color: 'rgba(218,165,32,0.9)',
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
    color: '#F2ECD8',
    lineHeight: 24,
    textShadowColor: 'rgba(184,137,26, 0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
    includeFontPadding: false,
  },
  cardYear: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 3,
    color: colors.fog,
    marginTop: 5,
    marginBottom: 6,
    includeFontPadding: false,
  },
});

const st = StyleSheet.create({
  hitSlop: { top: 15, bottom: 15, left: 15, right: 15 },
  actionDeckWrap: { marginTop: 14, width: '100%', zIndex: 1 },
});

import React, { useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { CinematicFlashList } from '../layout/CinematicFlashList';
import { LayoutList, Lock, ListOrdered } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation, ReduceMotion } from 'react-native-reanimated';
import { colors, fonts , SEPIA_HASH } from '../../theme/theme';
import { tmdb } from '../../lib/tmdb';
import type { ProfileList, ProfileListFilm } from '../../types';
import PressableScale from '../PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';
import { r, roomTier, ROOM_INSET } from './roomStyles';
import { RoomRetrieving, RoomEmpty, RoomFoot, RoomLoadMore } from './RoomParts';

/**
 * THE STACKS — bound volumes, not thumbnails.
 *
 * A stack is the one thing in these six rooms a member MADE. It had a fanned
 * strip of three posters and a title, which is a thumbnail; what it did not
 * have was any sense of being an object with a shape. It gets a spine now, in
 * the member's own rank colour — the thing you actually see when a book is on a
 * shelf — and the private ones get a lock that reads as a clasp rather than a
 * yellow pill floating over the artwork.
 */

interface ProfileListsTabProps {
  lists: ProfileList[];
  /** Has the data landed? A room must not describe itself before it knows. */
  ready?: boolean;
  tier?: string | null;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  isSelf?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
}

const ProfileListCard = React.memo(({ list, router, edge }: { list: ProfileList, router: import('expo-router').Router, edge: string }) => {
  const posters = (list.films || [])
    .filter((f: ProfileListFilm) => f.poster)
    .slice(0, 3)
    .map((f: ProfileListFilm) => tmdb.poster(f.poster || '', 'w185'));

  return (
    <PressableScale
      // The card is far larger than 44pt on its own, and the gutter between two
      // of them is spent entirely on their margins — so a card claims nothing.
      // At 8 per side, two neighbouring stacks overlapped by 6pt and the later
      // one silently took every tap meant for the earlier.
      hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
      style={s.stackCard}
      onPress={() => (router.push as any)(`/stacks/${list.id}` as any)}
      haptic
      accessibilityRole="button"
      accessibilityLabel={[
        list.title ?? 'Untitled stack',
        `${list.filmCount} ${list.filmCount === 1 ? 'film' : 'films'}`,
        list.isRanked ? 'ranked' : '',
        list.isPrivate ? 'private' : '',
      ].filter(Boolean).join(', ')}
      accessibilityHint="Opens the stack"
    >
      <View style={s.stackPosterWrap}>
        {posters.length > 0 ? (
          posters.map((uri: any, i: number) => (
            <Image
              key={i}
              source={{ uri }}
              style={[s.stackPosterPanel, { left: `${(i * 100) / posters.length}%` as import('react-native').DimensionValue, width: `${100 / posters.length}%` as import('react-native').DimensionValue }]}
              cachePolicy="memory-disk"
              placeholder={{ blurhash: SEPIA_HASH }}
              transition={200}
            />
          ))
        ) : (
          <View style={s.stackEmptyBg} />
        )}
        <View style={s.stackOverlay} pointerEvents="none" />
        {/* The spine — the member's rank, and the thing that makes this read as
            a bound volume rather than a wide thumbnail. */}
        <View style={[r.spine, { backgroundColor: edge }]} pointerEvents="none" />
        <View style={r.spineSeam} pointerEvents="none" />
        {list.isPrivate && (
          <View style={s.clasp} pointerEvents="none">
            <Lock size={9} color={colors.ink} strokeWidth={2.5} />
          </View>
        )}
      </View>
      <View style={s.stackContent}>
        <View style={s.badgeRow}>
          {/* filmCount, NOT films.length — for a visitor that array is capped at 4,
              which is how a 96-film stack advertised itself as "4 FILMS" (#46). */}
          <Text {...scaledTextProps} style={s.stackBadge}>{list.filmCount} {list.filmCount === 1 ? 'FILM' : 'FILMS'}</Text>
          {list.isRanked && (
            <View style={s.rankedBadge}>
              <ListOrdered size={9} color={colors.sepia} />
              <Text {...scaledTextProps} style={s.rankedText}>RANKED</Text>
            </View>
          )}
        </View>
        <Text {...scaledTextProps} style={s.stackTitle} numberOfLines={2}>{(list.title || '').toUpperCase()}</Text>
        {list.description ? (
          <Text {...scaledTextProps} style={s.stackDesc} numberOfLines={2}>{list.description}</Text>
        ) : null}
      </View>
    </PressableScale>
  );
});

export default React.memo(function ProfileListsTab({ lists, ready = true, tier, onLoadMore, isLoadingMore, hasMore, isSelf, refreshing = false, onRefresh, bottomInset }: ProfileListsTabProps) {
  const router = useRouter();
  const edge = useMemo(() => roomTier(tier).edge, [tier]);

  const breatheAnim = useSharedValue(0.1);
  useEffect(() => {
    breatheAnim.value = withRepeat(
      withTiming(0.4, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      // 20, not -1 — see the Archive.
      20, true, undefined, ReduceMotion.System,
    );
    return () => cancelAnimation(breatheAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: breatheAnim.value * -3 }],
    shadowOpacity: breatheAnim.value,
  }));

  const renderItem = useCallback(({ item }: { item: ProfileList }) => {
    return (
      <ProfileListCard list={item} router={router} edge={edge} />
    );
  }, [router, edge]);

  const ListEmptyComponent = useMemo(() => {
    if (lists.length > 0) return null;

    if (!ready) return <View style={s.footWrap}><RoomRetrieving room="the stacks" /></View>;

    if (isSelf) {
      return (
        <Animated.View style={[s.emptyStateSelf, pulseStyle]}>
          <View style={s.dossierStackBg1} />
          <View style={s.dossierStackBg2} />
          <View style={s.dossierFront}>
            <LayoutList size={32} color={colors.parchment} strokeWidth={1.5} style={r.ownIcon} />
            <Text {...scaledTextProps} style={r.ownTitle}>Uncharted Stacks</Text>
            <PressableScale style={r.ownAct} onPress={() => (router.push as any)('/list-modal' as never)} haptic accessibilityRole="button" accessibilityLabel="Compile a dossier">
              <Text {...scaledTextProps} style={r.ownActText}>COMPILE A DOSSIER</Text>
            </PressableScale>
          </View>
        </Animated.View>
      );
    }

    // This room's list carries only HALF the inset (the cards carry the rest),
    // so anything that is not a card has to make up the difference or it sits
    // 8pt further out than the same panel in the other five rooms.
    return (
      <View style={s.footWrap}>
        <RoomEmpty
          icon={<LayoutList size={26} color={colors.sepia} strokeWidth={1} style={r.stateIcon} />}
          title="The Stacks are Empty"
          body="This member hasn’t compiled a stack yet."
        />
      </View>
    );
  }, [lists.length, ready, isSelf, pulseStyle, router]);

  const ListFooterComponent = useMemo(() => {
    if (lists.length === 0) return null;
    return (
      <View style={s.footWrap}>
        {hasMore && <RoomLoadMore busy={isLoadingMore} onPress={onLoadMore} />}
        <RoomFoot tier={tier} />
      </View>
    );
  }, [lists.length, hasMore, isLoadingMore, onLoadMore, tier]);

  return (
    <View style={r.container}>
      <CinematicFlashList
        data={lists}
        renderItem={renderItem}
        keyExtractor={(item: ProfileList) => item.id}
        numColumns={2}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        estimatedItemSize={200}
        contentContainerStyle={r.listContentGrid}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.5}
        bottomInset={bottomInset}
      />
    </View>
  );
});

/** Half the room inset lives on each card, so the gutter matches the margin. */
const CARD_MARGIN = ROOM_INSET / 2;

const s = StyleSheet.create({
  // ── a bound volume ──
  stackCard: { flex: 1, marginHorizontal: CARD_MARGIN, marginBottom: 20 },
  stackPosterWrap: { width: '100%', aspectRatio: 3 / 2, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(18,14,9,0.5)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(232,223,208,0.14)', position: 'relative' },
  stackPosterPanel: { position: 'absolute', top: 0, bottom: 0, height: '100%' },
  stackEmptyBg: { flex: 1, backgroundColor: 'rgba(18,14,9,0.7)' },
  stackOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,4,3,0.32)' },
  /**
   * A clasp, not a pill. The old lock was a filled brass circle floating over
   * the artwork at radius 12 — the roundest object in an app where nothing is
   * round, and brass, which everywhere else means "you can press this".
   */
  clasp: { position: 'absolute', top: 0, right: 10, paddingHorizontal: 5, paddingTop: 4, paddingBottom: 5, backgroundColor: colors.sepia, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  stackContent: { paddingTop: 9 },
  stackBadge: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.8, color: colors.sepia, opacity: 0.85 },
  /**
   * `adjustsFontSizeToFit` is gone from both of these. Paired with
   * `numberOfLines`, it shrinks a long title until it fits — so a wall of
   * stacks was set in a different size per card, and the shortest title on the
   * screen was the largest. Two lines and an ellipsis, at one size, always.
   */
  stackTitle: { fontFamily: fonts.display, fontSize: 13, lineHeight: 17, color: colors.parchment, marginTop: 5 },
  stackDesc: { fontFamily: fonts.bodyItalic, fontSize: 10.5, lineHeight: 15, color: colors.fog, opacity: 0.75, marginTop: 4 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rankedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(184,137,26,0.1)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(184,137,26,0.3)' },
  rankedText: { fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1, color: colors.sepia },

  /**
   * Anything in this room that is NOT a card — the footer, the empty panels,
   * the retrieving line — sits inside a list carrying only half the room inset,
   * because the other half lives on the cards. This is that other half.
   */
  footWrap: { paddingHorizontal: CARD_MARGIN },

  // ── your own empty stacks ──
  emptyStateSelf: { marginTop: 24, marginHorizontal: CARD_MARGIN, position: 'relative', shadowColor: 'rgba(0,0,0,0.8)', shadowOffset: { width: 0, height: 10 }, shadowRadius: 20 },
  dossierStackBg1: { position: 'absolute', top: -12, left: 12, right: 12, height: '100%', backgroundColor: 'rgba(15,12,8,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 4 },
  dossierStackBg2: { position: 'absolute', top: -6, left: 6, right: 6, height: '100%', backgroundColor: 'rgba(18,14,9,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 4 },
  dossierFront: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40, backgroundColor: 'rgba(25,20,15,1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 4 },
});


ProfileListCard.displayName = 'ProfileListCard';

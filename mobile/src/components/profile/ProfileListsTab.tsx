import React, { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { Image } from 'expo-image';
import { CinematicFlashList } from '../layout/CinematicFlashList';
import { LayoutList, Lock, ListOrdered, Search } from 'lucide-react-native';
import { nav } from '@/src/utils/typedRouter';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation, ReduceMotion } from 'react-native-reanimated';
import { colors, fonts , SEPIA_HASH } from '../../theme/theme';
import { tmdb } from '../../lib/tmdb';
import type { ProfileList, ProfileListFilm, ShelfSort } from '../../types';
import PressableScale from '../PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';
import { r, roomTier, ROOM_INSET } from './roomStyles';
import { RoomChip, RoomSearch, RoomRetrieving, RoomUnreachable, RoomEmpty, RoomFoot, RoomLoadMore } from './RoomParts';
import { EDGE_LIT } from '@/src/theme/light';

/**
 * THE STACKS — bound volumes, not thumbnails: the one thing in these rooms a
 * member MADE. Each has a spine in the member's own rank colour (what you see
 * of a book on a shelf), and a private one is held by a clasp.
 */

/** The same three orders the Watchlist and the Vault offer. */
const STACK_SORTS: { id: ShelfSort; label: string }[] = [
  { id: 'default', label: 'RECENT' },
  { id: 'az', label: 'A–Z' },
  { id: 'za', label: 'Z–A' },
];

interface ProfileListsTabProps {
  lists: ProfileList[];
  listsSort?: ShelfSort;
  setListsSort?: (val: ShelfSort) => void;
  listsSearch?: string;
  setListsSearch?: (v: string) => void;
  /** The reconciled total — decides whether search is worth a row. */
  totalLists?: number;
  /** Has the data landed? A room must not describe itself before it knows. */
  ready?: boolean;
  /** A visitor's room whose read failed: the way to ask again (the room then says so). */
  unreachable?: () => void;
  tier?: string | null;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  isSelf?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
}

const ProfileListCard = React.memo(({ list, edge }: { list: ProfileList, edge: string }) => {
  const posters = (list.films || [])
    .filter((f: ProfileListFilm) => f.poster)
    .slice(0, 3)
    .map((f: ProfileListFilm) => tmdb.poster(f.poster || '', 'w185'));

  return (
    <PressableScale
      // The card is far larger than 44pt on its own, and the gutter between two
      // of them is spent entirely on their margins — so a card claims nothing
      // (any slop and the later of two neighbours takes the earlier's taps).
      hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
      style={s.stackCard}
      onPress={() => nav.push(`/stacks/${list.id}`)}
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
          {/* filmCount, NOT films.length: for a visitor that array is capped at
              4, and a 96-film stack would call itself "4 FILMS". */}
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

export default React.memo(function ProfileListsTab({ lists, listsSort = 'default', setListsSort, listsSearch, setListsSearch, totalLists, ready = true, unreachable, tier, onLoadMore, isLoadingMore, hasMore, isSelf, refreshing = false, onRefresh, bottomInset }: ProfileListsTabProps) {
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

  /**
   * Search — the way IN. Shown past one screenful, measured on the REAL total
   * rather than the rows in hand (under a search, those are its answer), and
   * always while a search is live.
   */
  const searching = !!listsSearch?.trim();
  const showSearch = (totalLists ?? lists.length) > 6 || searching;
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localSearch, setLocalSearch] = useState(listsSearch ?? '');
  const handleSearchChange = useCallback((val: string) => {
    setLocalSearch(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setListsSearch?.(val), 300);
  }, [setListsSearch]);
  // A pending debounce must not outlive the room.
  useEffect(() => () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  }, []);



  const renderItem = useCallback(({ item }: { item: ProfileList }) => {
    return (
      <ProfileListCard list={item} edge={edge} />
    );
  }, [edge]);

  const ListEmptyComponent = useMemo(() => {
    if (lists.length > 0) return null;

    if (!ready) return <View style={s.footWrap}>{unreachable ? <RoomUnreachable room="the stacks" onRetry={unreachable} /> : <RoomRetrieving room="the stacks" />}</View>;

    // A SEARCH found nothing — not an empty room.
    if (searching) {
      return (
        <View style={s.footWrap}>
          <RoomEmpty
            invite
            icon={<Search size={26} color={colors.sepia} strokeWidth={1} style={r.stateIcon} />}
            title="Nothing under that name"
            body={`No stack matches “${listsSearch?.trim()}”.`}
            actionLabel="CLEAR THE SEARCH"
            onAction={() => { setLocalSearch(''); setListsSearch?.(''); }}
          />
        </View>
      );
    }

    if (isSelf) {
      return (
        <Animated.View style={[s.emptyStateSelf, pulseStyle]}>
          <View style={s.dossierStackBg1} pointerEvents="none" />
          <View style={s.dossierStackBg2} pointerEvents="none" />
          <View style={s.dossierFront}>
            <LayoutList size={32} color={colors.parchment} strokeWidth={1.5} style={r.ownIcon} />
            <Text {...scaledTextProps} style={r.ownTitle}>Uncharted Stacks</Text>
            <PressableScale style={r.ownAct} onPress={() => nav.push('/list-modal')} haptic accessibilityRole="button" accessibilityLabel="Compile a stack">
              <Text {...scaledTextProps} style={r.ownActText}>COMPILE A STACK</Text>
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
  }, [lists.length, ready, unreachable, searching, listsSearch, setListsSearch, isSelf, pulseStyle]);

  /**
   * The search and the order the volumes stand in — only when there are
   * enough of them to matter: six is where a shelf stops being scannable.
   */
  const ListHeaderComponent = useMemo(() => {
    if (!showSearch) return null;
    return (
      <View style={s.footWrap}>
        <View style={s.searchWrap}>
          <RoomSearch
            value={localSearch}
            onChange={handleSearchChange}
            onClear={() => { setLocalSearch(''); setListsSearch?.(''); }}
            placeholder="Find a stack…"
            a11y="Search the stacks by name or description"
            ember={<Search size={13} color={colors.fog} strokeWidth={1.5} style={s.searchIcon} />}
          />
        </View>
        <View style={r.chipRow}>
          {STACK_SORTS.map(sv => (
            <RoomChip
              key={sv.id}
              label={sv.label}
              on={listsSort === sv.id}
              onPress={() => setListsSort?.(sv.id)}
              gap={8}
              a11y={`Order the stacks: ${sv.label}`}
            />
          ))}
        </View>
      </View>
    );
  }, [showSearch, listsSort, setListsSort, localSearch, handleSearchChange, setListsSearch]);

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
        ListHeaderComponent={ListHeaderComponent}
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
  stackPosterWrap: { width: '100%', aspectRatio: 3 / 2, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(30,25,20,0.5)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(232,223,208,0.14)', position: 'relative' },
  stackPosterPanel: { position: 'absolute', top: 0, bottom: 0, height: '100%' },
  stackEmptyBg: { flex: 1, backgroundColor: 'rgba(30,25,20,0.7)' },
  stackOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,5,4,0.32)' },
  // A clasp hung from the top edge, square-cornered: nothing here is round.
  clasp: { position: 'absolute', top: 0, right: 10, paddingHorizontal: 5, paddingTop: 4, paddingBottom: 5, backgroundColor: colors.sepia, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  stackContent: { paddingTop: 9 },
  stackBadge: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.8, color: colors.sepia },
  // Two lines and an ellipsis, at one size, always: shrunk to fit, a wall of
  // stacks would be set in a different size per card.
  stackTitle: { fontFamily: fonts.display, fontSize: 13, lineHeight: 17, color: colors.parchment, marginTop: 5 },
  // Solid fogQuiet: a word never borrows its contrast from the ground, so it
  // holds 4.5:1 on a lit card as on the page.
  stackDesc: { fontFamily: fonts.bodyItalic, fontSize: 10.5, lineHeight: 15, color: colors.fogQuiet, marginTop: 4 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rankedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(184,137,26,0.1)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(184,137,26,0.3)' },
  rankedText: { fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1, color: colors.sepia },

  /**
   * Anything in this room that is NOT a card — the footer, the empty panels,
   * the retrieving line — sits inside a list carrying only half the room inset,
   * because the other half lives on the cards. This is that other half.
   */
  footWrap: { paddingHorizontal: CARD_MARGIN },
  searchWrap: { marginBottom: 12 },
  searchIcon: { opacity: 0.6 },

  // ── your own empty stacks ──
  emptyStateSelf: { marginTop: 24, marginHorizontal: CARD_MARGIN, position: 'relative', shadowColor: 'rgba(0,0,0,0.8)', shadowOffset: { width: 0, height: 10 }, shadowRadius: 20 },
  dossierStackBg1: { position: 'absolute', top: -12, left: 12, right: 12, height: '100%', backgroundColor: 'rgba(13,11,9,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 4 },
  dossierStackBg2: { position: 'absolute', top: -6, left: 6, right: 6, height: '100%', backgroundColor: 'rgba(30,25,20,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 4 },
  dossierFront: { ...EDGE_LIT, alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 4 },
});


ProfileListCard.displayName = 'ProfileListCard';

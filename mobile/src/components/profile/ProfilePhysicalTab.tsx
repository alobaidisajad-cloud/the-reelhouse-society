import React, { useEffect, useMemo, useCallback } from 'react';
import { View, ScrollView, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { CinematicFlashList } from '../layout/CinematicFlashList';
import { Disc, Film as FilmIcon } from 'lucide-react-native';
import { colors, fonts , SEPIA_HASH } from '../../theme/theme';
import { tmdb } from '../../lib/tmdb';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation, ReduceMotion } from 'react-native-reanimated';
import type { ProfileVaultItem, FormatCount, ShelfSort } from '../../types';
import PressableScale from '../PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';
import { FORMAT_META, shelfRank } from '@/src/constants/formats';
import { r, posterColumns } from './roomStyles';
import { RoomChip, RoomChipDivider, RoomRail, RoomRetrieving, RoomEmpty, RoomFoot, RoomLoadMore } from './RoomParts';

/**
 * THE VAULT — a collection of OBJECTS, arranged the way objects are.
 *
 * This room held physical discs and drew them as flat posters in a grid,
 * shelved by the MONTH each one was catalogued — a fact about the database, not
 * about the collection: a member's 4K box and their father's VHS sat side by
 * side because they were typed in on the same Tuesday. Nothing on the screen
 * said "this is a thing you own" rather than "this is a film you watched".
 *
 * So the Vault is shelved by CARRIER now, newest first, and every item is drawn
 * as a CASE: a coloured spine down its left edge in the format's own colour,
 * standing on a shelf board. It is the same data. It reads as a wall of discs.
 */

const SHELF_LABEL: Record<string, string> = { '4k': '4K UHD', bluray: 'BLU-RAY', dvd: 'DVD', vhs: 'VHS', laserdisc: 'LASERDISC', steelbook: 'STEELBOOK', criterion: 'CRITERION' };
/** The same three the Watchlist offers — one vocabulary for 'in what order'. */
const SHELF_SORTS: { id: ShelfSort; label: string }[] = [
  { id: 'default', label: 'RECENT' },
  { id: 'az', label: 'A–Z' },
  { id: 'za', label: 'Z–A' },
];

const CASE_BADGE: Record<string, string> = { '4k': '4K', bluray: 'BD', dvd: 'DVD', vhs: 'VHS', laserdisc: 'LD', steelbook: 'SB', criterion: 'CC' };

interface ProfilePhysicalTabProps {
  isSelf: boolean;
  vault: ProfileVaultItem[];
  physicalFilter: string | null;
  setPhysicalFilter: (val: string | null) => void;
  physicalSort: ShelfSort;
  setPhysicalSort: (val: ShelfSort) => void;
  physicalFormatCounts: FormatCount[];
  physicalFiltered: ProfileVaultItem[];
  // `groupByMonth` is gone: a collection is shelved by carrier, not by the
  // Tuesday each copy happened to be typed in.
  /** Has the data landed? A room must not describe itself before it knows. */
  ready?: boolean;
  tier?: string | null;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
}

type VaultListItem =
  | { type: 'shelf'; format: string; count: number; id: string }
  | { type: 'row'; items: ProfileVaultItem[]; format: string; id: string };

// ════════════════════════════════════════════════════════════════════════════
// A CASE ON A SHELF
// ════════════════════════════════════════════════════════════════════════════
const VaultCase = React.memo(function VaultCase({
  vaultItem, format, width,
}: {
  vaultItem: ProfileVaultItem;
  /** The shelf this copy stands on — its spine takes that carrier's colour. */
  format: string;
  width: number;
}) {
  const router = useRouter();
  const posterUri = tmdb.poster(vaultItem.poster_path, 'w185');
  const tint = FORMAT_META[format]?.color ?? colors.sepia;
  // A copy that is BOTH a Blu-ray and a Steelbook stands on both shelves; the
  // badge on the face names the shelf it is standing on, so the same object
  // reads correctly in both places.
  const badge = CASE_BADGE[format] ?? format.toUpperCase();

  const onPress = useCallback(() => {
    const fid = vaultItem.film_id ?? vaultItem.filmId;
    if (fid) (router.push as any)(`/film/${fid}` as never);
  }, [vaultItem.film_id, vaultItem.filmId, router]);

  return (
    <PressableScale
      style={[s.case, { width }]}
      onPress={onPress}
      // Cases sit in a row at the grid gap and stack in shelves — the whole
      // case clears 44pt on its own, so it claims nothing from its neighbours.
      hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
      haptic
      accessibilityRole="button"
      accessibilityLabel={[
        vaultItem.title ?? 'Untitled film',
        FORMAT_META[format]?.label ?? format,
        vaultItem.condition ? `condition ${vaultItem.condition}` : '',
      ].filter(Boolean).join(', ')}
      accessibilityHint="Opens the film"
    >
      {posterUri ? (
        <Image
          source={{ uri: posterUri }}
          style={s.caseFace}
          recyclingKey={posterUri}
          cachePolicy="memory-disk"
          placeholder={{ blurhash: SEPIA_HASH }}
          transition={200}
        />
      ) : (
        <View style={[s.caseFace, s.caseEmpty]}>
          <FilmIcon size={14} color={colors.sepia} strokeWidth={1} />
        </View>
      )}
      {/* The spine and its seam — drawn after the face so they sit on top of
          it, and inert so neither can swallow the tap. */}
      <View style={[r.spine, { backgroundColor: tint, opacity: 0.9 }]} pointerEvents="none" />
      <View style={r.spineSeam} pointerEvents="none" />
      <View style={[s.caseBadge, { borderColor: tint }]} pointerEvents="none">
        <Text {...scaledTextProps} style={[s.caseBadgeText, { color: tint }]} numberOfLines={1}>{badge}</Text>
      </View>
    </PressableScale>
  );
});

export default React.memo(function ProfilePhysicalTab({
  isSelf,
  vault,
  physicalFilter,
  setPhysicalFilter,
  physicalSort = 'default',
  setPhysicalSort,
  physicalFormatCounts,
  physicalFiltered,
  ready = true,
  tier,
  onLoadMore,
  isLoadingMore,
  hasMore,
  refreshing = false,
  onRefresh,
  bottomInset
}: ProfilePhysicalTabProps) {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const grid = useMemo(() => posterColumns(windowWidth, 4), [windowWidth]);

  const breatheAnim = useSharedValue(0.1);
  useEffect(() => {
    breatheAnim.value = withRepeat(
      withTiming(0.6, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      // 20, not -1. Every sibling room caps here and says why: to let the UI
      // thread idle instead of running a worklet for as long as the tab stays
      // open. The Vault looped forever. And it is atmosphere, so it holds still
      // for anyone who has asked the system to stop things moving.
      20, true, undefined, ReduceMotion.System,
    );
    return () => cancelAnimation(breatheAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(184,137,26,${0.2 + breatheAnim.value * 0.5})`,
    backgroundColor: `rgba(10,8,6,${0.9 + (breatheAnim.value * 0.1)})`,
  }));

  /**
   * The shelves.
   *
   * A copy stands on the shelf of EVERY carrier it is recorded under, which is
   * what `formats: string[]` means. Today the log flow writes exactly one, so
   * nothing doubles — but when it learns to write two, a Criterion Blu-ray will
   * appear on both shelves without a line changing here, which is the whole
   * reason it is written this way rather than reading `formats[0]`.
   *
   * A copy with no format at all still has to live somewhere: it goes to an
   * UNFILED shelf rather than silently vanishing from the member's own vault.
   */
  const flashData = useMemo(() => {
    const result: VaultListItem[] = [];
    if (physicalFiltered.length === 0) return result;

    const shelves = new Map<string, ProfileVaultItem[]>();
    for (const item of physicalFiltered) {
      const formats = (item.formats || []).filter(Boolean);
      const keys = formats.length > 0 ? formats : ['unfiled'];
      for (const key of keys) {
        // When a filter is on, only that shelf is standing.
        if (physicalFilter && key !== physicalFilter) continue;
        const shelf = shelves.get(key);
        if (shelf) shelf.push(item); else shelves.set(key, [item]);
      }
    }

    const ordered = Array.from(shelves.entries()).sort((a, b) => {
      const d = shelfRank(a[0]) - shelfRank(b[0]);
      return d !== 0 ? d : a[0].localeCompare(b[0]);
    });

    for (const [format, items] of ordered) {
      result.push({ type: 'shelf', format, count: items.length, id: `shelf-${format}` });
      for (let i = 0; i < items.length; i += 4) {
        result.push({ type: 'row', items: items.slice(i, i + 4), format, id: `row-${format}-${i}` });
      }
    }
    return result;
  }, [physicalFiltered, physicalFilter]);

  // Pre-fetch all visible and next-page posters using expo-image for zero-latency scroll
  useEffect(() => {
    const urlsToPrefetch = physicalFiltered
      .slice(0, 40) // aggressive prefetch of first 40 items
      .map(item => tmdb.poster(item.poster_path, 'w185'))
      .filter((url): url is string => !!url);

    if (urlsToPrefetch.length > 0) {
      Image.prefetch(urlsToPrefetch);
    }
  }, [physicalFiltered]);

  const renderItem = useCallback(({ item }: { item: VaultListItem }) => {
    if (item.type === 'shelf') {
      const meta = FORMAT_META[item.format];
      return (
        <RoomRail
          label={SHELF_LABEL[item.format] ?? (meta?.label ?? item.format).toUpperCase()}
          count={`${item.count} ${item.count === 1 ? 'COPY' : 'COPIES'}`}
          tint={meta?.color}
        />
      );
    }
    return (
      <View>
        <View style={[r.gridRow, { gap: grid.gap }]}>
          {item.items.map(v => (
            <VaultCase key={`${item.format}-${v.id}`} vaultItem={v} format={item.format} width={grid.width} />
          ))}
        </View>
        {/* The board the row stands on. */}
        <View style={r.shelfBoard} />
      </View>
    );
  }, [grid]);

  const ListHeaderComponent = useMemo(() => {
    if (physicalFormatCounts.length === 0) return null;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={r.chipScroll} contentContainerStyle={r.chipRow}>
        <RoomChip
          label="ALL"
          count={vault.length}
          on={!physicalFilter}
          onPress={() => setPhysicalFilter(null)}
          gap={8}
          a11y={`Show the whole vault, ${vault.length} items`}
        />
        {physicalFormatCounts.map((f: FormatCount) => (
          <RoomChip
            key={f.id}
            label={f.label.toUpperCase()}
            count={f.count}
            on={physicalFilter === f.id}
            onPress={() => setPhysicalFilter(physicalFilter === f.id ? null : f.id)}
            gap={8}
            a11y={`Show only ${f.label}, ${f.count} items`}
          />
        ))}
        {/* WHICH shelves, then in what ORDER on them — one row, one hairline,
            because a third row of header chrome is worse than the choice is
            worth. A shelf you own gets alphabetised; that is what shelves are. */}
        <RoomChipDivider />
        {SHELF_SORTS.map(sv => (
          <RoomChip
            key={sv.id}
            label={sv.label}
            on={physicalSort === sv.id}
            onPress={() => setPhysicalSort(sv.id)}
            gap={8}
            a11y={`Arrange each shelf: ${sv.label}`}
          />
        ))}
      </ScrollView>
    );
  }, [physicalFormatCounts, physicalFilter, vault.length, setPhysicalFilter, physicalSort, setPhysicalSort]);

  const ListEmptyComponent = useMemo(() => {
    if (physicalFiltered.length > 0) return null;

    if (!ready) return <RoomRetrieving room="the vault" />;

    // A FORMAT filter matched nothing — not an empty vault.
    if (vault.length > 0) {
      const meta = physicalFilter ? FORMAT_META[physicalFilter] : null;
      return (
        <RoomEmpty
          invite
          icon={<Disc size={26} color={colors.sepia} strokeWidth={1} style={r.stateIcon} />}
          title="That shelf is bare"
          body={`Nothing in the vault is catalogued as ${meta?.label ?? physicalFilter ?? 'that format'}.`}
          actionLabel="SHOW EVERY SHELF"
          onAction={() => setPhysicalFilter(null)}
        />
      );
    }

    if (isSelf) {
      return (
        <Animated.View style={[s.emptyStateSelf, pulseStyle]}>
          <View style={s.vaultPattern} pointerEvents="none" />
          <Disc size={36} color={colors.parchment} strokeWidth={1.5} style={r.ownIcon} />
          <Text {...scaledTextProps} style={r.ownTitle}>Empty Shelves</Text>
          <PressableScale style={r.ownAct} onPress={() => (router.push as any)('/search-modal' as never)} haptic accessibilityRole="button" accessibilityLabel="Catalogue physical media">
            <Text {...scaledTextProps} style={r.ownActText}>CATALOGUE A COPY</Text>
          </PressableScale>
        </Animated.View>
      );
    }

    return (
      <RoomEmpty
        icon={<Disc size={26} color={colors.sepia} strokeWidth={1} style={r.stateIcon} />}
        title="The Shelves are Bare"
        body="This member hasn’t catalogued a physical copy yet."
      />
    );
  }, [physicalFiltered.length, vault.length, physicalFilter, setPhysicalFilter, ready, isSelf, pulseStyle, router]);

  const ListFooterComponent = useMemo(() => {
    if (flashData.length === 0) return null;
    return (
      <View>
        {hasMore && <RoomLoadMore busy={isLoadingMore} onPress={onLoadMore} />}
        <RoomFoot tier={tier} />
      </View>
    );
  }, [flashData.length, hasMore, isLoadingMore, onLoadMore, tier]);

  return (
    <View style={r.container}>
      <CinematicFlashList
        data={flashData}
        renderItem={renderItem}
        keyExtractor={(item: VaultListItem) => item.id}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        // A row of cases plus its shelf board — derived, where the old 100 was a
        // guess less than half the true height of the item it described.
        estimatedItemSize={Math.round(grid.width * 1.5) + 11}
        getItemType={(item: VaultListItem) => item.type}
        contentContainerStyle={r.listContent}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.5}
        bottomInset={bottomInset}
      />
    </View>
  );
});

const s = StyleSheet.create({
  // ── a cased copy ──
  /**
   * `maxWidth: '23.5%'` used to fight `flex: 1` inside a row with an 8pt gap —
   * four of them came to 94% plus 24pt of gaps, which is how the fourth case
   * was clipped on every phone. The width is passed in now, derived once.
   */
  case: {
    position: 'relative', aspectRatio: 2 / 3, borderRadius: 2, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(232,223,208,0.14)',
    backgroundColor: colors.posterVoid,
  },
  caseFace: { width: '100%', height: '100%' },
  caseEmpty: { backgroundColor: 'rgba(18,14,9,0.7)', justifyContent: 'center', alignItems: 'center' },
  caseBadge: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(5,4,3,0.95)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 2, borderWidth: 1 },
  caseBadgeText: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1 },

  // ── your own empty shelves ──
  emptyStateSelf: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40, borderWidth: 2, borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  vaultPattern: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.02)', opacity: 0.5 },
});

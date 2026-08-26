import React, { useMemo, useCallback, useEffect, useState, useRef } from 'react';
import { View, ScrollView, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { CinematicFlashList } from '../layout/CinematicFlashList';
import { Film as FilmIcon, Search, X } from 'lucide-react-native';
import { Image } from 'expo-image';
import { colors, fonts, SEPIA_HASH } from '../../theme/theme';
import { tmdb } from '../../lib/tmdb';
import { stripHTML, isRTLText, truncateReview } from '@/src/utils/text';
import PressableScale from '../PressableScale';
import type { ProfileLog } from '../../types';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation, ReduceMotion } from 'react-native-reanimated';
import VaultLock from './VaultLock';
import { useAuthStore } from '@/src/stores/auth';
import { decorativeTextProps, scaledTextProps } from '@/src/constants/textScaling';
import { r, rtlText, posterColumns, completeCount, countLabel, ROOM_INSET, yearMarker } from './roomStyles';
import { RoomChip, RoomRail, RoomSearch, RoomRetrieving, RoomEmpty, RoomFoot } from './RoomParts';

/**
 * THE ARCHIVE — every film, by the month it was seen.
 *
 * The Archive and the Ledger were twins: the same four-wide grid of the same
 * posters, differing only in which subset of logs they were handed. A member
 * had no way to tell which room they were standing in. The Archive keeps the
 * grid — it is the room for SHEER VOLUME, the wall of everything — and takes
 * the month rails as its structure. The Ledger stops being a grid entirely.
 */

interface ProfileArchiveTabProps {
  logs: ProfileLog[];
  isSelf: boolean;
  archiveSieve: string;
  setArchiveSieve: (val: string) => void;
  archiveFiltered: ProfileLog[];
  renderPosterCard: (log: ProfileLog, width: number) => React.ReactNode;
  groupByMonth: (items: ProfileLog[], dateKey?: string) => Record<string, ProfileLog[]>;
  /** Has the data landed? A room must not describe itself before it knows. */
  ready?: boolean;
  tier?: string | null;
  /** The TRUE films-per-month, from the server. Absent = draw no counts. */
  monthCounts?: { month: string; count: number }[] | null;
  /** The reconciled total — decides whether search is worth a row. */
  totalFilms?: number;
  archiveSearch?: string;
  setArchiveSearch?: (v: string) => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
}

type ArchiveItem =
  | { type: 'header'; title: string; lead: string; count?: string; weight?: number }
  | { type: 'row'; data: ProfileLog[]; id: string }
  | { type: 'walkout'; log: ProfileLog };

/** A film the member left, and why. */
const WalkoutRow = React.memo(function WalkoutRow({ log, onPress }: { log: ProfileLog; onPress: () => void }) {
  const posterUri = tmdb.poster(log.altPoster ?? log.poster, 'w185');
  const reason = useMemo(() => {
    const plain = stripHTML(String(log.abandonedReason ?? '')).replace(/\s+/g, ' ').trim();
    return plain ? truncateReview(plain, 180) : '';
  }, [log.abandonedReason]);
  const rtl = useMemo(() => isRTLText(reason), [reason]);

  return (
    <PressableScale
      style={s.walkRow}
      onPress={onPress}
      // Rows stack with no gap, so there is no slack to claim — any at all and
      // each row takes the tap belonging to its neighbour.
      hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
      haptic
      accessibilityRole="button"
      accessibilityLabel={[
        log.title ?? 'Untitled film',
        log.year ? String(log.year) : '',
        'abandoned',
        reason ? 'with a reason given' : 'no reason given',
      ].filter(Boolean).join(', ')}
      accessibilityHint="Opens the entry"
    >
      <View style={s.walkPlateWrap}>
        {posterUri
          ? <Image source={{ uri: posterUri }} style={s.walkPlate} recyclingKey={posterUri} cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={180} />
          : <View style={[s.walkPlate, s.walkPlateEmpty]} />}
      </View>
      <View style={s.walkBody}>
        <View style={s.walkHead}>
          <Text {...scaledTextProps} style={s.walkTitle} numberOfLines={1}>{log.title}</Text>
          {!!log.year && <Text {...scaledTextProps} style={s.walkYear}>{String(log.year)}</Text>}
        </View>
        <View style={s.walkMark}>
          <X size={8} color={colors.crimson} strokeWidth={2.5} />
          <Text {...scaledTextProps} style={s.walkMarkText}>WALKED OUT</Text>
        </View>
        {reason
          ? <Text {...scaledTextProps} style={[s.walkWords, rtl && rtlText]} numberOfLines={2}>{reason}</Text>
          // Said plainly rather than left blank — a row with nothing under the
          // mark reads as a rendering fault.
          : <Text {...scaledTextProps} style={[s.walkWords, s.walkSilent]} numberOfLines={1}>no reason given</Text>}
      </View>
    </PressableScale>
  );
});

const MONTH_INDEX: Record<string, string> = {
  JANUARY: '01', FEBRUARY: '02', MARCH: '03', APRIL: '04', MAY: '05', JUNE: '06',
  JULY: '07', AUGUST: '08', SEPTEMBER: '09', OCTOBER: '10', NOVEMBER: '11', DECEMBER: '12',
};

const SIEVES = [
  { id: 'all', label: 'ALL' },
  { id: 'watched', label: 'WATCHED' },
  { id: 'rewatched', label: 'REWATCHED' },
  { id: 'abandoned', label: 'ABANDONED' },
];

export default function ProfileArchiveTab({
  logs,
  isSelf,
  archiveSieve,
  setArchiveSieve,
  archiveFiltered,
  renderPosterCard,
  groupByMonth,
  ready = true,
  tier,
  monthCounts,
  totalFilms,
  archiveSearch,
  setArchiveSearch,
  onLoadMore,
  isLoadingMore,
  refreshing = false,
  onRefresh,
  bottomInset
}: ProfileArchiveTabProps) {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const grid = useMemo(() => posterColumns(windowWidth, 4), [windowWidth]);

  // The Vault only guards the member's OWN archive, and only when they have
  // explicitly enabled the biometric lock in Settings.
  const biometricLock = useAuthStore((s) => s.user?.preferences?.biometric_lock === true);
  const requiresVault = isSelf && biometricLock;
  const [unlocked, setUnlocked] = useState(false);

  const breatheAnim = useSharedValue(0.2);
  useEffect(() => {
    breatheAnim.value = withRepeat(
      withTiming(0.6, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      // 20, not -1 — the app's own convention, so the UI thread can idle
      // instead of running a worklet for as long as the room stays open. And
      // it is atmosphere, so it holds still for anyone who has asked the
      // system to stop things moving.
      20, true, undefined, ReduceMotion.System,
    );
    return () => cancelAnimation(breatheAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(184,137,26,${breatheAnim.value})`,
    shadowColor: colors.tarnish,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: breatheAnim.value * 0.5,
    shadowRadius: 20,
    elevation: breatheAnim.value * 10
  }));

  const handleUnlocked = useCallback(() => {
    setUnlocked(true);
  }, []);

  /**
   * Search — the way IN to two thousand films.
   *
   * Shown past ONE SCREENFUL, measured against the member's REAL total rather
   * than the rows that happen to have loaded. Gating on the loaded array would
   * make the box appear and disappear as a member scrolls, which is the same
   * small-data mistake as counting a month from one page.
   *
   * Twelve is three rows of four — everything a phone shows at once. Below
   * that, looking is faster than typing.
   */
  const showSearch = (totalFilms ?? logs.length) > 12;
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localSearch, setLocalSearch] = useState(archiveSearch ?? '');

  const handleSearchChange = useCallback((val: string) => {
    setLocalSearch(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setArchiveSearch?.(val), 300);
  }, [setArchiveSearch]);

  // A pending debounce must not outlive the room — see the Ledger.
  useEffect(() => () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  }, []);

  /**
   * The TRUE size of each month, and how heavy it was.
   *
   * `items.length` counted whatever had loaded — the app pages fifty rows at a
   * time, so March said 7 when it held 40, and the number climbed as you
   * scrolled. The server sends the real shape of the whole history on every
   * profile load; it was being thrown away.
   *
   * Under a status filter the server's figures cannot speak for what is on
   * screen (it counted every film in March, not every ABANDONED film in March),
   * so `serverKnows` goes false and both the count and the rhythm disappear.
   * A heading with no number is honest. A wrong one is not.
   */
  const months = useMemo(() => {
    const by = new Map<string, number>();
    let heaviest = 0;
    for (const m of monthCounts ?? []) {
      if (!m?.month || typeof m.count !== 'number') continue;
      by.set(m.month, m.count);
      if (m.count > heaviest) heaviest = m.count;
    }
    return { by, heaviest };
  }, [monthCounts]);

  /**
   * A search narrows the room in a way the server's figures know nothing about
   * — they count every film in March, not every film in March matching
   * "kubrick" — so counts and rhythm both stand down, exactly as under a
   * status filter.
   */
  const searching = !!(archiveSearch && archiveSearch.trim());
  /** Asking for "abandoned" is asking a question whose answer is words. */
  const abandonedView = archiveSieve === 'abandoned' && !searching;
  const serverKnows = archiveSieve === 'all' && !searching && months.by.size > 0;

  const flashData = useMemo(() => {
    if (archiveFiltered.length === 0) return [];

    /**
     * NO MONTH RAILS WHILE SEARCHING.
     *
     * Searching one director across fifteen years produces forty headings with
     * one poster under each — the structure stops organising anything and
     * becomes the noise between results. A search wants a flat wall.
     */
    if (searching) {
      const flat: ArchiveItem[] = [];
      for (let i = 0; i < archiveFiltered.length; i += 4) {
        flat.push({ type: 'row', data: archiveFiltered.slice(i, i + 4), id: `found-${i}` });
      }
      return flat;
    }

    /**
     * FILTERED TO ABANDONED, THE ROOM CHANGES SHAPE.
     *
     * A walk-out reason had nowhere to live in this app. The Ledger holds only
     * films that were rated or written about, and an abandoned film has
     * neither — so `abandoned_reason`, the most characterful sentence a member
     * ever writes, was fetched on every log and displayed in no room at all.
     *
     * A poster grid has no room for a sentence. But asking for "abandoned" is
     * asking a QUESTION, and the answer to it is the reasons, not the artwork.
     * So the room answers in rows.
     */
    if (abandonedView) {
      const rows: ArchiveItem[] = [];
      let lastMonth = '';
      for (const log of archiveFiltered) {
        const month = Object.keys(groupByMonth([log]))[0] ?? '';
        if (month && month !== lastMonth) {
          const cut = month.lastIndexOf(' ');
          rows.push({
            type: 'header',
            title: cut > 0 ? month.slice(0, cut) : month,
            lead: cut > 0 ? month.slice(cut + 1) : '',
            // No count: the server counts every film in March, not every
            // abandoned one. Same rule as everywhere else.
            count: undefined,
          });
          lastMonth = month;
        }
        rows.push({ type: 'walkout', log });
      }
      return rows;
    }

    const grouped = groupByMonth(archiveFiltered);
    const result: ArchiveItem[] = [];
    // A year prints only where it changes — see yearMarker.
    const markYear = yearMarker();

    Object.entries(grouped).forEach(([month, items]) => {
      // `groupByMonth` keys on "MARCH 2026". The MONTH is the heading and takes
      // the display face; the year is a quiet tag beside it. Split from the END
      // so a month name can never be mistaken for the year.
      const cut = month.lastIndexOf(' ');
      const name = cut > 0 ? month.slice(0, cut) : month;
      const year = cut > 0 ? month.slice(cut + 1) : '';
      // The server keys months as `YYYY-MM`; this room groups them by name.
      // Rebuilding the key here rather than anywhere else keeps the two forms
      // adjacent, because a silent mismatch would show every month as unknown.
      const key = year && MONTH_INDEX[name] ? `${year}-${MONTH_INDEX[name]}` : '';
      const real = completeCount({ count: months.by.get(key) ?? -1 }, serverKnows);

      result.push({
        type: 'header',
        title: name,
        lead: markYear(year),
        count: countLabel(real, 'FILM', 'FILMS'),
        weight: real !== undefined && months.heaviest > 0 ? real / months.heaviest : undefined,
      });
      for (let i = 0; i < items.length; i += 4) {
        result.push({
          type: 'row',
          data: items.slice(i, i + 4),
          id: `${month}-row-${i}`
        });
      }
    });

    return result;
  }, [archiveFiltered, groupByMonth, months, serverKnows, searching, abandonedView]);

  const renderItem = useCallback(({ item }: { item: ArchiveItem }) => {
    if (item.type === 'header') {
      return <RoomRail lead={item.lead} label={item.title} count={item.count} weight={item.weight} />;
    }
    if (item.type === 'walkout') {
      return (
        <WalkoutRow
          log={item.log}
          onPress={() => { if (item.log.id) (router.push as any)(`/log/${item.log.id}` as never); }}
        />
      );
    }
    return (
      <View style={[r.gridRow, { gap: grid.gap, marginBottom: 12 }]}>
        {item.data.map(log => (
          <View key={log.id || log.filmId} style={{ width: grid.width }}>
            {renderPosterCard(log, grid.width)}
          </View>
        ))}
      </View>
    );
  }, [renderPosterCard, grid, router]);

  const ListHeaderComponent = useMemo(() => {
    if (logs.length === 0) return null;
    return (
      <>
        {showSearch && (
          <View style={s.searchWrap}>
            <RoomSearch
              value={localSearch}
              onChange={handleSearchChange}
              onClear={() => { setLocalSearch(''); setArchiveSearch?.(''); }}
              placeholder="Find a film…"
              a11y="Search the archive by title"
              ember={<Search size={13} color={colors.fog} strokeWidth={1.5} style={s.searchIcon} />}
            />
          </View>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={r.chipScroll} contentContainerStyle={r.chipRow}>
          {SIEVES.map(sv => (
            <RoomChip
              key={sv.id}
              label={sv.label}
              on={archiveSieve === sv.id}
              onPress={() => { setArchiveSieve(sv.id); }}
              gap={8}
              a11y={`Filter the archive by ${sv.label.toLowerCase()}`}
            />
          ))}
        </ScrollView>
      </>
    );
  }, [logs.length, archiveSieve, setArchiveSieve, showSearch, localSearch, handleSearchChange, setArchiveSearch]);

  const ListEmptyComponent = useMemo(() => {
    if (logs.length > 0 && archiveFiltered.length > 0) return null;

    // Nothing true can be said about a room whose contents are still in transit.
    if (!ready) return <RoomRetrieving room="the archive" />;

    // A SEARCH found nothing — checked BEFORE the filter case, because with
    // both live the search is what the member just did and the one they will
    // want undone.
    if (logs.length > 0 && searching) {
      return (
        <RoomEmpty
          invite
          icon={<Search size={26} color={colors.sepia} strokeWidth={1} style={r.stateIcon} />}
          title="Nothing under that name"
          body={`No film in the archive matches “${archiveSearch}”.`}
          actionLabel="CLEAR THE SEARCH"
          onAction={() => { setLocalSearch(''); setArchiveSearch?.(''); }}
        />
      );
    }

    // A FILTER matched nothing. That is not an empty archive, and telling a
    // member with 200 films that "the Archive is Empty" sends them hunting for
    // a fault in their own account. The only way out offered is the way back.
    if (logs.length > 0) {
      const sieve = SIEVES.find(sv => sv.id === archiveSieve);
      return (
        <RoomEmpty
          invite
          icon={<FilmIcon size={28} color={colors.sepia} strokeWidth={1} style={r.stateIcon} />}
          title="Nothing under this heading"
          body={`No films in the archive are marked ${(sieve?.label ?? archiveSieve).toLowerCase()}.`}
          actionLabel="SHOW EVERYTHING"
          onAction={() => setArchiveSieve('all')}
        />
      );
    }

    if (isSelf) {
      return (
        <Animated.View style={[s.emptyStateSelf, pulseStyle]}>
          <FilmIcon size={32} color={colors.sepia} strokeWidth={1} style={r.ownIcon} />
          <Text {...scaledTextProps} style={r.ownTitle}>The Archive Awaits</Text>
          <PressableScale style={r.ownAct} onPress={() => (router.push as any)('/search-modal' as never)} haptic accessibilityRole="button" accessibilityLabel="Record a screening">
            <Text {...scaledTextProps} style={r.ownActText}>RECORD A SCREENING</Text>
          </PressableScale>

          {/* The import signpost — the feature already lives in Settings; this
              points a switcher to it at the moment they face an empty shelf.
              Own-profile empty-archive only, so it shares a screen with nothing. */}
          <View style={s.importDividerRow}>
            <View style={s.importDividerLine} />
            <Text {...decorativeTextProps} style={s.importDividerMark}>✦</Text>
            <View style={s.importDividerLine} />
          </View>
          <Text {...scaledTextProps} style={s.importLine}>Your viewing history can travel with you.</Text>
          <PressableScale
            style={s.importBtn}
            onPress={() => (router.push as any)('/settings' as never)}
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel="Import your archive from another service"
          >
            <Text {...scaledTextProps} style={s.importBtnText}>✦  IMPORT YOUR ARCHIVE</Text>
          </PressableScale>
        </Animated.View>
      );
    }

    return (
      <RoomEmpty
        icon={<FilmIcon size={28} color={colors.sepia} strokeWidth={1} style={r.stateIcon} />}
        title="The Archive is Empty"
        body="This member hasn’t filed a screening yet."
      />
    );
  }, [logs.length, archiveFiltered.length, isSelf, ready, archiveSieve, setArchiveSieve, searching, archiveSearch, setArchiveSearch, pulseStyle, router]);

  /**
   * Derived, not guessed.
   *
   * The old 200 was a third too small at every width: a row is a poster at 3:2
   * plus its title block plus the gap beneath it. Under-estimating makes
   * FlashList render and re-measure more rows than it needs on every scroll.
   */
  const estimatedItemSize = abandonedView ? 88 : Math.round(grid.width * 1.5) + 42;

  return (
    <View style={r.container}>
      {requiresVault && !unlocked && <VaultLock onUnlocked={handleUnlocked} />}
      <CinematicFlashList
        estimatedItemSize={estimatedItemSize}
        data={flashData}
        getItemType={(item: ArchiveItem) => item.type}
        renderItem={renderItem}
        keyExtractor={(item: ArchiveItem) =>
          item.type === 'header' ? `header-${item.lead}-${item.title}`
            : item.type === 'walkout' ? `walk-${item.log.id}`
            : `row-${item.id}`}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={r.listContent}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isLoadingMore
            ? <RoomRetrieving room="more" />
            : flashData.length > 0 ? <RoomFoot tier={tier} /> : null
        }
        bottomInset={bottomInset}
      />
    </View>
  );
}

const s = StyleSheet.create({
  searchWrap: { paddingHorizontal: ROOM_INSET, marginBottom: 12 },

  // ── a walk-out, in rows ──
  walkRow: {
    flexDirection: 'row', gap: 12, minHeight: 64, paddingVertical: 11, paddingHorizontal: ROOM_INSET,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(232,223,208,0.07)',
  },
  walkPlateWrap: { width: 42, height: 63 },
  walkPlate: {
    width: '100%', height: '100%', borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(232,223,208,0.14)',
  },
  walkPlateEmpty: { backgroundColor: colors.posterVoid },
  walkBody: { flex: 1, minWidth: 0, justifyContent: 'center' },
  walkHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  walkTitle: { flex: 1, fontFamily: fonts.display, fontSize: 14.5, lineHeight: 19, color: colors.parchment },
  walkYear: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.2, color: colors.fog },
  walkMark: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 5 },
  walkMarkText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.4, color: colors.crimson },
  walkWords: { fontFamily: fonts.bodyItalic, fontSize: 11.5, lineHeight: 17, color: colors.bone, opacity: 0.72, marginTop: 6 },
  walkSilent: { opacity: 0.4 },
  searchIcon: { opacity: 0.6 },
  emptyStateSelf: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40, backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderRadius: 4, marginTop: 12 },
  importDividerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', marginTop: 20, marginBottom: 12, paddingHorizontal: 10 },
  importDividerLine: { flex: 1, height: 1, backgroundColor: colors.sepia, opacity: 0.2 },
  importDividerMark: { fontFamily: fonts.sub, fontSize: 7, color: colors.sepia, opacity: 0.7 },
  importLine: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.bone, opacity: 0.6, textAlign: 'center', lineHeight: 18, marginBottom: 12 },
  importBtn: { paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(184,137,26,0.45)', borderRadius: 2 },
  importBtnText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.5, color: colors.sepia },
});

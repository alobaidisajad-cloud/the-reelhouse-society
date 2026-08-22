import React, { useMemo, useCallback, useEffect, useState, useRef } from 'react';
import { View, ScrollView, Text, TextInput, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { CinematicFlashList } from '../layout/CinematicFlashList';
import { PenTool, Search, X, TrendingUp, TrendingDown, Minus, Stethoscope } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, useAnimatedProps, cancelAnimation, ReduceMotion } from 'react-native-reanimated';
import { colors, fonts, SEPIA_HASH } from '../../theme/theme';
import { tmdb } from '../../lib/tmdb';
import PressableScale from '../PressableScale';
import { ReelRating } from '../Decorative';
import SpoilerVeil from '../SpoilerVeil';
import type { ProfileLog, HalfLifeEntry } from '../../types';
import { scaledTextProps } from '@/src/constants/textScaling';
import { stripHTML, isRTLText, truncateReview } from '@/src/utils/text';
import { r, rtlText } from './roomStyles';
import { RoomChip, RoomRail, RoomRetrieving, RoomEmpty, RoomFoot } from './RoomParts';

/**
 * THE LEDGER — what the member WROTE.
 *
 * This room and the Archive were the same room: an identical four-wide grid of
 * identical posters, differing only in which logs they were handed. Standing in
 * one, you could not tell which. And the whole point of the Ledger — the
 * writing — was the one thing a grid of posters cannot show, so a member's
 * words appeared nowhere on the screen dedicated to them.
 *
 * So: rows, ruled like a ledger. A small plate, the title, the rating, and the
 * first two lines of what they actually said.
 */

// Module-scoped: prevents remount on every render cycle
const AnimatedSearchIcon = Animated.createAnimatedComponent(Search);

/** A plate on a ledger row — small, because the words are the subject here. */
const PLATE_W = 42;
const PLATE_H = 63;
/**
 * How much of a review is worth carrying into a row that shows two lines of it.
 *
 * BOTH halves matter. `numberOfLines` alone leaves the whole string — and some
 * members write four thousand words — in memory to be measured by the text
 * engine on every pass of a recycled row. Cutting in JS first bounds that work;
 * `numberOfLines` then does the visual truncation at whatever width the phone
 * turns out to be. 180 is comfortably more than two lines at any Dynamic Type
 * size, so the visible cut is always the layout's, never this one.
 */
const ROW_REVIEW_CHARS = 180;

interface ProfileLedgerTabProps {
  logs: ProfileLog[];
  ledgerSearch: string;
  setLedgerSearch: (val: string) => void;
  ledgerRatingFilter: number | 'all';
  setLedgerRatingFilter: (val: number | 'all') => void;
  ledgerFiltered: ProfileLog[];
  halfLifeMap: Record<number, HalfLifeEntry>;
  // `renderPosterCard` is gone: the Ledger draws its own row now, because the
  // grid it shared with the Archive was the defect.
  groupByMonth: (items: ProfileLog[], dateKey?: string) => Record<string, ProfileLog[]>;
  /** Has the data landed? A room must not describe itself before it knows. */
  ready?: boolean;
  tier?: string | null;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  isSelf?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
}

type LedgerItem =
  | { type: 'header'; title: string; lead: string; count: string }
  | { type: 'entry'; log: ProfileLog };

// ════════════════════════════════════════════════════════════════════════════
// A LEDGER ROW
// ════════════════════════════════════════════════════════════════════════════
const LedgerRow = React.memo(function LedgerRow({
  log, halfLife, isSelf, onPress,
}: {
  log: ProfileLog;
  halfLife?: HalfLifeEntry | null;
  isSelf?: boolean;
  onPress: () => void;
}) {
  const posterUri = tmdb.poster(log.altPoster ?? log.poster, 'w185');

  // A review arrives as HTML from the editorial desk. Rendering the raw string
  // printed `<p>` and `&mdash;` into the row; stripping it is the same call the
  // share cards already make, so a row and a share card cut the same words.
  const words = useMemo(() => {
    const plain = stripHTML(String(log.pullQuote || log.review || ''));
    return plain ? truncateReview(plain.replace(/\s+/g, ' '), ROW_REVIEW_CHARS) : '';
  }, [log.pullQuote, log.review]);
  const rtl = useMemo(() => isRTLText(words), [words]);

  return (
    <PressableScale
      style={s.row}
      onPress={onPress}
      // Rows are stacked with no gap between them, so there is no slack to
      // claim on the vertical axis: any at all and each row steals the tap that
      // belongs to its neighbour, with the LATER sibling winning.
      hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
      haptic
      accessibilityRole="button"
      accessibilityLabel={[
        log.title ?? 'Untitled film',
        log.year ? String(log.year) : '',
        log.rating > 0 ? `rated ${log.rating} of 5` : 'unrated',
        log.isAutopsied ? 'autopsied' : '',
        halfLife && halfLife.count > 1 ? `seen ${halfLife.count} times` : '',
        // The words themselves are NOT read out: a row is a way in, and a
        // screen reader that recites 180 characters of prose per row makes the
        // list impossible to move through. The log page reads the review.
        words ? 'with a written entry' : '',
      ].filter(Boolean).join(', ')}
      accessibilityHint="Opens the entry"
    >
      <View style={s.plateWrap}>
        {posterUri ? (
          <Image
            source={{ uri: posterUri }}
            style={s.plate}
            recyclingKey={posterUri}
            cachePolicy="memory-disk"
            placeholder={{ blurhash: SEPIA_HASH }}
            transition={180}
          />
        ) : (
          <View style={[s.plate, s.plateEmpty]} />
        )}
      </View>

      <View style={s.rowBody}>
        <View style={s.rowHead}>
          <Text {...scaledTextProps} style={s.rowTitle} numberOfLines={1}>{log.title}</Text>
          {!!log.year && <Text {...scaledTextProps} style={s.rowYear}>{String(log.year)}</Text>}
        </View>

        <View style={s.rowMeta}>
          {log.rating > 0
            ? <ReelRating rating={log.rating} size={8} />
            : <Text {...scaledTextProps} style={s.rowUnrated}>UNRATED</Text>}

          {!!log.isAutopsied && (
            <View style={s.markRow}>
              <Stethoscope size={8} color={colors.sepia} strokeWidth={1.75} />
              <Text {...scaledTextProps} style={s.markText}>AUTOPSY</Text>
            </View>
          )}

          {!!halfLife && halfLife.count > 1 && (
            <View style={s.markRow}>
              {halfLife.trajectory === 'ASCENDING' ? <TrendingUp size={8} color={colors.validation} strokeWidth={2} />
                : halfLife.trajectory === 'DECAYING' ? <TrendingDown size={8} color={colors.crimson} strokeWidth={2} />
                : <Minus size={8} color={colors.sepia} strokeWidth={2} />}
              <Text
                {...scaledTextProps}
                style={[s.markText, { color: halfLife.trajectory === 'ASCENDING' ? colors.validation : halfLife.trajectory === 'DECAYING' ? colors.crimson : colors.sepia }]}
              >
                ×{halfLife.count}
              </Text>
            </View>
          )}
        </View>

        {!!words && (
          // The author always sees their own words; a visitor sees the veil.
          // `revealKey` is not optional on a recycled list — without it a
          // revealed veil carries into whichever entry reuses the row.
          <SpoilerVeil isSpoiler={log.isSpoiler} bypass={isSelf} revealKey={log.id} compact>
            <Text {...scaledTextProps} style={[s.rowWords, rtl && rtlText]} numberOfLines={2}>
              {words}
            </Text>
          </SpoilerVeil>
        )}
      </View>
    </PressableScale>
  );
});

const RATINGS = ['all', 1, 2, 3, 4, 5] as const;

export default function ProfileLedgerTab({
  logs,
  ledgerSearch,
  setLedgerSearch,
  ledgerRatingFilter,
  setLedgerRatingFilter,
  ledgerFiltered,
  halfLifeMap,
  groupByMonth,
  ready = true,
  tier,
  onLoadMore,
  isLoadingMore,
  isSelf,
  refreshing = false,
  onRefresh,
  bottomInset
}: ProfileLedgerTabProps) {
  const router = useRouter();

  const breatheAnim = useSharedValue(0.1);
  useEffect(() => {
    breatheAnim.value = withRepeat(
      withTiming(0.4, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      // Atmosphere holds still for anyone who asked the system to stop motion.
      20, true, undefined, ReduceMotion.System,
    );
    return () => cancelAnimation(breatheAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(184,137,26,${0.2 + breatheAnim.value})`,
    backgroundColor: `rgba(15,12,8,${0.8 + (breatheAnim.value * 0.2)})`,
  }));

  // Nitrate Noir Breathing Ember Protocol for Search
  const searchEmberOpacity = useSharedValue(0.5);
  useEffect(() => {
      if (ledgerSearch.length > 0) {
          searchEmberOpacity.value = withRepeat(withTiming(1, { duration: 600 }), -1, true, undefined, ReduceMotion.System);
      } else {
          searchEmberOpacity.value = withTiming(0.5, { duration: 300 });
      }
      return () => cancelAnimation(searchEmberOpacity);
  }, [ledgerSearch.length, searchEmberOpacity]);

  // Reanimated props must map from useSharedValue to prevent UI thread sync failures
  const animatedSearchProps = useAnimatedProps(() => ({
      color: searchEmberOpacity.value > 0.5 ? colors.bloodReel : colors.fog,
  }));
  const animatedSearchStyle = useAnimatedStyle(() => ({
      opacity: searchEmberOpacity.value,
  }));

  // Debounce JS thread string search to prevent ANR freezes on 1000+ log profiles
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localSearch, setLocalSearch] = useState(ledgerSearch);

  const handleSearchChange = useCallback((val: string) => {
      setLocalSearch(val);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(() => {
          setLedgerSearch(val);
      }, 300);
  }, [setLedgerSearch]);

  // A pending debounce used to outlive the room: leave the Ledger inside 300ms
  // of a keystroke and the timer still fired, setting state on a screen that
  // was gone.
  useEffect(() => () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  }, []);

  const flashData = useMemo(() => {
    if (ledgerFiltered.length === 0) return [];
    const grouped = groupByMonth(ledgerFiltered);
    const result: LedgerItem[] = [];

    Object.entries(grouped).forEach(([month, items]) => {
      const cut = month.lastIndexOf(' ');
      result.push({
        type: 'header',
        title: cut > 0 ? month.slice(0, cut) : month,
        lead: cut > 0 ? month.slice(cut + 1) : '',
        count: `${items.length} ${items.length === 1 ? 'ENTRY' : 'ENTRIES'}`,
      });
      for (const log of items) result.push({ type: 'entry', log });
    });

    return result;
  }, [ledgerFiltered, groupByMonth]);

  // Pre-fetch next-page posters using expo-image for zero-latency scroll
  useEffect(() => {
    const urlsToPrefetch = ledgerFiltered
      .slice(0, 40)
      .map(item => {
        const path = item.poster || item.altPoster;
        return path ? tmdb.poster(path, 'w185') : null;
      })
      .filter((url): url is string => !!url);

    // A STATIC import, as the Vault already does. expo-image is a hard
    // dependency rendered on nearly every screen, so deferring it bought
    // nothing — and the dynamic form made this component impossible to mount
    // in a test at all, which is exactly why nothing covered it.
    if (urlsToPrefetch.length > 0) Image.prefetch(urlsToPrefetch);
  }, [ledgerFiltered]);

  const renderItem = useCallback(({ item }: { item: LedgerItem }) => {
    if (item.type === 'header') {
      return <RoomRail lead={item.lead} label={item.title} count={item.count} />;
    }
    const log = item.log;
    return (
      <LedgerRow
        log={log}
        halfLife={log.filmId ? halfLifeMap[log.filmId] : null}
        isSelf={isSelf}
        onPress={() => { if (log.id) (router.push as any)(`/log/${log.id}` as never); }}
      />
    );
  }, [halfLifeMap, isSelf, router]);

  const ListHeaderComponent = useMemo(() => {
    if (logs.length === 0) return null;
    return (
      <View style={s.filterGroupCol}>
        <View style={r.search}>
          <AnimatedSearchIcon size={13} animatedProps={animatedSearchProps} strokeWidth={1.5} style={[s.searchIconStyle, animatedSearchStyle]} />
          <TextInput
            style={r.searchInput}
            value={localSearch}
            onChangeText={handleSearchChange}
            placeholder="Search the ledger…"
            placeholderTextColor={colors.fog}
            selectionColor={colors.sepia}
            keyboardAppearance="dark"
            accessibilityLabel="Search the ledger by film or by what was written"
            returnKeyType="search"
          />
          {localSearch.length > 0 && (
            <PressableScale onPress={() => { setLocalSearch(''); setLedgerSearch(''); }} style={r.searchClear} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} haptic accessibilityRole="button" accessibilityLabel="Clear the search">
              <X size={14} color={colors.fog} strokeWidth={1.5} />
            </PressableScale>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={r.chipRow}>
          {RATINGS.map(v => (
            <RoomChip
              key={String(v)}
              label={v === 'all' ? 'ALL' : undefined}
              on={ledgerRatingFilter === v}
              onPress={() => { setLedgerRatingFilter(v); }}
              gap={8}
              a11y={v === 'all' ? 'Show every rating' : `Show entries rated ${v} of 5`}
            >
              {v === 'all' ? undefined : <ReelRating rating={v} size={8} />}
            </RoomChip>
          ))}
        </ScrollView>
      </View>
    );
   
  }, [logs.length, localSearch, handleSearchChange, setLedgerSearch, ledgerRatingFilter, setLedgerRatingFilter, animatedSearchProps, animatedSearchStyle]);

  const ListEmptyComponent = useMemo(() => {
    if (logs.length > 0 && ledgerFiltered.length > 0) return null;

    if (!ready) return <RoomRetrieving room="the ledger" />;

    // A SEARCH found nothing — not an empty ledger. The way out is the way back.
    if (logs.length > 0 && ledgerSearch) {
      return (
        <RoomEmpty
          invite
          icon={<Search size={26} color={colors.sepia} strokeWidth={1} style={r.stateIcon} />}
          title="Nothing under that name"
          body={`No entry matches “${ledgerSearch}”.`}
          actionLabel="CLEAR THE SEARCH"
          onAction={() => { setLocalSearch(''); setLedgerSearch(''); }}
        />
      );
    }

    // A RATING filter found nothing.
    if (logs.length > 0) {
      return (
        <RoomEmpty
          invite
          icon={<PenTool size={26} color={colors.sepia} strokeWidth={1} style={r.stateIcon} />}
          title="Nothing at that mark"
          body={ledgerRatingFilter === 'all'
            ? 'No entries to show.'
            : `Nothing in the ledger is rated ${ledgerRatingFilter} of 5.`}
          actionLabel="SHOW EVERY RATING"
          onAction={() => setLedgerRatingFilter('all')}
        />
      );
    }

    if (isSelf) {
      return (
        <Animated.View style={[s.emptyStateSelf, pulseStyle]}>
          <PenTool size={32} color={colors.sepia} strokeWidth={1} style={r.ownIcon} />
          <Text {...scaledTextProps} style={r.ownTitle}>A Blank Ledger</Text>
          <PressableScale style={r.ownAct} onPress={() => (router.push as any)('/search-modal' as never)} haptic accessibilityRole="button" accessibilityLabel="Draft a critique">
            <Text {...scaledTextProps} style={r.ownActText}>DRAFT A CRITIQUE</Text>
          </PressableScale>
        </Animated.View>
      );
    }

    return (
      <RoomEmpty
        icon={<PenTool size={26} color={colors.sepia} strokeWidth={1} style={r.stateIcon} />}
        title="The Ledger is Empty"
        body="This member hasn’t rated or written about a film yet."
      />
    );
   
  }, [logs.length, ledgerFiltered.length, ledgerSearch, ledgerRatingFilter, setLedgerSearch, setLedgerRatingFilter, ready, isSelf, pulseStyle, router]);

  return (
    <View style={r.container}>
      <CinematicFlashList
        data={flashData}
        getItemType={(item: LedgerItem) => item.type}
        renderItem={renderItem}
        keyExtractor={(item: LedgerItem) => item.type === 'header' ? `header-${item.lead}-${item.title}` : `entry-${item.log.id}`}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        // A row is a 63pt plate plus its padding — measured, where the old 250
        // was a guess three times too large, which made FlashList reserve three
        // screens of blank space below the last entry on a short ledger.
        estimatedItemSize={PLATE_H + 24}
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
  filterGroupCol: { gap: 12, marginBottom: 18 },
  searchIconStyle: { opacity: 0.6 },

  // ── the row ──
  row: {
    flexDirection: 'row',
    gap: 12,
    // 64 is the floor a 63pt plate plus a hairline needs; a row with a long
    // review grows past it on its own.
    minHeight: 64,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(232,223,208,0.07)',
  },
  plateWrap: { width: PLATE_W, height: PLATE_H },
  plate: {
    width: '100%', height: '100%', borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(232,223,208,0.14)',
  },
  plateEmpty: { backgroundColor: colors.posterVoid },
  rowBody: { flex: 1, minWidth: 0, justifyContent: 'center' },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  rowTitle: { flex: 1, fontFamily: fonts.display, fontSize: 14.5, lineHeight: 19, color: colors.parchment },
  rowYear: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.2, color: colors.fog },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 5, flexWrap: 'wrap' },
  rowUnrated: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.8, color: colors.fog, opacity: 0.7 },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  markText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.4, color: colors.sepia },
  /**
   * The member's own words — the reason this room exists, and the one thing it
   * never used to show.
   */
  rowWords: { fontFamily: fonts.bodyItalic, fontSize: 11.5, lineHeight: 17, color: colors.bone, opacity: 0.72, marginTop: 6 },

  // ── your own blank ledger ──
  emptyStateSelf: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40, borderWidth: 1, borderRadius: 4, marginTop: 12 },
});

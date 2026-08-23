import React, { useMemo, useCallback, useEffect, useState, useRef } from 'react';
import { View, ScrollView, Text, TextInput, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { CinematicFlashList } from '../layout/CinematicFlashList';
import { Bookmark, Search, X, Disc3, Sparkles } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, useAnimatedProps, cancelAnimation, ReduceMotion } from 'react-native-reanimated';
import { colors, fonts } from '../../theme/theme';
import PressableScale from '../PressableScale';
import type { ProfileWatchlistItem, WatchlistDecade, ShelfSort } from '../../types';
import { decadeLabel } from '../../types';
import { tmdb } from '../../lib/tmdb';
import { scaledTextProps } from '@/src/constants/textScaling';
import { r, posterColumns, EMBER_REST, EMBER_BEATS } from './roomStyles';
import { RoomChip, RoomChipDivider, RoomRetrieving, RoomEmpty, RoomFoot } from './RoomParts';

/**
 * THE WATCHLIST — the queue, and the one room with a ritual in it.
 *
 * The Oracle stays exactly where it is. It is the best object on any of these
 * six screens: a reel of perforations that picks tonight's film, and the only
 * thing in the rooms that a member comes back FOR rather than to check. What
 * changes is everything around it — one chip, one search, honest empty states,
 * and a grid that stops clipping its third column.
 */

// Module-scoped: prevents remount on every render cycle
const AnimatedSearchIcon = Animated.createAnimatedComponent(Search);

const SORTS: { id: ShelfSort; label: string }[] = [
  { id: 'default', label: 'RECENT' },
  { id: 'az', label: 'A–Z' },
  { id: 'za', label: 'Z–A' },
];

interface ProfileWatchlistTabProps {
  watchlist: ProfileWatchlistItem[];
  watchlistFiltered: ProfileWatchlistItem[];
  isSelf: boolean;
  watchlistSearch: string;
  setWatchlistSearch: (val: string) => void;
  watchlistSort: ShelfSort;
  setWatchlistSort: (val: ShelfSort) => void;
  watchlistDecade: WatchlistDecade;
  setWatchlistDecade: (val: WatchlistDecade) => void;
  /** The decades this queue spans, newest first — derived from what is loaded. */
  decades: { decade: number; count: number }[];
  setRouletteOpen: (val: boolean) => void;
  renderPosterCard: (item: ProfileWatchlistItem, width: number) => React.ReactNode;
  /** Has the data landed? A room must not describe itself before it knows. */
  ready?: boolean;
  tier?: string | null;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
}

type WatchlistRowItem = { type: 'row'; data: ProfileWatchlistItem[]; id: string };

export default function ProfileWatchlistTab({
  watchlist,
  watchlistFiltered,
  isSelf,
  watchlistSearch,
  setWatchlistSearch,
  watchlistSort,
  setWatchlistSort,
  watchlistDecade,
  setWatchlistDecade,
  decades = [],
  setRouletteOpen,
  renderPosterCard,
  ready = true,
  tier,
  onLoadMore,
  isLoadingMore,
  refreshing = false,
  onRefresh,
  bottomInset
}: ProfileWatchlistTabProps) {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const grid = useMemo(() => posterColumns(windowWidth, 3), [windowWidth]);

  const breatheAnim = useSharedValue(0.1);
  useEffect(() => {
    breatheAnim.value = withRepeat(
      withTiming(0.4, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      // Atmosphere holds still for anyone who asked the system to stop motion.
      20, true, undefined, ReduceMotion.System,
    );
    return () => cancelAnimation(breatheAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(184,137,26,${0.1 + breatheAnim.value})`,
  }));

  // Nitrate Noir Breathing Ember Protocol for Search
  const searchEmberOpacity = useSharedValue(EMBER_REST);
  useEffect(() => {
      if (watchlistSearch.length > 0) {
          searchEmberOpacity.value = withRepeat(withTiming(1, { duration: 600 }), EMBER_BEATS, true, undefined, ReduceMotion.System);
      } else {
          searchEmberOpacity.value = withTiming(EMBER_REST, { duration: 300 });
      }
      return () => cancelAnimation(searchEmberOpacity);
  }, [watchlistSearch.length, searchEmberOpacity]);

  // Reanimated props must map from useSharedValue to prevent UI thread sync failures
  const animatedSearchProps = useAnimatedProps(() => ({
      color: searchEmberOpacity.value > EMBER_REST ? colors.bloodReel : colors.fog,
  }));
  const animatedSearchStyle = useAnimatedStyle(() => ({
      opacity: searchEmberOpacity.value,
  }));

  // Debounce JS thread string search to prevent ANR freezes
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localSearch, setLocalSearch] = useState(watchlistSearch);

  const handleSearchChange = useCallback((val: string) => {
      setLocalSearch(val);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(() => {
          setWatchlistSearch(val);
      }, 300);
  }, [setWatchlistSearch]);

  // A pending debounce used to outlive the room — see the Ledger.
  useEffect(() => () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  }, []);

  const flashData = useMemo(() => {
    if (watchlistFiltered.length === 0) return [];
    const result: WatchlistRowItem[] = [];
    for (let i = 0; i < watchlistFiltered.length; i += 3) {
      result.push({
        type: 'row',
        data: watchlistFiltered.slice(i, i + 3),
        id: `watchlist-row-${i}`
      });
    }
    return result;
  }, [watchlistFiltered]);

  // Pre-fetch next-page posters using expo-image for zero-latency scroll
  useEffect(() => {
    const urlsToPrefetch = watchlistFiltered
      .slice(0, 40) // aggressive prefetch of first 40 items
      .map(item => tmdb.poster(item.poster_path, 'w185'))
      .filter((url): url is string => !!url);

    // A STATIC import, as the Vault already does — see the note in the Ledger.
    if (urlsToPrefetch.length > 0) Image.prefetch(urlsToPrefetch);
  }, [watchlistFiltered]);

  const renderItem = useCallback(({ item }: { item: WatchlistRowItem }) => {
    return (
      <View style={[r.gridRow, { gap: grid.gap, marginBottom: grid.gap }]}>
        {item.data.map(film => (
          <View key={film.id || (film as {id?: number, film_id?: number}).film_id} style={{ width: grid.width }}>
            {renderPosterCard(film, grid.width)}
          </View>
        ))}
      </View>
    );
  }, [renderPosterCard, grid]);

  const ListHeaderComponent = useMemo(() => {
    if (watchlist.length === 0) return null;
    return (
      <>
        {isSelf && watchlist.length > 1 && (
          <PressableScale style={s.oracleCta} onPress={() => setRouletteOpen(true)} haptic accessibilityRole="button" accessibilityLabel="Consult the Oracle's Choice — let the archive pick tonight's film">
            <View style={s.oracleCtaPerf}>
              {[0, 1, 2].map(i => <View key={i} style={s.oracleCtaHole} />)}
            </View>
            <Disc3 size={18} color={colors.sepia} strokeWidth={1.5} />
            <View style={s.oracleCtaText}>
              <Text {...scaledTextProps} style={s.oracleCtaTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>THE ORACLE&apos;S CHOICE</Text>
              <Text {...scaledTextProps} style={s.oracleCtaSub} numberOfLines={2}>Let the Archive pick tonight&apos;s reel</Text>
            </View>
            <Sparkles size={13} color={colors.sepia} strokeWidth={1.5} />
            <View style={s.oracleCtaPerf}>
              {[0, 1, 2].map(i => <View key={i} style={s.oracleCtaHole} />)}
            </View>
          </PressableScale>
        )}
        {watchlist.length > 5 && (
          <View style={s.controlCol}>
            <View style={r.search}>
              <AnimatedSearchIcon size={13} animatedProps={animatedSearchProps} strokeWidth={1.5} style={[s.searchIconStyle, animatedSearchStyle]} />
              <TextInput
                style={r.searchInput}
                value={localSearch}
                onChangeText={handleSearchChange}
                placeholder="Search the queue…"
                placeholderTextColor={colors.fog}
                selectionColor={colors.sepia}
                keyboardAppearance="dark"
                accessibilityLabel="Search the watchlist"
                returnKeyType="search"
              />
              {localSearch.length > 0 && (
                <PressableScale onPress={() => { setLocalSearch(''); setWatchlistSearch(''); }} style={r.searchClear} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} haptic accessibilityRole="button" accessibilityLabel="Clear the search">
                  <X size={14} color={colors.fog} strokeWidth={1.5} />
                </PressableScale>
              )}
            </View>
            {/* The sort row used to sit BESIDE the search box, which left each
                chip about 40pt wide with 4pt between them — three targets a
                thumb could not separate. Its own line, at the shared gap.
                The decades share that line rather than taking a third one:
                header chrome is the loudest complaint about this app. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={r.chipRow}>
              {SORTS.map(sv => (
                <RoomChip
                  key={sv.id}
                  label={sv.label}
                  on={watchlistSort === sv.id}
                  onPress={() => { setWatchlistSort(sv.id); }}
                  gap={8}
                  a11y={`Sort the queue: ${sv.label}`}
                />
              ))}
              {/* Only when there is a choice to make. One decade is not a filter. */}
              {decades.length > 1 && (
                <>
                  <RoomChipDivider />
                  <RoomChip
                    label="ANY ERA"
                    on={watchlistDecade === null}
                    onPress={() => setWatchlistDecade(null)}
                    gap={8}
                    a11y="Show films from every decade"
                  />
                  {decades.map(d => (
                    <RoomChip
                      key={d.decade}
                      label={decadeLabel(d.decade)}
                      count={d.count}
                      on={watchlistDecade === d.decade}
                      onPress={() => setWatchlistDecade(watchlistDecade === d.decade ? null : d.decade)}
                      gap={8}
                      a11y={`Show only films from the ${decadeLabel(d.decade)}, ${d.count}`}
                    />
                  ))}
                </>
              )}
            </ScrollView>
          </View>
        )}
      </>
    );
   
  }, [watchlist.length, isSelf, setRouletteOpen, localSearch, handleSearchChange, setWatchlistSearch, watchlistSort, setWatchlistSort, watchlistDecade, setWatchlistDecade, decades, animatedSearchProps, animatedSearchStyle]);

  const ListEmptyComponent = useMemo(() => {
    if (watchlist.length > 0 && watchlistFiltered.length > 0) return null;

    if (!ready) return <RoomRetrieving room="the queue" />;

    // A FILTER found nothing. This used to be one grey line of italic text
    // floating in the middle of the page with no way out of it — the only
    // "empty state" in the six rooms that was not a panel at all. And it has
    // to name the RIGHT filter: with a search and a decade both live, telling a
    // member to clear the search when it was the decade that emptied the room
    // sends them round the loop again.
    if (watchlist.length > 0) {
      const era = watchlistDecade !== null ? decadeLabel(watchlistDecade) : null;
      return (
        <RoomEmpty
          invite
          icon={<Search size={26} color={colors.sepia} strokeWidth={1} style={r.stateIcon} />}
          title={era && !watchlistSearch ? 'Nothing from that era' : 'Nothing under that name'}
          body={
            watchlistSearch && era ? `No film from the ${era} in the queue matches “${watchlistSearch}”.`
              : watchlistSearch ? `No film in the queue matches “${watchlistSearch}”.`
              : era ? `Nothing in the queue is from the ${era}.`
              : 'No films to show.'
          }
          actionLabel={watchlistSearch ? 'CLEAR THE SEARCH' : era ? 'SHOW EVERY ERA' : undefined}
          onAction={
            watchlistSearch ? () => { setLocalSearch(''); setWatchlistSearch(''); }
              : era ? () => setWatchlistDecade(null)
              : undefined
          }
        />
      );
    }

    if (isSelf) {
      return (
        <Animated.View style={[s.emptyStateSelf, pulseStyle]}>
          <Bookmark size={32} color={colors.sepia} strokeWidth={1.5} style={r.ownIcon} />
          <Text {...scaledTextProps} style={r.ownTitle}>An Empty Queue</Text>
          <PressableScale style={r.ownAct} onPress={() => (router.push as any)('/search-modal' as never)} haptic accessibilityRole="button" accessibilityLabel="Curate future viewings">
            <Text {...scaledTextProps} style={r.ownActText}>CURATE FUTURE VIEWINGS</Text>
          </PressableScale>
        </Animated.View>
      );
    }

    return (
      <RoomEmpty
        icon={<Bookmark size={26} color={colors.sepia} strokeWidth={1} style={r.stateIcon} />}
        title="The Queue is Empty"
        body="This member hasn’t saved a film for later yet."
      />
    );
  }, [watchlist.length, watchlistFiltered.length, isSelf, ready, watchlistSearch, setWatchlistSearch, watchlistDecade, setWatchlistDecade, pulseStyle, router]);

  return (
    <View style={r.container}>
      <CinematicFlashList
        data={flashData}
        renderItem={renderItem}
        keyExtractor={(item: WatchlistRowItem) => item.id}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        // A 3-wide poster row, derived — the old 150 was a guess.
        estimatedItemSize={Math.round(grid.width * 1.5) + grid.gap}
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
  emptyStateSelf: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40, backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderRadius: 4, marginTop: 12 },

  // ── the Oracle — untouched, because it is the best thing here ──
  oracleCta: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.sepiaFaint, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(184,137,26,0.45)', paddingVertical: 14, paddingHorizontal: 14, marginBottom: 18, overflow: 'hidden' },
  oracleCtaText: { flex: 1, minWidth: 0 },
  oracleCtaTitle: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.sepia },
  oracleCtaSub: { fontFamily: fonts.bodyItalic, fontSize: 10, lineHeight: 14, color: colors.fog, marginTop: 2 },
  oracleCtaPerf: { alignSelf: 'stretch', justifyContent: 'space-around', paddingVertical: 2 },
  oracleCtaHole: { width: 5, height: 6, borderRadius: 1, backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(184,137,26,0.2)' },

  controlCol: { gap: 12, marginBottom: 18 },
  searchIconStyle: { opacity: 0.6 },
});

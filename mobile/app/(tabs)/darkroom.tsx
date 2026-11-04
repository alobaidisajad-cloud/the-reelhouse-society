import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { useNetInfo } from '@react-native-community/netinfo';
import { useFocusEffect } from 'expo-router';
import { useScrollToTop } from 'expo-router/react-navigation';
import { storage } from '@/src/stores/mmkv-storage';

import { colors } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { useDiscoverStore, sheetCacheKey, type DiscoverFilm } from '@/src/stores/discover';
import { globalScrollY } from '@/src/lib/scrollBridge';
import { useShallow } from 'zustand/react/shallow';

import FrozenTab from '@/src/components/layout/FrozenTab';
import { DarkroomHeader } from '@/src/components/darkroom/DarkroomHeader';
import { Print, PrintTile } from '@/src/components/darkroom/DarkroomCards';
import { NothingDeveloped, ArchivesUnreached, SheetFoot } from '@/src/components/darkroom/DarkroomStates';
import { HungLight } from '@/src/components/atmosphere/HungLight';
import { ROOM, SHEET, printsPerRow, rowsOf } from '@/src/components/darkroom/sheet';
import { CinematicFlashList } from '@/src/components/layout/CinematicFlashList';
import { useScreenReady } from '@/src/hooks/useScreenReady';
import { useColumnWidth, useTabBarHeight, useTabContentBottom, useTabContentTop } from '@/src/components/layout/navMetrics';

/** A print on the sheet, and its place among the sheet's films (an artist has none). */
type Placed = { item: DiscoverFilm; place: number | null };
const keyOf = (f: DiscoverFilm) => `${f.media_type || 'movie'}-${f.id}`;

/**
 * THE DARKROOM: the safelight over the room; the title and the enlarger (search); the baths
 * (moods) and the settings (filters); and the contact sheet, its prints in rows with their edge
 * prints beneath. Every state is said in the room's own words.
 */
export default function DarkRoomScreen() {
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(false);
  // Re-tap the active tab icon → smoothly scroll this feed to the top (iOS-standard).
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);

  const fetchRequestId = useRef(0);
  // How many pages the catalogue holds: the handler reads the ref; the foot, drawn, reads the state.
  const totalPagesRef = useRef(1000);
  const [totalPages, setTotalPages] = useState(1000);
  const keepTotal = useCallback((n: number) => { totalPagesRef.current = n; setTotalPages(n); }, []);
  const network = useNetInfo();
  const [lastFetchedKey, setLastFetchedKey] = useState<string>('');
  // The catalogue could not be asked for the first page. Said as that — the
  // tray used to call it "nothing surfaced" and offer to reset the filters.
  const [unreachable, setUnreachable] = useState(false);
  const [asked, setAsked] = useState(0);
  const askAgain = useCallback(() => setAsked((n) => n + 1), []);
  /**
   * The search whose next batch could not be read: the sheet says so instead of simply ending.
   * Held with its search, a new search or filter is a new sheet with nothing failed.
   */
  const [moreFailedFor, setMoreFailedFor] = useState<string | null>(null);

  const {
    page, mood, query, accumulatedFilms, filters,
    setPage, setAccumulatedFilms, clearFilters: clearAllFilters, clearSearch: clearAllSearch,
  } = useDiscoverStore(
    useShallow((s) => ({
      page: s.page,
      mood: s.mood,
      query: s.query,
      accumulatedFilms: s.accumulatedFilms,
      filters: s.filters,
      setPage: s.setPage,
      setAccumulatedFilms: s.setAccumulatedFilms,
      clearFilters: s.clearFilters,
      clearSearch: s.clearSearch,
    })),
  );

  const localScrollY = useSharedValue(0);
  const scrollHeight = useSharedValue(0);
  const viewHeight = useSharedValue(0);
  const isScrolling = useSharedValue(false);

  // Reset scroll bridge so NavBar returns to transparent on this tab
  useEffect(() => { globalScrollY.value = 0; }, []);

  useFocusEffect(
    useCallback(() => {
      globalScrollY.value = withTiming(localScrollY.value, { duration: 250 });
    }, [localScrollY]),
  );

  const isSearching = !!query;

  // Below the top bar, as it measured itself, and above the tab bar; memoised, as both rarely move.
  const topPad = useTabContentTop();
  const endPad = useTabContentBottom();
  const tabBar = useTabBarHeight();
  const listContentStyle = useMemo(() => ({ ...s.listContent, paddingTop: topPad, paddingBottom: endPad }), [topPad, endPad]);
  const cols = printsPerRow(useColumnWidth());

  // The sheet kept for these words or settings: named whole, in any script (sheetCacheKey).
  const cacheKey = useMemo(() => {
    if (isSearching) return sheetCacheKey(`search:${query}`);
    const filterKey = `${filters.genreId}_${filters.sortBy}_${filters.decade?.label ?? ''}_${filters.yearFrom ?? ''}_${filters.yearTo ?? ''}_${filters.language ?? ''}_${filters.minRating}`;
    return sheetCacheKey(`${mood?.label ?? 'default'}:${filterKey}`);
  }, [isSearching, query, mood, filters]);

  const showSkeleton = loading || (cacheKey !== lastFetchedKey && network.isConnected !== false);

  // Synchronous cache injection to completely eliminate the 3-stage UI flash
  const displayData = useMemo(() => {
    if (accumulatedFilms.length > 0) return accumulatedFilms;
    if (page === 1) {
      try {
        const cachedStr = storage.getString(cacheKey);
        if (cachedStr) {
          const parsed = JSON.parse(cachedStr);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed as DiscoverFilm[];
        }
      } catch {}
    }
    return [];
  }, [accumulatedFilms, page, cacheKey]);
  const offline = network.isConnected === false;
  // Failed: nothing to show, and the tray says the catalogue could not be reached.
  const readyMark = useScreenReady('darkroom', showSkeleton ? 'reading'
    : displayData.length === 0 && (offline || unreachable) ? 'failed' : 'ready');

  const moreFailed = moreFailedFor === cacheKey;
  // Prints kept from a visit, shown while the archives cannot be reached: said to be that.
  const stale = !showSkeleton && displayData.length > 0 && (offline || unreachable);

  // Each print's place among the sheet's films, then the sheet's rows.
  const rows = useMemo(() => {
    let n = 0;
    const placed: Placed[] = displayData.map((item) => ({ item, place: item.media_type === 'person' ? null : ++n }));
    return rowsOf(placed, cols);
  }, [displayData, cols]);

  // -- Main Fetching Logic --
  useEffect(() => {
    let active = true;
    const reqId = ++fetchRequestId.current;

    const fetchContent = async () => {
      loadingRef.current = true;
      setLoading(true);
      if (page === 1) setUnreachable(false);

      // Optimistic UI & Skeleton Activation
      if (page === 1) {
        try {
          const cachedStr = storage.getString(cacheKey);
          const parsed = cachedStr ? JSON.parse(cachedStr) : null;
          setAccumulatedFilms(Array.isArray(parsed) && parsed.length > 0 ? parsed : []);
        } catch {
          setAccumulatedFilms([]);
        }
      }

      try {
        let results: any[] = [];
        let isNetworkFailure = false;

        if (isSearching) {
          const res = await tmdb.search(query, page);
          results = res?.results ?? [];
          if (res && (res.total_pages ?? 0) > 0) keepTotal(res.total_pages ?? 0);
          else if (res?.total_pages === 0) isNetworkFailure = true;
        } else {
          let voteCount = mood?.voteGte ?? 20;
          if (!mood && filters.sortBy === 'vote_average.desc') {
            voteCount = Math.max(voteCount, 300);
          }
          const params: Record<string, string | number> = {
            sort_by: mood ? mood.sort : filters.sortBy,
            page,
            'vote_count.gte': voteCount,
          };
          if (filters.genreId) params.with_genres = filters.genreId;
          else if (mood) params.with_genres = mood.genre;

          if (filters.yearFrom || filters.yearTo) {
            if (filters.yearFrom) params['primary_release_date.gte'] = `${filters.yearFrom}-01-01`;
            if (filters.yearTo) params['primary_release_date.lte'] = `${filters.yearTo}-12-31`;
          } else if (filters.decade) {
            params['primary_release_date.gte'] = filters.decade.from;
            params['primary_release_date.lte'] = filters.decade.to;
          }
          if (filters.language) params.with_original_language = filters.language;
          if (filters.minRating > 0) params['vote_average.gte'] = filters.minRating;

          const strParams: Record<string, string> = {};
          for (const [k, v] of Object.entries(params)) strParams[k] = String(v);
          const discoverRes = await tmdb.discover(strParams);
          results = discoverRes?.results ?? [];
          // Preserve known total_pages to prevent network flicker kill-switch, bounded to 500
          const apiPages = discoverRes?.total_pages;
          if (apiPages && apiPages > 0) {
            keepTotal(Math.min(apiPages, 500));
          } else if (apiPages === 0) {
            isNetworkFailure = true;
          } else if (page === 1) {
            keepTotal(1);
          }
        }

        if (active && reqId === fetchRequestId.current) {
          // Detect network failure to prevent permanent page skipping
          if (isNetworkFailure && page > 1) {
            useDiscoverStore.getState().setPage(page - 1);
            setMoreFailedFor(cacheKey);
            return;
          }

          // People need a face; films need a name: a film with no poster is an
          // unexposed plate (THE NEGATIVES), a person with no photograph a gap.
          const withPostersRaw = results.filter((f: DiscoverFilm) =>
            f.media_type === 'person' ? !!f.profile_path : !!(f.poster_path || f.title || f.name),
          );

          // Absolute best O(N) deduplication natively
          const uniqueWithPosters: DiscoverFilm[] = [];
          const seenKeys = new Set<string>();
          for (const film of withPostersRaw) {
            const key = keyOf(film);
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              uniqueWithPosters.push(film);
            }
          }

          if (page === 1) {
            setAccumulatedFilms(uniqueWithPosters);
            try { storage.set(cacheKey, JSON.stringify(uniqueWithPosters.slice(0, 60))); } catch { /* non-critical */ }
          } else {
            setMoreFailedFor(null);
            setAccumulatedFilms((prev) => {
              const currentKeys = new Set(prev.map(keyOf));
              const newUnique = uniqueWithPosters.filter((f) => !currentKeys.has(keyOf(f)));
              if (newUnique.length === 0) return prev;
              return [...prev, ...newUnique].slice(0, 5000);
            });
          }
        }
      } catch (error) {
        if (__DEV__) console.error(error);
        // Graceful Pagination Rollback on Hard Network Failure
        if (active && reqId === fetchRequestId.current && page > 1) {
          useDiscoverStore.getState().setPage(page - 1);
          setMoreFailedFor(cacheKey);
        }
        if (active && reqId === fetchRequestId.current && page === 1) setUnreachable(true);
        // Optimistic cache was already injected at the start of fetchContent.
      } finally {
        if (active && reqId === fetchRequestId.current) {
          setLoading(false);
          loadingRef.current = false;
          setLastFetchedKey(cacheKey);
        }
      }
    };
    // Its failures are caught and said inside it; the effect only starts it.
    void fetchContent();
    return () => { active = false; };
  }, [query, page, filters, mood, isSearching, setAccumulatedFilms, cacheKey, network.isConnected, asked, keepTotal]);

  // What the sheet's foot says: the next batch, developed as the sheet's end is reached; that it
  // failed; or the end of the sheet, every batch read.
  const footState = moreFailed ? 'failed' as const
    : loading || page < totalPages ? 'developing' as const
    : 'end' as const;
  const developNext = useCallback(() => { setMoreFailedFor(null); setPage(useDiscoverStore.getState().page + 1); }, [setPage]);
  const renderFooter = useCallback(() => (rows.length > 0 && !showSkeleton
    ? <SheetFoot state={footState} onRetry={developNext} />
    : null), [rows.length, showSkeleton, footState, developNext]);

  const renderEmpty = useMemo(() => {
    // Developing: the sheet's still tiles, three rows of them, said as one. Nothing loops.
    if (showSkeleton) {
      return (
        <View accessible accessibilityRole="progressbar" accessibilityLabel="Developing the prints">
          {rowsOf(Array.from({ length: cols * 3 }, (_, i) => i), cols).map((row, r) => (
            <View key={r} style={s.row}>{row.map((i) => <PrintTile key={i} />)}</View>
          ))}
          <SheetFoot state={null} onRetry={developNext} />
        </View>
      );
    }
    // Offline, it asks again by itself when the connection returns (the fetch hears it); reached
    // but refused, the member asks.
    if (offline || unreachable) return <ArchivesUnreached onRetry={offline ? undefined : askAgain} />;
    return (
      <NothingDeveloped searching={isSearching} onPress={() => {
        if (isSearching) clearAllSearch(); else clearAllFilters();
        setPage(1);
      }} />
    );
  }, [showSkeleton, cols, developNext, offline, unreachable, askAgain, isSearching, clearAllFilters, clearAllSearch, setPage]);

  const renderRow = useCallback(({ item: row }: { item: (Placed | null)[] }) => (
    <View style={s.row}>
      {row.map((p, i) => (p ? <Print key={keyOf(p.item)} item={p.item} place={p.place} /> : <View key={`room-${i}`} style={s.room} />))}
    </View>
  ), []);

  return (
    <FrozenTab>
      <View style={s.container}>
        {/* The safelight, hung above the screen. */}
        <HungLight source={require('@/assets/images/light-darkroom.png')} top={topPad} scrollY={localScrollY} />
        {readyMark}
        <CinematicFlashList
          ref={listRef}
          data={showSkeleton ? [] : rows}
          keyExtractor={(row: (Placed | null)[], i: number) => (row[0] ? keyOf(row[0].item) : `row-${i}`)}
          estimatedItemSize={200}
          contentContainerStyle={listContentStyle}
          ListHeaderComponent={
            <DarkroomHeader sheet={showSkeleton || rows.length > 0} stale={stale} onRetry={offline ? undefined : askAgain} />
          }
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          renderItem={renderRow}
          onEndReached={() => {
            if (!loadingRef.current && !moreFailed && displayData.length > 0 && displayData.length < 5000 && !offline) {
              const statePage = useDiscoverStore.getState().page;
              if (statePage < totalPagesRef.current) {
                loadingRef.current = true;
                setPage(statePage + 1);
              }
            }
          }}
          onEndReachedThreshold={0.5}
          externalScrollY={globalScrollY}
          scrollMetrics={{ scrollY: localScrollY, scrollHeight, viewHeight, isScrolling }}
          bottomInset={tabBar}
          keyboardShouldPersistTaps="handled"
          // A drag puts the keyboard away, on both platforms ('interactive' is the iPhone's alone).
          keyboardDismissMode="on-drag"
        />
      </View>
    </FrozenTab>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  listContent: { paddingHorizontal: ROOM.page },
  // A row of the contact sheet: its ink, its padding, its gutters.
  row: { flexDirection: 'row', gap: SHEET.gutter, paddingHorizontal: SHEET.pad, backgroundColor: colors.inkwell },
  room: { flex: 1, minWidth: 0 },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';

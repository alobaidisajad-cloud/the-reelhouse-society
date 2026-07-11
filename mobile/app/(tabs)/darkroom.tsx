import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown, useSharedValue, withTiming, withRepeat, Easing, cancelAnimation } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { useFocusEffect } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { storage } from '@/src/stores/mmkv-storage';

import { colors, fonts, spacing, effects } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { useDiscoverStore, type DiscoverFilm } from '@/src/stores/discover';
import { globalScrollY } from '@/src/lib/scrollBridge';
import { useShallow } from 'zustand/react/shallow';

import Buster from '@/src/components/Buster';
import { EmptyOffline } from '@/src/components/EmptyStates';
import PressableScale from '@/src/components/PressableScale';
import FrozenTab from '@/src/components/layout/FrozenTab';

import { DarkroomHeader } from '@/src/components/darkroom/DarkroomHeader';
import { FilmGridCard, AnimatedPosterSkeleton } from '@/src/components/darkroom/DarkroomCards';
import { CinematicFlashList } from '@/src/components/layout/CinematicFlashList';

// === MAIN SCREEN ===
export default function DarkRoomScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(false);
  // Re-tap the active tab icon → smoothly scroll this feed to the top (iOS-standard).
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);

  const fetchRequestId = useRef(0);
  const totalPagesRef = useRef(1000);
  const network = useNetInfo();
  const [lastFetchedKey, setLastFetchedKey] = useState<string>('');
  
  const {
    page, mood, query, accumulatedFilms, filters,
    setPage, setAccumulatedFilms, clearFilters: clearAllFilters, clearSearch: clearAllSearch
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
      clearSearch: s.clearSearch
    }))
  );

  const localScrollY = useSharedValue(0);
  const scrollHeight = useSharedValue(0);
  const viewHeight = useSharedValue(0);
  const isScrolling = useSharedValue(false);
  const skeletonOpacity = useSharedValue(0.4);

  useEffect(() => {
    skeletonOpacity.value = withRepeat(withTiming(0.8, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(skeletonOpacity);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset scroll bridge so NavBar returns to transparent on this tab
  useEffect(() => { globalScrollY.value = 0; }, []);

  useFocusEffect(
    useCallback(() => {
      globalScrollY.value = withTiming(localScrollY.value, { duration: 250 });
    }, [localScrollY])
  );

  const isSearching = !!query;

  // Memoize contentContainerStyle — insets are stable per session
  const listContentStyle = useMemo(
    () => ({ ...s.listContent, paddingTop: insets.top + 90 }),
    [insets.top]
  );

  // Cache key based on current discovery params
  const cacheKey = useMemo(() => {
    let rawKey = '';
    if (isSearching) {
      rawKey = `darkroom_cache_search_${query}`;
    } else {
      const moodKey = mood?.label ?? 'default';
      const filterKey = `${filters.genreId}_${filters.sortBy}_${filters.decade?.label ?? ''}_${filters.yearFrom ?? ''}_${filters.yearTo ?? ''}_${filters.language ?? ''}_${filters.minRating}`;
      rawKey = `darkroom_cache_${moodKey}_${filterKey}`;
    }
    // Pure alphanumeric sanitation & truncation to guarantee JNI/C++ safety
    return rawKey.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 128);
  }, [isSearching, query, mood, filters]);

  // Synchronous cache injection to completely eliminate the 3-stage UI flash
  const displayData = useMemo(() => {
    if (accumulatedFilms.length > 0) return accumulatedFilms;
    if (page === 1) {
      try {
        const cachedStr = storage.getString(cacheKey);
        if (cachedStr) {
          const parsed = JSON.parse(cachedStr);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return [];
  }, [accumulatedFilms, page, cacheKey]);

  // -- Main Fetching Logic --
  useEffect(() => {
    let active = true;
    const reqId = ++fetchRequestId.current;

    const fetchContent = async () => {
      loadingRef.current = true;
      setLoading(true);

      // Optimistic UI & Skeleton Activation
      if (page === 1) {
        try {
          const cachedStr = storage.getString(cacheKey);
          if (cachedStr) {
            const parsed = JSON.parse(cachedStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setAccumulatedFilms(parsed);
            } else {
              setAccumulatedFilms([]);
            }
          } else {
            setAccumulatedFilms([]);
          }
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
          if (res && (res.total_pages ?? 0) > 0) totalPagesRef.current = res.total_pages ?? 0;
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
            totalPagesRef.current = Math.min(apiPages, 500);
          } else if (apiPages === 0) {
            isNetworkFailure = true;
          } else if (page === 1) {
            totalPagesRef.current = 1;
          }
        }

        if (active && reqId === fetchRequestId.current) {
          // Detect network failure to prevent permanent page skipping
          if (isNetworkFailure && page > 1) {
            useDiscoverStore.getState().setPage(page - 1);
            return; // Gracefully abort this cycle, let the rollback re-trigger cache
          }

          const withPostersRaw = results.filter((f: DiscoverFilm) => f.poster_path || f.profile_path);

          const getFilmKey = (f: DiscoverFilm) => `${f.media_type || 'movie'}-${f.id}`;

          // Absolute best O(N) deduplication natively
          const uniqueWithPosters: DiscoverFilm[] = [];
          const seenKeys = new Set<string>();
          for (let i = 0; i < withPostersRaw.length; i++) {
             const key = getFilmKey(withPostersRaw[i]);
             if (!seenKeys.has(key)) {
                seenKeys.add(key);
                uniqueWithPosters.push(withPostersRaw[i]);
             }
          }

          if (page === 1) {
            setAccumulatedFilms(uniqueWithPosters);
            try { storage.set(cacheKey, JSON.stringify(uniqueWithPosters.slice(0, 60))); } catch { /* non-critical */ }
          } else {
            // Merge safely via Zustand functional updater to eliminate micro race conditions
            setAccumulatedFilms((prev) => {
              const currentKeys = new Set(prev.map(getFilmKey));
              const newUnique = uniqueWithPosters.filter(f => !currentKeys.has(getFilmKey(f)));
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
        }
        // Optimistic cache was already injected at the start of fetchContent.
        // No redundant MMKV read or array allocation needed here.
      } finally {
        if (active && reqId === fetchRequestId.current) {
          setLoading(false);
          loadingRef.current = false;
          setLastFetchedKey(cacheKey);
        }
      }
    };
    fetchContent();
    return () => { active = false; };
  }, [query, page, filters, mood, isSearching, setAccumulatedFilms, cacheKey, network.isConnected]);

  const renderFooter = useCallback(() => {
    if (loading && page > 1) {
      return (
        <View style={s.footerLoading}>
           <Animated.Text entering={FadeInDown} style={s.paginationRetrieving}>
             [ DEVELOPING THE NEXT BATCH... ]
           </Animated.Text>
        </View>
      );
    }
    return <View style={s.footerSpacer} />;
  }, [loading, page]);

  const renderEmpty = useMemo(() => {
    const isStale = cacheKey !== lastFetchedKey;
    const showSkeleton = loading || (isStale && network.isConnected !== false);

    if (showSkeleton) {
      return (
        <View style={s.skeletonGrid}>
          {Array.from({ length: 21 }).map((_, i) => (
            <View key={i} style={s.skeletonItem}>
              <AnimatedPosterSkeleton sharedOp={skeletonOpacity} />
            </View>
          ))}
        </View>
      );
    }
    
    if (network.isConnected === false) {
      return (
        <Animated.View entering={FadeInDown.duration(600)} style={[s.emptyWrap, s.offlineWrap]}>
           <EmptyOffline />
        </Animated.View>
      );
    }

    return (
      <Animated.View entering={FadeInDown.duration(600)} style={s.emptyWrap}>
        {/* Removed empty onPress handler — was doing nothing */}
        <View style={{ alignItems: 'center' }}>
          <Buster size={56} mood="crying" />
        </View>
        {/* "The Vault" belongs to the profile's physical-media room —
            this tray speaks in the Darkroom's own chemistry. */}
        <Text style={s.emptyTitle}>
          {isSearching ? 'The negatives hold no match.' : 'Nothing surfaced in the tray.'}
        </Text>
        <Text style={s.emptySub}>
          {isSearching
            ? 'No films match that search. Try a different title.'
            : 'Adjust your filters to develop something new.'}
        </Text>
        <PressableScale
          style={s.emptyBtn}
          onPress={() => {
            if (isSearching) { clearAllSearch(); } else { clearAllFilters(); }
            setPage(1);
          }}
          haptic="medium"
          accessibilityRole="button"
          accessibilityLabel={isSearching ? 'Clear search query' : 'Reset all filters'}
        >
          <Text style={s.emptyBtnText}>
            {isSearching ? 'CLEAR SEARCH' : 'RESET FILTERS'}
          </Text>
        </PressableScale>
      </Animated.View>
    );
  }, [loading, network.isConnected, isSearching, clearAllFilters, clearAllSearch, setPage, cacheKey, lastFetchedKey, skeletonOpacity]);

  const renderFilmItem = useCallback(({ item }: { item: DiscoverFilm }) => (
    <View style={s.filmItemWrap}>
      <FilmGridCard item={item} />
    </View>
  ), []);



  return (
    <FrozenTab>
      <View style={s.container}>
        <CinematicFlashList
          ref={listRef}
          data={displayData}
          keyExtractor={(item: any) => `${item.media_type || 'movie'}-${item.id}`}
          estimatedItemSize={190}
          numColumns={3}
          contentContainerStyle={listContentStyle}
          ListHeaderComponent={<DarkroomHeader />}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          renderItem={renderFilmItem}
          onEndReached={() => {
            if (!loadingRef.current && displayData.length > 0 && displayData.length < 5000 && network.isConnected !== false) {
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
          bottomInset={insets.bottom}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        />
      </View>
    </FrozenTab>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  listContent: {
    padding: spacing.md,
  },
  footerLoading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  footerSpacer: {
    height: 100,
  },
  paginationRetrieving: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 3,
    color: colors.sepia,
    opacity: 0.6,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.sepia,
    textAlign: 'center',
    marginTop: 20,
    letterSpacing: 1,
    opacity: 0.9,
  },
  emptySub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.bone,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
    opacity: 0.5,
    fontStyle: 'italic',
  },
  emptyBtn: {
    backgroundColor: 'rgba(14,11,8,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.25)',
    borderRadius: 3,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 20,
    ...effects.shadowPrimary,
  },
  emptyBtnText: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 2.5,
    color: colors.sepia,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  skeletonItem: {
    width: '33.33%',
    padding: 4,
  },
  offlineWrap: {
    flex: 1,
    paddingTop: 100,
  },
  filmItemWrap: {
    flex: 1,
    padding: 4,
  },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';

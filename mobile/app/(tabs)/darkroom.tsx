import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { storage } from '@/src/stores/mmkv-storage';

import { colors, fonts, spacing, effects } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { useDiscoverStore, type DiscoverFilm } from '@/src/stores/discover';
import { setScrollY } from '@/src/utils/scrollBridge';

import Buster from '@/src/components/Buster';
import { EmptyOffline } from '@/src/components/EmptyStates';
import PressableScale from '@/src/components/PressableScale';
import FrozenTab from '@/src/components/layout/FrozenTab';

import { DarkroomHeader } from '@/src/components/darkroom/DarkroomHeader';
import { FilmGridCard, AnimatedPosterSkeleton } from '@/src/components/darkroom/DarkroomCards';

// === MAIN SCREEN ===
export default function DarkRoomScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const loadingRef = useRef(false);
  const network = useNetInfo();
  
  const {
    page, mood, query, accumulatedFilms, filters,
    setPage, setAccumulatedFilms
  } = useDiscoverStore();

  // Reset scroll bridge so NavBar returns to transparent on this tab
  useEffect(() => { setScrollY(0); }, []);

  const isSearching = !!query;

  // Memoize contentContainerStyle — insets are stable per session
  const listContentStyle = useMemo(
    () => ({ ...s.listContent, paddingTop: insets.top + 90 }),
    [insets.top]
  );

  // Stable onScroll reference to avoid FlashList re-subscribing per render
  const handleScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => setScrollY(e.nativeEvent.contentOffset.y),
    []
  );

  // F-11 FIX: Cache key based on current discovery params
  const cacheKey = useMemo(() => {
    if (isSearching) return `darkroom_cache_search_${query}`;
    const moodKey = mood?.label ?? 'default';
    const filterKey = `${filters.genreId}_${filters.sortBy}_${filters.decade?.label ?? ''}`;
    return `darkroom_cache_${moodKey}_${filterKey}`;
  }, [isSearching, query, mood, filters]);

  // -- Main Fetching Logic --
  useEffect(() => {
    let active = true;
    const fetchContent = async () => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        let results = [];
        if (isSearching) {
          const res = await tmdb.search(query, page);
          results = res?.results ?? [];
        } else {
          const params: Record<string, string | number> = {
            sort_by: mood ? mood.sort : filters.sortBy,
            page,
            'vote_count.gte': mood?.voteGte ?? 20,
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
        }

        if (active) {
          const withPosters = results.filter((f: DiscoverFilm) => f.poster_path || f.profile_path);
          if (page === 1) {
            setAccumulatedFilms(withPosters);
            // F-11 FIX: Cache successful page-1 results for offline access
            try { storage.set(cacheKey, JSON.stringify(withPosters.slice(0, 60))); } catch { /* non-critical */ }
          } else {
            setAccumulatedFilms((prev: DiscoverFilm[]) => {
              const keys = new Set(prev.map(p => p.id));
              const merged = [...prev, ...withPosters.filter((f: DiscoverFilm) => !keys.has(f.id))];
              return merged.slice(0, 500);
            });
          }
        }
      } catch (error) {
        if (__DEV__) console.error(error);
        // F-11 FIX: Restore cached results when fetch fails (offline)
        if (active && useDiscoverStore.getState().accumulatedFilms.length === 0) {
          try {
            const cached = storage.getString(cacheKey);
            if (cached) setAccumulatedFilms(JSON.parse(cached));
          } catch { /* cache corrupted, show empty */ }
        }
      } finally {
        if (active) {
          setLoading(false);
          loadingRef.current = false;
        }
      }
    };
    fetchContent();
    return () => { active = false; };
  }, [query, page, filters, mood, isSearching, setAccumulatedFilms, cacheKey]);

  const renderFooter = useCallback(() => {
    if (loading && page > 1) {
      return (
        <View style={s.footerLoading}>
           <Animated.Text entering={FadeInDown} style={s.paginationRetrieving}>
             [ ACCESSING ARCHIVES... ]
           </Animated.Text>
        </View>
      );
    }
    return <View style={s.footerSpacer} />;
  }, [loading, page]);

  const { clearFilters: clearAllFilters, clearSearch: clearAllSearch } = useDiscoverStore();

  const renderEmpty = useMemo(() => {
    if (loading) {
      return (
        <View style={s.skeletonGrid}>
          {Array.from({ length: 21 }).map((_, i) => (
            <View key={i} style={s.skeletonItem}>
              <AnimatedPosterSkeleton />
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
        {/* L-04 AUDIT FIX: Removed empty onPress handler — was doing nothing */}
        <View style={{ alignItems: 'center' }}>
          <Buster size={56} mood="crying" />
        </View>
        <Text style={s.emptyTitle}>
          {isSearching ? 'The vault is sealed.' : 'No films surfaced.'}
        </Text>
        <Text style={s.emptySub}>
          {isSearching
            ? 'No films match that search. Try a different title.'
            : 'Adjust your filters to uncover something from the archive.'}
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
  }, [loading, network.isConnected, isSearching, clearAllFilters, clearAllSearch, setPage]);

  const renderFilmItem = useCallback(({ item }: { item: DiscoverFilm }) => (
    <View style={s.filmItemWrap}>
      <FilmGridCard item={item} />
    </View>
  ), []);

  const viewabilityConfig = useRef({
    minimumViewTime: 400,
    itemVisiblePercentThreshold: 80,
  }).current;

  const inflightFetches = useRef(new Set<number>());
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIdsRef = useRef<Set<number>>(new Set());

  // F-03 AUDIT FIX: Clear pending prefetch timer on unmount to prevent stale fetches
  useEffect(() => {
    return () => {
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    };
  }, []);

  // F-06 FIX: Debounced batch prefetch — collects IDs over 300ms then fires once
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: import('react-native').ViewToken[] }) => {
    if (inflightFetches.current.size > 200) {
      inflightFetches.current.clear();
    }

    // Collect IDs
    viewableItems.forEach((vi) => {
      if (vi.item && vi.item.id && !inflightFetches.current.has(vi.item.id)) {
        pendingIdsRef.current.add(vi.item.id);
      }
    });

    // Debounce: wait 300ms after last viewability change before firing
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    prefetchTimerRef.current = setTimeout(() => {
      const ids = Array.from(pendingIdsRef.current);
      pendingIdsRef.current.clear();
      if (ids.length === 0) return;

      // S3-02 FIX: Process ALL collected IDs in staggered batches of 3
      // Previously only the first 3 were prefetched, silently discarding the rest.
      ids.forEach(id => inflightFetches.current.add(id));
      const BATCH_SIZE = 3;
      const BATCH_DELAY = 200; // ms between batches
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const chunk = ids.slice(i, i + BATCH_SIZE);
        const delay = (i / BATCH_SIZE) * BATCH_DELAY;
        setTimeout(() => {
          chunk.forEach(id => {
            tmdb.detail(id)
              .catch(() => {})
              .finally(() => {
                inflightFetches.current.delete(id);
              });
          });
        }, delay);
      }
    }, 300);
  }).current;

  return (
    <FrozenTab>
      <View style={s.container}>
        <FlashList
          data={accumulatedFilms}
          keyExtractor={(item) => String(item.id)}
          estimatedItemSize={190}
          numColumns={3}
          contentContainerStyle={listContentStyle}
          ListHeaderComponent={<DarkroomHeader filtersVisible={filtersVisible} setFiltersVisible={setFiltersVisible} />}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          renderItem={renderFilmItem}
          onEndReached={() => {
            if (!loadingRef.current && accumulatedFilms.length > 0 && accumulatedFilms.length < 500) {
              setPage(useDiscoverStore.getState().page + 1);
            }
          }}
          onEndReachedThreshold={0.5}
          onScroll={handleScroll}
          scrollEventThrottle={32}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
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
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 4,
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
    borderColor: 'rgba(196,150,26,0.25)',
    borderRadius: 3,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 20,
    ...effects.shadowPrimary,
  },
  emptyBtnText: {
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 3,
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

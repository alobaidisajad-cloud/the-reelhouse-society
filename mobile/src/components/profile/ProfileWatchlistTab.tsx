import React, { useMemo, useCallback, useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { CinematicFlashList } from '../layout/CinematicFlashList';
import { Bookmark, Search, X, Disc3, Sparkles } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, useAnimatedProps, cancelAnimation } from 'react-native-reanimated';
import { colors, fonts } from '../../theme/theme';
import PressableScale from '../PressableScale';
import type { ProfileWatchlistItem } from '../../types';
import { tmdb } from '../../lib/tmdb';
import { scaledTextProps } from '@/src/constants/textScaling';

// Module-scoped: prevents remount on every render cycle
const AnimatedSearchIcon = Animated.createAnimatedComponent(Search);

interface ProfileWatchlistTabProps {
  watchlist: ProfileWatchlistItem[];
  watchlistFiltered: ProfileWatchlistItem[];
  isSelf: boolean;
  watchlistSearch: string;
  setWatchlistSearch: (val: string) => void;
  watchlistSort: 'default' | 'az' | 'za';
  setWatchlistSort: (val: 'default' | 'az' | 'za') => void;
  setRouletteOpen: (val: boolean) => void;
  renderPosterCard: (item: ProfileWatchlistItem, width: number) => React.ReactNode;
  POSTER_COL_3: number;
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
  setRouletteOpen,
  renderPosterCard,
  POSTER_COL_3,
  onLoadMore,
  isLoadingMore,
  refreshing = false,
  onRefresh,
  bottomInset
}: ProfileWatchlistTabProps) {
  const router = useRouter();

  const breatheAnim = useSharedValue(0.1);
  useEffect(() => {
    breatheAnim.value = withRepeat(
      withTiming(0.4, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      20, true
    );
    return () => cancelAnimation(breatheAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(184,137,26,${0.1 + breatheAnim.value})`,
  }));

  // Nitrate Noir Breathing Ember Protocol for Search
  const searchEmberOpacity = useSharedValue(0.5);
  useEffect(() => {
      if (watchlistSearch.length > 0) {
          searchEmberOpacity.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
      } else {
          searchEmberOpacity.value = withTiming(0.5, { duration: 300 });
      }
      return () => cancelAnimation(searchEmberOpacity);
  }, [watchlistSearch.length, searchEmberOpacity]);

  // Reanimated props must map from useSharedValue to prevent UI thread sync failures
  const animatedSearchProps = useAnimatedProps(() => ({
      color: searchEmberOpacity.value > 0.5 ? colors.bloodReel : colors.fog,
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
    
    if (urlsToPrefetch.length > 0) {
      import('expo-image').then(({ Image }) => {
        Image.prefetch(urlsToPrefetch);
      });
    }
  }, [watchlistFiltered]);

  const renderItem = useCallback(({ item }: { item: WatchlistRowItem }) => {
    return (
      <View style={s.grid3}>
        {item.data.map(film => (
          <View key={film.id || (film as {id?: number, film_id?: number}).film_id} style={{ width: POSTER_COL_3 }}>
            {renderPosterCard(film, POSTER_COL_3)}
          </View>
        ))}
      </View>
    );
  }, [renderPosterCard, POSTER_COL_3]);

  const ListHeaderComponent = useMemo(() => {
    if (watchlist.length === 0) return null;
    return (
      <>
        {isSelf && watchlist.length > 1 && (
          <PressableScale style={s.oracleCta} onPress={() => setRouletteOpen(true)} haptic accessibilityRole="button" accessibilityLabel="Consult the Oracle's Choice">
            <View style={s.oracleCtaPerf}>
              {[0, 1, 2].map(i => <View key={i} style={s.oracleCtaHole} />)}
            </View>
            <Disc3 size={18} color={colors.sepia} strokeWidth={1.5} />
            <View style={s.oracleCtaText}>
              <Text {...scaledTextProps} style={s.oracleCtaTitle}>THE ORACLE&apos;S CHOICE</Text>
              <Text {...scaledTextProps} style={s.oracleCtaSub}>Let the Archive pick tonight&apos;s reel</Text>
            </View>
            <Sparkles size={13} color={colors.sepia} strokeWidth={1.5} />
            <View style={s.oracleCtaPerf}>
              {[0, 1, 2].map(i => <View key={i} style={s.oracleCtaHole} />)}
            </View>
          </PressableScale>
        )}
        {watchlist.length > 5 && (
          <View style={s.watchlistControlRow}>
            <View style={[s.searchWrap, s.searchWrapFlex]}>
              <AnimatedSearchIcon size={12} animatedProps={animatedSearchProps} strokeWidth={1.5} style={[s.searchIconStyle, animatedSearchStyle]} />
              <TextInput 
                style={s.searchInput} 
                value={localSearch} 
                onChangeText={handleSearchChange} 
                placeholder="Search watchlist..." 
                placeholderTextColor={colors.fog}
                selectionColor={colors.sepia}
                keyboardAppearance="dark"
                accessibilityLabel="Filter your watchlist"
                returnKeyType="search"
              />
              {localSearch.length > 0 && (
                <PressableScale onPress={() => { setLocalSearch(''); setWatchlistSearch(''); }} style={s.searchClear} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic accessibilityRole="button" accessibilityLabel="Clear search">
                  <X size={14} color={colors.fog} strokeWidth={1.5} />
                </PressableScale>
              )}
            </View>
            <View style={s.sortRow}>
              {([{ id: 'default' as const, label: 'RECENT' }, { id: 'az' as const, label: 'A-Z' }, { id: 'za' as const, label: 'Z-A' }]).map(sv => (
                <PressableScale 
                  key={sv.id} 
                  style={[s.filterChip, watchlistSort === sv.id && s.filterChipActive]} 
                  onPress={() => { setWatchlistSort(sv.id); }} 
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  haptic
                  accessibilityRole="button"
                  accessibilityLabel={`Sort the watchlist: ${sv.label}`}
                  accessibilityState={{ selected: watchlistSort === sv.id }}
                >
                  <Text {...scaledTextProps} style={[s.filterChipText, watchlistSort === sv.id && s.filterChipTextActive]}>{sv.label}</Text>
                </PressableScale>
              ))}
            </View>
          </View>
        )}
      </>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist.length, isSelf, setRouletteOpen, watchlistSearch, handleSearchChange, watchlistSort, setWatchlistSort, animatedSearchProps, animatedSearchStyle]);

  const ListEmptyComponent = useMemo(() => {
    if (watchlist.length > 0 && watchlistFiltered.length > 0) return null;
    
    if (watchlist.length === 0 && isSelf) {
      return (
        <Animated.View style={[s.emptyStateSelf, pulseStyle]}>
          <Bookmark size={32} color={colors.sepia} strokeWidth={1.5} style={s.emptyLockIcon} />
          <Text {...scaledTextProps} style={s.emptyTitleSelf}>An Empty Queue</Text>
          <PressableScale style={s.ctaBtnSelf} onPress={() => (router.push as any)('/search-modal' as never)} haptic accessibilityRole="button" accessibilityLabel="Curate future viewings">
            <Text {...scaledTextProps} style={s.ctaBtnTextSelf}>CURATE FUTURE VIEWINGS</Text>
          </PressableScale>
        </Animated.View>
      );
    }

    if (watchlist.length === 0) {
      return (
        <View style={s.emptyState}>
          <Bookmark size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
          <Text {...scaledTextProps} style={s.emptyTitle}>The Queue is Empty</Text>
          {/* eslint-disable-next-line react/no-unescaped-entities */}
          <Text {...scaledTextProps} style={s.emptyDesc}>This member hasn't saved any films yet.</Text>
        </View>
      );
    }
    
    if (watchlistSearch) {
      return <Text {...scaledTextProps} style={s.searchNoResults}>No films match &quot;{watchlistSearch}&quot;</Text>;
    }
    
    return null;
  }, [watchlist.length, watchlistFiltered.length, isSelf, watchlistSearch, pulseStyle, router]);

  return (
    <View style={s.container}>
      <CinematicFlashList
        data={flashData}
        renderItem={renderItem}
        keyExtractor={(item: WatchlistRowItem) => item.id}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        estimatedItemSize={150}
        contentContainerStyle={s.listContent}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.sepia} style={{ marginVertical: 20 }} /> : null}
        bottomInset={bottomInset}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40, backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 2, marginTop: 12 },
  emptyStateSelf: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40, backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderRadius: 4, marginTop: 12 },
  emptyLockIcon: { marginBottom: 16, opacity: 0.8 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, marginBottom: 8, textAlign: 'center' },
  emptyTitleSelf: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, marginBottom: 24, textAlign: 'center', letterSpacing: 1 },
  emptyDesc: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.bone, opacity: 0.6, textAlign: 'center', lineHeight: 20 },
  ctaBtnSelf: { paddingVertical: 14, paddingHorizontal: 32, borderWidth: 1, borderColor: 'rgba(184,137,26,0.4)', borderRadius: 2, backgroundColor: colors.sepiaFaint },
  ctaBtnTextSelf: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5, color: colors.sepia },
  oracleCta: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.sepiaFaint, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(184,137,26,0.45)', paddingVertical: 14, paddingHorizontal: 14, marginBottom: 24, overflow: 'hidden' },
  oracleCtaText: { flex: 1 },
  oracleCtaTitle: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.sepia },
  oracleCtaSub: { fontFamily: fonts.bodyItalic, fontSize: 10, color: colors.fog, marginTop: 2 },
  oracleCtaPerf: { alignSelf: 'stretch', justifyContent: 'space-around', paddingVertical: 2 },
  oracleCtaHole: { width: 5, height: 6, borderRadius: 1, backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(184,137,26,0.2)' },
  watchlistControlRow: { gap: 12, marginBottom: 24 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(8,6,4,0.7)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 2, paddingHorizontal: 16, height: 44 },
  searchWrapFlex: { flex: 1 },
  searchIconStyle: { opacity: 0.6 },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.parchment, paddingHorizontal: 12, height: '100%' },
  searchClear: { padding: 4, opacity: 0.8 },
  sortRow: { flexDirection: 'row', gap: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(184,137,26,0.15)', backgroundColor: 'transparent' },
  filterChipActive: { backgroundColor: 'rgba(184,137,26,0.1)', borderColor: 'rgba(184,137,26,0.4)' },
  filterChipText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.5, color: colors.fog },
  filterChipTextActive: { color: colors.sepia },
  searchNoResults: { fontFamily: fonts.bodyItalic, fontSize: 14, color: colors.fog, textAlign: 'center', marginTop: 40 },
  grid3: { flexDirection: 'row', gap: 12, marginBottom: 12 },
});

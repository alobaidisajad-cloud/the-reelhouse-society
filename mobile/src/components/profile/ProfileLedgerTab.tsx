import React, { useMemo, useCallback, useEffect, useState, useRef } from 'react';
import { View, ScrollView, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { CinematicFlashList } from '../layout/CinematicFlashList';
import { PenTool, Film as FilmIcon, Search, X, TrendingUp, TrendingDown, Minus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, useAnimatedProps, cancelAnimation } from 'react-native-reanimated';
import { colors, fonts } from '../../theme/theme';
import { tmdb } from '../../lib/tmdb';
import PressableScale from '../PressableScale';
import { ReelRating } from '../Decorative';
import type { ProfileLog, HalfLifeEntry } from '../../types';

// Module-scoped: prevents remount on every render cycle
const AnimatedSearchIcon = Animated.createAnimatedComponent(Search);

interface ProfileLedgerTabProps {
  logs: ProfileLog[];
  ledgerSearch: string;
  setLedgerSearch: (val: string) => void;
  ledgerRatingFilter: number | 'all';
  setLedgerRatingFilter: (val: number | 'all') => void;
  ledgerFiltered: ProfileLog[];
  halfLifeMap: Record<number, HalfLifeEntry>;
  renderPosterCard: (log: ProfileLog, width: number, showRating: boolean, showTimeAgo: boolean, navigateToLog: boolean) => React.ReactNode;
  groupByMonth: (items: ProfileLog[], dateKey?: string) => Record<string, ProfileLog[]>;
  POSTER_COL_4: number;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  isSelf?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
}

type LedgerItem = 
  | { type: 'header'; title: string }
  | { type: 'row'; data: ProfileLog[]; id: string };

export default function ProfileLedgerTab({
  logs,
  ledgerSearch,
  setLedgerSearch,
  ledgerRatingFilter,
  setLedgerRatingFilter,
  ledgerFiltered,
  halfLifeMap,
  renderPosterCard,
  groupByMonth,
  POSTER_COL_4,
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
      20, true
    );
    return () => cancelAnimation(breatheAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(196,150,26,${0.2 + breatheAnim.value})`,
    backgroundColor: `rgba(15,12,8,${0.8 + (breatheAnim.value * 0.2)})`,
  }));

  // Nitrate Noir Breathing Ember Protocol for Search
  const searchEmberOpacity = useSharedValue(0.5);
  useEffect(() => {
      if (ledgerSearch.length > 0) {
          searchEmberOpacity.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
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

  // Flatten month groupings into a predictable FlashList array
  const flashData = useMemo(() => {
    if (ledgerFiltered.length === 0) return [];
    const grouped = groupByMonth(ledgerFiltered);
    const result: LedgerItem[] = [];
    
    Object.entries(grouped).forEach(([month, items]) => {
      result.push({ type: 'header', title: month });
      // Chunk items into rows of 4
      for (let i = 0; i < items.length; i += 4) {
        result.push({ 
          type: 'row', 
          data: items.slice(i, i + 4),
          id: `${month}-row-${i}`
        });
      }
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
    
    if (urlsToPrefetch.length > 0) {
      import('expo-image').then(({ Image }) => {
        Image.prefetch(urlsToPrefetch);
      });
    }
  }, [ledgerFiltered]);

  const renderItem = useCallback(({ item }: { item: LedgerItem }) => {
    if (item.type === 'header') {
      return <Text style={s.monthHeader}>{item.title}</Text>;
    }
    return (
      <View style={s.grid4}>
        {item.data.map(log => {
          const hl = log.filmId ? halfLifeMap[log.filmId] : null;
          return (
            <View key={log.id || log.filmId} style={{ width: POSTER_COL_4, position: 'relative' }}>
              {renderPosterCard(log, POSTER_COL_4, false, false, true)}
              {hl && (
                <View style={[s.halfLifeBadge, { pointerEvents: 'none' }]}>
                  <View style={s.halfLifeContent}>
                    {hl.trajectory === 'ASCENDING' ? <TrendingUp size={7} color="#22c55e" strokeWidth={2} /> 
                      : hl.trajectory === 'DECAYING' ? <TrendingDown size={7} color="#ef4444" strokeWidth={2} /> 
                      : <Minus size={7} color={colors.sepia} strokeWidth={2} />}
                    <Text style={[s.halfLifeText, { color: hl.trajectory === 'ASCENDING' ? '#22c55e' : hl.trajectory === 'DECAYING' ? '#ef4444' : colors.sepia }]}>
                      x{hl.count}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  }, [renderPosterCard, POSTER_COL_4, halfLifeMap]);

  const ListHeaderComponent = useMemo(() => {
    if (logs.length === 0) return null;
    return (
      <View style={s.filterGroupCol}>
        <View style={s.searchWrap}>
          <AnimatedSearchIcon size={12} animatedProps={animatedSearchProps} strokeWidth={1.5} style={[s.searchIconStyle, animatedSearchStyle]} />
          <TextInput 
            style={s.searchInput} 
            value={localSearch} 
            onChangeText={handleSearchChange} 
            placeholder="Search your ledger..." 
            placeholderTextColor={colors.fog}
            selectionColor={colors.sepia}
            keyboardAppearance="dark"
            accessibilityLabel="Filter your film log"
            returnKeyType="search"
          />
          {localSearch.length > 0 && (
            <PressableScale onPress={() => { setLocalSearch(''); setLedgerSearch(''); }} style={s.searchClear} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic>
              <X size={14} color={colors.fog} strokeWidth={1.5} />
            </PressableScale>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterChipRowTight}>
          {(['all', 1, 2, 3, 4, 5] as const).map(r => (
            <PressableScale 
              key={String(r)} 
              style={[s.filterChip, ledgerRatingFilter === r && s.filterChipActive]} 
              onPress={() => { setLedgerRatingFilter(r); }} 
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              haptic
            >
              {r === 'all' ? (
                <Text style={[s.filterChipText, ledgerRatingFilter === r && s.filterChipTextActive]}>ALL</Text>
              ) : (
                <ReelRating rating={r} size={8} />
              )}
            </PressableScale>
          ))}
        </ScrollView>
      </View>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs.length, ledgerSearch, handleSearchChange, ledgerRatingFilter, setLedgerRatingFilter, animatedSearchProps, animatedSearchStyle]);

  const ListEmptyComponent = useMemo(() => {
    if (logs.length > 0 && ledgerFiltered.length > 0) return null;

    if (logs.length === 0 && !ledgerSearch && isSelf) {
      return (
        <Animated.View style={[s.emptyStateSelf, pulseStyle]}>
          <PenTool size={32} color="#C4921E" strokeWidth={1} style={s.emptyLockIcon} />
          <Text style={s.emptyTitleSelf}>A Blank Ledger</Text>
          <PressableScale style={s.ctaBtn} onPress={() => (router.push as any)('/search-modal' as never)} haptic>
            <Text style={s.ctaBtnText}>DRAFT A CRITIQUE</Text>
          </PressableScale>
        </Animated.View>
      );
    }

    return (
      <View style={s.emptyState}>
        <FilmIcon size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
        <Text style={s.emptyTitle}>{ledgerSearch ? 'No Results' : 'The Ledger is Empty'}</Text>
        <Text style={s.emptyDesc}>{ledgerSearch ? `No entries match "${ledgerSearch}"` : 'No rated or reviewed films yet.'}</Text>
      </View>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs.length, ledgerFiltered.length, ledgerSearch, pulseStyle, router]);

  return (
    <View style={s.container}>
      <CinematicFlashList
        data={flashData}
        getItemType={(item) => item.type}
        renderItem={renderItem}
        keyExtractor={(item: LedgerItem) => item.type === 'header' ? `header-${item.title}` : `row-${(item as any).id}`}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        estimatedItemSize={250}
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
  filterGroupCol: { gap: 16, marginBottom: 24 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(8,6,4,0.7)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 2, paddingHorizontal: 16, height: 44 },
  searchIconStyle: { opacity: 0.6 },
  searchInput: { flex: 1, fontFamily: fonts.ui, fontSize: 13, color: colors.parchment, paddingHorizontal: 12, height: '100%' },
  searchClear: { padding: 4, opacity: 0.8 },
  filterChipRowTight: { gap: 8, flexDirection: 'row', alignItems: 'center' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(184,137,26,0.15)', backgroundColor: 'transparent' },
  filterChipActive: { backgroundColor: 'rgba(184,137,26,0.1)', borderColor: 'rgba(184,137,26,0.4)' },
  filterChipText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.5, color: colors.fog },
  filterChipTextActive: { color: colors.sepia },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40, backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 2, marginTop: 12 },
  emptyStateSelf: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40, borderWidth: 1, borderRadius: 4, marginTop: 12 },
  emptyLockIcon: { marginBottom: 16, opacity: 0.8 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, marginBottom: 8, textAlign: 'center' },
  emptyTitleSelf: { fontFamily: fonts.display, fontSize: 24, color: '#C4921E', marginBottom: 24, textAlign: 'center' },
  emptyDesc: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.bone, opacity: 0.6, textAlign: 'center', lineHeight: 20 },
  ctaBtn: { paddingVertical: 14, paddingHorizontal: 32, borderWidth: 1, borderColor: 'rgba(196,150,26,0.4)', borderRadius: 2, backgroundColor: 'rgba(196,150,26,0.05)' },
  ctaBtnText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 3, color: '#C4921E' },
  monthHeader: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 4, color: colors.sepia, opacity: 0.8, marginBottom: 16, marginTop: 24 },
  grid4: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  halfLifeBadge: { position: 'absolute', top: -4, right: -4, zIndex: 10, backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.5)', borderRadius: 2, padding: 2 },
  halfLifeContent: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 2 },
  halfLifeText: { fontFamily: fonts.uiBold, fontSize: 8 },
});

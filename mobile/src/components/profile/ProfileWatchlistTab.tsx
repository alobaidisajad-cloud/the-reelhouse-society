import React, { useMemo, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Bookmark, Search, X, Dice5 } from 'lucide-react-native';
import { colors, fonts } from '../../theme/theme';
import * as Haptics from 'expo-haptics';
import PressableScale from '../PressableScale';
import type { ProfileWatchlistItem } from '../../types';

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
  POSTER_COL_3
}: ProfileWatchlistTabProps) {

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

  const renderItem = useCallback(({ item }: { item: WatchlistRowItem }) => {
    return (
      <View style={s.grid3}>
        {item.data.map(film => (
          <View key={film.id || film.filmId} style={{ width: POSTER_COL_3 }}>
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
          <PressableScale style={s.ctaBtn} onPress={() => setRouletteOpen(true)} haptic>
            <View style={s.ctaBtnRow}>
              <Dice5 size={12} color={colors.sepia} strokeWidth={1.5} />
              <Text style={s.ctaBtnText}>SPIN WATCHLIST ROULETTE</Text>
            </View>
          </PressableScale>
        )}
        {watchlist.length > 5 && (
          <View style={s.watchlistControlRow}>
            <View style={[s.searchWrap, s.searchWrapFlex]}>
              <Search size={12} color={colors.fog} strokeWidth={1.5} style={s.searchIconStyle} />
              <TextInput 
                style={s.searchInput} 
                value={watchlistSearch} 
                onChangeText={setWatchlistSearch} 
                placeholder="Search watchlist..." 
                placeholderTextColor={colors.fog} 
              />
              {watchlistSearch.length > 0 && (
                <PressableScale onPress={() => setWatchlistSearch('')} style={s.searchClear} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic>
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
                >
                  <Text style={[s.filterChipText, watchlistSort === sv.id && s.filterChipTextActive]}>{sv.label}</Text>
                </PressableScale>
              ))}
            </View>
          </View>
        )}
      </>
    );
  }, [watchlist.length, isSelf, setRouletteOpen, watchlistSearch, setWatchlistSearch, watchlistSort, setWatchlistSort]);

  const ListEmptyComponent = useMemo(() => {
    if (watchlist.length > 0 && watchlistFiltered.length > 0) return null;
    
    if (watchlist.length === 0) {
      return (
        <View style={s.emptyState}>
          <Bookmark size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
          <Text style={s.emptyTitle}>The Queue is Empty</Text>
          <Text style={s.emptyDesc}>{isSelf ? 'No films saved yet.' : "This member hasn't saved any films yet."}</Text>
        </View>
      );
    }
    
    if (watchlistSearch) {
      return <Text style={s.searchNoResults}>No films match "{watchlistSearch}"</Text>;
    }
    
    return null;
  }, [watchlist.length, watchlistFiltered.length, isSelf, watchlistSearch]);

  return (
    <View style={s.container}>
      <FlashList
        data={flashData}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        estimatedItemSize={180}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40, backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', borderRadius: 2, marginTop: 12 },
  emptyLockIcon: { marginBottom: 16, opacity: 0.6 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, marginBottom: 8, textAlign: 'center' },
  emptyDesc: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.bone, opacity: 0.6, textAlign: 'center', lineHeight: 20 },
  ctaBtn: { backgroundColor: 'rgba(8,6,4,0.95)', borderRadius: 2, borderWidth: 1, borderColor: 'rgba(139,105,20,0.4)', paddingVertical: 14, alignItems: 'center', marginBottom: 24 },
  ctaBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ctaBtnText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 3, color: colors.sepia },
  watchlistControlRow: { gap: 12, marginBottom: 24 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(8,6,4,0.7)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', borderRadius: 2, paddingHorizontal: 16, height: 44 },
  searchWrapFlex: { flex: 1 },
  searchIconStyle: { opacity: 0.6 },
  searchInput: { flex: 1, fontFamily: fonts.ui, fontSize: 13, color: colors.parchment, paddingHorizontal: 12, height: '100%' },
  searchClear: { padding: 4, opacity: 0.8 },
  sortRow: { flexDirection: 'row', gap: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)', backgroundColor: 'transparent' },
  filterChipActive: { backgroundColor: 'rgba(139,105,20,0.1)', borderColor: 'rgba(139,105,20,0.4)' },
  filterChipText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.5, color: colors.fog },
  filterChipTextActive: { color: colors.sepia },
  searchNoResults: { fontFamily: fonts.bodyItalic, fontSize: 14, color: colors.fog, textAlign: 'center', marginTop: 40 },
  grid3: { flexDirection: 'row', gap: 12, marginBottom: 12 },
});

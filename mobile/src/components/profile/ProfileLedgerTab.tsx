import React, { useMemo, useCallback } from 'react';
import { View, ScrollView, Text, TextInput, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Film as FilmIcon, Search, X, TrendingUp, TrendingDown, Minus } from 'lucide-react-native';
import { colors, fonts } from '../../theme/theme';
import PressableScale from '../PressableScale';
import { ReelRating } from '../Decorative';
import type { ProfileLog, HalfLifeEntry } from '../../types';

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
  POSTER_COL_4
}: ProfileLedgerTabProps) {

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
          <Search size={12} color={colors.fog} strokeWidth={1.5} style={s.searchIconStyle} />
          <TextInput 
            style={s.searchInput} 
            value={ledgerSearch} 
            onChangeText={setLedgerSearch} 
            placeholder="Search your ledger..." 
            placeholderTextColor={colors.fog} 
          />
          {ledgerSearch.length > 0 && (
            <PressableScale onPress={() => setLedgerSearch('')} style={s.searchClear} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic>
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
  }, [logs.length, ledgerSearch, setLedgerSearch, ledgerRatingFilter, setLedgerRatingFilter]);

  const ListEmptyComponent = useMemo(() => {
    if (logs.length > 0 && ledgerFiltered.length > 0) return null;
    return (
      <View style={s.emptyState}>
        <FilmIcon size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
        <Text style={s.emptyTitle}>{ledgerSearch ? 'No Results' : 'The Ledger is Empty'}</Text>
        <Text style={s.emptyDesc}>{ledgerSearch ? `No entries match "${ledgerSearch}"` : 'No rated or reviewed films yet.'}</Text>
      </View>
    );
  }, [logs.length, ledgerFiltered.length, ledgerSearch]);

  return (
    <View style={s.container}>
      <FlashList
        data={flashData}
        renderItem={renderItem}
        keyExtractor={(item) => item.type === 'header' ? `header-${item.title}` : `row-${item.id}`}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        estimatedItemSize={140}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
  filterGroupCol: { gap: 16, marginBottom: 24 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(8,6,4,0.7)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', borderRadius: 2, paddingHorizontal: 16, height: 44 },
  searchIconStyle: { opacity: 0.6 },
  searchInput: { flex: 1, fontFamily: fonts.ui, fontSize: 13, color: colors.parchment, paddingHorizontal: 12, height: '100%' },
  searchClear: { padding: 4, opacity: 0.8 },
  filterChipRowTight: { gap: 8, flexDirection: 'row', alignItems: 'center' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)', backgroundColor: 'transparent' },
  filterChipActive: { backgroundColor: 'rgba(139,105,20,0.1)', borderColor: 'rgba(139,105,20,0.4)' },
  filterChipText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.5, color: colors.fog },
  filterChipTextActive: { color: colors.sepia },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40, backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', borderRadius: 2, marginTop: 12 },
  emptyLockIcon: { marginBottom: 16, opacity: 0.6 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, marginBottom: 8, textAlign: 'center' },
  emptyDesc: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.bone, opacity: 0.6, textAlign: 'center', lineHeight: 20 },
  monthHeader: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 4, color: colors.sepia, opacity: 0.8, marginBottom: 16, marginTop: 24 },
  grid4: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  halfLifeBadge: { position: 'absolute', top: -4, right: -4, zIndex: 10, backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.5)', borderRadius: 2, padding: 2 },
  halfLifeContent: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 2 },
  halfLifeText: { fontFamily: fonts.uiBold, fontSize: 8 },
});

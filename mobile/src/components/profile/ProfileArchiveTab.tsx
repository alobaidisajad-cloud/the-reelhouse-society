import React, { useMemo, useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { CinematicFlashList } from '../layout/CinematicFlashList';
import { Film as FilmIcon } from 'lucide-react-native';
import { colors, fonts } from '../../theme/theme';
import PressableScale from '../PressableScale';
import type { ProfileLog } from '../../types';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import VaultLock from './VaultLock';
import { useAuthStore } from '@/src/stores/auth';

interface ProfileArchiveTabProps {
  logs: ProfileLog[];
  isSelf: boolean;
  archiveSieve: string;
  setArchiveSieve: (val: string) => void;
  archiveFiltered: ProfileLog[];
  renderPosterCard: (log: ProfileLog, width: number) => React.ReactNode;
  groupByMonth: (items: ProfileLog[], dateKey?: string) => Record<string, ProfileLog[]>;
  POSTER_COL_4: number;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
}

type ArchiveItem = 
  | { type: 'header'; title: string }
  | { type: 'row'; data: ProfileLog[]; id: string };

export default function ProfileArchiveTab({
  logs,
  isSelf,
  archiveSieve,
  setArchiveSieve,
  archiveFiltered,
  renderPosterCard,
  groupByMonth,
  POSTER_COL_4,
  onLoadMore,
  isLoadingMore,
  refreshing = false,
  onRefresh,
  bottomInset
}: ProfileArchiveTabProps) {
  const router = useRouter();
  // The Vault only guards the member's OWN archive, and only when they have
  // explicitly enabled the biometric lock in Settings.
  const biometricLock = useAuthStore((s) => s.user?.preferences?.biometric_lock === true);
  const requiresVault = isSelf && biometricLock;
  const [unlocked, setUnlocked] = useState(false);

  const breatheAnim = useSharedValue(0.2);
  useEffect(() => {
    breatheAnim.value = withRepeat(
      withTiming(0.6, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1, true
    );
    return () => cancelAnimation(breatheAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(184,137,26,${breatheAnim.value})`,
    shadowColor: '#8b6914',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: breatheAnim.value * 0.5,
    shadowRadius: 20,
    elevation: breatheAnim.value * 10
  }));

  const handleUnlocked = useCallback(() => {
    setUnlocked(true);
  }, []);

  // Flatten month groupings into a predictable FlashList array
  const flashData = useMemo(() => {
    if (archiveFiltered.length === 0) return [];
    const grouped = groupByMonth(archiveFiltered);
    const result: ArchiveItem[] = [];
    
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
  }, [archiveFiltered, groupByMonth]);

  const renderItem = useCallback(({ item }: { item: ArchiveItem }) => {
    if (item.type === 'header') {
      return <Text style={s.monthHeader}>{item.title}</Text>;
    }
    return (
      <View style={s.grid4}>
        {item.data.map(log => (
          <View key={log.id || log.filmId} style={{ width: POSTER_COL_4 }}>
            {renderPosterCard(log, POSTER_COL_4)}
          </View>
        ))}
      </View>
    );
  }, [renderPosterCard, POSTER_COL_4]);

  const ListHeaderComponent = useMemo(() => {
    if (logs.length === 0) return null;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScrollMargin} contentContainerStyle={s.filterChipRow}>
        {[{ id: 'all', label: 'All' }, { id: 'watched', label: 'Watched' }, { id: 'rewatched', label: 'Rewatched' }, { id: 'abandoned', label: 'Abandoned' }].map(sv => (
          <PressableScale 
            key={sv.id} 
            style={[s.filterChip, archiveSieve === sv.id && s.filterChipActive]} 
            onPress={() => { setArchiveSieve(sv.id); }} 
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            haptic
          >
            <Text style={[s.filterChipText, archiveSieve === sv.id && s.filterChipTextActive]}>{sv.label}</Text>
          </PressableScale>
        ))}
      </ScrollView>
    );
  }, [logs.length, archiveSieve, setArchiveSieve]);

  const ListEmptyComponent = useMemo(() => {
    if (logs.length > 0 && archiveFiltered.length > 0) return null;

    if (logs.length === 0 && isSelf) {
      return (
        <Animated.View style={[s.emptyStateSelf, pulseStyle]}>
          <FilmIcon size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
          <Text style={s.emptyTitleSelf}>The Archive Awaits</Text>
          <PressableScale style={s.ctaBtn} onPress={() => (router.push as any)('/search-modal' as never)} haptic>
            <Text style={s.ctaBtnText}>RECORD A SCREENING</Text>
          </PressableScale>
        </Animated.View>
      );
    }

    return (
      <View style={s.emptyState}>
        <FilmIcon size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
        <Text style={s.emptyTitle}>The Archive is Empty</Text>
        <Text style={s.emptyDesc}>
          {logs.length === 0 
            ? "This member hasn't watched any films yet." 
            : 'No films match this filter.'}
        </Text>
      </View>
    );
  }, [logs.length, archiveFiltered.length, isSelf, pulseStyle, router]);

  return (
    <View style={s.container}>
      {requiresVault && !unlocked && <VaultLock onUnlocked={handleUnlocked} />}
      <CinematicFlashList
        estimatedItemSize={200}
        data={flashData}
        getItemType={(item: ArchiveItem) => item.type}
        renderItem={renderItem}
        keyExtractor={(item: ArchiveItem) => item.type === 'header' ? `header-${item.title}` : `row-${item.id}`}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
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
  filterScrollMargin: { marginBottom: 20 },
  filterChipRow: { gap: 8, flexDirection: 'row', alignItems: 'center' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(184,137,26,0.15)', backgroundColor: 'transparent' },
  filterChipActive: { backgroundColor: 'rgba(184,137,26,0.1)', borderColor: 'rgba(184,137,26,0.4)' },
  filterChipText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.5, color: colors.fog },
  filterChipTextActive: { color: colors.sepia },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40, backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 2, marginTop: 12 },
  emptyStateSelf: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40, backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderRadius: 4, marginTop: 12 },
  emptyLockIcon: { marginBottom: 16, opacity: 0.8 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, marginBottom: 8, textAlign: 'center' },
  emptyTitleSelf: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, marginBottom: 24, textAlign: 'center' },
  emptyDesc: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.bone, opacity: 0.6, textAlign: 'center', lineHeight: 20 },
  ctaBtn: { paddingVertical: 14, paddingHorizontal: 32, borderWidth: 1, borderColor: 'rgba(184,137,26,0.4)', borderRadius: 2, backgroundColor: 'rgba(184,137,26,0.05)' },
  ctaBtnText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 3, color: colors.sepia },
  monthHeader: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 4, color: colors.sepia, opacity: 0.8, marginBottom: 16, marginTop: 24 },
  grid4: { flexDirection: 'row', gap: 8, marginBottom: 12 },
});

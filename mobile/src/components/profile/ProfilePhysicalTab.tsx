import React, { useEffect, useMemo, useCallback } from 'react';
import { View, ScrollView, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { CinematicFlashList } from '../layout/CinematicFlashList';
import { Disc, Film as FilmIcon } from 'lucide-react-native';
import { colors, fonts , SEPIA_HASH } from '../../theme/theme';
import { tmdb } from '../../lib/tmdb';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import type { ProfileVaultItem, FormatCount } from '../../types';
import PressableScale from '../PressableScale';


interface ProfilePhysicalTabProps {
  isSelf: boolean;
  vault: ProfileVaultItem[];
  physicalFilter: string | null;
  setPhysicalFilter: (val: string | null) => void;
  physicalFormatCounts: FormatCount[];
  physicalFiltered: ProfileVaultItem[];
  groupByMonth: (items: ProfileVaultItem[], dateKey?: string) => Record<string, ProfileVaultItem[]>;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
}

type VaultListItem = 
  | { type: 'header'; month: string; id: string }
  | { type: 'row'; items: ProfileVaultItem[]; id: string };

const POSTER_COL_4 = 4;

 
const PhysicalVaultCard = React.memo(({ vaultItem }: { vaultItem: ProfileVaultItem }) => {
  const router = useRouter();
  const posterUri = tmdb.poster(vaultItem.poster_path, 'w185');
  const fmt = (vaultItem.formats || [])[0];
  const FC: Record<string, string> = { '4k': '#a855f7', bluray: '#3b82f6', dvd: '#f59e0b', vhs: '#ef4444', laserdisc: '#10b981', steelbook: '#6366f1', criterion: colors.sepia };
  const FL: Record<string, string> = { '4k': '4K', bluray: 'BD', dvd: 'DVD', vhs: 'VHS', laserdisc: 'LD', steelbook: 'SB', criterion: 'CC' };
  
  const onPress = useCallback(() => {
    if (vaultItem.film_id) (router.push as any)(`/film/${vaultItem.film_id}` as never);
  }, [vaultItem.film_id, router]);

  return (
    <PressableScale 
      style={s.posterCardWrap} 
      onPress={onPress}
      haptic
    >
      {posterUri ? (
        <Image 
          source={{ uri: posterUri }} 
          style={s.posterImg} 
          cachePolicy="memory-disk"
          placeholder={{ blurhash: SEPIA_HASH }}
          transition={200}
        />
      ) : (
        <View style={[s.posterImg, s.posterPlaceholder]}>
          <FilmIcon size={14} color={colors.sepia} strokeWidth={1} />
        </View>
      )}
      {fmt && (
        <View style={[s.formatBadge, { borderColor: FC[fmt] || colors.sepia }]}>
          <Text style={[s.formatBadgeText, { color: FC[fmt] || colors.sepia }]}>
            {FL[fmt] || fmt.toUpperCase()}
          </Text>
        </View>
      )}
    </PressableScale>
  );
});

export default React.memo(function ProfilePhysicalTab({
  isSelf,
  vault,
  physicalFilter,
  setPhysicalFilter,
  physicalFormatCounts,
  physicalFiltered,
  groupByMonth,
  onLoadMore,
  isLoadingMore,
  hasMore,
  refreshing = false,
  onRefresh,
  bottomInset
}: ProfilePhysicalTabProps) {
  const router = useRouter();

  const breatheAnim = useSharedValue(0.1);
  useEffect(() => {
    breatheAnim.value = withRepeat(
      withTiming(0.6, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      -1, true
    );
    return () => cancelAnimation(breatheAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(139,105,20,${0.2 + breatheAnim.value * 0.5})`,
    backgroundColor: `rgba(10,8,6,${0.9 + (breatheAnim.value * 0.1)})`,
  }));

  const flashData = useMemo(() => {
    const result: VaultListItem[] = [];
    if (physicalFiltered.length === 0) return result;

    const grouped = groupByMonth(physicalFiltered, 'created_at');
    Object.entries(grouped).forEach(([month, items]) => {
      result.push({ type: 'header', month, id: `header-${month}` });
      const vaultItems = items as ProfileVaultItem[];
      for (let i = 0; i < vaultItems.length; i += POSTER_COL_4) {
        result.push({
          type: 'row',
          items: vaultItems.slice(i, i + POSTER_COL_4),
          id: `row-${month}-${i}`
        });
      }
    });
    return result;
  }, [physicalFiltered, groupByMonth]);

  // Pre-fetch all visible and next-page posters using expo-image for zero-latency scroll
  useEffect(() => {
    const urlsToPrefetch = physicalFiltered
      .slice(0, 40) // aggressive prefetch of first 40 items
      .map(item => tmdb.poster(item.poster_path, 'w185'))
      .filter((url): url is string => !!url);
    
    if (urlsToPrefetch.length > 0) {
      Image.prefetch(urlsToPrefetch);
    }
  }, [physicalFiltered]);

  const renderItem = useCallback(({ item }: { item: VaultListItem }) => {
    if (item.type === 'header') {
      return (
        <View style={s.monthHeaderWrap}>
          <Text style={s.monthHeader}>{item.month}</Text>
        </View>
      );
    }

    return (
      <View style={s.grid4}>
        {item.items.map((vaultItem: ProfileVaultItem) => (
          <PhysicalVaultCard key={vaultItem.id} vaultItem={vaultItem} />
        ))}
      </View>
    );
  }, []);

  const ListHeaderComponent = useMemo(() => {
    if (physicalFormatCounts.length === 0) return null;
    return (
      <View style={s.filterHeaderWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScrollMargin} contentContainerStyle={s.filterChipRowTight}>
          <PressableScale 
            style={[s.filterChip, !physicalFilter && s.filterChipActive]} 
            onPress={() => setPhysicalFilter(null)} 
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            haptic
          >
            <Text style={[s.filterChipText, !physicalFilter && s.filterChipTextActive]}>ALL ({vault.length})</Text>
          </PressableScale>
          {physicalFormatCounts.map((f: FormatCount) => (
            <PressableScale 
              key={f.id} 
              style={[s.filterChip, physicalFilter === f.id && { borderColor: f.color, backgroundColor: `${f.color}15` }]} 
              onPress={() => setPhysicalFilter(physicalFilter === f.id ? null : f.id)} 
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              haptic
            >
              <Text style={[s.filterChipText, physicalFilter === f.id && { color: f.color }]}>
                {f.label} ({f.count})
              </Text>
            </PressableScale>
          ))}
        </ScrollView>
      </View>
    );
  }, [physicalFormatCounts, physicalFilter, vault.length, setPhysicalFilter]);

  const ListEmptyComponent = useMemo(() => {
    if (physicalFiltered.length > 0) return null;
    
    if (isSelf) {
      return (
        <Animated.View style={[s.emptyStateSelf, pulseStyle]}>
          <View style={s.vaultPattern} />
          <Disc size={36} color={colors.parchment} strokeWidth={1.5} style={s.emptyLockIcon} />
          <Text style={s.emptyTitleSelf}>The Vault is Sealed</Text>
          <PressableScale style={s.ctaBtnSelf} onPress={() => (router.push as any)('/search-modal' as never)} haptic>
            <Text style={s.ctaBtnTextSelf}>CATALOGUE MEDIA</Text>
          </PressableScale>
        </Animated.View>
      );
    }

    return (
      <View style={s.emptyState}>
        <Disc size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
        <Text style={s.emptyTitle}>Physical Archive is Empty</Text>
        <Text style={s.emptyDesc}>No physical media.</Text>
      </View>
    );
  }, [physicalFiltered.length, isSelf, pulseStyle, router]);

  const ListFooterComponent = useMemo(() => {
    if (physicalFiltered.length === 0) return null;
    return (
      <View>
        {hasMore && (
          <PressableScale style={s.loadMoreBtn} onPress={onLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? <ActivityIndicator color={colors.sepia} /> : <Text style={s.loadMoreText}>LOAD MORE</Text>}
          </PressableScale>
        )}
      </View>
    );
  }, [physicalFiltered.length, hasMore, isLoadingMore, onLoadMore]);

  return (
    <View style={s.container}>
      <CinematicFlashList
        data={flashData}
        renderItem={renderItem}
        keyExtractor={(item: any) => item.id}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        /* Mixed header/row items: weighted average */
        estimatedItemSize={100}
        getItemType={(item: any) => item.type}
        contentContainerStyle={s.listContent}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.5}
        bottomInset={bottomInset}
      />
    </View>
  );
});

const s = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
  filterHeaderWrap: { marginBottom: 16 },
  filterScrollMargin: { marginBottom: 12 },
  filterChipRowTight: { gap: 8, flexDirection: 'row', alignItems: 'center' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)', backgroundColor: 'transparent' },
  filterChipActive: { backgroundColor: 'rgba(139,105,20,0.1)', borderColor: 'rgba(139,105,20,0.4)' },
  filterChipText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.5, color: colors.fog },
  filterChipTextActive: { color: colors.sepia },
  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', backgroundColor: 'rgba(8,6,4,0.98)' },
  emptyStateSelf: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40, borderWidth: 2, borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  vaultPattern: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.02)', opacity: 0.5 },
  emptyLockIcon: { marginBottom: 16, opacity: 0.8 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.parchment, marginBottom: 8, textAlign: 'center' },
  emptyTitleSelf: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, marginBottom: 24, textAlign: 'center', letterSpacing: 1 },
  emptyDesc: { fontFamily: fonts.body, fontSize: 10, color: colors.fog, fontStyle: 'italic', textAlign: 'center', lineHeight: 16 },
  ctaBtnSelf: { paddingVertical: 14, paddingHorizontal: 32, borderWidth: 1, borderColor: 'rgba(139,105,20,0.6)', backgroundColor: 'rgba(139,105,20,0.1)', borderRadius: 2 },
  ctaBtnTextSelf: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 4, color: colors.sepia },
  monthHeaderWrap: { paddingTop: 16, paddingBottom: 12 },
  monthHeader: { fontFamily: 'Courier', fontSize: 12, letterSpacing: 6, color: colors.sepia, opacity: 0.6, paddingHorizontal: 4 },
  grid4: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  posterCardWrap: { position: 'relative', flex: 1, maxWidth: '23.5%', aspectRatio: 2 / 3, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#3A2E1C', backgroundColor: '#050402' },
  posterImg: { width: '100%', height: '100%' },
  posterPlaceholder: { backgroundColor: 'rgba(18,14,9,0.7)', justifyContent: 'center', alignItems: 'center' },
  formatBadge: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(5,4,3,0.95)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 3, borderWidth: 1 },
  formatBadgeText: { fontFamily: fonts.uiBold, fontSize: 7, letterSpacing: 1 },
  loadMoreBtn: { width: '100%', paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 16, borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)' },
  loadMoreText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.sepia },
});


PhysicalVaultCard.displayName = 'PhysicalVaultCard';
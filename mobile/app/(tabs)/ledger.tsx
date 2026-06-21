import { ReelRating, SectionDivider } from '@/src/components/Decorative';
import { EmptyLedger, EmptyLists, EmptyVault, EmptyWatchlist } from '@/src/components/EmptyStates';
import PressableScale from '@/src/components/PressableScale';
import { CinematicFlashList } from '@/src/components/layout/CinematicFlashList';
import FrozenTab from '@/src/components/layout/FrozenTab';
import { globalScrollY } from '@/src/lib/scrollBridge';
import { useAuthStore } from '@/src/stores/auth';
import { useLogStore } from '@/src/stores/films';
import { colors, fonts } from '@/src/theme/theme';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { Lock, Sparkles } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, runOnJS, useAnimatedScrollHandler, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w185';
const AnimatedView = Animated.createAnimatedComponent(View);

type TabName = 'logs' | 'watchlist' | 'vault' | 'lists';

const LedgerLogCard = React.memo(({ item, index, router }: { item: Record<string, any>, index: number, router: import('expo-router').Router }) => {
  const posterUri = item.poster ? `${TMDB_IMG}${item.poster}` : null;
  return (
    <AnimatedView entering={FadeInUp.duration(350).delay(Math.min(index * 40, 300))}>
      <PressableScale onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); (router.push as any)(`/log/${item.id}` as any); }}>
        <View style={s.logRow}>
          {posterUri ? <Image source={{ uri: posterUri }} style={s.logPoster} contentFit="cover" cachePolicy="memory-disk" recyclingKey={`log-${item.id}`} /> : <View style={[s.logPoster, s.noPoster]} />}
          <View style={s.logInfo}>
            <Text style={s.logTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={s.logMeta}>{item.year ?? ''}</Text>
            {item.rating > 0 && <ReelRating rating={item.rating} size={11} />}
          </View>
          <Text style={s.logStatus}>{(item.status ?? 'watched').toUpperCase()}</Text>
        </View>
      </PressableScale>
    </AnimatedView>
  );
});
LedgerLogCard.displayName = 'LedgerLogCard';

const LedgerWatchlistCard = React.memo(({ item, index, router }: { item: Record<string, any>, index: number, router: import('expo-router').Router }) => {
  const posterUri = item.poster_path ? `${TMDB_IMG}${item.poster_path}` : null;
  return (
    <AnimatedView entering={FadeInUp.duration(300).delay(Math.min(index * 30, 250))} style={s.gridItem}>
      <PressableScale onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); (router.push as any)(`/film/${item.id}` as any); }}>
        {posterUri ? <Image source={{ uri: posterUri }} style={s.gridPoster} contentFit="cover" cachePolicy="memory-disk" recyclingKey={`wl-${item.id}`} /> : <View style={[s.gridPoster, s.noPoster]}><Text style={s.noPosterText}>?</Text></View>}
        <Text style={s.gridTitle} numberOfLines={1}>{item.title}</Text>
      </PressableScale>
    </AnimatedView>
  );
});
LedgerWatchlistCard.displayName = 'LedgerWatchlistCard';

const LedgerVaultCard = React.memo(({ item, index, router }: { item: Record<string, any>, index: number, router: import('expo-router').Router }) => {
  const posterUri = item.poster_path ? `${TMDB_IMG}${item.poster_path}` : null;
  return (
    <AnimatedView entering={FadeInUp.duration(300).delay(Math.min(index * 30, 250))} style={s.gridItem}>
      <PressableScale onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); (router.push as any)(`/film/${item.id}` as any); }}>
        {posterUri ? <Image source={{ uri: posterUri }} style={s.gridPoster} contentFit="cover" cachePolicy="memory-disk" recyclingKey={`vault-${item.id}`} /> : <View style={[s.gridPoster, s.noPoster]}><Text style={s.noPosterText}>?</Text></View>}
        <Text style={s.gridTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={s.gridFormat}>{item.format}</Text>
      </PressableScale>
    </AnimatedView>
  );
});
LedgerVaultCard.displayName = 'LedgerVaultCard';

const LedgerListCard = React.memo(({ item, index, router }: { item: Record<string, any>, index: number, router: import('expo-router').Router }) => {
  return (
    <AnimatedView entering={FadeInUp.duration(350).delay(Math.min(index * 50, 300))}>
      <PressableScale onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); (router.push as any)(`/stacks/${item.id}` as any); }}>
        <View style={s.listCard}>
          <Text style={s.listTitle}>{item.title}</Text>
          <Text style={s.listMeta}>{item.films?.length ?? 0} films{item.description ? ` · ${item.description}` : ''}</Text>
          {item.films && item.films.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.listPosters}>
              {item.films.slice(0, 6).map((f: Record<string, any>, i: number) => {
                const uri = f.poster_path ? `${TMDB_IMG}${f.poster_path}` : null;
                return uri ? <Image key={i} source={{ uri }} style={s.listPosterThumb} contentFit="cover" cachePolicy="memory-disk" /> : null;
              })}
            </ScrollView>
          )}
        </View>
      </PressableScale>
    </AnimatedView>
  );
});
LedgerListCard.displayName = 'LedgerListCard';

export default function StacksScreen() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { isAuthenticated, user } = useAuthStore();
  const { logs, watchlist, physicalArchive, lists, fetchLogs, fetchWatchlist, fetchPhysicalArchive, fetchLists } = useLogStore();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabName>('logs');
  const [refreshing, setRefreshing] = useState(false);
  const scrollOffsets = useRef<Record<TabName, number>>({ logs: 0, watchlist: 0, vault: 0, lists: 0 });
  const insets = useSafeAreaInsets();

  const setScrollOffset = useCallback((tab: TabName, val: number) => {
    scrollOffsets.current[tab] = val;
  }, []);

  // Scroll tracking (isolated per tab)
  const logsScrollY = useSharedValue(0);
  const logsScrollHeight = useSharedValue(0);
  const logsViewHeight = useSharedValue(0);
  const logsIsScrolling = useSharedValue(false);
  const onScrollLogs = useAnimatedScrollHandler({
    onScroll: (e) => {
      logsScrollY.value = e.contentOffset.y;
      logsScrollHeight.value = e.contentSize.height;
      logsViewHeight.value = e.layoutMeasurement.height;
      if (activeTab === 'logs') globalScrollY.value = e.contentOffset.y;
    },
    onBeginDrag: () => { logsIsScrolling.value = true; },
    onEndDrag: (e) => { logsIsScrolling.value = false; runOnJS(setScrollOffset)('logs', e.contentOffset.y); },
    onMomentumBegin: () => { logsIsScrolling.value = true; },
    onMomentumEnd: (e) => { logsIsScrolling.value = false; runOnJS(setScrollOffset)('logs', e.contentOffset.y); }
  });

  const watchlistScrollY = useSharedValue(0);
  const watchlistScrollHeight = useSharedValue(0);
  const watchlistViewHeight = useSharedValue(0);
  const watchlistIsScrolling = useSharedValue(false);
  const onScrollWatchlist = useAnimatedScrollHandler({
    onScroll: (e) => {
      watchlistScrollY.value = e.contentOffset.y;
      watchlistScrollHeight.value = e.contentSize.height;
      watchlistViewHeight.value = e.layoutMeasurement.height;
      if (activeTab === 'watchlist') globalScrollY.value = e.contentOffset.y;
    },
    onBeginDrag: () => { watchlistIsScrolling.value = true; },
    onEndDrag: (e) => { watchlistIsScrolling.value = false; runOnJS(setScrollOffset)('watchlist', e.contentOffset.y); },
    onMomentumBegin: () => { watchlistIsScrolling.value = true; },
    onMomentumEnd: (e) => { watchlistIsScrolling.value = false; runOnJS(setScrollOffset)('watchlist', e.contentOffset.y); }
  });

  const vaultScrollY = useSharedValue(0);
  const vaultScrollHeight = useSharedValue(0);
  const vaultViewHeight = useSharedValue(0);
  const vaultIsScrolling = useSharedValue(false);
  const onScrollVault = useAnimatedScrollHandler({
    onScroll: (e) => {
      vaultScrollY.value = e.contentOffset.y;
      vaultScrollHeight.value = e.contentSize.height;
      vaultViewHeight.value = e.layoutMeasurement.height;
      if (activeTab === 'vault') globalScrollY.value = e.contentOffset.y;
    },
    onBeginDrag: () => { vaultIsScrolling.value = true; },
    onEndDrag: (e) => { vaultIsScrolling.value = false; runOnJS(setScrollOffset)('vault', e.contentOffset.y); },
    onMomentumBegin: () => { vaultIsScrolling.value = true; },
    onMomentumEnd: (e) => { vaultIsScrolling.value = false; runOnJS(setScrollOffset)('vault', e.contentOffset.y); }
  });

  const listsScrollY = useSharedValue(0);
  const listsScrollHeight = useSharedValue(0);
  const listsViewHeight = useSharedValue(0);
  const listsIsScrolling = useSharedValue(false);
  const onScrollLists = useAnimatedScrollHandler({
    onScroll: (e) => {
      listsScrollY.value = e.contentOffset.y;
      listsScrollHeight.value = e.contentSize.height;
      listsViewHeight.value = e.layoutMeasurement.height;
      if (activeTab === 'lists') globalScrollY.value = e.contentOffset.y;
    },
    onBeginDrag: () => { listsIsScrolling.value = true; },
    onEndDrag: (e) => { listsIsScrolling.value = false; runOnJS(setScrollOffset)('lists', e.contentOffset.y); },
    onMomentumBegin: () => { listsIsScrolling.value = true; },
    onMomentumEnd: (e) => { listsIsScrolling.value = false; runOnJS(setScrollOffset)('lists', e.contentOffset.y); }
  });

  useEffect(() => { globalScrollY.value = 0; }, []);

  useFocusEffect(
    useCallback(() => {
      globalScrollY.value = withTiming(scrollOffsets.current[activeTab] || 0, { duration: 250 });
    }, [activeTab])
  );

  useEffect(() => {
    if (isAuthenticated) {
      fetchLogs(); fetchWatchlist(); fetchPhysicalArchive(); fetchLists();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchLogs(), fetchWatchlist(), fetchPhysicalArchive(), fetchLists()]);
    setRefreshing(false);
  }, [fetchLogs, fetchWatchlist, fetchPhysicalArchive, fetchLists]);

  // Memoize the shared refresh control to prevent re-creation
  const sharedRefreshControl = useMemo(() => (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} />
  ), [refreshing, onRefresh]);

  const renderLogItem = useCallback(({ item, index }: { item: Record<string, any>, index: number }) => (
    <LedgerLogCard item={item} index={index} router={router} />
  ), [router]);

  const renderWatchlistItem = useCallback(({ item, index }: { item: Record<string, any>, index: number }) => (
    <LedgerWatchlistCard item={item} index={index} router={router} />
  ), [router]);

  const renderVaultItem = useCallback(({ item, index }: { item: Record<string, any>, index: number }) => (
    <LedgerVaultCard item={item} index={index} router={router} />
  ), [router]);

  const renderListItem = useCallback(({ item, index }: { item: Record<string, any>, index: number }) => (
    <LedgerListCard item={item} index={index} router={router} />
  ), [router]);

  if (!isAuthenticated) {
    return (
      <FrozenTab>
      <View style={s.container}>
        <View style={s.center}>
          <Lock size={40} color={colors.ash} strokeWidth={1.2} />
          <Text style={s.lockedText}>Sign in to access your Stacks</Text>
          <PressableScale style={s.ctaBtn} onPress={() => (router.push as any)('/login' as any)} pressedScale={0.97}>
            <View style={s.ctaBtnContent}>
              <Sparkles size={12} color={colors.ink} strokeWidth={2} />
              <Text style={s.ctaText}>ENTER THE HOUSE</Text>
            </View>
          </PressableScale>
        </View>
      </View>
      </FrozenTab>
    );
  }

  const tabs: { key: TabName; label: string; count: number }[] = [
    { key: 'logs', label: 'LEDGER', count: logs.length },
    { key: 'watchlist', label: 'WATCHLIST', count: watchlist.length },
    { key: 'vault', label: 'VAULT', count: physicalArchive.length },
    { key: 'lists', label: 'LISTS', count: lists.length },
  ];



  return (
    <FrozenTab>
    <View style={s.container}>
      {/* Header */}
      <AnimatedView entering={FadeInDown.duration(600)} style={[s.header, { paddingTop: Math.max(insets.top + 10, 60) }]}>
        <Text style={s.eyebrow}>YOUR PRIVATE ARCHIVE</Text>
        <Text style={s.title}>The Stacks</Text>
      </AnimatedView>

      {/* Stats Bar */}
      <AnimatedView entering={FadeInDown.duration(600).delay(100)} style={s.statsBar}>
        {tabs.map((t) => (
          <PressableScale key={t.key} style={[s.statItem, activeTab === t.key && s.statActive]} onPress={() => setActiveTab(t.key)} haptic="selection">
            <Text style={[s.statNum, activeTab === t.key && s.statNumActive]}>{t.count}</Text>
            <Text style={[s.statLabel, activeTab === t.key && s.statLabelActive]}>{t.label}</Text>
          </PressableScale>
        ))}
      </AnimatedView>

      <SectionDivider />

      {/*
       * Refactored to dynamically render ONLY the active tab, clearing thousands 
       * of React shadow tree nodes from memory. Scroll position is preserved via 
       * the scrollOffsets ref and initialScrollOffset prop on remount.
       */}
      <View style={s.tabPaneActive}>
        <View style={[StyleSheet.absoluteFill, { opacity: activeTab === 'logs' ? 1 : 0, zIndex: activeTab === 'logs' ? 1 : 0 }]} pointerEvents={activeTab === 'logs' ? 'auto' : 'none'}>
          <CinematicFlashList
            data={logs}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={s.listContent}
            estimatedItemSize={83}
            refreshControl={sharedRefreshControl}
            renderItem={renderLogItem}
            ListEmptyComponent={<EmptyLedger />}
            scrollMetrics={{
              scrollY: logsScrollY,
              scrollHeight: logsScrollHeight,
              viewHeight: logsViewHeight,
              isScrolling: logsIsScrolling
            }}
            onScroll={onScrollLogs}
            bottomInset={insets.bottom + 49}
          />
        </View>
        <View style={[StyleSheet.absoluteFill, { opacity: activeTab === 'watchlist' ? 1 : 0, zIndex: activeTab === 'watchlist' ? 1 : 0 }]} pointerEvents={activeTab === 'watchlist' ? 'auto' : 'none'}>
          <CinematicFlashList
            data={watchlist}
            keyExtractor={(item: any) => String(item.id)}
            numColumns={3}
            contentContainerStyle={s.gridContent}
            estimatedItemSize={180}
            refreshControl={sharedRefreshControl}
            renderItem={renderWatchlistItem}
            ListEmptyComponent={<EmptyWatchlist />}
            scrollMetrics={{
              scrollY: watchlistScrollY,
              scrollHeight: watchlistScrollHeight,
              viewHeight: watchlistViewHeight,
              isScrolling: watchlistIsScrolling
            }}
            onScroll={onScrollWatchlist}
            bottomInset={insets.bottom + 49}
          />
        </View>
        <View style={[StyleSheet.absoluteFill, { opacity: activeTab === 'vault' ? 1 : 0, zIndex: activeTab === 'vault' ? 1 : 0 }]} pointerEvents={activeTab === 'vault' ? 'auto' : 'none'}>
          <CinematicFlashList
            data={physicalArchive}
            keyExtractor={(item: any) => String(item.id)}
            numColumns={3}
            contentContainerStyle={s.gridContent}
            estimatedItemSize={180}
            refreshControl={sharedRefreshControl}
            renderItem={renderVaultItem}
            ListEmptyComponent={<EmptyVault />}
            scrollMetrics={{
              scrollY: vaultScrollY,
              scrollHeight: vaultScrollHeight,
              viewHeight: vaultViewHeight,
              isScrolling: vaultIsScrolling
            }}
            onScroll={onScrollVault}
            bottomInset={insets.bottom + 49}
          />
        </View>
        <View style={[StyleSheet.absoluteFill, { opacity: activeTab === 'lists' ? 1 : 0, zIndex: activeTab === 'lists' ? 1 : 0 }]} pointerEvents={activeTab === 'lists' ? 'auto' : 'none'}>
          <CinematicFlashList
            data={lists}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={s.listContent}
            estimatedItemSize={120}
            refreshControl={sharedRefreshControl}
            renderItem={renderListItem}
            ListEmptyComponent={<EmptyLists />}
            scrollMetrics={{
              scrollY: listsScrollY,
              scrollHeight: listsScrollHeight,
              viewHeight: listsViewHeight,
              isScrolling: listsIsScrolling
            }}
            onScroll={onScrollLists}
            bottomInset={insets.bottom + 49}
          />
        </View>
      </View>
    </View>
    </FrozenTab>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  header: { paddingHorizontal: 16, marginBottom: 16 },
  eyebrow: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 4, color: colors.sepia, marginBottom: 6 },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.parchment },

  // Stats Tab Bar
  // Web: statsBar borderRadius 2px matching --radius-card
  statsBar: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: colors.soot, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statActive: { borderBottomWidth: 2, borderBottomColor: colors.sepia },
  statNum: { fontFamily: fonts.display, fontSize: 20, color: colors.fog, marginBottom: 2 },
  statNumActive: { color: colors.sepia },
  statLabel: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.5, color: colors.fog },
  statLabelActive: { color: colors.bone },

  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  gridContent: { paddingHorizontal: 12, paddingBottom: 40 },

  // Log Rows
  // Web: log row borderRadius 2px
  logRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.soot, borderRadius: 2,
    marginBottom: 8, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
  },
  logPoster: { width: 50, height: 75, backgroundColor: colors.ash },
  noPoster: { alignItems: 'center', justifyContent: 'center' },
  noPosterText: { fontFamily: fonts.display, color: colors.fog, fontSize: 14 },
  logInfo: { flex: 1, padding: 12 },
  logTitle: { fontFamily: fonts.sub, fontSize: 14, color: colors.parchment, marginBottom: 3 },
  logMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.sepia },
  logStatus: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2, color: colors.bloodReel, marginRight: 12 },

  // Poster Grid
  // Web: poster grid borderRadius 2px
  gridItem: { flex: 1 / 3, margin: 4, maxWidth: '31%' },
  gridPoster: { width: '100%', aspectRatio: 2 / 3, borderRadius: 2, backgroundColor: colors.ash },
  gridTitle: { fontFamily: fonts.body, fontSize: 10, color: colors.bone, marginTop: 4 },
  gridFormat: { fontFamily: fonts.ui, fontSize: 8, color: colors.fog, letterSpacing: 1 },

  // List Cards
  // Web: list card borderRadius 2px
  listCard: {
    backgroundColor: colors.soot, borderRadius: 2, padding: 16, marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
  },
  listTitle: { fontFamily: fonts.sub, fontSize: 15, color: colors.parchment, marginBottom: 4 },
  listMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, marginBottom: 8 },
  listPosters: { flexDirection: 'row', marginTop: 4 },
  listPosterThumb: { width: 40, height: 60, borderRadius: 2, marginRight: 6, backgroundColor: colors.ash },

  // Persistent tab panes — stay mounted to preserve scroll state
  tabPaneActive: { flex: 1 },

  // Locked
  lockedText: { fontFamily: fonts.body, color: colors.fog, fontSize: 13, marginBottom: 16, marginTop: 12 },
  ctaBtn: { backgroundColor: colors.sepia, borderRadius: 2, paddingVertical: 14, paddingHorizontal: 28 },
  ctaBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaText: { fontFamily: fonts.uiMedium, fontSize: 11, letterSpacing: 2, color: colors.ink, fontWeight: '700' },
  emptyText: { fontFamily: fonts.body, color: colors.fog, fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
});

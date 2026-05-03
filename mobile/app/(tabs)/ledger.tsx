import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Lock, Sparkles } from 'lucide-react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { useRouter } from 'expo-router';
import { colors, fonts } from '@/src/theme/theme';
import { SectionDivider, ReelRating } from '@/src/components/Decorative';
import { EmptyLedger, EmptyWatchlist, EmptyVault, EmptyLists } from '@/src/components/EmptyStates';
import PressableScale from '@/src/components/PressableScale';
import FrozenTab from '@/src/components/layout/FrozenTab';
import { setScrollY } from '@/src/utils/scrollBridge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w185';
const AnimatedView = Animated.createAnimatedComponent(View);

type TabName = 'logs' | 'watchlist' | 'vault' | 'lists';

const LedgerLogCard = React.memo(({ item, index, router }: { item: Record<string, any>, index: number, router: import('expo-router').Router }) => {
  const posterUri = item.poster ? `${TMDB_IMG}${item.poster}` : null;
  return (
    <AnimatedView entering={FadeInUp.duration(350).delay(Math.min(index * 40, 300))}>
      <PressableScale onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/log/${item.id}` as any); }}>
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
      <PressableScale onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/film/${item.id}` as any); }}>
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
      <PressableScale onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/film/${item.id}` as any); }}>
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
      <PressableScale onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/stacks/${item.id}` as any); }}>
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
  const { logs, watchlist, physicalArchive, lists, fetchLogs, fetchWatchlist, fetchPhysicalArchive, fetchLists } = useFilmStore();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabName>('logs');
  const scrollOffsets = useRef<Record<TabName, number>>({ logs: 0, watchlist: 0, vault: 0, lists: 0 });
  const insets = useSafeAreaInsets();

  const handleScroll = useCallback((e: any) => {
    scrollOffsets.current[activeTab] = e.nativeEvent.contentOffset.y;
  }, [activeTab]);

  // Reset scroll bridge so NavBar returns to transparent on this tab
  useEffect(() => { setScrollY(0); }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchLogs(); fetchWatchlist(); fetchPhysicalArchive(); fetchLists();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const onRefresh = useCallback(() => { fetchLogs(); fetchWatchlist(); fetchPhysicalArchive(); fetchLists(); }, [fetchLogs, fetchWatchlist, fetchPhysicalArchive, fetchLists]);

  // F-04 FIX: Memoize the shared refresh control to prevent re-creation
  const sharedRefreshControl = useMemo(() => (
    <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.sepia} />
  ), [onRefresh]);

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
          <PressableScale style={s.ctaBtn} onPress={() => router.push('/login' as any)} pressedScale={0.97}>
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
        {activeTab === 'logs' && (
          <FlashList
            data={logs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            estimatedItemSize={83}
            refreshControl={sharedRefreshControl}
            renderItem={renderLogItem}
            ListEmptyComponent={<EmptyLedger />}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentOffset={{ y: scrollOffsets.current['logs'], x: 0 }}
          />
        )}
        {activeTab === 'watchlist' && (
          <FlashList
            data={watchlist}
            keyExtractor={(item) => String(item.id)}
            numColumns={3}
            contentContainerStyle={s.gridContent}
            showsVerticalScrollIndicator={false}
            estimatedItemSize={180}
            refreshControl={sharedRefreshControl}
            renderItem={renderWatchlistItem}
            ListEmptyComponent={<EmptyWatchlist />}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentOffset={{ y: scrollOffsets.current['watchlist'], x: 0 }}
          />
        )}
        {activeTab === 'vault' && (
          <FlashList
            data={physicalArchive}
            keyExtractor={(item) => String(item.id)}
            numColumns={3}
            contentContainerStyle={s.gridContent}
            showsVerticalScrollIndicator={false}
            estimatedItemSize={180}
            refreshControl={sharedRefreshControl}
            renderItem={renderVaultItem}
            ListEmptyComponent={<EmptyVault />}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentOffset={{ y: scrollOffsets.current['vault'], x: 0 }}
          />
        )}
        {activeTab === 'lists' && (
          <FlashList
            data={lists}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            estimatedItemSize={120}
            refreshControl={sharedRefreshControl}
            renderItem={renderListItem}
            ListEmptyComponent={<EmptyLists />}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentOffset={{ y: scrollOffsets.current['lists'], x: 0 }}
          />
        )}
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

  // F-04 FIX: Persistent tab panes — stay mounted to preserve scroll state
  tabPaneActive: { flex: 1 },

  // Locked
  lockedText: { fontFamily: fonts.body, color: colors.fog, fontSize: 13, marginBottom: 16, marginTop: 12 },
  ctaBtn: { backgroundColor: colors.sepia, borderRadius: 2, paddingVertical: 14, paddingHorizontal: 28 },
  ctaBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaText: { fontFamily: fonts.uiMedium, fontSize: 11, letterSpacing: 2, color: colors.ink, fontWeight: '700' },
  emptyText: { fontFamily: fonts.body, color: colors.fog, fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
});

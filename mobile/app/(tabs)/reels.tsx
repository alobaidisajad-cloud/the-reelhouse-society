import { useEffect, useCallback, useState, useMemo, useRef, memo } from 'react';
import { View, StyleSheet, Keyboard } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import { AnimatedText } from '@/src/components/text/AnimatedText';

import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, useDerivedValue, Easing
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TactileEngine from '@/src/utils/TactileEngine';
import { useFocusEffect } from 'expo-router';
import { nav } from '@/src/utils/typedRouter';
import { Arrive } from '@/src/components/Arrive';
import { useScrollToTop } from '@react-navigation/native';

import { useAuthStore } from '@/src/stores/auth';
import { resolveTier } from '@/src/utils/tier';
import { useSocialStore } from '@/src/stores/followStore';
import { colors, fonts } from '@/src/theme/theme';

import { SectionDivider } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import Buster from '@/src/components/Buster';
import FrozenTab from '@/src/components/layout/FrozenTab';

import { SectionErrorBoundary } from '@/src/components/SectionErrorBoundary';
import { globalScrollY } from '@/src/lib/scrollBridge';
import {
  ReelSection, FeedFilter 
} from '@/src/components/reels/types';
import { SharedReelHeader } from '@/src/components/reels/ReelsHeader';
import { 
  ReelProjectorBeam, TungstenSpooling, FilterChip, FILTER_GAP,
} from '@/src/components/reels/ReelsCards';
import { useCommunityFeed, useFollowingFeed, useStacksFeed } from '@/src/hooks/useFeeds';
import { ReelsFeedList } from '@/src/components/reels/ReelsFeedList';
import { ReelsStackList } from '@/src/components/reels/ReelsStackList';
import { MemberRegistry } from '@/src/components/reels/MemberRegistry';
import { NAV_ROW_MIN_H, navTopPadding } from '@/src/components/layout/navMetrics';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import { EDGE_LIT, WASH } from '@/src/theme/light';
import { useScreenReady } from '@/src/hooks/useScreenReady';
import { EmptyOffline, REFRESH_FAILED } from '@/src/components/EmptyStates';
import reelToast from '@/src/utils/reelToast';
import { BrassSheen } from '@/src/components/theme/BrassSheen';

const AutonomousSearchBar = memo(({ value, onChangeText, onClear }: { value: string; onChangeText: (text: string) => void; onClear: () => void }) => {
  const [localText, setLocalText] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmittedValue = useRef(value);

  useEffect(() => {
    if (value !== lastEmittedValue.current) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setLocalText(value);
      lastEmittedValue.current = value;
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleChange = useCallback((t: string) => {
    setLocalText(t);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      lastEmittedValue.current = t;
      onChangeText(t);
    }, 400);
  }, [onChangeText]);

  const handleClear = useCallback(() => {
    setLocalText('');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onClear();
  }, [onClear]);

  return (
    <>
      <TextInput
        style={st.searchInput}
        placeholder="SEARCH STACKS..."
        placeholderTextColor={colors.fog}
        value={localText}
        onChangeText={handleChange}
        returnKeyType="search"
        onSubmitEditing={() => Keyboard.dismiss()}
        selectionColor={colors.sepia}
        keyboardAppearance="dark"
        accessibilityLabel="Search curated stacks"
        autoCorrect={false}
        spellCheck={false}
        onFocus={() => TactileEngine.navigate()}
      />
      {localText.length > 0 && (
        <PressableScale onPress={handleClear} style={st.searchClear} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          accessibilityRole="button" accessibilityLabel="Clear the search">
          <Text style={st.searchClearText}>✕</Text>
        </PressableScale>
      )}
    </>
  );
});
AutonomousSearchBar.displayName = 'AutonomousSearchBar';


export default function ReelScreen() {
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const user = useAuthStore(s => s.user);
  const resolvedRole = resolveTier(user);

  // The bar's row and bottom padding; the 12 is 2pt over the padding, as on the Lobby.
  const NAV_HEIGHT = NAV_ROW_MIN_H + 12;
  // The bar's own top padding: with no inset it still pads, and a bare inset hides the masthead.
  const topPad = navTopPadding(insets.top) + NAV_HEIGHT + 8;

  useEffect(() => { globalScrollY.value = 0; }, []);

  const overallLogsScrollY = useSharedValue(0);
  const stacksScrollY = useSharedValue(0);
  const activeTabSV = useSharedValue<ReelSection>('logs');

  const activeScrollY = useDerivedValue(() => {
    return activeTabSV.value === 'logs' ? overallLogsScrollY.value : stacksScrollY.value;
  });

  useFocusEffect(
    useCallback(() => {
      globalScrollY.value = withTiming(activeScrollY.value, { duration: 250 });
    }, [activeScrollY])
  );

  // Never animate zIndex: on Fabric it races FlashList's commits and the layers blink.
  // Opacity crossfades; pointerEvents gates the touches.
  const logsProgress = useDerivedValue(() =>
    withTiming(activeTabSV.value === 'logs' ? 1 : 0, { duration: 300, easing: Easing.out(Easing.quad) })
  );

  const logsOpacityStyle = useAnimatedStyle(() => ({ opacity: logsProgress.value }));
  const stacksOpacityStyle = useAnimatedStyle(() => ({ opacity: 1 - logsProgress.value }));

  const logsFlatListRef = useRef<any>(null);
  const stacksFlatListRef = useRef<any>(null);
  
  const [section, setSection] = useState<ReelSection>('logs');

  const activeSectionRef = useRef(section);
  activeSectionRef.current = section;

  const proxyScrollRef = useRef({
    scrollToOffset: (options: any) => {
      if (activeSectionRef.current === 'logs') {
        logsFlatListRef.current?.scrollToOffset(options);
      } else {
        stacksFlatListRef.current?.scrollToOffset(options);
      }
    }
  });
  useScrollToTop(proxyScrollRef);

  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  const [stackFilter, setStackFilter] = useState<FeedFilter>('all');
  const [stackSearch, setStackSearch] = useState('');
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // isRefetching is deliberately not taken: the pull gesture drives
  // isManualRefreshing above, so the screen owns its own spinner.
  const { data: communityData, isLoading: communityLoading, isError: communityFailed, refetch: refetchCommunity, fetchNextPage: fetchNextCommunity, hasNextPage: hasNextCommunity, isFetchingNextPage: isFetchingNextCommunity } = useCommunityFeed();
  const { data: followingData, isLoading: followingLoading, isError: followingFailed, refetch: refetchFollowing, fetchNextPage: fetchNextFollowing, hasNextPage: hasNextFollowing, isFetchingNextPage: isFetchingNextFollowing } = useFollowingFeed();
  const { data: stacksData, isLoading: stacksLoading, isError: stacksFailed, refetch: refetchStacks, fetchNextPage: fetchNextStacks, hasNextPage: hasNextStacks, isFetchingNextPage: isFetchingNextStacks } = useStacksFeed(stackFilter, stackSearch);

  const followingCount = useSocialStore((s) => s.following.length);

  const communityFeed = useMemo(() => communityData?.pages.flat() || [], [communityData]);
  const followingFeed = useMemo(() => followingData?.pages.flat() || [], [followingData]);
  const readyMark = useScreenReady('reel', !communityLoading);
  const filteredStacks = useMemo(() => {
    if (stackFilter === 'following' && followingCount === 0) return [];
    return stacksData?.pages.flat() || [];
  }, [stacksData, stackFilter, followingCount]);

  const onRefresh = useCallback(async () => {
    TactileEngine.navigate();
    setIsManualRefreshing(true);
    const isFollowingAnyone = useSocialStore.getState().following.length > 0;
    
    try {
      let pulled: { isError: boolean; data?: unknown } | null = null;
      if (section === 'logs') {
        if (feedFilter === 'following') {
          if (isAuthenticated && isFollowingAnyone) {
            pulled = await refetchFollowing();
          }
        } else {
          pulled = await refetchCommunity();
        }
      } else {
        pulled = await refetchStacks();
      }
      // The reel on screen stays and the pull's failure is said; an empty reel says it itself.
      if (pulled?.isError && pulled.data !== undefined) reelToast.error(REFRESH_FAILED);
    } finally {
      setIsManualRefreshing(false);
    }
  }, [section, feedFilter, refetchCommunity, refetchFollowing, refetchStacks, isAuthenticated]);
  const activeFeed = useMemo(() => 
    feedFilter === 'following' ? (followingCount > 0 ? followingFeed : []) : communityFeed, 
  [feedFilter, followingFeed, communityFeed, followingCount]);
  const logCount = activeFeed.length;
  const feedLoading = feedFilter === 'following' ? followingLoading : communityLoading;

  const onLoadMoreLogs = useCallback(() => {
    if (feedFilter === 'following' && hasNextFollowing) {
      fetchNextFollowing();
    } else if (feedFilter === 'all' && hasNextCommunity) {
      fetchNextCommunity();
    }
  }, [feedFilter, hasNextFollowing, fetchNextFollowing, hasNextCommunity, fetchNextCommunity]);

  const onLoadMoreStacks = useCallback(() => {
    if (hasNextStacks) {
      fetchNextStacks();
    }
  }, [hasNextStacks, fetchNextStacks]);

  const switchSection = useCallback((s: ReelSection) => {
    if (s === section) return;
    TactileEngine.mutate();
    activeTabSV.value = s;
    setSection(s);
    
    // Instantly sync the global scroll variables to prevent nav bar glitching
    if (s === 'logs') {
      globalScrollY.value = overallLogsScrollY.value;

    } else {
      globalScrollY.value = stacksScrollY.value;

    }
  }, [section, activeTabSV, overallLogsScrollY, stacksScrollY]);

  /** A stranger reads this page; each act asks for a name where it is, as every act gate does. */
  const askForAName = useCallback(() => {
    TactileEngine.destroy();
    nav.push('/login');
  }, []);

  const switchFeedFilter = useCallback((f: FeedFilter) => {
    // Roped, not hidden: the chip is where a stranger learns an orbit exists.
    if (f === 'following' && !isAuthenticated) return askForAName();
    if (f === feedFilter) return;
    TactileEngine.selection();
    
    // Synchronously kill momentum before batching state updates
    logsFlatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    overallLogsScrollY.value = 0;
    globalScrollY.value = 0;

    setFeedFilter(f);
  }, [feedFilter, overallLogsScrollY, isAuthenticated, askForAName]);

  const switchStackFilter = useCallback((f: FeedFilter) => {
    // Same rope, same reason — see switchFeedFilter above.
    if (f === 'following' && !isAuthenticated) return askForAName();
    if (f === stackFilter) return;
    TactileEngine.selection();
    
    // Synchronously kill momentum before batching state updates
    stacksFlatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    stacksScrollY.value = 0;
    globalScrollY.value = 0;

    setStackFilter(f);
  }, [stackFilter, stacksScrollY, isAuthenticated, askForAName]);



  const handleStackSearchChange = useCallback((text: string) => {
    stacksFlatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    stacksScrollY.value = 0;
    globalScrollY.value = 0;

    setStackSearch(text);
  }, [stacksScrollY]);

  const handleClearSearch = useCallback(() => {
    stacksFlatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    stacksScrollY.value = 0;
    globalScrollY.value = 0;

    setStackSearch('');
  }, [stacksScrollY]);

  const logsHeader = useMemo(() => (
    <>
      <SharedReelHeader section={section} variant="logs" userRole={resolvedRole} onTabSwitch={switchSection} />
      <View style={st.filterRow}>
        <FilterChip label="MAIN REEL" active={feedFilter === 'all'} onPress={() => switchFeedFilter('all')} />
        <FilterChip label="FOLLOWING" active={feedFilter === 'following'} onPress={() => switchFeedFilter('following')} />
      </View>
      <SectionDivider label="THE LIVING RECORD" />
    </>
  ), [section, feedFilter, resolvedRole, switchSection, switchFeedFilter]);

  // A feed that could not be read is not an empty one, and does not say it is.
  const feedFailed = feedFilter === 'following'
    ? followingFailed && followingData === undefined
    : communityFailed && communityData === undefined;
  const rereadFeed = useCallback(() => {
    void (feedFilter === 'following' ? refetchFollowing() : refetchCommunity());
  }, [feedFilter, refetchFollowing, refetchCommunity]);

  const logsEmpty = useMemo(() => {
    if (feedLoading) return <TungstenSpooling />;
    if (feedFailed) return <EmptyOffline onRetry={rereadFeed} />;
    return (
      <Arrive name="reel.empty" style={st.emptyWrap}>
        <Buster size={48} mood="unimpressed" />
        <Text style={st.emptyTitle}>
          {feedFilter === 'following' ? 'Your orbit is quiet.' : 'The projection booth is dark.'}
        </Text>
        <Text style={st.emptySub}>
          {feedFilter === 'following'
            ? 'Follow other members to see their logs here.'
            : 'Be the first to log a film and leave your mark.'}
        </Text>
        {feedFilter === 'following' ? (
          <PressableScale style={st.emptyBtn} onPress={() => { TactileEngine.mutate(); switchFeedFilter('all'); }}>
            <Text style={st.emptyBtnText}>GLOBAL REEL</Text>
          </PressableScale>
        ) : (
          <PressableScale style={st.emptyBtn} onPress={() => { if (!isAuthenticated) return askForAName(); TactileEngine.mutate(); nav.push('/log-modal'); }}>
            <Text style={st.emptyBtnText}>LOG A FILM</Text>
          </PressableScale>
        )}

        {/* Only in the empty FOLLOWING feed, so an orbit is never a dead end. */}
        <MemberRegistry visible={feedFilter === 'following'} />
      </Arrive>
    );
  }, [feedLoading, feedFailed, rereadFeed, feedFilter, switchFeedFilter, isAuthenticated, askForAName]);

  const stackHeader = useMemo(() => (
    <>
      <SharedReelHeader section={section} variant="stacks" userRole={resolvedRole} onTabSwitch={switchSection} />
      <View style={st.searchWrap}>
        <AnimatedText style={st.searchIcon}>✦</AnimatedText>
        <AutonomousSearchBar 
          value={stackSearch} 
          onChangeText={handleStackSearchChange} 
          onClear={handleClearSearch} 
        />
      </View>
      {/* No count: the feed pages 60 at a time, so a length is never the total. */}
      <View style={st.filterRow}>
        <FilterChip label="ALL STACKS" active={stackFilter === 'all'} onPress={() => switchStackFilter('all')} />
        <FilterChip label="FOLLOWING" active={stackFilter === 'following'} onPress={() => switchStackFilter('following')} />
      </View>
      {/* Above the rule, so "CURATED STACKS" introduces the grid, not the button. */}
      <PressableScale
        testID="reel-curate-stack"
        style={st.createStackBtn}
        onPress={() => { if (!isAuthenticated) return askForAName(); TactileEngine.destroy(); nav.push('/list-modal'); }}
        accessibilityRole="button" accessibilityLabel="Curate a collection"
      >
        <BrassSheen />
        <LinearGradient
          colors={['transparent', 'rgba(184,137,26,0.06)', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={st.createStackGlow}
        />
        <Text style={st.createStackText}>✦ CURATE A COLLECTION</Text>
      </PressableScale>
      <SectionDivider label="CURATED STACKS" />
    </>
  ), [section, resolvedRole, stackSearch, stackFilter, switchSection, switchStackFilter, handleStackSearchChange, handleClearSearch, isAuthenticated, askForAName]);

  const logsExtraData = useMemo(() => [feedFilter, section, logCount, resolvedRole, feedLoading], [feedFilter, section, logCount, resolvedRole, feedLoading]);
  const stacksExtraData = useMemo(() => [stackSearch, stackFilter, section, logCount, resolvedRole, filteredStacks.length, stacksLoading], [stackSearch, stackFilter, section, logCount, resolvedRole, filteredStacks.length, stacksLoading]);


  const stacksLost = stacksFailed && stacksData === undefined;
  const rereadStacks = useCallback(() => { void refetchStacks(); }, [refetchStacks]);

  const stackEmpty = useMemo(() => {
    if (stacksLoading) return <TungstenSpooling />;
    if (stacksLost) return <EmptyOffline onRetry={rereadStacks} />;
    return (
      <Arrive name="stacks.empty" style={st.emptyWrap}>
        <Buster size={48} mood="suspicious" />
        <Text style={st.emptyTitle}>
          {stackSearch ? 'No stacks match your search.' 
            : stackFilter === 'following' ? 'Your orbit has no collections.'
            : 'The archive awaits its first curator.'}
        </Text>
        <Text style={st.emptySub}>
          {stackSearch
            ? 'Try a different search term or clear your filters.'
            : stackFilter === 'following' ? 'Follow more curators to discover their stacks here.'
            : 'Create a collection to immortalize your cinematic taste.'}
        </Text>
        {stackSearch ? (
          <PressableScale style={st.emptyBtn} onPress={() => { TactileEngine.mutate(); handleClearSearch(); }}>
            <Text style={st.emptyBtnText}>CLEAR FILTERS</Text>
          </PressableScale>
        ) : stackFilter === 'following' ? (
          <PressableScale style={st.emptyBtn} onPress={() => { TactileEngine.mutate(); switchStackFilter('all'); }}>
            <Text style={st.emptyBtnText}>GLOBAL STACKS</Text>
          </PressableScale>
        ) : (
          <PressableScale style={st.emptyBtn} onPress={() => { if (!isAuthenticated) return askForAName(); TactileEngine.mutate(); nav.push('/list-modal'); }}>
            <Text style={st.emptyBtnText}>CREATE COLLECTION</Text>
          </PressableScale>
        )}
      </Arrive>
    );
  }, [stacksLoading, stacksLost, rereadStacks, stackSearch, stackFilter, handleClearSearch, switchStackFilter, isAuthenticated, askForAName]);



  // Why a stranger may read the Reel and not the Lounge: theReelIsTheAdvertisement.test.ts.
  return (
    <SectionErrorBoundary section="The Reel">
      <FrozenTab>
      <View style={st.container}>
      <RoomLight room="reel" />
      {readyMark}
      {/* The page's own fade, thinned so the projector's light shows through. */}
      <LinearGradient
        colors={[colors.ink, 'rgba(13,11,9,1)', colors.soot]}
        locations={[0, 0.4, 1]}
        style={[StyleSheet.absoluteFillObject, WASH]}
      />
      <ReelProjectorBeam scrollY={activeScrollY} />

      <Animated.View pointerEvents={section === 'logs' ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, logsOpacityStyle]}>
        <ReelsFeedList
          feed={activeFeed}
          refreshing={isManualRefreshing}
          onRefresh={onRefresh}
          topPad={topPad}
          bottomInset={insets.bottom + 49}
          overallLogsScrollY={overallLogsScrollY}
          activeTabSV={activeTabSV}
          ListHeaderComponent={logsHeader}
          ListEmptyComponent={logsEmpty}
          contentContainerStyle={{ ...st.listContent, paddingTop: topPad }}
          listRef={logsFlatListRef}
          onEndReached={onLoadMoreLogs}
          isFetchingNextPage={feedFilter === 'following' ? isFetchingNextFollowing : isFetchingNextCommunity}
          extraData={logsExtraData}
        />
      </Animated.View>

      <Animated.View pointerEvents={section === 'stacks' ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, stacksOpacityStyle]}>
        <ReelsStackList
          stacks={filteredStacks}
          refreshing={isManualRefreshing}
          onRefresh={onRefresh}
          topPad={topPad}
          bottomInset={insets.bottom + 49}
          stacksScrollY={stacksScrollY}
          activeTabSV={activeTabSV}
          ListHeaderComponent={stackHeader}
          ListEmptyComponent={stackEmpty}
          contentContainerStyle={{ ...st.listContent, paddingTop: topPad, paddingHorizontal: 10 }}
          listRef={stacksFlatListRef}
          onEndReached={onLoadMoreStacks}
          isFetchingNextPage={isFetchingNextStacks}
          extraData={stacksExtraData}
        />
      </Animated.View>
    </View>
    </FrozenTab>
    </SectionErrorBoundary>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  listContent: { paddingBottom: 120 },

  filterRow: {
    flexDirection: 'row', paddingHorizontal: 16, gap: FILTER_GAP,
    marginBottom: 14, alignItems: 'center',
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12,
    backgroundColor: colors.well, borderWidth: 1, borderColor: 'rgba(184,137,26,0.12)',
    borderRadius: 4, paddingHorizontal: 12, height: 40,
  },
  // The glyph that marks the field as searchable: 0.80 gives 4.35:1, past the
  // 3:1 a mark needs.
  searchIcon: { fontSize: 9, color: colors.sepia, opacity: 0.8, marginRight: 10 },
  searchInput: {
    flex: 1, fontFamily: fonts.body, fontSize: 11, color: colors.parchment,
    paddingVertical: 0,
  },
  searchClear: { padding: 4, marginLeft: 4 },
  searchClearText: { fontFamily: fonts.sub, fontSize: 10, color: colors.fog },

  createStackBtn: { ...EDGE_LIT,
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: colors.soot, borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.2)', borderStyle: 'dashed', borderRadius: 2,
    paddingVertical: 16, alignItems: 'center',
    overflow: 'hidden',
  },
  createStackGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  },
  createStackText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.4, color: colors.parchment },


  emptyWrap: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment, textAlign: 'center', marginBottom: 8 },
  // Solid fogQuiet: the line that says what to do with an empty feed reads on any ground.
  emptySub: { fontFamily: fonts.body, fontSize: 12, color: colors.fogQuiet, fontStyle: 'italic', textAlign: 'center', lineHeight: 18, marginBottom: 24 },
  emptyBtn: { ...EDGE_LIT,
    backgroundColor: colors.soot, borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.3)', borderRadius: 2, borderStyle: 'dashed',
    paddingVertical: 12, paddingHorizontal: 28,
  },
  emptyBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.4, color: colors.sepia },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';

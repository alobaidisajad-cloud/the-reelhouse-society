import { useEffect, useCallback, useLayoutEffect, useState, useMemo, useRef, memo } from 'react';
import { View, StyleSheet, Keyboard } from 'react-native';
import { Text, TextInput } from '@/src/components/text';

import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, useDerivedValue, Easing
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import TactileEngine from '@/src/utils/TactileEngine';
import { useFocusEffect } from 'expo-router';
import { nav } from '@/src/utils/typedRouter';
import { askIn } from '@/src/utils/askIn';
import { Arrive } from '@/src/components/Arrive';
import { useScrollToTop } from "expo-router/react-navigation";

import { useAuthStore } from '@/src/stores/auth';
import { resolveTier } from '@/src/utils/tier';
import { useSocialStore } from '@/src/stores/followStore';
import { hydrateFollowing } from '@/src/stores/domain/socialSlice';
import { colors, fonts } from '@/src/theme/theme';

import PressableScale from '@/src/components/PressableScale';
import Buster from '@/src/components/Buster';
import FrozenTab from '@/src/components/layout/FrozenTab';

import { SectionErrorBoundary } from '@/src/components/SectionErrorBoundary';
import { globalScrollY } from '@/src/lib/scrollBridge';
import {
  ReelSection, FeedFilter 
} from '@/src/components/reels/types';
import { SharedReelHeader, ReelSelector } from '@/src/components/reels/ReelsHeader';
import { ReelReading, CansReading, StateFrame, NextReelFailed, TheEnd, FrameSkeleton } from '@/src/components/reels/ReelStates';
import { LogModerationHost } from '@/src/components/moderation/LogModerationHost';
import { FRAME, FRAME_RADIUS } from '@/src/components/feed/frame/metrics';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import { Search } from 'lucide-react-native';
import { useCommunityFeed, useFollowingFeed, useStacksFeed } from '@/src/hooks/useFeeds';
import { useFeedTop } from '@/src/hooks/useFeedTop';
import { ReelsFeedList } from '@/src/components/reels/ReelsFeedList';
import { ReelsStackList } from '@/src/components/reels/ReelsStackList';
import { MemberRegistry } from '@/src/components/reels/MemberRegistry';
import { useTabBarHeight, useTabContentBottom, useTabContentTop } from '@/src/components/layout/navMetrics';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import { WASH } from '@/src/theme/light';
import { useScreenReady } from '@/src/hooks/useScreenReady';
import { useScreenSeen } from '@/src/hooks/useScreenSeen';
import { EmptyOffline, REFRESH_FAILED } from '@/src/components/EmptyStates';
import reelToast from '@/src/utils/reelToast';
import { ARRIVAL_GRACE_MS } from '@/src/hooks/useArrival';
import { CROSSFADE_MS, HIDDEN, SHOWN } from '@/src/components/reels/sectionLayers';
import { SEARCH_MAX } from '@/src/constants/inputLimits';

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
        placeholder="SEARCH THE CANS"
        placeholderTextColor={colors.fog}
        value={localText}
        onChangeText={handleChange}
        maxLength={SEARCH_MAX}
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


/** The feeds each list draws, by the heads of their keys. */
const LOG_FEEDS = [['feed', 'community'], ['feed', 'following']] as const;
const STACK_FEEDS = [['feed', 'stacks']] as const;

export default function ReelScreen() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const user = useAuthStore(s => s.user);
  const resolvedRole = resolveTier(user);
  // The page's wash kept as a texture while the Reel is in front, as the room's light is (RoomLight).
  const seen = useScreenSeen();

  // Below the top bar, as it measured itself; above the tab bar drawn over the tab.
  const topPad = useTabContentTop();
  const endPad = useTabContentBottom();
  const tabBar = useTabBarHeight();

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
    withTiming(activeTabSV.value === 'logs' ? 1 : 0, { duration: CROSSFADE_MS, easing: Easing.out(Easing.quad) })
  );

  const logsOpacityStyle = useAnimatedStyle(() => ({ opacity: logsProgress.value }));
  const stacksOpacityStyle = useAnimatedStyle(() => ({ opacity: 1 - logsProgress.value }));

  const logsFlatListRef = useRef<any>(null);
  const stacksFlatListRef = useRef<any>(null);
  
  const [section, setSection] = useState<ReelSection>('logs');
  // Once the crossfade is over, each layer is drawn plainly, shown or hidden as its touches are:
  // an animated style that never reached its view (the film tray, Sealed E2E run 38790116312)
  // would leave a member seeing one section and touching the other.
  // Settled per section: a new section is mid-crossfade in the very render it is chosen.
  const [settledOn, setSettledOn] = useState<ReelSection>(section);
  const crossfaded = settledOn === section;
  useEffect(() => {
    const settled = setTimeout(() => setSettledOn(section), CROSSFADE_MS + ARRIVAL_GRACE_MS);
    return () => clearTimeout(settled);
  }, [section]);

  const activeSectionRef = useRef(section);
  useLayoutEffect(() => { activeSectionRef.current = section; });

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

  // Each list's feeds are fetched again on return or reconnect only while it stands at its top.
  const { whenBack: logsBack } = useFeedTop(overallLogsScrollY, LOG_FEEDS);
  const { whenBack: stacksBack } = useFeedTop(stacksScrollY, STACK_FEEDS);

  // isRefetching is deliberately not taken: the pull gesture drives
  // isManualRefreshing above, so the screen owns its own spinner.
  const { data: communityData, isLoading: communityLoading, isError: communityFailed, refetch: refetchCommunity, fetchNextPage: fetchNextCommunity, hasNextPage: hasNextCommunity, isFetchingNextPage: isFetchingNextCommunity, isFetchNextPageError: communityNextFailed } = useCommunityFeed(logsBack);
  // The reel opens on the house's logs: the other two feeds are asked once that one has answered,
  // or at once when the member turns to them, so the first read and its first frame go alone.
  const followingAsked = feedFilter === 'following' || !communityLoading;
  const stacksAsked = section === 'stacks' || !communityLoading;
  const { data: followingData, isLoading: followingLoading, isError: followingFailed, refetch: refetchFollowing, fetchNextPage: fetchNextFollowing, hasNextPage: hasNextFollowing, isFetchingNextPage: isFetchingNextFollowing, isFetchNextPageError: followingNextFailed } = useFollowingFeed(logsBack, followingAsked);
  const { data: stacksData, isLoading: stacksLoading, isError: stacksFailed, refetch: refetchStacks, fetchNextPage: fetchNextStacks, hasNextPage: hasNextStacks, isFetchingNextPage: isFetchingNextStacks, isFetchNextPageError: stacksNextFailed } = useStacksFeed(stackFilter, stackSearch, stacksBack, stacksAsked);

  const followingCount = useSocialStore((s) => s.following.length);
  // Following nobody is a fact only of a list read: one unread or failed follows someone, perhaps.
  const followingKnown = useSocialStore((s) => s.followingKnown);
  const followsUnread = followingCount === 0 && followingKnown === 'unread';
  const followsLost = followingCount === 0 && followingKnown === 'failed';

  const communityFeed = useMemo(() => communityData?.pages.flat() || [], [communityData]);
  const followingFeed = useMemo(() => followingData?.pages.flat() || [], [followingData]);
  // The reel opens on the house's logs: their read is the screen's.
  const readyMark = useScreenReady('reel', communityLoading ? 'reading'
    : communityFailed && communityData === undefined ? 'failed' : 'ready');
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
  const feedLoading = feedFilter === 'following' ? followingLoading || followsUnread : communityLoading;

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
    activeTabSV.set(s);
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
    askIn();
  }, []);

  const switchFeedFilter = useCallback((f: FeedFilter) => {
    // Roped, not hidden: the chip is where a stranger learns an orbit exists.
    if (f === 'following' && !isAuthenticated) return askForAName();
    if (f === feedFilter) return;
    TactileEngine.selection();
    
    // Synchronously kill momentum before batching state updates
    logsFlatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    overallLogsScrollY.set(0);
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
    stacksScrollY.set(0);
    globalScrollY.value = 0;

    setStackFilter(f);
  }, [stackFilter, stacksScrollY, isAuthenticated, askForAName]);



  const handleStackSearchChange = useCallback((text: string) => {
    stacksFlatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    stacksScrollY.set(0);
    globalScrollY.value = 0;

    setStackSearch(text);
  }, [stacksScrollY]);

  const handleClearSearch = useCallback(() => {
    stacksFlatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    stacksScrollY.set(0);
    globalScrollY.value = 0;

    setStackSearch('');
  }, [stacksScrollY]);

  const logsHeader = useMemo(() => (
    <>
      <SharedReelHeader section={section} onTabSwitch={switchSection} />
      <ReelSelector first="MAIN REEL" value={feedFilter} onChange={switchFeedFilter} />
    </>
  ), [section, feedFilter, switchSection, switchFeedFilter]);

  // A feed that could not be read is not an empty one, and does not say it is.
  const feedFailed = feedFilter === 'following'
    ? (followingFailed && followingData === undefined) || followsLost
    : communityFailed && communityData === undefined;
  const rereadFeed = useCallback(() => {
    if (feedFilter === 'following' && followsLost) void hydrateFollowing();
    void (feedFilter === 'following' ? refetchFollowing() : refetchCommunity());
  }, [feedFilter, followsLost, refetchFollowing, refetchCommunity]);

  const logsEmpty = useMemo(() => {
    if (feedLoading) return <ReelReading />;
    if (feedFailed) return <StateFrame><EmptyOffline onRetry={rereadFeed} /></StateFrame>;
    return (
      <Arrive name="reel.empty">
        <StateFrame>
          <Buster size={48} mood="unimpressed" />
          <Text style={st.emptyTitle} {...displayTextProps}>
            {feedFilter === 'following' ? 'Your orbit is quiet.' : 'The projection booth is dark.'}
          </Text>
          <Text style={st.emptySub} {...scaledTextProps}>
            {feedFilter === 'following'
              ? 'Follow other members to see their logs here.'
              : 'Be the first to log a film and leave your mark.'}
          </Text>
          {feedFilter === 'following' ? (
            <PressableScale style={st.emptyBtn} onPress={() => { TactileEngine.mutate(); switchFeedFilter('all'); }}>
              <Text style={st.emptyBtnText} {...scaledTextProps}>GLOBAL REEL</Text>
            </PressableScale>
          ) : (
            <PressableScale style={st.emptyBtn} onPress={() => { if (!isAuthenticated) return askForAName(); TactileEngine.mutate(); nav.push('/log-modal'); }}>
              <Text style={st.emptyBtnText} {...scaledTextProps}>LOG A FILM</Text>
            </PressableScale>
          )}

          {/* Only in the empty FOLLOWING feed, so an orbit is never a dead end. */}
          <MemberRegistry visible={feedFilter === 'following'} />
        </StateFrame>
      </Arrive>
    );
  }, [feedLoading, feedFailed, rereadFeed, feedFilter, switchFeedFilter, isAuthenticated, askForAName]);

  const stackHeader = useMemo(() => (
    <>
      <SharedReelHeader section={section} onTabSwitch={switchSection} />
      {/* No count: the feed pages 60 at a time, so a length is never the total. */}
      <ReelSelector first="ALL STACKS" value={stackFilter} onChange={switchStackFilter} />
      <View style={st.searchWrap}>
        <Search size={16} color={colors.fog} strokeWidth={1.5} />
        <AutonomousSearchBar
          value={stackSearch}
          onChangeText={handleStackSearchChange}
          onClear={handleClearSearch}
        />
      </View>
    </>
  ), [section, stackSearch, stackFilter, switchSection, switchStackFilter, handleStackSearchChange, handleClearSearch]);
  const curate = useCallback(() => {
    if (!isAuthenticated) return askForAName();
    TactileEngine.destroy();
    nav.push('/list-modal');
  }, [isAuthenticated, askForAName]);

  const logsExtraData = useMemo(() => [feedFilter, section, logCount, resolvedRole, feedLoading], [feedFilter, section, logCount, resolvedRole, feedLoading]);
  const stacksFollowsUnread = stackFilter === 'following' && followsUnread;
  const stacksExtraData = useMemo(() => [stackSearch, stackFilter, section, logCount, resolvedRole, filteredStacks.length, stacksLoading, stacksFollowsUnread], [stackSearch, stackFilter, section, logCount, resolvedRole, filteredStacks.length, stacksLoading, stacksFollowsUnread]);


  const stacksLost = (stacksFailed && stacksData === undefined) || (stackFilter === 'following' && followsLost);
  const rereadStacks = useCallback(() => {
    if (stackFilter === 'following' && followsLost) void hydrateFollowing();
    void refetchStacks();
  }, [stackFilter, followsLost, refetchStacks]);

  const stackEmpty = useMemo(() => {
    if (stacksLoading || stacksFollowsUnread) return <CansReading />;
    if (stacksLost) return <StateFrame><EmptyOffline onRetry={rereadStacks} /></StateFrame>;
    return (
      <Arrive name="stacks.empty">
        <StateFrame>
        <Buster size={48} mood="suspicious" />
        <Text style={st.emptyTitle} {...displayTextProps}>
          {stackSearch ? 'No stacks match your search.' 
            : stackFilter === 'following' ? 'Your orbit has no collections.'
            : 'The archive awaits its first curator.'}
        </Text>
        <Text style={st.emptySub} {...scaledTextProps}>
          {stackSearch
            ? 'Try a different search term or clear your filters.'
            : stackFilter === 'following' ? 'Follow more curators to discover their stacks here.'
            : 'Create a collection to immortalize your cinematic taste.'}
        </Text>
        {stackSearch ? (
          <PressableScale style={st.emptyBtn} onPress={() => { TactileEngine.mutate(); handleClearSearch(); }}>
            <Text style={st.emptyBtnText} {...scaledTextProps}>CLEAR FILTERS</Text>
          </PressableScale>
        ) : stackFilter === 'following' ? (
          <PressableScale style={st.emptyBtn} onPress={() => { TactileEngine.mutate(); switchStackFilter('all'); }}>
            <Text style={st.emptyBtnText} {...scaledTextProps}>GLOBAL STACKS</Text>
          </PressableScale>
        ) : (
          <PressableScale style={st.emptyBtn} onPress={() => { if (!isAuthenticated) return askForAName(); TactileEngine.mutate(); nav.push('/list-modal'); }}>
            <Text style={st.emptyBtnText} {...scaledTextProps}>CREATE COLLECTION</Text>
          </PressableScale>
        )}
        </StateFrame>
      </Arrive>
    );
  }, [stacksLoading, stacksFollowsUnread, stacksLost, rereadStacks, stackSearch, stackFilter, handleClearSearch, switchStackFilter, isAuthenticated, askForAName]);



  // The reel's foot: the next page as a still frame while it is read, a line when it failed, The End
  // when the whole reel has run.
  const logsNextReading = feedFilter === 'following' ? isFetchingNextFollowing : isFetchingNextCommunity;
  const logsNextFailed = feedFilter === 'following' ? followingNextFailed : communityNextFailed;
  const logsHasNext = feedFilter === 'following' ? hasNextFollowing : hasNextCommunity;
  const logsFooter = useMemo(() => {
    if (logCount === 0) return null;
    if (logsNextReading) return <FrameSkeleton />;
    if (logsNextFailed) return <NextReelFailed words="The next reel did not load." what="read the next reel" onRetry={onLoadMoreLogs} />;
    return logsHasNext ? null : <TheEnd />;
  }, [logCount, logsNextReading, logsNextFailed, logsHasNext, onLoadMoreLogs]);
  const stacksFooter = useMemo(() => {
    if (filteredStacks.length === 0) return null;
    if (isFetchingNextStacks) return <CansReading />;
    if (stacksNextFailed) return <NextReelFailed words="The next cans did not load." what="read the next cans" onRetry={onLoadMoreStacks} />;
    return null;
  }, [filteredStacks.length, isFetchingNextStacks, stacksNextFailed, onLoadMoreStacks]);

  // Why a stranger may read the Reel and not the Lounge: theReelIsTheAdvertisement.test.ts.
  return (
    <SectionErrorBoundary section="The Reel">
      <FrozenTab>
      <View style={st.container}>
      <RoomLight room="reel" />
      {readyMark}
      {/* The room's floor, thinned so the lamp's light shows through. */}
      <LinearGradient
        testID="reel-floor"
        colors={[colors.ink, 'rgba(13,11,9,1)', colors.soot]}
        locations={[0, 0.4, 1]}
        style={[StyleSheet.absoluteFill, WASH]}
        renderToHardwareTextureAndroid={seen}
      />

      <Animated.View testID="reels-logs-layer" pointerEvents={section === 'logs' ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, crossfaded ? (section === 'logs' ? SHOWN : HIDDEN) : logsOpacityStyle]}>
        <ReelsFeedList
          feed={activeFeed}
          refreshing={isManualRefreshing}
          onRefresh={onRefresh}
          topPad={topPad}
          bottomInset={tabBar}
          overallLogsScrollY={overallLogsScrollY}
          activeTabSV={activeTabSV}
          ListHeaderComponent={logsHeader}
          ListEmptyComponent={logsEmpty}
          contentContainerStyle={{ paddingTop: topPad, paddingBottom: endPad }}
          listRef={logsFlatListRef}
          onEndReached={onLoadMoreLogs}
          footer={logsFooter}
          extraData={logsExtraData}
        />
      </Animated.View>

      <Animated.View testID="reels-stacks-layer" pointerEvents={section === 'stacks' ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, crossfaded ? (section === 'stacks' ? SHOWN : HIDDEN) : stacksOpacityStyle]}>
        <ReelsStackList
          stacks={filteredStacks}
          refreshing={isManualRefreshing}
          onRefresh={onRefresh}
          topPad={topPad}
          bottomInset={tabBar}
          stacksScrollY={stacksScrollY}
          activeTabSV={activeTabSV}
          ListHeaderComponent={stackHeader}
          ListEmptyComponent={stackEmpty}
          onCurate={curate}
          contentContainerStyle={{ paddingTop: topPad, paddingBottom: endPad }}
          listRef={stacksFlatListRef}
          onEndReached={onLoadMoreStacks}
          footer={stacksFooter}
          extraData={stacksExtraData}
        />
      </Animated.View>
      <LogModerationHost />
    </View>
    </FrozenTab>
    </SectionErrorBoundary>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },

  // A field, as every field in the house is: the well, its sepia edge, the frame's corner.
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: FRAME.margin, marginTop: 8, marginBottom: 12,
    backgroundColor: colors.well, borderWidth: 1, borderColor: colors.sepiaBorder,
    borderRadius: FRAME_RADIUS, paddingHorizontal: 16, minHeight: 48,
  },
  searchInput: {
    flex: 1, fontFamily: fonts.sub, fontSize: 12, letterSpacing: 2, color: colors.parchment,
    paddingVertical: 12,
  },
  searchClear: { padding: 4, marginLeft: 4 },
  searchClearText: { fontFamily: fonts.sub, fontSize: 10, color: colors.fog },

  // An empty reel's frame: Buster, what is so, and the one thing to do about it.
  emptyTitle: { fontFamily: fonts.display, fontSize: 17, letterSpacing: 0.5, color: colors.parchment, textAlign: 'center', marginTop: 14 },
  emptySub: { fontFamily: fonts.bodyItalic, fontSize: 13, lineHeight: 20, color: colors.fog, textAlign: 'center', maxWidth: 280, marginTop: 8 },
  emptyBtn: {
    marginTop: 18, minHeight: 48, paddingHorizontal: 22, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: colors.sepia, borderRadius: 3,
  },
  emptyBtnText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 3, color: colors.sepia },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';

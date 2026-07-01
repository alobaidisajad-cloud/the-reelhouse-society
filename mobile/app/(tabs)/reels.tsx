import { useEffect, useCallback, useState, useMemo, useRef, memo } from 'react';
import {
  View, Text, StyleSheet,
  TextInput, Keyboard
} from 'react-native';

import { Image } from 'expo-image';
import Animated, {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  FadeInDown, useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, withTiming, useDerivedValue, Easing
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter, useFocusEffect } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';

import { useAuthStore } from '@/src/stores/auth';
import { resolveTier } from '@/src/utils/tier';
import { useSocialStore } from '@/src/stores/followStore';
import { colors, fonts, effects } from '@/src/theme/theme';

import { SectionDivider } from '@/src/components/Decorative';
import QuickActionsFAB from '@/src/components/QuickActionsFAB';
import PressableScale from '@/src/components/PressableScale';
import Buster from '@/src/components/Buster';
import FrozenTab from '@/src/components/layout/FrozenTab';

import { SectionErrorBoundary } from '@/src/components/SectionErrorBoundary';
import { globalScrollY } from '@/src/lib/scrollBridge';

// Extracted Modules
import { 
  ReelSection, FeedFilter 
} from '@/src/components/reels/types';
import { SharedReelHeader } from '@/src/components/reels/ReelsHeader';
import { 
  ProjectorBeam, TungstenSpooling, FilterChip, BrassSheen 
} from '@/src/components/reels/ReelsCards';
import { useCommunityFeed, useFollowingFeed, useStacksFeed } from '@/src/hooks/useFeeds';
import { ReelsFeedList } from '@/src/components/reels/ReelsFeedList';
import { ReelsStackList } from '@/src/components/reels/ReelsStackList';

// Removed LayoutAnimation — conflicts with Reanimated layout transitions.
// Reanimated's entering/exiting animations handle all transitions in this screen.

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
        placeholder="SEARCH ARCHIVES..."
        placeholderTextColor={colors.fog}
        value={localText}
        onChangeText={handleChange}
        returnKeyType="search"
        onSubmitEditing={() => Keyboard.dismiss()}
        selectionColor={colors.sepia}
        keyboardAppearance="dark"
        accessibilityLabel="Search curated stacks"
        onFocus={() => TactileEngine.navigate()}
      />
      {localText.length > 0 && (
        <PressableScale onPress={handleClear} style={st.searchClear} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
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
  const router = useRouter();

  const NAV_HEIGHT = 44 + 12;
  const topPad = insets.top + NAV_HEIGHT + 8;

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

  const logsOpacityStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(activeTabSV.value === 'logs' ? 1 : 0, { duration: 300, easing: Easing.out(Easing.quad) }),
      zIndex: activeTabSV.value === 'logs' ? 10 : 1,
    };
  });

  const stacksOpacityStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(activeTabSV.value === 'stacks' ? 1 : 0, { duration: 300, easing: Easing.out(Easing.quad) }),
      zIndex: activeTabSV.value === 'stacks' ? 10 : 1,
    };
  });

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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: communityData, isLoading: communityLoading, refetch: refetchCommunity, isRefetching: isCommunityRefetching, fetchNextPage: fetchNextCommunity, hasNextPage: hasNextCommunity, isFetchingNextPage: isFetchingNextCommunity } = useCommunityFeed();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: followingData, isLoading: followingLoading, refetch: refetchFollowing, isRefetching: isFollowingRefetching, fetchNextPage: fetchNextFollowing, hasNextPage: hasNextFollowing, isFetchingNextPage: isFetchingNextFollowing } = useFollowingFeed();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: stacksData, isLoading: stacksLoading, refetch: refetchStacks, isRefetching: isStacksRefetching, fetchNextPage: fetchNextStacks, hasNextPage: hasNextStacks, isFetchingNextPage: isFetchingNextStacks } = useStacksFeed(stackFilter, stackSearch);

  const followingCount = useSocialStore((s) => s.following.length);

  const communityFeed = useMemo(() => communityData?.pages.flat() || [], [communityData]);
  const followingFeed = useMemo(() => followingData?.pages.flat() || [], [followingData]);
  const filteredStacks = useMemo(() => {
    if (stackFilter === 'following' && followingCount === 0) return [];
    return stacksData?.pages.flat() || [];
  }, [stacksData, stackFilter, followingCount]);

  const onRefresh = useCallback(async () => {
    TactileEngine.navigate();
    setIsManualRefreshing(true);
    const isFollowingAnyone = useSocialStore.getState().following.length > 0;
    
    try {
      if (section === 'logs') {
        if (feedFilter === 'following') {
          if (isAuthenticated && isFollowingAnyone) {
            await refetchFollowing();
          }
        } else {
          await refetchCommunity();
        }
      } else {
        await refetchStacks();
      }
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

  const switchFeedFilter = useCallback((f: FeedFilter) => {
    if (f === feedFilter) return;
    TactileEngine.selection();
    
    // Synchronously kill momentum before batching state updates
    logsFlatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    overallLogsScrollY.value = 0;
    globalScrollY.value = 0;

    setFeedFilter(f);
  }, [feedFilter, overallLogsScrollY]);

  const switchStackFilter = useCallback((f: FeedFilter) => {
    if (f === stackFilter) return;
    TactileEngine.selection();
    
    // Synchronously kill momentum before batching state updates
    stacksFlatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    stacksScrollY.value = 0;
    globalScrollY.value = 0;

    setStackFilter(f);
  }, [stackFilter, stacksScrollY]);



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
      <SharedReelHeader section={section} logCount={logCount} userRole={resolvedRole} onTabSwitch={switchSection} />
      <View style={st.filterRow}>
        <FilterChip label="MAIN REEL" active={feedFilter === 'all'} onPress={() => switchFeedFilter('all')} />
        <FilterChip label="FOLLOWING" active={feedFilter === 'following'} onPress={() => switchFeedFilter('following')} />
      </View>
      <SectionDivider label="LOGS" />
    </>
  ), [section, feedFilter, logCount, resolvedRole, switchSection, switchFeedFilter]);

  const logsEmpty = useMemo(() => {
    if (feedLoading) return <TungstenSpooling />;
    return (
      <Animated.View entering={FadeInDown.duration(600)} style={st.emptyWrap}>
        <Buster size={48} mood="peeking" />
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
          <PressableScale style={st.emptyBtn} onPress={() => { TactileEngine.mutate(); (router.push as any)('/log-modal' as any); }}>
            <Text style={st.emptyBtnText}>LOG A FILM</Text>
          </PressableScale>
        )}
      </Animated.View>
    );
  }, [feedLoading, feedFilter, router, switchFeedFilter]);

  const stackHeader = useMemo(() => (
    <>
      <SharedReelHeader section={section} logCount={logCount} userRole={resolvedRole} onTabSwitch={switchSection} />
      <View style={st.searchWrap}>
        <Animated.Text style={st.searchIcon}>✦</Animated.Text>
        <AutonomousSearchBar 
          value={stackSearch} 
          onChangeText={handleStackSearchChange} 
          onClear={handleClearSearch} 
        />
      </View>
      <View style={st.filterRow}>
        <FilterChip label="ALL STACKS" active={stackFilter === 'all'} onPress={() => switchStackFilter('all')} />
        <FilterChip label="FOLLOWING" active={stackFilter === 'following'} onPress={() => switchStackFilter('following')} />
        <View style={st.filterSpacer} />
        <Text style={st.resultCount}>{filteredStacks.length} {stackSearch ? 'RESULTS' : 'STACKS'}</Text>
      </View>
      <SectionDivider label="CURATED STACKS" />
      <PressableScale
        style={st.createStackBtn}
        onPress={() => { TactileEngine.destroy(); (router.push as any)('/list-modal' as any); }}
      >
        <BrassSheen />
        <LinearGradient
          colors={['transparent', 'rgba(184,137,26,0.06)', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={st.createStackGlow}
        />
        <Text style={st.createStackText}>✦ CURATE A COLLECTION</Text>
      </PressableScale>
    </>
   
  ), [section, logCount, resolvedRole, stackSearch, stackFilter, filteredStacks.length, switchSection, switchStackFilter, router, handleStackSearchChange, handleClearSearch]);

  const logsExtraData = useMemo(() => [feedFilter, section, logCount, resolvedRole, feedLoading], [feedFilter, section, logCount, resolvedRole, feedLoading]);
  const stacksExtraData = useMemo(() => [stackSearch, stackFilter, section, logCount, resolvedRole, filteredStacks.length, stacksLoading], [stackSearch, stackFilter, section, logCount, resolvedRole, filteredStacks.length, stacksLoading]);


  const stackEmpty = useMemo(() => {
    if (stacksLoading) return <TungstenSpooling />;
    return (
      <Animated.View entering={FadeInDown.duration(600)} style={st.emptyWrap}>
        <Buster size={48} mood="thinking" />
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
          <PressableScale style={st.emptyBtn} onPress={() => { TactileEngine.mutate(); (router.push as any)('/list-modal' as any); }}>
            <Text style={st.emptyBtnText}>CREATE COLLECTION</Text>
          </PressableScale>
        )}
      </Animated.View>
    );
  }, [stacksLoading, stackSearch, stackFilter, router, handleClearSearch, switchStackFilter]);



  if (!isAuthenticated) {
    return (
      <FrozenTab>
      <View style={st.gateContainer}>
        <LinearGradient colors={[colors.ink, colors.soot]} style={StyleSheet.absoluteFillObject} />
        <Image source={require('../../assets/images/reelhouse-logo.png')} style={st.gateLogo} contentFit="contain" />
        <Text style={st.gateTitle}>Admit One Required</Text>
        <Text style={st.gateSub}>Join the Society to access The Reel.</Text>
        <PressableScale style={st.gateCta} onPress={() => { TactileEngine.destroy(); (router.push as any)('/login' as any); }}>
          <BrassSheen />
          <Text style={st.gateCtaText}>REQUEST MEMBERSHIP</Text>
        </PressableScale>
      </View>
      </FrozenTab>
    );
  }

  return (
    <SectionErrorBoundary section="The Reel">
      <FrozenTab>
      <View style={st.container}>
      <LinearGradient
        colors={[colors.ink, 'rgba(10,5,3,1)', colors.soot]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <ProjectorBeam scrollY={activeScrollY} />

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
          contentContainerStyle={{ ...st.listContent, paddingTop: topPad, paddingBottom: 100, paddingHorizontal: 10 }}
          listRef={stacksFlatListRef}
          onEndReached={onLoadMoreStacks}
          isFetchingNextPage={isFetchingNextStacks}
          extraData={stacksExtraData}
        />
      </Animated.View>

      <QuickActionsFAB />
    </View>
    </FrozenTab>
    </SectionErrorBoundary>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  listContent: { paddingBottom: 120 },

  filterRow: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 12,
    marginBottom: 20, alignItems: 'center',
  },
  resultCount: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 2, color: colors.fog, opacity: 0.5, fontWeight: '700' },
  filterSpacer: { flex: 1 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12,
    backgroundColor: 'rgba(14,11,8,0.9)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.12)',
    borderRadius: 4, paddingHorizontal: 12, height: 40,
  },
  searchIcon: { fontSize: 9, color: colors.sepia, opacity: 0.55, marginRight: 10 },
  searchInput: {
    flex: 1, fontFamily: fonts.body, fontSize: 11, color: colors.parchment,
    paddingVertical: 0,
  },
  searchClear: { padding: 4, marginLeft: 4 },
  searchClearText: { fontFamily: fonts.ui, fontSize: 10, color: colors.fog },

  createStackBtn: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: 'rgba(14,11,8,0.9)', borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.2)', borderStyle: 'dashed', borderRadius: 2,
    paddingVertical: 16, alignItems: 'center',
    overflow: 'hidden',
  },
  createStackGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  },
  createStackText: { fontFamily: fonts.uiBold, fontSize: 9, letterSpacing: 4, color: colors.parchment, opacity: 0.9 },


  emptyWrap: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment, opacity: 0.8, textAlign: 'center', marginBottom: 8 },
  emptySub: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, opacity: 0.5, fontStyle: 'italic', textAlign: 'center', lineHeight: 18, marginBottom: 24 },
  emptyBtn: {
    backgroundColor: 'rgba(14,11,8,0.9)', borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.3)', borderRadius: 2, borderStyle: 'dashed',
    paddingVertical: 12, paddingHorizontal: 28,
  },
  emptyBtnText: { fontFamily: fonts.uiBold, fontSize: 9, letterSpacing: 3, color: colors.sepia },

  gateContainer: { flex: 1, backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center' },
  gateLogo: { width: 48, height: 48, opacity: 0.3, marginBottom: 20 },
  gateTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginBottom: 8 },
  gateSub: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, fontStyle: 'italic', marginBottom: 24 },
  gateCta: {
    backgroundColor: 'rgba(18,14,9,0.9)', borderRadius: 3, overflow: 'hidden',
    paddingVertical: 14, paddingHorizontal: 32, borderWidth: 1,
    borderColor: 'rgba(218,165,32,0.5)',
    ...effects.glowSepia,
  },
  gateCtaText: { fontFamily: fonts.uiBold, fontSize: 9, letterSpacing: 2.5, color: colors.sepia },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';

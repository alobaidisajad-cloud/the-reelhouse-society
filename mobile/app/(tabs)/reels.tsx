import { useEffect, useCallback, useState, useMemo, useRef, memo } from 'react';
import {
  View, Text, StyleSheet,
  TextInput, Keyboard
} from 'react-native';

import Animated, {
  FadeInDown, useSharedValue, useAnimatedStyle, withTiming, useDerivedValue, Easing
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter, useFocusEffect } from 'expo-router';
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
import { MemberRegistry } from '@/src/components/reels/MemberRegistry';
import { NAV_ROW_MIN_H, navTopPadding } from '@/src/components/layout/navMetrics';

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

  // NAV_ROW_MIN_H plus the bar's bottom padding. The 12 is 2pt more than the
  // bar actually pads; it predates this and is left alone on purpose, since
  // trimming it would shift three screens for no gain.
  const NAV_HEIGHT = NAV_ROW_MIN_H + 12;
  // The zero-inset floor now comes FROM the bar instead of being copied here.
  // It exists because on a zero-inset device the nav is 74px tall while a bare
  // insets.top offset would be 64px, tucking the masthead under the blur.
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

  // STACKING LAW: never animate zIndex here. On Fabric, Reanimated writing
  // zIndex from the UI thread races FlashList's per-scroll React commits over
  // native stacking order — transient re-sorts made the FAB and background
  // layers blink during scroll on both platforms. The crossfade needs only
  // opacity (an invisible list's stacking position is irrelevant), and
  // pointerEvents already gates touches. Sibling order is static: FAB last.
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
  const { data: communityData, isLoading: communityLoading, refetch: refetchCommunity, fetchNextPage: fetchNextCommunity, hasNextPage: hasNextCommunity, isFetchingNextPage: isFetchingNextCommunity } = useCommunityFeed();
  const { data: followingData, isLoading: followingLoading, refetch: refetchFollowing, fetchNextPage: fetchNextFollowing, hasNextPage: hasNextFollowing, isFetchingNextPage: isFetchingNextFollowing } = useFollowingFeed();
  const { data: stacksData, isLoading: stacksLoading, refetch: refetchStacks, fetchNextPage: fetchNextStacks, hasNextPage: hasNextStacks, isFetchingNextPage: isFetchingNextStacks } = useStacksFeed(stackFilter, stackSearch);

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

  /**
   * A stranger reads this page and acts on none of it.
   *
   * The ask happens AT THE ACT, not at the door — the rule the film and log
   * pages already follow (`if (!isAuthenticated) return router.push('/login')`).
   * A bare '/login' is deliberate and matches every other act gate in the app:
   * the two places that promised MEMBERSHIP instead of a sign-in were the
   * outliers, and one of them was the wall this screen no longer has.
   */
  const askForAName = useCallback(() => {
    TactileEngine.destroy();
    (router.push as any)('/login' as any);
  }, [router]);

  const switchFeedFilter = useCallback((f: FeedFilter) => {
    /**
     * FOLLOWING is roped rather than hidden. A stranger has no orbit, so the
     * filter cannot work for them — but removing the chip would also remove the
     * only place the app says an orbit exists. It stays visible, and tapping it
     * is the invitation. Switching back to ALL is never gated.
     */
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





  // `stackCount` removed with the header count it fed. The stacks list already
  // tracks `filteredStacks.length` directly in its extraData below.

  const logsHeader = useMemo(() => (
    <>
      <SharedReelHeader section={section} variant="logs" userRole={resolvedRole} onTabSwitch={switchSection} />
      <View style={st.filterRow}>
        <FilterChip label="MAIN REEL" active={feedFilter === 'all'} onPress={() => switchFeedFilter('all')} />
        <FilterChip label="FOLLOWING" active={feedFilter === 'following'} onPress={() => switchFeedFilter('following')} />
      </View>
      <SectionDivider label="THE LIVING RECORD" />
    </>
  // No longer depends on the feed length: with the count gone the header does
  // not change when a page loads, so it stops being rebuilt on every scroll-in.
  ), [section, feedFilter, resolvedRole, switchSection, switchFeedFilter]);

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
          <PressableScale style={st.emptyBtn} onPress={() => { if (!isAuthenticated) return askForAName(); TactileEngine.mutate(); (router.push as any)('/log-modal' as any); }}>
            <Text style={st.emptyBtnText}>LOG A FILM</Text>
          </PressableScale>
        )}

        {/* The Member Registry — only in the empty FOLLOWING feed. Introduces
            notable members so the orbit is never a dead end; retires itself
            once a follow lands and the feed re-develops. Renders nothing when
            there's no one notable to show. */}
        <MemberRegistry visible={feedFilter === 'following'} />
      </Animated.View>
    );
  }, [feedLoading, feedFilter, router, switchFeedFilter, isAuthenticated, askForAName]);

  const stackHeader = useMemo(() => (
    <>
      <SharedReelHeader section={section} variant="stacks" userRole={resolvedRole} onTabSwitch={switchSection} />
      <View style={st.searchWrap}>
        <Animated.Text style={st.searchIcon}>✦</Animated.Text>
        <AutonomousSearchBar 
          value={stackSearch} 
          onChangeText={handleStackSearchChange} 
          onClear={handleClearSearch} 
        />
      </View>
      {/* The trailing "{n} STACKS" is gone. It repeated the header three rows
          above, it clipped off the right edge (no shrink guard in a row with a
          flex spacer), it measured 2.44:1 — and it was never a total anyway:
          the stacks feed pages 60 at a time, so `.length` is the page size. */}
      <View style={st.filterRow}>
        <FilterChip label="ALL STACKS" active={stackFilter === 'all'} onPress={() => switchStackFilter('all')} />
        <FilterChip label="FOLLOWING" active={stackFilter === 'following'} onPress={() => switchStackFilter('following')} />
      </View>
      {/* Create sits ABOVE the rule now, so "CURATED STACKS" introduces the grid
          it labels rather than the button. */}
      <PressableScale
        style={st.createStackBtn}
        onPress={() => { if (!isAuthenticated) return askForAName(); TactileEngine.destroy(); (router.push as any)('/list-modal' as any); }}
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
   
  // Same here — `filteredStacks.length` left with the duplicate count.
  ), [section, resolvedRole, stackSearch, stackFilter, switchSection, switchStackFilter, router, handleStackSearchChange, handleClearSearch, isAuthenticated, askForAName]);

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
          <PressableScale style={st.emptyBtn} onPress={() => { if (!isAuthenticated) return askForAName(); TactileEngine.mutate(); (router.push as any)('/list-modal' as any); }}>
            <Text style={st.emptyBtnText}>CREATE COLLECTION</Text>
          </PressableScale>
        )}
      </Animated.View>
    );
  }, [stacksLoading, stackSearch, stackFilter, router, handleClearSearch, switchStackFilter, isAuthenticated, askForAName]);



  /**
   * ── THE DOOR THAT STOOD IN FRONT OF AN OPEN WINDOW ──────────────────────────
   * A full-screen wall used to sit here: "Admit One Required · Join the Society
   * to access The Reel." It protected nothing.
   *
   * Asked of production directly, the `anon` role already reads every byte
   * behind it — 316 logs, 33 members, 15 stacks — through deliberate COLUMN
   * grants that hand a stranger the film, the rating, the writing, the poster,
   * the handle and the portrait, while withholding email, streaks, badges and
   * everything about suspensions. Somebody designed exactly what a stranger may
   * see, and then the app refused to show them any of it. The same writing is
   * on the public web right now at /feed, /user/:username and /log/:id, with no
   * account at all.
   *
   * So the wall did not keep anything private. It only meant the one thing that
   * argues for this place — members' actual writing about actual films — was
   * the one thing nobody could look at before deciding whether to join.
   *
   * The Reel is the advertisement. Reading it needs no name. The acts inside it
   * still do, and they ask for one where they are, which is the rule the film
   * and log pages have always followed.
   *
   * The Lounge keeps its wall, and now for a reason that can be checked rather
   * than asserted: a stranger reads 0 lounges and 0 messages at the database.
   * A salon roster is not for the street, and the schema says so too.
   */

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
    flexDirection: 'row', paddingHorizontal: 16, gap: 12,
    marginBottom: 14, alignItems: 'center',
  },
  // `resultCount` and `filterSpacer` removed together — the spacer existed only
  // to push the count to the right edge, which is where it clipped.

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12,
    backgroundColor: 'rgba(14,11,8,0.9)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.12)',
    borderRadius: 4, paddingHorizontal: 12, height: 40,
  },
  // 0.55 measured 2.60:1 — the glyph that marks the field as searchable was
  // fainter than the placeholder beside it. 0.80 gives 4.35:1.
  searchIcon: { fontSize: 9, color: colors.sepia, opacity: 0.8, marginRight: 10 },
  searchInput: {
    flex: 1, fontFamily: fonts.body, fontSize: 11, color: colors.parchment,
    paddingVertical: 0,
  },
  searchClear: { padding: 4, marginLeft: 4 },
  searchClearText: { fontFamily: fonts.sub, fontSize: 10, color: colors.fog },

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
  createStackText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 3, color: colors.parchment, opacity: 0.9 },


  emptyWrap: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment, opacity: 0.8, textAlign: 'center', marginBottom: 8 },
  // 0.5 measured 3.12:1 on 12pt italic. 0.7 gives 5.14:1 — this is the line that
  // tells a member what to DO with an empty feed, so it has to be readable.
  emptySub: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, opacity: 0.7, fontStyle: 'italic', textAlign: 'center', lineHeight: 18, marginBottom: 24 },
  emptyBtn: {
    backgroundColor: 'rgba(14,11,8,0.9)', borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.3)', borderRadius: 2, borderStyle: 'dashed',
    paddingVertical: 12, paddingHorizontal: 28,
  },
  emptyBtnText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 3, color: colors.sepia },

  // The six `gate*` styles that dressed the "Admit One Required" wall went with
  // it. Leaving them would have left the next reader looking for the screen
  // that used them.
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';

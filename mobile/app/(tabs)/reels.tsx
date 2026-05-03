import { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, RefreshControl,
  TextInput
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import Animated, {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  FadeInDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect } from 'expo-router';
import { storage } from '@/src/stores/mmkv-storage';

import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts, effects } from '@/src/theme/theme';
import { ActivityCard, FeedItem } from '@/src/components/feed/ActivityCard';
import { SectionDivider } from '@/src/components/Decorative';
import QuickActionsFAB from '@/src/components/QuickActionsFAB';
import PressableScale from '@/src/components/PressableScale';
import Buster from '@/src/components/Buster';
import FrozenTab from '@/src/components/layout/FrozenTab';

import { setScrollY } from '@/src/utils/scrollBridge';

// Extracted Modules
import { 
  RawFeedRow, StackFilm, StackData, ListRow, ListItemRow, EndorseRow, ReelSection, FeedFilter 
} from '@/src/components/reels/types';
import { SharedReelHeader } from '@/src/components/reels/ReelsHeader';
import { 
  ProjectorBeam, TungstenSpooling, FilterChip, StackCard, BrassSheen 
} from '@/src/components/reels/ReelsCards';

// M-04 AUDIT FIX: Removed LayoutAnimation — conflicts with Reanimated layout transitions.
// Reanimated's entering/exiting animations handle all transitions in this screen.

export default function ReelScreen() {
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const user = useAuthStore(s => s.user);
  const router = useRouter();

  const NAV_HEIGHT = 44 + 12;
  const topPad = insets.top + NAV_HEIGHT + 8;

  useEffect(() => { setScrollY(0); }, []);

  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  const overallLogsScrollY = useSharedValue(0);
  const logsScrollY = useRef(0);
  const stacksScrollY = useRef(0);
  const lastHapticRef = useRef(0);
  const logsFlatListRef = useRef<any>(null);
  const stacksFlatListRef = useRef<any>(null);
  
  const [section, setSection] = useState<ReelSection>('logs');
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  const [stackFilter, setStackFilter] = useState<FeedFilter>('all');
  const [stackSearch, setStackSearch] = useState('');

  const [communityFeed, setCommunityFeed] = useState<FeedItem[]>([]);
  const [followingFeed, setFollowingFeed] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [allStacks, setAllStacks] = useState<StackData[]>([]);
  const [stacksLoading, setStacksLoading] = useState(false);
  const stacksFirstLoadRef = useRef(true);
  const communityFirstLoadRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (section === 'logs' && logsFlatListRef.current && logsScrollY.current > 0) {
        logsFlatListRef.current.scrollToOffset({ offset: logsScrollY.current, animated: false });
      } else if (section === 'stacks' && stacksFlatListRef.current && stacksScrollY.current > 0) {
        stacksFlatListRef.current.scrollToOffset({ offset: stacksScrollY.current, animated: false });
      }
    }, [section])
  );

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number }; velocity?: { y?: number } } }, isLogs: boolean) => {
    const y = e.nativeEvent.contentOffset.y;
    overallLogsScrollY.value = y;
    setScrollY(y);
    if (isLogs) logsScrollY.current = y;
    else stacksScrollY.current = y;
    
    // M-03 AUDIT FIX: Throttle scroll haptics to 150ms minimum to prevent battery drain
    const velocity = Math.abs(e.nativeEvent.velocity?.y ?? 0);
    if (velocity > 1.2) {
      const now = Date.now();
      if (now - lastHapticRef.current > 150) {
        lastHapticRef.current = now;
        Haptics.selectionAsync();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStackSearchChange = useCallback((text: string) => {
    setStackSearch(text);
  }, []);

  const stackSearchEmber = useSharedValue(0.5);
  useEffect(() => {
    if (stacksLoading || stackSearch.length > 0) {
      stackSearchEmber.value = withTiming(1, { duration: 600 });
    } else {
      stackSearchEmber.value = withTiming(0.5, { duration: 300 });
    }
  }, [stacksLoading, stackSearch.length, stackSearchEmber]);

  const stackSearchIconStyle = useAnimatedStyle(() => ({
    opacity: stackSearchEmber.value,
    color: (stacksLoading || stackSearch.length > 0) ? colors.bloodReel : colors.sepia,
  }));

  const fetchFeed = useCallback(async (mode: FeedFilter) => {
    try {
      if (mode === 'following' && user?.following && user.following.length > 0) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_following_feed', {
          p_usernames: user.following,
          p_limit: 40,
          p_offset: 0,
        });

        if (!rpcError && rpcData) {
          return (rpcData as unknown as RawFeedRow[]).map((d) => ({
            id: String(d.id),
            username: d.username ?? 'unknown',
            avatar_url: d.avatar_url ?? undefined,
            film_title: d.film_title ?? 'Unknown Film',
            film_id: d.film_id ?? 0,
            poster_path: d.poster_path ?? null,
            rating: d.rating ?? 0,
            review: d.review ?? null,
            drop_cap: d.drop_cap,
            status: d.status ?? 'watched',
            created_at: d.created_at ?? new Date().toISOString(),
            year: d.year ?? undefined,
            editorial_header: d.editorial_header ?? null,
            pull_quote: d.pull_quote ?? null,
            role: d.role,
            is_autopsied: d.is_autopsied,
            autopsy: typeof d.autopsy === 'object' && d.autopsy !== null ? d.autopsy as Record<string, number> : undefined,
          }));
        }

        const { data: profiles } = await supabase.from('profiles').select('id').in('username', user.following).limit(500);
        if (!profiles || profiles.length === 0) return [];
        const { data } = await supabase.from('logs')
          .select('id, film_id, film_title, poster_path, rating, review, drop_cap, status, abandoned_reason, created_at, year, user_id, editorial_header, pull_quote, watched_with, is_autopsied, autopsy, profiles!logs_user_id_fkey(username, avatar_url, role)')
          .not('review', 'is', null).neq('review', '')
          .in('user_id', profiles.map(p => p.id))
          .order('created_at', { ascending: false }).limit(40);
        if (!data) return [];
        return (data as unknown as RawFeedRow[]).map((d) => {
          const profile = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles;
          return {
            id: String(d.id),
            username: profile?.username ?? 'unknown',
            avatar_url: profile?.avatar_url ?? undefined,
            film_title: d.film_title ?? 'Unknown Film',
            film_id: d.film_id ?? 0,
            poster_path: d.poster_path ?? null,
            rating: d.rating ?? 0,
            review: d.review ?? null,
            drop_cap: d.drop_cap,
            status: d.status ?? 'watched',
            abandoned_reason: d.abandoned_reason ?? null,
            created_at: d.created_at ?? new Date().toISOString(),
            year: d.year ?? undefined,
            editorial_header: d.editorial_header ?? null,
            pull_quote: d.pull_quote ?? null,
            watched_with: d.watched_with ?? null,
            role: profile?.role ?? 'cinephile',
            is_autopsied: d.is_autopsied,
            autopsy: typeof d.autopsy === 'object' && d.autopsy !== null ? d.autopsy as Record<string, number> : undefined,
          } satisfies FeedItem;
        });
      }

      const { data } = await supabase.from('logs')
        .select('id, film_id, film_title, poster_path, rating, review, drop_cap, status, abandoned_reason, created_at, year, user_id, editorial_header, pull_quote, watched_with, is_autopsied, autopsy, profiles!logs_user_id_fkey(username, avatar_url, role)')
        .not('review', 'is', null).neq('review', '')
        .order('created_at', { ascending: false }).limit(40);
      if (!data) return [];

      return (data as unknown as RawFeedRow[]).map((d) => {
        const profile = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles;
        return {
          id: String(d.id),
          username: profile?.username ?? 'unknown',
          avatar_url: profile?.avatar_url ?? undefined,
          film_title: d.film_title ?? 'Unknown Film', 
          film_id: d.film_id ?? 0, 
          poster_path: d.poster_path ?? null,
          rating: d.rating ?? 0, 
          review: d.review ?? null, 
          drop_cap: d.drop_cap,
          status: d.status ?? 'watched', 
          abandoned_reason: d.abandoned_reason ?? null, 
          created_at: d.created_at ?? new Date().toISOString(), 
          year: d.year ?? undefined,
          editorial_header: d.editorial_header ?? null, 
          pull_quote: d.pull_quote ?? null,
          watched_with: d.watched_with ?? null,
          role: profile?.role ?? 'cinephile',
          is_autopsied: d.is_autopsied, 
          autopsy: typeof d.autopsy === 'object' && d.autopsy !== null ? d.autopsy as Record<string, number> : undefined,
        } satisfies FeedItem;
      });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err: unknown) { return []; }
  }, [user?.following]);

  const fetchStacks = useCallback(async () => {
    const isFirstLoad = stacksFirstLoadRef.current;
    if (isFirstLoad && isMountedRef.current) setStacksLoading(true);
    try {
      const { data: lists } = await supabase
        .from('lists')
        .select('id, title, description, created_at, user_id, is_private, is_ranked, profiles!lists_user_id_fkey(username)')
        .eq('is_private', false)
        .order('created_at', { ascending: false })
        .limit(60);

      if (!lists || lists.length === 0) { 
        if (isMountedRef.current) { setAllStacks([]); setStacksLoading(false); }
        return; 
      }

      const listIds = lists.map((l: ListRow & { profiles?: { username?: string } | { username?: string }[] }) => l.id);

      const [itemsResp, endorseResp] = await Promise.all([
        listIds.length > 0 ? supabase.from('list_items').select('list_id, film_id, film_title, poster_path').in('list_id', listIds).order('position', { ascending: true }).order('created_at', { ascending: true }) : Promise.resolve({ data: [] }),
        listIds.length > 0 ? supabase.from('interactions').select('target_list_id').in('target_list_id', listIds).eq('type', 'endorse_list') : Promise.resolve({ data: [] }),
      ]);

      const itemsMap: Record<string, ListItemRow[]> = {};
      if (itemsResp.data) {
        (itemsResp.data as ListItemRow[]).forEach((item) => {
          if (!itemsMap[item.list_id]) itemsMap[item.list_id] = [];
          itemsMap[item.list_id].push(item);
        });
      }

      const endorseMap: Record<string, number> = {};
      if (endorseResp.data) {
        (endorseResp.data as EndorseRow[]).forEach((e) => {
          endorseMap[e.target_list_id] = (endorseMap[e.target_list_id] ?? 0) + 1;
        });
      }

      if (isMountedRef.current) {
        setAllStacks(lists.map((l: ListRow & { profiles?: { username?: string } | { username?: string }[] }) => {
          const curator = Array.isArray(l.profiles) ? l.profiles[0]?.username : l.profiles?.username;
          return {
            id: l.id,
            title: l.title,
            description: l.description ?? '',
            curator: curator ?? 'society',
            curatorId: l.user_id,
            createdAt: l.created_at,
            films: (itemsMap[l.id] ?? []).map((item: ListItemRow) => ({
              id: item.film_id, title: item.film_title, poster_path: item.poster_path ?? null,
            })),
            count: (itemsMap[l.id] ?? []).length,
            certifyCount: endorseMap[l.id] ?? 0,
            isRanked: l.is_ranked ?? false,
          };
        }));
      }
    } catch { /* ignore */ }
    if (isFirstLoad && isMountedRef.current) {
      setStacksLoading(false);
      stacksFirstLoadRef.current = false;
    }
  }, []);

  const loadCommunityAndStacks = useCallback(async () => {
    const isFirstLoad = communityFirstLoadRef.current;
    if (isFirstLoad) {
      const cached = storage.getString('nitrate_memory_feed');
      if (cached) {
        try {
          setCommunityFeed(JSON.parse(cached));
        } catch (err: unknown) {
          if (__DEV__) console.warn('[Reels] Cache parsing failed, obliterating corrupted key.', err);
          storage.delete('nitrate_memory_feed');
          setFeedLoading(true);
        }
      } else {
        setFeedLoading(true);
      }
    }
    const community = await fetchFeed('all');

    if (community.length > 0) {
      try { storage.set('nitrate_memory_feed', JSON.stringify(community.slice(0, 15))); } catch {}
    }

    if (isMountedRef.current) {
      setCommunityFeed(community as FeedItem[]);
      if (isFirstLoad) {
        setFeedLoading(false);
        communityFirstLoadRef.current = false;
      }
    }
    fetchStacks();
  }, [fetchFeed, fetchStacks]);

  const followingUsernames = user?.following;
  const followingCount = followingUsernames?.length ?? 0;

  const loadFollowingFeed = useCallback(async () => {
    if (!isAuthenticated || followingCount === 0) {
      if (isMountedRef.current) setFollowingFeed([]);
      return;
    }
    const following = await fetchFeed('following');
    if (isMountedRef.current) setFollowingFeed(following as FeedItem[]);
  }, [fetchFeed, isAuthenticated, followingCount]);

  useEffect(() => {
    if (isAuthenticated) loadCommunityAndStacks();
  }, [isAuthenticated, loadCommunityAndStacks]);

  useEffect(() => {
    if (isAuthenticated && followingCount > 0) loadFollowingFeed();
  }, [isAuthenticated, followingCount, loadFollowingFeed]);

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && followingCount > 0) loadFollowingFeed();
    }, [isAuthenticated, followingCount, loadFollowingFeed])
  );

  const loadAll = useCallback(async () => {
    await Promise.all([loadCommunityAndStacks(), loadFollowingFeed()]);
  }, [loadCommunityAndStacks, loadFollowingFeed]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const activeFeed = useMemo(() => feedFilter === 'following' ? followingFeed : communityFeed, [feedFilter, followingFeed, communityFeed]);
  const logCount = activeFeed.length;

  const filteredStacks = useMemo(() => {
    let result = [...allStacks];
    if (stackFilter === 'following' && user?.following && user.following.length > 0) {
      result = result.filter((s: StackData) => user.following!.includes(s.curator));
    }
    if (stackSearch.trim()) {
      const q = stackSearch.toLowerCase().trim();
      result = result.filter((s: StackData) =>
        s.title.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        s.curator.toLowerCase().includes(q) ||
        (s.films ?? []).some((f: StackFilm) => f.title && f.title.toLowerCase().includes(q))
      );
    }
    return result;
  }, [allStacks, stackFilter, stackSearch, user?.following]);

  const switchSection = useCallback((s: ReelSection) => {
    if (s === section) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSection(s);
  }, [section]);

  const switchFeedFilter = useCallback((f: FeedFilter) => {
    if (f === feedFilter) return;
    Haptics.selectionAsync();
    setFeedFilter(f);
  }, [feedFilter]);

  const switchStackFilter = useCallback((f: FeedFilter) => {
    if (f === stackFilter) return;
    Haptics.selectionAsync();
    setStackFilter(f);
  }, [stackFilter]);



  const renderLogItem = useCallback(({ item, index }: { item: FeedItem; index: number }) => (
    <ActivityCard item={item} index={index} parentScrollY={overallLogsScrollY} />
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), []);

  const logsHeader = useMemo(() => (
    <>
      <SharedReelHeader section={section} logCount={logCount} userRole={user?.role} onTabSwitch={switchSection} />
      <View style={st.filterRow}>
        <FilterChip label="MAIN REEL" active={feedFilter === 'all'} onPress={() => switchFeedFilter('all')} />
        <FilterChip label="FOLLOWING" active={feedFilter === 'following'} onPress={() => switchFeedFilter('following')} />
      </View>
      <SectionDivider label="LOGS" />
    </>
  ), [section, feedFilter, logCount, user?.role, switchSection, switchFeedFilter]);

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
          <PressableScale style={st.emptyBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setFeedFilter('all'); }}>
            <Text style={st.emptyBtnText}>GLOBAL REEL</Text>
          </PressableScale>
        ) : (
          <PressableScale style={st.emptyBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/log-modal' as any); }}>
            <Text style={st.emptyBtnText}>LOG A FILM</Text>
          </PressableScale>
        )}
      </Animated.View>
    );
  }, [feedLoading, feedFilter, router]);

  const stackHeader = useMemo(() => (
    <>
      <SharedReelHeader section={section} logCount={logCount} userRole={user?.role} onTabSwitch={switchSection} />
      <View style={st.searchWrap}>
        <Animated.Text style={[st.searchIcon, stackSearchIconStyle]}>✦</Animated.Text>
        <TextInput
          style={st.searchInput}
          placeholder="SEARCH ARCHIVES..."
          placeholderTextColor={colors.fog}
          value={stackSearch}
          onChangeText={handleStackSearchChange}
          returnKeyType="search"
          selectionColor={colors.sepia}
          keyboardAppearance="dark"
          accessibilityLabel="Search curated stacks"
          onFocus={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        />
        {stackSearch.length > 0 && (
          <PressableScale onPress={() => handleStackSearchChange('')} style={st.searchClear} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
            <Text style={st.searchClearText}>✕</Text>
          </PressableScale>
        )}
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
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); router.push('/list-modal' as any); }}
      >
        <BrassSheen />
        <LinearGradient
          colors={['transparent', 'rgba(139,105,20,0.06)', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={st.createStackGlow}
        />
        <Text style={st.createStackText}>✦ CURATE A COLLECTION</Text>
      </PressableScale>
    </>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [section, logCount, user?.role, stackSearch, stackFilter, filteredStacks.length, switchSection, switchStackFilter, router]);

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
          <PressableScale style={st.emptyBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setStackSearch(''); setStackFilter('all'); }}>
            <Text style={st.emptyBtnText}>CLEAR FILTERS</Text>
          </PressableScale>
        ) : stackFilter === 'following' ? (
          <PressableScale style={st.emptyBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setStackFilter('all'); }}>
            <Text style={st.emptyBtnText}>GLOBAL STACKS</Text>
          </PressableScale>
        ) : (
          <PressableScale style={st.emptyBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/list-modal' as any); }}>
            <Text style={st.emptyBtnText}>CREATE COLLECTION</Text>
          </PressableScale>
        )}
      </Animated.View>
    );
  }, [stacksLoading, stackSearch, stackFilter, router]);

  const renderStackItem = useCallback(({ item }: { item: StackData }) => (
    <View style={st.stackGridCell}>
      <StackCard
        stack={item}
        onPress={() => { Haptics.selectionAsync(); router.push(`/stacks/${item.id}` as any); }}
      />
    </View>
  ), [router]);

  const viewabilityConfig = useRef({
    minimumViewTime: 800,
    itemVisiblePercentThreshold: 80,
  }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: import('react-native').ViewToken[] }) => {
    // S3-03 FIX: Fire-and-forget prefetch — errors are intentionally swallowed
    viewableItems.forEach((vi) => {
      const item = vi.item as Partial<FeedItem>;
      if (item && item.film_id) {
        tmdb.detail(item.film_id).catch(() => {});
      }
    });
  }).current;

  if (!isAuthenticated) {
    return (
      <FrozenTab>
      <View style={st.gateContainer}>
        <LinearGradient colors={[colors.ink, colors.soot]} style={StyleSheet.absoluteFillObject} />
        <Image source={require('../../assets/images/reelhouse-logo.png')} style={st.gateLogo} contentFit="contain" />
        <Text style={st.gateTitle}>Admit One Required</Text>
        <Text style={st.gateSub}>Join the Society to access The Reel.</Text>
        <PressableScale style={st.gateCta} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); router.push('/login' as any); }}>
          <BrassSheen />
          <Text style={st.gateCtaText}>REQUEST MEMBERSHIP</Text>
        </PressableScale>
      </View>
      </FrozenTab>
    );
  }

  return (
    <FrozenTab>
    <View style={st.container}>
      <LinearGradient
        colors={[colors.ink, 'rgba(10,5,3,1)', colors.soot]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <ProjectorBeam scrollY={overallLogsScrollY} />

      {section === 'logs' ? (
        <FlashList
          ref={logsFlatListRef}
          key="logs-feed"
          data={activeFeed}
          keyExtractor={(item) => item.id}
          estimatedItemSize={280}
          renderItem={renderLogItem}
          contentContainerStyle={{ ...st.listContent, paddingTop: topPad }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={logsHeader}
          ListEmptyComponent={logsEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="transparent"
              colors={['transparent']}
              progressBackgroundColor="transparent"
              progressViewOffset={topPad}
            />
          }
          onScroll={(e) => handleScroll(e, true)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          decelerationRate="fast"
          overScrollMode="never"
          bounces={true}
          scrollEventThrottle={32}
          drawDistance={250}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
        />
      ) : (
        <FlashList
          ref={stacksFlatListRef}
          key="stacks-grid"
          data={filteredStacks}
          keyExtractor={(item) => item.id}
          estimatedItemSize={180}
          numColumns={2}
          renderItem={renderStackItem}
          contentContainerStyle={{ ...st.listContent, paddingTop: topPad, paddingBottom: 100, paddingHorizontal: 10 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={stackHeader}
          ListEmptyComponent={stackEmpty}
          onScroll={(e) => handleScroll(e, false)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          decelerationRate="fast"
          overScrollMode="never"
          scrollEventThrottle={32}
          drawDistance={250}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="transparent"
              colors={['transparent']}
              progressBackgroundColor="transparent"
              progressViewOffset={topPad}
            />
          }
        />
      )}

      <QuickActionsFAB />
    </View>
    </FrozenTab>
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
    backgroundColor: 'rgba(14,11,8,0.9)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.12)',
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
    borderColor: 'rgba(139,105,20,0.2)', borderStyle: 'dashed', borderRadius: 2,
    paddingVertical: 16, alignItems: 'center',
    overflow: 'hidden',
  },
  createStackGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  },
  createStackText: { fontFamily: fonts.uiBold, fontSize: 9, letterSpacing: 4, color: colors.parchment, opacity: 0.9 },

  stackGridCell: { flex: 1, paddingHorizontal: 6 },

  emptyWrap: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment, opacity: 0.8, textAlign: 'center', marginBottom: 8 },
  emptySub: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, opacity: 0.5, fontStyle: 'italic', textAlign: 'center', lineHeight: 18, marginBottom: 24 },
  emptyBtn: {
    backgroundColor: 'rgba(14,11,8,0.9)', borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.3)', borderRadius: 2, borderStyle: 'dashed',
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

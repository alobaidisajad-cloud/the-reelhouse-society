import { useEffect, useCallback, useState, useMemo, memo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  TextInput, Platform, ScrollView, LayoutAnimation, UIManager,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import Animated, {
  FadeInDown, FadeIn
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts, effects, SEPIA_HASH } from '@/src/theme/theme';
import { ActivityCard, FeedItem } from '@/src/components/feed/ActivityCard';
import { SectionDivider } from '@/src/components/Decorative';
import QuickActionsFAB from '@/src/components/QuickActionsFAB';
import PressableScale from '@/src/components/PressableScale';
import Buster from '@/src/components/Buster';
import SkeletonPulse from '@/src/components/SkeletonPulse';
import { setScrollY } from '@/src/utils/scrollBridge';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w185';



/** Shape of a processed stack for display */
interface StackFilm {
  id: number;
  title: string;
  poster_path: string | null;
}

interface StackData {
  id: string;
  title: string;
  description: string;
  curator: string;
  curatorId: string;
  createdAt: string;
  films: StackFilm[];
  count: number;
  certifyCount: number;
}

interface ListRow {
  id: string;
  title: string;
  description?: string;
  created_at: string;
  user_id: string;
  is_private: boolean;
}

interface ListItemRow {
  list_id: string;
  film_id: number;
  film_title: string;
  poster_path: string | null;
}

interface EndorseRow {
  target_list_id: string;
}


// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type ReelSection = 'logs' | 'stacks';
type FeedFilter = 'all' | 'following';

// ── Cinematic spring config for tab transitions ──
const CINEMATIC_TRANSITION = {
  duration: 350,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};

// ══════════════════════════════════════════════════════════════
//  SECTION TAB PILL
// ══════════════════════════════════════════════════════════════
const TabPill = memo(function TabPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[st.tabPill, active && st.tabPillActive]}
    >
      <Text style={[st.tabPillText, active && st.tabPillTextActive]}>{label}</Text>
      {active && (
        <Animated.View entering={FadeIn.duration(300)} style={st.tabPillDot} />
      )}
    </TouchableOpacity>
  );
});

// ══════════════════════════════════════════════════════════════
//  FILTER PILL (ALL / FOLLOWING)
// ══════════════════════════════════════════════════════════════
const FilterChip = memo(function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[st.filterChip, active && st.filterChipActive]}
    >
      <Text style={[st.filterChipText, active && st.filterChipTextActive]}>{label}</Text>
      {active && (
        <Animated.View entering={FadeIn.duration(200)} style={st.filterActiveLine} />
      )}
    </TouchableOpacity>
  );
});

// ══════════════════════════════════════════════════════════════
//  STACK CARD — Compact Dossier Card (Parity with Web)
// ══════════════════════════════════════════════════════════════
const PRESET_GRADIENTS: readonly [string, string, ...string[]][] = [
  ['#1a0e05', '#3a2010', '#0a0703'],
  ['#0a0a0a', '#1c1710', '#2a1a05'],
  ['#05080a', '#101820', '#1a2010'],
  ['#0a0508', '#1a0f18', '#0a0508'],
];

const StackCard = memo(function StackCard({ stack, onPress }: { stack: StackData; onPress: () => void }) {
  const posters = (stack.films ?? []).filter((f: StackFilm) => f.poster_path).slice(0, 3);
  const curatorInitial = (stack.curator ?? 'S')[0].toUpperCase();
  const refCode = stack.id ? `REF: ${stack.id.slice(0, 4).toUpperCase()}` : 'REF: 0000';
  
  const hash = stack.id ? stack.id.charCodeAt(0) : 0;
  const gradientColors = PRESET_GRADIENTS[Math.abs(hash) % PRESET_GRADIENTS.length];

  return (
    <PressableScale onPress={onPress} style={st.stackCard} haptic>
      {/* ── Background Poster Triptych (Web Parity) ── */}
      <View style={st.stackCardPosterWrap}>
        {posters.length === 0 ? (
          <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={st.stackCardPosterRow}>
            {posters.map((f: StackFilm, i: number) => (
              <View key={i} style={[st.stackCardPosterPanel, { width: `${100 / posters.length}%` }]}>
                <Image
                  source={{ uri: `${TMDB_IMG}${f.poster_path}` }}
                  style={StyleSheet.absoluteFillObject}
                  resizeMode="cover"
                  cachePolicy="memory-disk"
                  placeholder={{ blurhash: SEPIA_HASH }}
                  transition={100}
                />
                {/* Fade overlays to blend panels */}
                {i < posters.length - 1 && (
                  <LinearGradient 
                    colors={['transparent', 'rgba(10,10,10,0.8)']} 
                    start={{ x: 0.8, y: 0 }} end={{ x: 1, y: 0 }} 
                    style={StyleSheet.absoluteFillObject} 
                  />
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── Overlays ── */}
      <LinearGradient 
        colors={['rgba(15,12,8,0)', 'rgba(5,3,2,0.9)', 'rgba(5,3,2,1)']} 
        locations={[0, 0.4, 0.9]} 
        style={StyleSheet.absoluteFillObject} 
      />

      {/* ── REF Stamp ── */}
      <View style={st.stackCardRef}>
        <Text style={st.stackCardRefText}>{refCode}</Text>
      </View>

      {/* ── Content ── */}
      <View style={st.stackCardContent}>
        {/* Meta Row */}
        <View style={st.stackCardMetaRow}>
          <Text style={st.stackCardBadgeText}>{stack.count ?? 0} FILMS</Text>
          {stack.certifyCount > 0 && (
            <Text style={st.stackCertifyText}>✦ {stack.certifyCount}</Text>
          )}
          <View style={st.stackCardMetaDivider} />
        </View>

        {/* Title */}
        <Text style={st.stackCardTitle} numberOfLines={2}>{(stack.title ?? '').toUpperCase()}</Text>

        {/* Curator */}
        <View style={st.stackCardCuratorRow}>
          <View style={st.stackCardCuratorDot} />
          <Text style={st.stackCardCuratorName}>@{(stack.curator ?? 'society').toUpperCase()}</Text>
        </View>
      </View>
    </PressableScale>
  );
});

// ══════════════════════════════════════════════════════════════
//  SKELETON LOADER
// ══════════════════════════════════════════════════════════════
const SkeletonCard = memo(function SkeletonCard() {
  return (
    <View style={st.skeleton}>
      <SkeletonPulse height={8} width={'40%'} />
      <SkeletonPulse height={14} width={'80%'} />
      <SkeletonPulse height={8} width={'55%'} />
    </View>
  );
});

// ══════════════════════════════════════════════════════════════
//  MAIN SCREEN: THE REEL
// ══════════════════════════════════════════════════════════════
export default function ReelScreen() {
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const user = useAuthStore(s => s.user);
  const router = useRouter();

  const NAV_HEIGHT = 44 + 12;
  const topPad = insets.top + NAV_HEIGHT + 8;

  // Reset scroll bridge so NavBar returns to transparent on this tab
  useEffect(() => { setScrollY(0); }, []);

  // #7: Persistent scroll position — restore on tab focus
  const scrollOffsetRef = useRef(0);
  const logsFlatListRef = useRef<FlatList>(null);
  useFocusEffect(
    useCallback(() => {
      if (scrollOffsetRef.current > 0 && section === 'logs' && logsFlatListRef.current) {
        logsFlatListRef.current.scrollToOffset({ offset: scrollOffsetRef.current, animated: false });
      }
    }, [section])
  );

  // ── Section + Filter State ──
  const [section, setSection] = useState<ReelSection>('logs');
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  const [stackFilter, setStackFilter] = useState<FeedFilter>('all');
  const [stackSearch, setStackSearch] = useState('');

  // ── Transition tracking for cinematic animation direction ──
  const prevSection = useRef<ReelSection>('logs');

  // ── Feed Data ──
  const [communityFeed, setCommunityFeed] = useState<FeedItem[]>([]);
  const [followingFeed, setFollowingFeed] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ── Stacks Data ──
  const [allStacks, setAllStacks] = useState<StackData[]>([]);
  const [stacksLoading, setStacksLoading] = useState(false);

  // ══════════════════════════════════════════════════════════
  //  DATA FETCHING
  // ══════════════════════════════════════════════════════════

  const fetchFeed = useCallback(async (mode: FeedFilter) => {
    try {
      // ── Following mode: use server-side RPC for single-query join ──
      if (mode === 'following' && user?.following && user.following.length > 0) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_following_feed', {
          p_usernames: user.following,
          p_limit: 40,
          p_offset: 0,
        });

        // If RPC exists and succeeds, use it (single server-side query)
        if (!rpcError && rpcData) {
          return (rpcData as Record<string, unknown>[]).map((d) => ({
            id: String(d.id),
            username: d.username as string ?? 'unknown',
            avatar_url: d.avatar_url as string | undefined,
            film_title: d.film_title,
            film_id: d.film_id,
            poster_path: d.poster_path,
            rating: d.rating,
            review: d.review,
            drop_cap: d.drop_cap,
            status: (d.status as string) ?? 'watched',
            created_at: d.created_at,
            year: d.year,
            editorial_header: d.editorial_header,
            pull_quote: d.pull_quote,
            role: d.role as string | undefined,
            is_autopsied: d.is_autopsied,
            autopsy: d.autopsy,
          }));
        }

        // Fallback: if RPC not deployed yet, use old N+1 pattern
        const { data: profiles } = await supabase
          .from('profiles').select('id').in('username', user.following).limit(500);
        if (!profiles || profiles.length === 0) return [];
        const { data } = await supabase
          .from('logs')
          .select('id, film_id, film_title, poster_path, rating, review, drop_cap, status, created_at, year, user_id, editorial_header, pull_quote, watched_with, is_autopsied, autopsy, profiles!logs_user_id_fkey(username, avatar_url, role)')
          .not('review', 'is', null).neq('review', '')
          .in('user_id', profiles.map(p => p.id))
          .order('created_at', { ascending: false }).limit(40);
        if (!data) return [];
        return data.map((d: Record<string, unknown> & { profiles?: { username?: string; avatar_url?: string; role?: string } | Array<{ username?: string; avatar_url?: string; role?: string }> }) => ({
          id: String(d.id),
          username: Array.isArray(d.profiles) ? d.profiles[0]?.username : d.profiles?.username ?? 'unknown',
          avatar_url: Array.isArray(d.profiles) ? d.profiles[0]?.avatar_url : d.profiles?.avatar_url,
          film_title: d.film_title, film_id: d.film_id, poster_path: d.poster_path,
          rating: d.rating, review: d.review, drop_cap: d.drop_cap,
          status: d.status ?? 'watched', created_at: d.created_at, year: d.year,
          editorial_header: d.editorial_header, pull_quote: d.pull_quote,
          role: Array.isArray(d.profiles) ? d.profiles[0]?.role : d.profiles?.role,
          is_autopsied: d.is_autopsied, autopsy: d.autopsy,
        }));
      }

      // ── All mode: standard query ──
      const { data } = await supabase
        .from('logs')
        .select('id, film_id, film_title, poster_path, rating, review, drop_cap, status, created_at, year, user_id, editorial_header, pull_quote, watched_with, is_autopsied, autopsy, profiles!logs_user_id_fkey(username, avatar_url, role)')
        .not('review', 'is', null).neq('review', '')
        .order('created_at', { ascending: false }).limit(40);
      if (!data) return [];

      return data.map((d: Record<string, unknown> & { profiles?: { username?: string; avatar_url?: string; role?: string } | Array<{ username?: string; avatar_url?: string; role?: string }> }) => ({
        id: String(d.id),
        username: Array.isArray(d.profiles) ? d.profiles[0]?.username : d.profiles?.username ?? 'unknown',
        avatar_url: Array.isArray(d.profiles) ? d.profiles[0]?.avatar_url : d.profiles?.avatar_url,
        film_title: d.film_title, film_id: d.film_id, poster_path: d.poster_path,
        rating: d.rating, review: d.review, drop_cap: d.drop_cap,
        status: d.status ?? 'watched', created_at: d.created_at, year: d.year,
        editorial_header: d.editorial_header, pull_quote: d.pull_quote,
        role: Array.isArray(d.profiles) ? d.profiles[0]?.role : d.profiles?.role,
        is_autopsied: d.is_autopsied, autopsy: d.autopsy,
      }));
    } catch { return []; }
  }, [user?.following]);

  const fetchStacks = useCallback(async () => {
    // #1: Stale-While-Revalidate — only show skeletons on first load
    const isFirstLoad = allStacks.length === 0;
    if (isFirstLoad) setStacksLoading(true);
    try {
      // Single query: lists + curator username via foreign key join
      const { data: lists } = await supabase
        .from('lists')
        .select('id, title, description, created_at, user_id, is_private, profiles!lists_user_id_fkey(username)')
        .eq('is_private', false)
        .order('created_at', { ascending: false })
        .limit(60);

      if (!lists || lists.length === 0) { setAllStacks([]); setStacksLoading(false); return; }

      const listIds = lists.map((l: ListRow & { profiles?: { username?: string } | Array<{ username?: string }> }) => l.id);

      // Parallel: list_items + endorsement counts (2 queries instead of 3 sequential)
      const [itemsResp, endorseResp] = await Promise.all([
        listIds.length > 0
          ? supabase.from('list_items').select('list_id, film_id, film_title, poster_path').in('list_id', listIds)
          : Promise.resolve({ data: [] }),
        listIds.length > 0
          ? supabase.from('interactions').select('target_list_id').in('target_list_id', listIds).eq('type', 'endorse_list')
          : Promise.resolve({ data: [] }),
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

      setAllStacks(lists.map((l: ListRow & { profiles?: { username?: string } | Array<{ username?: string }> }) => {
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
        };
      }));
    } catch {}
    if (isFirstLoad) setStacksLoading(false);
  }, [allStacks.length]);

  const loadAll = useCallback(async () => {
    // #1: Stale-While-Revalidate — only show skeletons on first load
    const isFirstLoad = communityFeed.length === 0;
    if (isFirstLoad) {
      // The Nitrate Memory (Phase 2): Instantly load prior session
      const cached = await AsyncStorage.getItem('nitrate_memory_feed');
      if (cached) {
        try { setCommunityFeed(JSON.parse(cached)); } catch {}
      } else {
        setFeedLoading(true);
      }
    }
    const [community, following] = await Promise.all([
      fetchFeed('all'),
      isAuthenticated && user?.following?.length ? fetchFeed('following') : Promise.resolve([]),
    ]);

    if (community.length > 0) {
      AsyncStorage.setItem('nitrate_memory_feed', JSON.stringify(community.slice(0, 15)));
    }

    setCommunityFeed(community);
    setFollowingFeed(following);
    if (isFirstLoad) setFeedLoading(false);
    fetchStacks();
  }, [fetchFeed, fetchStacks, isAuthenticated, user?.following?.length, communityFeed.length]);

  useEffect(() => {
    if (isAuthenticated) loadAll();
  }, [isAuthenticated, loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // ── Derived Data ──
  const activeFeed = useMemo(() => feedFilter === 'following' ? followingFeed : communityFeed, [feedFilter, followingFeed, communityFeed]);
  const logCount = communityFeed.length;

  // ── Filtered Stacks ──
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

  // ── Section Switch (with cinematic LayoutAnimation) ──
  const switchSection = useCallback((s: ReelSection) => {
    if (s === section) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    LayoutAnimation.configureNext(CINEMATIC_TRANSITION);
    prevSection.current = section;
    setSection(s);
  }, [section]);

  const switchFeedFilter = useCallback((f: FeedFilter) => {
    if (f === feedFilter) return;
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(CINEMATIC_TRANSITION);
    setFeedFilter(f);
  }, [feedFilter]);

  const switchStackFilter = useCallback((f: FeedFilter) => {
    if (f === stackFilter) return;
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(CINEMATIC_TRANSITION);
    setStackFilter(f);
  }, [stackFilter]);

  // ── Unauthenticated Gate ──
  if (!isAuthenticated) {
    return (
      <View style={st.gateContainer}>
        <LinearGradient colors={[colors.ink, colors.soot]} style={StyleSheet.absoluteFillObject} />
        <Image
          source={require('../../assets/images/reelhouse-logo.png')}
          style={st.gateLogo}
          resizeMode="contain"
        />
        <Text style={st.gateTitle}>Admit One Required</Text>
        <Text style={st.gateSub}>Join the Society to access The Reel.</Text>
        <TouchableOpacity style={st.gateCta} onPress={() => router.push('/login')} accessibilityRole="button" accessibilityLabel="Request membership">
          <Text style={st.gateCtaText}>REQUEST MEMBERSHIP</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════
  //  SHARED HEADER — appears in both sections
  // ══════════════════════════════════════════════════════════
  const SharedReelHeader = () => (
    <>
      {/* Section Header */}
      <Animated.View entering={FadeIn.duration(600)} style={st.sectionHeaderWrap}>
        <Text style={st.headerEyebrow}>✦ THE REELHOUSE SOCIETY ✦</Text>
        <Text style={st.headerTitle} accessibilityRole="header">The Reel</Text>

        {/* Decorative Est. 1924 rule */}
        <View style={st.headerEstRow}>
          <LinearGradient colors={['transparent', colors.sepia]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.headerEstLine} />
          <Text style={st.headerEst}>EST. 1924</Text>
          <LinearGradient colors={[colors.sepia, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.headerEstLine} />
        </View>

        {section === 'logs' && (
          <Animated.View entering={FadeIn.duration(400)} style={st.liveRow}>
            <View style={[
              st.liveDot,
              user?.role === 'auteur' ? st.liveDotAuteur
                : user?.role === 'archivist' ? st.liveDotArchivist
                : st.liveDotDefault
            ]} />
            <Text style={st.liveText}>
              LIVE · {logCount > 0 ? `${logCount} LOG${logCount === 1 ? '' : 'S'}` : 'AWAITING SIGNAL'}
            </Text>
          </Animated.View>
        )}
      </Animated.View>

      {/* Section Tabs */}
      <View style={st.tabBarRow}>
        <TabPill label="LOGS" active={section === 'logs'} onPress={() => switchSection('logs')} />
        <TabPill label="STACKS" active={section === 'stacks'} onPress={() => switchSection('stacks')} />
      </View>
    </>
  );

  // ══════════════════════════════════════════════════════════
  //  LOGS SECTION — Log Feed
  // ══════════════════════════════════════════════════════════
  const renderLogItem = useCallback(({ item, index }: { item: FeedItem; index: number }) => (
    <ActivityCard item={item} index={index} />
  ), []);

  const logsHeader = useMemo(() => (
    <>
      <SharedReelHeader />

      {/* Feed Filter */}
      <View style={st.filterRow}>
        <FilterChip label="MAIN REEL" active={feedFilter === 'all'} onPress={() => switchFeedFilter('all')} />
        <FilterChip label="FOLLOWING" active={feedFilter === 'following'} onPress={() => switchFeedFilter('following')} />
      </View>

      <SectionDivider label="LOGS" />
    </>
  ), [section, feedFilter, logCount, switchSection, switchFeedFilter]);

  const logsEmpty = useMemo(() => {
    if (feedLoading) return (
      <View style={st.skeletonWrap}>
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </View>
    );
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
        <TouchableOpacity style={st.emptyBtn} onPress={() => router.push('/log-modal')}>
          <Text style={st.emptyBtnText}>LOG A FILM</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }, [feedLoading, feedFilter, router]);

  // ══════════════════════════════════════════════════════════
  //  STACKS SECTION — Curated Lists
  // ══════════════════════════════════════════════════════════

  const stackHeader = useMemo(() => (
    <>
      <SharedReelHeader />

      {/* Search Bar */}
      <View style={st.searchWrap}>
        <Text style={st.searchIcon}>✦</Text>
        <TextInput
          style={st.searchInput}
          placeholder="Search stacks, films, curators…"
          placeholderTextColor={colors.fog}
          value={stackSearch}
          onChangeText={setStackSearch}
          returnKeyType="search"
        />
        {stackSearch.length > 0 && (
          <TouchableOpacity onPress={() => setStackSearch('')} style={st.searchClear}>
            <Text style={st.searchClearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Stack Filters */}
      <View style={st.filterRow}>
        <FilterChip label="ALL STACKS" active={stackFilter === 'all'} onPress={() => switchStackFilter('all')} />
        <FilterChip label="FOLLOWING" active={stackFilter === 'following'} onPress={() => switchStackFilter('following')} />
        <View style={st.filterSpacer} />
        <Text style={st.resultCount}>
          {filteredStacks.length} {stackSearch ? 'RESULTS' : 'STACKS'}
        </Text>
      </View>

      <SectionDivider label="CURATED STACKS" />

      {/* Create CTA */}
      <TouchableOpacity
        style={st.createStackBtn}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/list-modal'); }}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['transparent', 'rgba(139,105,20,0.06)', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={st.createStackGlow}
        />
        <Text style={st.createStackText}>✦ CURATE A COLLECTION</Text>
      </TouchableOpacity>
    </>
  ), [section, stackSearch, stackFilter, filteredStacks.length, switchSection, switchStackFilter, router]);

  const stackEmpty = useMemo(() => {
    if (stacksLoading) return (
      <View style={st.skeletonWrap}>
        {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
      </View>
    );
    return (
      <Animated.View entering={FadeInDown.duration(600)} style={st.emptyWrap}>
        <Buster size={48} mood="thinking" />
        <Text style={st.emptyTitle}>
          {stackSearch ? 'No stacks match your search.' : 'The archive awaits its first curator.'}
        </Text>
        <Text style={st.emptySub}>
          {stackSearch
            ? 'Try a different search term or clear your filters.'
            : 'Create a collection to immortalize your cinematic taste.'}
        </Text>
        {stackSearch ? (
          <TouchableOpacity style={st.emptyBtn} onPress={() => { setStackSearch(''); setStackFilter('all'); }}>
            <Text style={st.emptyBtnText}>CLEAR FILTERS</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={st.emptyBtn} onPress={() => router.push('/list-modal')}>
            <Text style={st.emptyBtnText}>CREATE COLLECTION</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  }, [stacksLoading, stackSearch, router]);

  const renderStackItem = useCallback(({ item }: { item: StackData }) => (
    <View style={st.stackGridCell}>
      <StackCard
        stack={item}
        onPress={() => { Haptics.selectionAsync(); router.push(`/stacks/${item.id}`); }}
      />
    </View>
  ), [router]);

  // Mind Reader Pre-Fetching Engine
  const viewabilityConfig = useRef({
    minimumViewTime: 800,
    itemVisiblePercentThreshold: 80,
  }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    viewableItems.forEach((vi) => {
      // FeedItem has a film_id inside logs.
      if (vi.item && vi.item.film_id) {
        tmdb.detail(vi.item.film_id).catch(() => {});
      }
    });
  }).current;

  // ══════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <View style={st.container}>
      <LinearGradient
        colors={[colors.ink, 'rgba(10,7,3,0.98)', colors.soot]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {section === 'logs' ? (
        <FlashList
          ref={logsFlatListRef as any}
          key="logs-feed"
          data={activeFeed}
          keyExtractor={(item) => item.id}
          renderItem={renderLogItem}
          contentContainerStyle={[st.listContent, { paddingTop: topPad }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={logsHeader}
          ListEmptyComponent={logsEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.sepia}
              progressViewOffset={topPad}
            />
          }
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            setScrollY(y);
            scrollOffsetRef.current = y;
            
            // The Projectionist's Touch (Mechanical Scroll Haptics)
            const velocity = Math.abs(e.nativeEvent.velocity?.y ?? 0);
            if (velocity > 0.8) {
              const now = Date.now();
              const delay = Math.max(15, 100 - (velocity * 12)); // scales clicking speed against scroll speed
              if (now - lastHapticRef.current > delay) {
                lastHapticRef.current = now;
                Haptics.selectionAsync();
              }
            }
          }}
          // Option 3: Celluloid Tension (Heavy Overscroll Physics)
          decelerationRate="fast"
          overScrollMode="never"
          bounces={true}
          scrollEventThrottle={32}
          estimatedItemSize={280}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
        />
      ) : (
        <FlatList
          key="stacks-grid"
          data={filteredStacks}
          keyExtractor={(item) => item.id}
          numColumns={2}
          renderItem={renderStackItem}
          columnWrapperStyle={st.stackGridRow}
          contentContainerStyle={[st.listContent, { paddingTop: topPad }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={stackHeader}
          ListEmptyComponent={stackEmpty}
          ListFooterComponent={<View style={st.stackBottomSpacer} />}
          onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
          // Option 3: Celluloid Tension (Heavy Overscroll Physics)
          decelerationRate="fast"
          overScrollMode="never"
          scrollEventThrottle={32}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.sepia}
              progressViewOffset={topPad}
            />
          }
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={true}
        />
      )}

      {/* Option 1: The Archivist's Spotlight (Hardware Accelerated Vignette) */}
      <View style={[StyleSheet.absoluteFillObject, { pointerEvents: 'none' }]} pointerEvents="none">
        <LinearGradient
          colors={['#0A0703', 'rgba(10,7,3,0)']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 140 }}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(10,7,3,0)', '#0A0703']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 180 }}
          pointerEvents="none"
        />
      </View>

      <QuickActionsFAB />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
//  STYLES
// ════════════════════════════════════════════════════════════════
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  listContent: { paddingBottom: 120 },

  // ── Header ──
  sectionHeaderWrap: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  headerEyebrow: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 5, color: colors.sepia, opacity: 0.7, marginBottom: 8 },
  headerTitle: { fontFamily: fonts.display, fontSize: 34, color: colors.parchment, ...effects.textGlowSepia },
  headerEstRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10, marginBottom: 4,
  },
  headerEstLine: { width: 28, height: 1 },
  headerEst: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 5, color: colors.sepia, opacity: 0.35 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveDotDefault: { backgroundColor: colors.sepia, shadowColor: colors.sepia, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  liveDotArchivist: { backgroundColor: colors.sepia, shadowColor: colors.sepia, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  liveDotAuteur: { backgroundColor: 'rgba(180,45,45,1)', shadowColor: 'rgba(125,31,31,1)', shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  liveText: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 3, color: colors.fog, opacity: 0.65 },

  // ── Tab Bar ──
  tabBarRow: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 6, marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.12)', borderRadius: 4, overflow: 'hidden',
  },
  tabPill: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    backgroundColor: 'rgba(10,7,3,0.7)',
  },
  tabPillActive: {
    backgroundColor: 'rgba(139,105,20,0.06)',
    borderBottomWidth: 2, borderBottomColor: colors.sepia,
  },
  tabPillText: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 4, color: colors.fog },
  tabPillTextActive: { color: colors.sepia },
  tabPillDot: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: colors.sepia,
    marginTop: 5, ...effects.glowSepia,
  },

  // ── Filter Row ──
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 8,
    marginBottom: 12, alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 3, borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.12)',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  filterChipActive: {
    backgroundColor: 'rgba(139,105,20,0.1)',
    borderColor: 'rgba(139,105,20,0.35)',
  },
  filterChipText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.fog },
  filterChipTextActive: { color: colors.sepia },
  filterActiveLine: {
    position: 'absolute', bottom: -1, left: '20%', right: '20%',
    height: 1.5, backgroundColor: colors.sepia, borderRadius: 1,
  },
  resultCount: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2, color: colors.fog, opacity: 0.5 },
  filterSpacer: { flex: 1 },

  // ── Search ──
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12,
    backgroundColor: 'rgba(14,11,8,0.9)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.12)',
    borderRadius: 4, paddingHorizontal: 12, height: 40,
  },
  searchIcon: { fontSize: 10, color: colors.sepia, opacity: 0.55, marginRight: 10 },
  searchInput: {
    flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.parchment,
    paddingVertical: 0,
  },
  searchClear: { padding: 4, marginLeft: 4 },
  searchClearText: { fontFamily: fonts.ui, fontSize: 12, color: colors.fog },

  // ── Create Stack CTA ──
  createStackBtn: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: 'rgba(14,11,8,0.9)', borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.15)', borderRadius: 4,
    paddingVertical: 14, alignItems: 'center',
    overflow: 'hidden',
  },
  createStackGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  },
  createStackText: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 3, color: colors.sepia },

  // ── Stack Card (Web Parity) ──
  stackGridRow: {
    paddingHorizontal: 12, gap: 12,
  },
  stackGridCell: { flex: 1 },
  stackCard: {
    flex: 1, backgroundColor: 'rgba(10,5,3,1)',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)',
    borderRadius: 8, overflow: 'hidden',
    height: 200, // Taller for premium feel; web has minHeight
    marginBottom: 12,
    ...effects.shadowPrimary,
    position: 'relative',
  },
  stackCardPosterWrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 0,
    opacity: 0.8,
  },
  stackCardPosterPanel: {
    height: '100%',
  },
  stackCardPosterRow: { flexDirection: 'row', width: '100%', height: '100%' },
  stackCardRef: {
    position: 'absolute',
    top: 8, right: 8,
    backgroundColor: 'rgba(5,3,2,0.8)',
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 2,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.1)',
    zIndex: 10,
  },
  stackCardRefText: {
    fontFamily: fonts.uiBold,
    fontSize: 7,
    letterSpacing: 2.5,
    color: colors.parchment,
    opacity: 0.8,
  },
  stackCardContent: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    padding: 12,
    zIndex: 10,
  },
  stackCardMetaRow: { 
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 
  },
  stackCardBadgeText: { 
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.sepia 
  },
  stackCertifyText: { 
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: '#f2e8a0', opacity: 0.9 
  },
  stackCardMetaDivider: {
    flex: 1, height: 1, backgroundColor: 'rgba(139,105,20,0.3)',
    marginLeft: 4,
  },
  stackCardTitle: {
    fontFamily: fonts.display, fontSize: 16, color: colors.parchment,
    lineHeight: 18, marginBottom: 6,
    ...effects.textShadowDeep,
  },
  stackCardCuratorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stackCardCuratorDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: colors.sepia,
    opacity: 0.8,
  },
  stackCardCuratorName: { 
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.fog 
  },

  // ── Empty States ──
  emptyWrap: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 },
  emptyGlyph: { fontSize: 32, color: colors.sepia, opacity: 0.2, marginBottom: 16 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, opacity: 0.65, textAlign: 'center', marginBottom: 8 },
  emptySub: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, opacity: 0.45, fontStyle: 'italic', textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  emptyBtn: {
    backgroundColor: 'rgba(139,105,20,0.08)', borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.25)', borderRadius: 3,
    paddingVertical: 10, paddingHorizontal: 24,
  },
  emptyBtnText: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 2, color: colors.sepia },

  // ── Auth Gate ──
  gateContainer: { flex: 1, backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center' },
  gateLogo: { width: 48, height: 48, opacity: 0.3, marginBottom: 20 },
  gateTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 8 },
  gateSub: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, fontStyle: 'italic', marginBottom: 24 },
  gateCta: {
    backgroundColor: 'rgba(139,105,20,0.9)', borderRadius: 3,
    paddingVertical: 14, paddingHorizontal: 32, borderWidth: 1,
    borderColor: 'rgba(242,232,160,0.3)',
    ...effects.glowSepia,
  },
  gateCtaText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2.5, color: colors.ink },

  // ── Skeleton ──
  skeleton: {
    marginHorizontal: 16, marginBottom: 16, backgroundColor: 'rgba(14,11,8,0.7)',
    borderRadius: 4, padding: 20, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139,105,20,0.06)',
  },
  shimmerBlock: { backgroundColor: 'rgba(139,105,20,0.06)', borderRadius: 2 },
  shimmerNarrow: { width: '30%', height: 8 },
  shimmerWide: { width: '70%', height: 16, marginTop: 8 },
  shimmerMedium: { width: '45%', height: 10, marginTop: 8 },
  skeletonWrap: { paddingHorizontal: 16 },
  stackBottomSpacer: { height: 40 },
});

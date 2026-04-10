import { useEffect, useCallback, useState, useMemo, memo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  TextInput, Platform, Image, ScrollView, LayoutAnimation, UIManager,
} from 'react-native';
import Animated, {
  FadeInDown, FadeIn
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts, effects } from '@/src/theme/theme';
import { ActivityCard, FeedItem } from '@/src/components/feed/ActivityCard';
import { SectionDivider } from '@/src/components/Decorative';
import QuickActionsFAB from '@/src/components/QuickActionsFAB';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w185';

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
function TabPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
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
}

// ══════════════════════════════════════════════════════════════
//  FILTER PILL (ALL / FOLLOWING)
// ══════════════════════════════════════════════════════════════
function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
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
}

// ══════════════════════════════════════════════════════════════
//  STACK CARD — Compact Dossier Card (Parity with Web)
// ══════════════════════════════════════════════════════════════
const PRESET_GRADIENTS: readonly [string, string, ...string[]][] = [
  ['#1a0e05', '#3a2010', '#0a0703'],
  ['#0a0a0a', '#1c1710', '#2a1a05'],
  ['#05080a', '#101820', '#1a2010'],
  ['#0a0508', '#1a0f18', '#0a0508'],
];

const StackCard = memo(function StackCard({ stack, onPress }: { stack: any; onPress: () => void }) {
  const posters = (stack.films || []).filter((f: any) => f.poster_path).slice(0, 3);
  const curatorInitial = (stack.curator || 'S')[0].toUpperCase();
  const refCode = stack.id ? `REF: ${stack.id.slice(0, 4).toUpperCase()}` : 'REF: 0000';
  
  const hash = stack.id ? stack.id.charCodeAt(0) : 0;
  const gradientColors = PRESET_GRADIENTS[Math.abs(hash) % PRESET_GRADIENTS.length];

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={st.stackCard}>
      {/* ── Background Poster Triptych (Web Parity) ── */}
      <View style={st.stackCardPosterWrap}>
        {posters.length === 0 ? (
          <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={{ flexDirection: 'row', width: '100%', height: '100%' }}>
            {posters.map((f: any, i: number) => (
              <View key={i} style={[st.stackCardPosterPanel, { width: `${100 / posters.length}%` }]}>
                <Image
                  source={{ uri: `${TMDB_IMG}${f.poster_path}` }}
                  style={StyleSheet.absoluteFillObject}
                  resizeMode="cover"
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
          <Text style={st.stackCardBadgeText}>{stack.count || 0} FILMS</Text>
          {stack.certifyCount > 0 && (
            <Text style={st.stackCertifyText}>✦ {stack.certifyCount}</Text>
          )}
          <View style={st.stackCardMetaDivider} />
        </View>

        {/* Title */}
        <Text style={st.stackCardTitle} numberOfLines={2}>{(stack.title || '').toUpperCase()}</Text>

        {/* Curator */}
        <View style={st.stackCardCuratorRow}>
          <View style={st.stackCardCuratorDot} />
          <Text style={st.stackCardCuratorName}>@{(stack.curator || 'society').toUpperCase()}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ══════════════════════════════════════════════════════════════
//  SKELETON LOADER
// ══════════════════════════════════════════════════════════════
function SkeletonCard() {
  return (
    <View style={st.skeleton}>
      <View style={[st.shimmerBlock, { width: '30%', height: 8 }]} />
      <View style={[st.shimmerBlock, { width: '70%', height: 16, marginTop: 8 }]} />
      <View style={[st.shimmerBlock, { width: '45%', height: 10, marginTop: 8 }]} />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN SCREEN: THE REEL
// ══════════════════════════════════════════════════════════════
export default function ReelScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, user } = useAuthStore();
  const router = useRouter();

  const NAV_HEIGHT = 44 + 12;
  const topPad = insets.top + NAV_HEIGHT + 8;

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
  const [allStacks, setAllStacks] = useState<any[]>([]);
  const [stacksLoading, setStacksLoading] = useState(false);

  // ══════════════════════════════════════════════════════════
  //  DATA FETCHING
  // ══════════════════════════════════════════════════════════

  const fetchFeed = useCallback(async (mode: FeedFilter) => {
    try {
      let query = supabase
        .from('logs')
        .select('id, film_id, film_title, poster_path, rating, review, drop_cap, status, created_at, year, user_id, editorial_header, pull_quote, watched_with, is_autopsied, autopsy, profiles!logs_user_id_fkey(username, avatar_url, role)')
        .not('review', 'is', null)
        .neq('review', '')
        .order('created_at', { ascending: false })
        .limit(40);

      if (mode === 'following' && user?.following && user.following.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles').select('id').in('username', user.following).limit(500);
        if (profiles && profiles.length > 0) {
          query = query.in('user_id', profiles.map(p => p.id));
        } else {
          return [];
        }
      }

      const { data } = await query;
      if (!data) return [];

      return data.map((d: any) => ({
        id: String(d.id),
        username: Array.isArray(d.profiles) ? d.profiles[0]?.username : d.profiles?.username || 'unknown',
        avatar_url: Array.isArray(d.profiles) ? d.profiles[0]?.avatar_url : d.profiles?.avatar_url,
        film_title: d.film_title,
        film_id: d.film_id,
        poster_path: d.poster_path,
        rating: d.rating,
        review: d.review,
        drop_cap: d.drop_cap,
        status: d.status || 'watched',
        created_at: d.created_at,
        year: d.year,
        editorial_header: d.editorial_header,
        pull_quote: d.pull_quote,
        role: Array.isArray(d.profiles) ? d.profiles[0]?.role : d.profiles?.role,
        is_autopsied: d.is_autopsied,
        autopsy: d.autopsy,
      }));
    } catch { return []; }
  }, [user?.following]);

  const fetchStacks = useCallback(async () => {
    setStacksLoading(true);
    try {
      const { data: lists } = await supabase
        .from('lists')
        .select('id, title, description, created_at, user_id, is_private')
        .eq('is_private', false)
        .order('created_at', { ascending: false })
        .limit(60);

      if (!lists || lists.length === 0) { setAllStacks([]); setStacksLoading(false); return; }

      const userIds = [...new Set(lists.map((l: any) => l.user_id).filter(Boolean))];
      let usernameMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: p } = await supabase.from('profiles').select('id, username').in('id', userIds);
        if (p) usernameMap = Object.fromEntries(p.map((x: any) => [x.id, x.username]));
      }

      const listIds = lists.map((l: any) => l.id);
      let itemsMap: Record<string, any[]> = {};
      if (listIds.length > 0) {
        const { data: items } = await supabase.from('list_items').select('list_id, film_id, film_title, poster_path').in('list_id', listIds);
        if (items) {
          items.forEach((item: any) => {
            if (!itemsMap[item.list_id]) itemsMap[item.list_id] = [];
            itemsMap[item.list_id].push(item);
          });
        }
      }

      let endorseMap: Record<string, number> = {};
      if (listIds.length > 0) {
        const { data: endorsements } = await supabase
          .from('interactions').select('target_list_id')
          .in('target_list_id', listIds).eq('type', 'endorse_list');
        if (endorsements) {
          endorsements.forEach((e: any) => {
            endorseMap[e.target_list_id] = (endorseMap[e.target_list_id] || 0) + 1;
          });
        }
      }

      setAllStacks(lists.map((l: any) => ({
        id: l.id,
        title: l.title,
        description: l.description || '',
        curator: usernameMap[l.user_id] || 'society',
        curatorId: l.user_id,
        createdAt: l.created_at,
        films: (itemsMap[l.id] || []).map((item: any) => ({
          id: item.film_id, title: item.film_title, poster_path: item.poster_path || null,
        })),
        count: (itemsMap[l.id] || []).length,
        certifyCount: endorseMap[l.id] || 0,
      })));
    } catch {}
    setStacksLoading(false);
  }, []);

  const loadAll = useCallback(async () => {
    setFeedLoading(true);
    const [community, following] = await Promise.all([
      fetchFeed('all'),
      isAuthenticated && user?.following?.length ? fetchFeed('following') : Promise.resolve([]),
    ]);
    setCommunityFeed(community);
    setFollowingFeed(following);
    setFeedLoading(false);
    fetchStacks();
  }, [fetchFeed, fetchStacks, isAuthenticated, user?.following?.length]);

  useEffect(() => {
    if (isAuthenticated) loadAll();
  }, [isAuthenticated]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // ── Derived Data ──
  const activeFeed = feedFilter === 'following' ? followingFeed : communityFeed;
  const logCount = communityFeed.length;

  // ── Filtered Stacks ──
  const filteredStacks = useMemo(() => {
    let result = [...allStacks];
    if (stackFilter === 'following' && user?.following && user.following.length > 0) {
      result = result.filter((s: any) => user.following!.includes(s.curator));
    }
    if (stackSearch.trim()) {
      const q = stackSearch.toLowerCase().trim();
      result = result.filter((s: any) =>
        s.title.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        s.curator.toLowerCase().includes(q) ||
        (s.films || []).some((f: any) => f.title && f.title.toLowerCase().includes(q))
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
      <View style={[st.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient colors={[colors.ink, colors.soot]} style={StyleSheet.absoluteFillObject} />
        <Text style={st.gateGlyph}>◎</Text>
        <Text style={st.gateTitle}>Admit One Required</Text>
        <Text style={st.gateSub}>Join the Society to access The Reel.</Text>
        <TouchableOpacity style={st.gateCta} onPress={() => router.push('/login')}>
          <Text style={st.gateCtaText}>JOIN THE SOCIETY</Text>
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
        <Text style={st.headerTitle}>The Reel</Text>
        {section === 'logs' && (
          <Animated.View entering={FadeIn.duration(400)} style={st.liveRow}>
            <View style={[st.liveDot, { backgroundColor: user?.role === 'auteur' || (user as any)?.role === 'god' ? 'rgba(180,45,45,1)' : user?.role === 'archivist' ? colors.sepia : '#22c55e', shadowColor: user?.role === 'auteur' || (user as any)?.role === 'god' ? 'rgba(125,31,31,1)' : user?.role === 'archivist' ? colors.sepia : '#22c55e', shadowOpacity: 0.8, shadowRadius: 6 }]} />
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
      <View style={{ paddingHorizontal: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </View>
    );
    return (
      <Animated.View entering={FadeInDown.duration(600)} style={st.emptyWrap}>
        <Text style={st.emptyGlyph}>◉</Text>
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
        <Text style={st.searchIcon}>⌕</Text>
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
        <View style={{ flex: 1 }} />
        <Text style={st.resultCount}>
          {filteredStacks.length} {stackSearch ? 'RESULTS' : 'ARCHIVES'}
        </Text>
      </View>

      <SectionDivider label="CURATED STACKS" />

      {/* Create CTA */}
      <TouchableOpacity
        style={st.createStackBtn}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/list-modal'); }}
        activeOpacity={0.8}
      >
        <Text style={st.createStackText}>+ CREATE COLLECTION</Text>
      </TouchableOpacity>
    </>
  ), [section, stackSearch, stackFilter, filteredStacks.length, switchSection, switchStackFilter, router]);

  const stackEmpty = useMemo(() => {
    if (stacksLoading) return (
      <View style={{ paddingHorizontal: 16 }}>
        {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
      </View>
    );
    return (
      <Animated.View entering={FadeInDown.duration(600)} style={st.emptyWrap}>
        <Text style={st.emptyGlyph}>✦</Text>
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
        <FlatList
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
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[st.listContent, { paddingTop: topPad }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.sepia}
              progressViewOffset={topPad}
            />
          }
        >
          {stackHeader}

          {filteredStacks.length === 0 ? stackEmpty : (
            <View style={st.stackGridWrap}>
              {filteredStacks.map((item: any) => (
                <View key={item.id} style={st.stackGridCell}>
                  <StackCard
                    stack={item}
                    onPress={() => { Haptics.selectionAsync(); router.push(`/stacks/${item.id}`); }}
                  />
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

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
  sectionHeaderWrap: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  headerEyebrow: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 4, color: colors.sepia, opacity: 0.7, marginBottom: 6 },
  headerTitle: { fontFamily: fonts.display, fontSize: 32, color: colors.parchment, ...effects.textGlowSepia },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e', ...effects.glowSepia },
  liveText: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 3, color: colors.fog, opacity: 0.7 },

  // ── Tab Bar ──
  tabBarRow: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 4, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)', borderRadius: 4, overflow: 'hidden',
  },
  tabPill: {
    flex: 1, paddingVertical: 11, alignItems: 'center',
    backgroundColor: 'rgba(10,7,3,0.6)',
  },
  tabPillActive: {
    backgroundColor: 'rgba(139,105,20,0.08)',
    borderBottomWidth: 2, borderBottomColor: colors.sepia,
  },
  tabPillText: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 3, color: colors.fog },
  tabPillTextActive: { color: colors.sepia },
  tabPillDot: {
    width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.sepia,
    marginTop: 4, ...effects.glowSepia,
  },

  // ── Filter Row ──
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 8,
    marginBottom: 12, alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
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
    position: 'absolute', bottom: -1, left: '20%' as any, right: '20%' as any,
    height: 1.5, backgroundColor: colors.sepia, borderRadius: 1,
  },
  resultCount: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2, color: colors.fog, opacity: 0.5 },

  // ── Search ──
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12,
    backgroundColor: 'rgba(14,11,8,0.9)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.12)',
    borderRadius: 4, paddingHorizontal: 12, height: 40,
  },
  searchIcon: { fontSize: 16, color: colors.sepia, opacity: 0.5, marginRight: 8 },
  searchInput: {
    flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.parchment,
    paddingVertical: 0,
  },
  searchClear: { padding: 4, marginLeft: 4 },
  searchClearText: { fontFamily: fonts.ui, fontSize: 12, color: colors.fog },

  // ── Create Stack CTA ──
  createStackBtn: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: 'rgba(139,105,20,0.08)', borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.2)', borderRadius: 4,
    paddingVertical: 12, alignItems: 'center',
    borderStyle: 'dashed',
  },
  createStackText: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 3, color: colors.sepia },

  // ── Stack Card (Web Parity) ──
  stackGridWrap: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 10, gap: 0,
  },
  stackGridCell: { width: '50%' as any, paddingHorizontal: 6 },
  stackCard: {
    flex: 1, backgroundColor: 'rgba(10,5,3,1)',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)',
    borderRadius: 8, overflow: 'hidden',
    height: 180, // Web has a minHeight, we use absolute height for the grid
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
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2, color: colors.fog 
  },

  // ── Empty States ──
  emptyWrap: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32 },
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
  gateGlyph: { fontSize: 36, color: colors.sepia, opacity: 0.3, marginBottom: 16 },
  gateTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 8 },
  gateSub: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, fontStyle: 'italic', marginBottom: 24 },
  gateCta: {
    backgroundColor: 'rgba(139,105,20,0.9)', borderRadius: 3,
    paddingVertical: 14, paddingHorizontal: 32, borderWidth: 1,
    borderColor: 'rgba(242,232,160,0.3)',
    ...effects.glowSepia,
  },
  gateCtaText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2.5, color: colors.ink, fontWeight: '700' },

  // ── Skeleton ──
  skeleton: {
    marginHorizontal: 16, marginBottom: 16, backgroundColor: 'rgba(14,11,8,0.7)',
    borderRadius: 4, padding: 20, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139,105,20,0.06)',
  },
  shimmerBlock: { backgroundColor: 'rgba(139,105,20,0.06)', borderRadius: 2 },
});

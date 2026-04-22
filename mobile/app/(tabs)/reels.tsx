import { useEffect, useCallback, useState, useMemo, memo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, RefreshControl,
  TextInput, Platform, ScrollView, LayoutAnimation, UIManager, Dimensions
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import Animated, {
  FadeInDown, FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withSpring, Easing, interpolate, Extrapolation
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

import { setScrollY } from '@/src/utils/scrollBridge';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ══════════════════════════════════════════════════════════════
//  PROJECTOR BEAM ATMOSPHERICS (The Reel) - GPU HARDENED
// ══════════════════════════════════════════════════════════════
const ProjectorBeam = memo(function ProjectorBeam({ scrollY }: { scrollY: SharedValue<number> }) {
  const beamSwing = useSharedValue(0.1);
  const flicker = useSharedValue(0.8);

  useEffect(() => {
    // Subtle, slow physical sweep of a projector beam
    beamSwing.value = withRepeat(
      withSequence(
        withTiming(-0.1, { duration: 12000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.1, { duration: 12000, easing: Easing.inOut(Easing.sin) })
      ), -1, true
    );
    // Micro-flickers like an old arc lamp
    flicker.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 150 }),
        withTiming(0.85, { duration: 100 }),
        withTiming(0.95, { duration: 250 }),
        withTiming(0.7, { duration: 50 }),
        withTiming(0.9, { duration: 1200 }),
      ), -1, false
    );
  }, []);

  const style = useAnimatedStyle(() => {
    // Mathematical GPU Culling: Disable beam layer opacity entirely when scrolled far down
    if (scrollY.value > 600) return { opacity: 0 };
    
    return {
      opacity: flicker.value * Math.max(0, 1 - (scrollY.value / 600)),
      transform: [
        { perspective: 400 },
        { rotateX: '55deg' },
        { rotateZ: `${beamSwing.value * 15}deg` },
        { scaleY: 1.5 },
        { translateY: -SCREEN_H * 0.1 }
      ],
    };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, style, { alignItems: 'center', zIndex: 0 }]} pointerEvents="none">
      <LinearGradient
        colors={['rgba(218,165,32,0.12)', 'rgba(196,150,26,0.04)', 'transparent']}
        locations={[0, 0.4, 0.9]}
        style={{ width: SCREEN_W * 1.5, height: SCREEN_H, borderTopLeftRadius: SCREEN_W, borderTopRightRadius: SCREEN_W }}
      />
    </Animated.View>
  );
});

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
//  INTERLOCKING GEAR TAB (Mechanical Segment Control)
// ══════════════════════════════════════════════════════════════
const InterlockingGearTabs = memo(({ activeTab, onTabSwitch }: { activeTab: ReelSection, onTabSwitch: (t: ReelSection) => void }) => {
  const position = useSharedValue(activeTab === 'logs' ? 0 : 1);
  
  useEffect(() => {
    position.value = withSpring(activeTab === 'logs' ? 0 : 1, { mass: 1, damping: 14, stiffness: 120 });
  }, [activeTab]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(position.value, [0, 1], [0, (SCREEN_W - 32) / 2]) }]
  }));

  return (
    <View style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 12, marginBottom: 24, backgroundColor: 'rgba(18,14,9,0.5)', borderRadius: 4, borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)', height: 46, position: 'relative' }}>
      <Animated.View style={[StyleSheet.absoluteFillObject, { width: '50%', backgroundColor: 'rgba(18,14,9,0.95)', borderColor: 'rgba(139,105,20,0.4)', borderWidth: 1, borderRadius: 4, ...effects.shadowSurface, elevation: 5 }, pillStyle]} />
      <TouchableOpacity style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} activeOpacity={0.7} onPress={() => onTabSwitch('logs')}>
        <Text style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 6, color: activeTab === 'logs' ? '#E4DFCC' : colors.fog, opacity: activeTab === 'logs' ? 1 : 0.6, fontWeight: '700' }}>LOGS</Text>
      </TouchableOpacity>
      <TouchableOpacity style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} activeOpacity={0.7} onPress={() => onTabSwitch('stacks')}>
        <Text style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 6, color: activeTab === 'stacks' ? '#E4DFCC' : colors.fog, opacity: activeTab === 'stacks' ? 1 : 0.6, fontWeight: '700' }}>STACKS</Text>
      </TouchableOpacity>
    </View>
  );
});

// ══════════════════════════════════════════════════════════════
//  TUNGSTEN FILAMENT FILTER CHIP
// ══════════════════════════════════════════════════════════════
const FilterChip = memo(function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (active) {
      pulse.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }), -1, true);
    } else {
      pulse.value = 0;
    }
  }, [active]);

  const activeStyle = useAnimatedStyle(() => {
    if (!active) return { opacity: 0 };
    return { opacity: interpolate(pulse.value, [0, 1], [0.5, 1]) };
  });

  return (
    <PressableScale
      onPress={onPress}
      style={[st.filterChip, active ? { borderColor: 'rgba(218,165,32,0.6)' } : null]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <View style={[StyleSheet.absoluteFillObject, { borderRadius: 4, overflow: 'hidden' }]}>
         <Animated.View style={[StyleSheet.absoluteFillObject, activeStyle]}>
            <LinearGradient colors={['rgba(218,165,32,0.0)', 'rgba(218,165,32,0.4)', 'rgba(218,165,32,0.0)']} start={{x:0, y:0.5}} end={{x:1, y:0.5}} style={StyleSheet.absoluteFillObject} />
         </Animated.View>
      </View>
      <Text style={[st.filterChipText, active && st.filterChipTextActive]}>{label}</Text>
    </PressableScale>
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
                  contentFit="cover"
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
        <Text style={st.stackCardTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{(stack.title ?? '').toUpperCase()}</Text>

        {/* Curator */}
        <View style={st.stackCardCuratorRow}>
          <View style={st.stackCardCuratorDot} />
          <Text style={st.stackCardCuratorName} numberOfLines={1} ellipsizeMode="tail">@{(stack.curator ?? 'society').toUpperCase()}</Text>
        </View>
      </View>
    </PressableScale>
  );
});

// ════════════════════════════════════════════════════════════════
//  BRASS SHEEN (For Primary Call to Action)
// ════════════════════════════════════════════════════════════════
const BrassSheen = memo(() => {
    const sheen = useSharedValue(-2);
    useEffect(() => {
       sheen.value = withRepeat(
         withTiming(2, { duration: 4000, easing: Easing.inOut(Easing.quad) }),
         -1, false
       );
    }, []);
    const sheenStyle = useAnimatedStyle(() => ({
       transform: [{ translateX: interpolate(sheen.value, [-2, 2], [-200, 300]) }]
    }));
    return (
       <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' }}>
          <Animated.View style={[{ width: '150%', height: '100%', opacity: 0.15 }, sheenStyle]}>
             <LinearGradient colors={['transparent', '#FFF', 'transparent']} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFillObject} />
          </Animated.View>
       </View>
    );
});

// ════════════════════════════════════════════════════════════════
//  HIGH-TENSION SHUTTER BLADE (God-Tier Reloading)
// ════════════════════════════════════════════════════════════════
const MechanicalShutterBlade = memo(({ scrollY, isRefreshing }: { scrollY: SharedValue<number>, isRefreshing: boolean }) => {
  const refreshState = useSharedValue(0);

  useEffect(() => {
    refreshState.value = withSpring(isRefreshing ? 1 : 0, { mass: 1.2, damping: 16, stiffness: 90 });
    if (!isRefreshing) {
      // Mechanical slam haptic on retract
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  }, [isRefreshing]);

  const style = useAnimatedStyle(() => {
     // When actively refreshing, blade holds open
     if (refreshState.value > 0.5) {
       return { transform: [{ translateY: interpolate(refreshState.value, [0.5, 1], [-75, 0], Extrapolation.CLAMP) }], opacity: refreshState.value };
     }
     // When idle, track overdrag tension
     const overdrag = Math.max(0, -scrollY.value);
     if (overdrag <= 0 && refreshState.value < 0.05) return { transform: [{ translateY: -150 }], opacity: 0 };
     const tension = interpolate(overdrag, [0, 80], [-150, 0], Extrapolation.CLAMP);
     const retractBlend = interpolate(refreshState.value, [0, 0.5], [0, 1], Extrapolation.CLAMP);
     return {
       transform: [{ translateY: tension * (1 - retractBlend) + (-150 * retractBlend) }],
       opacity: Math.max(Math.min(1, overdrag / 40), refreshState.value)
     };
  });

  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: 120, backgroundColor: '#050403', zIndex: 100, borderBottomWidth: 4, borderBottomColor: 'rgba(218,165,32,0.8)', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 20, elevation: 25 }, style]} pointerEvents="none">
       <Text style={{ fontFamily: fonts.display, fontSize: 13, letterSpacing: 10, color: colors.sepia, ...effects.textGlowSepia }}>{isRefreshing ? 'RE-SPOOLING' : 'SHUTTER COCKED'}</Text>
    </Animated.View>
  );
});


// ════════════════════════════════════════════════════════════════
//  TUNGSTEN SPOOLING (God-Tier Loading sequence)
// ════════════════════════════════════════════════════════════════
const TungstenSpooling = memo(function TungstenSpooling() {
  const flicker = useSharedValue(0.4);
  useEffect(() => {
    flicker.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 50 }),
        withTiming(0.4, { duration: 100 }),
        withTiming(0.9, { duration: 30 }),
        withTiming(0.3, { duration: 250 }),
        withTiming(0.8, { duration: 80 })
      ), -1, true
    );
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: flicker.value }));
  return (
    <View style={{ height: 300, justifyContent: 'center', alignItems: 'center' }}>
      <Animated.View style={[style, { padding: 30, borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', borderRadius: 100, borderStyle: 'dashed' }]}>
        <Buster size={40} mood="thinking" />
      </Animated.View>
      <Animated.Text style={[style, { marginTop: 24, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 8, color: colors.sepia, ...effects.textGlowSepia }]}>
         SPOOLING
      </Animated.Text>
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

  // IsMounted Destructor reference to block fast-unmount async state leak
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  // #7: Persistent scroll position — restore on tab focus
  const overallLogsScrollY = useSharedValue(0);
  const logsScrollY = useRef(0);
  const stacksScrollY = useRef(0);
  const lastHapticRef = useRef(0);
  const logsFlatListRef = useRef<import('@shopify/flash-list').FlashList<FeedItem>>(null);
  const stacksFlatListRef = useRef<import('@shopify/flash-list').FlashList<StackData>>(null);
  
  useFocusEffect(
    useCallback(() => {
      // Restore scroll locations immediately without animation on section mount
      if (section === 'logs' && logsFlatListRef.current && logsScrollY.current > 0) {
        logsFlatListRef.current.scrollToOffset({ offset: logsScrollY.current, animated: false });
      } else if (section === 'stacks' && stacksFlatListRef.current && stacksScrollY.current > 0) {
        stacksFlatListRef.current.scrollToOffset({ offset: stacksScrollY.current, animated: false });
      }
    }, [section])
  );

  // ── Universal Projectionist Touch (Scroll Intercept) ──
  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number }; velocity?: { y?: number } } }, isLogs: boolean) => {
    const y = e.nativeEvent.contentOffset.y;
    overallLogsScrollY.value = y;
    setScrollY(y);
    if (isLogs) logsScrollY.current = y;
    else stacksScrollY.current = y;
    
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
  }, []);

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
    } catch (err: unknown) { return []; }
  }, [user?.following]);

  const fetchStacks = useCallback(async () => {
    // #1: Stale-While-Revalidate — only show skeletons on first load
    const isFirstLoad = allStacks.length === 0;
    if (isFirstLoad && isMountedRef.current) setStacksLoading(true);
    try {
      // Single query: lists + curator username via foreign key join
      const { data: lists } = await supabase
        .from('lists')
        .select('id, title, description, created_at, user_id, is_private, profiles!lists_user_id_fkey(username)')
        .eq('is_private', false)
        .order('created_at', { ascending: false })
        .limit(60);

      if (!lists || lists.length === 0) { 
        if (isMountedRef.current) { setAllStacks([]); setStacksLoading(false); }
        return; 
      }

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

      if (isMountedRef.current) {
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
      }
    } catch (err: unknown) {}
    if (isFirstLoad && isMountedRef.current) setStacksLoading(false);
  }, [allStacks.length]);

  // ── Load community feed + stacks (runs once, cached) ──
  const loadCommunityAndStacks = useCallback(async () => {
    const isFirstLoad = communityFeed.length === 0;
    if (isFirstLoad) {
      // The Nitrate Memory (Phase 2): Instantly load prior session
      const cached = await AsyncStorage.getItem('nitrate_memory_feed');
      if (cached) {
        try { setCommunityFeed(JSON.parse(cached)); } catch (err: unknown) {}
      } else {
        setFeedLoading(true);
      }
    }
    const community = await fetchFeed('all');

      if (community.length > 0) {
        AsyncStorage.setItem('nitrate_memory_feed', JSON.stringify(community.slice(0, 15)));
      }

      if (isMountedRef.current) {
        setCommunityFeed(community);
        if (isFirstLoad) setFeedLoading(false);
      }
      fetchStacks();
  }, [fetchFeed, fetchStacks, communityFeed.length]);

  // ── Load following feed (re-runs whenever user.following changes) ──
  const followingUsernames = user?.following;
  const followingCount = followingUsernames?.length ?? 0;

  const loadFollowingFeed = useCallback(async () => {
    if (!isAuthenticated || followingCount === 0) {
      if (isMountedRef.current) setFollowingFeed([]);
      return;
    }
    const following = await fetchFeed('following');
    if (isMountedRef.current) setFollowingFeed(following);
  }, [fetchFeed, isAuthenticated, followingCount]);

  // Initial load
  useEffect(() => {
    if (isAuthenticated) loadCommunityAndStacks();
  }, [isAuthenticated, loadCommunityAndStacks]);

  // Re-fetch following feed whenever the following list changes (e.g. after hydration or follow/unfollow)
  useEffect(() => {
    if (isAuthenticated && followingCount > 0) loadFollowingFeed();
  }, [isAuthenticated, followingCount, loadFollowingFeed]);

  // Re-fetch following feed when tab regains focus (user may have followed someone on a profile page)
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

  // ── Derived Data ──
  const activeFeed = useMemo(() => feedFilter === 'following' ? followingFeed : communityFeed, [feedFilter, followingFeed, communityFeed]);
  const logCount = activeFeed.length;

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
          contentFit="contain"
        />
        <Text style={st.gateTitle}>Admit One Required</Text>
        <Text style={st.gateSub}>Join the Society to access The Reel.</Text>
        <PressableScale style={st.gateCta} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); router.push('/login'); }}>
          <BrassSheen />
          <Text style={st.gateCtaText}>REQUEST MEMBERSHIP</Text>
        </PressableScale>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════
  //  SHARED HEADER — appears in both sections
  // ══════════════════════════════════════════════════════════
  const SharedReelHeader = () => {
    const livePulse = useSharedValue(0.4);
    useEffect(() => {
      livePulse.value = withRepeat(
        withSequence(withTiming(1, { duration: 1000 }), withTiming(0.4, { duration: 1000 })),
        -1,
        true
      );
    }, []);
    const pulseStyle = useAnimatedStyle(() => ({ opacity: livePulse.value }));

    return (
      <>
        {/* Section Header */}
        <View style={st.sectionHeaderWrap}>
          <Text style={st.headerEyebrow}>✦ THE REELHOUSE SOCIETY ✦</Text>
          <Text style={st.headerTitle} accessibilityRole="header">The Reel</Text>
  
          {/* Decorative Est. 1924 rule */}
          <View style={st.headerEstRow}>
            <LinearGradient colors={['transparent', colors.sepia]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.headerEstLine} />
            <Text style={st.headerEst}>EST. 1924</Text>
            <LinearGradient colors={[colors.sepia, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.headerEstLine} />
          </View>
  
          {section === 'logs' && (
            <View style={st.liveRow}>
              <Animated.View style={[
                st.liveDot,
                user?.role === 'auteur' ? st.liveDotAuteur
                  : user?.role === 'archivist' ? st.liveDotArchivist
                  : st.liveDotDefault,
                pulseStyle
              ]} />
              <Text style={st.liveText}>
                LIVE · {logCount > 0 ? `${logCount} LOG${logCount === 1 ? '' : 'S'}` : 'AWAITING SIGNAL'}
              </Text>
            </View>
          )}
        </View>
  
        {/* Section Tabs (Mechanical Slider) */}
        <InterlockingGearTabs activeTab={section} onTabSwitch={switchSection} />
      </>
    );
  };

  // ══════════════════════════════════════════════════════════
  //  LOGS SECTION — Log Feed
  // ══════════════════════════════════════════════════════════
  const renderLogItem = useCallback(({ item, index }: { item: FeedItem; index: number }) => (
    <ActivityCard item={item} index={index} parentScrollY={overallLogsScrollY} />
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
          <PressableScale style={st.emptyBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/log-modal'); }}>
            <Text style={st.emptyBtnText}>LOG A FILM</Text>
          </PressableScale>
        )}
      </Animated.View>
    );
  }, [feedLoading, feedFilter, router]);

  // ══════════════════════════════════════════════════════════
  //  STACKS SECTION — Curated Lists
  // ══════════════════════════════════════════════════════════

  const stackHeader = useMemo(() => (
    <>
      <SharedReelHeader />

      {/* Search Bar (Carbon Ribbon Typewriter) */}
      <View style={st.searchWrap}>
        <Text style={st.searchIcon}>✦</Text>
        <TextInput
          style={st.searchInput}
          placeholder="SEARCH ARCHIVES..."
          placeholderTextColor={colors.fog}
          value={stackSearch}
          onChangeText={(text) => { Haptics.selectionAsync(); setStackSearch(text); }}
          returnKeyType="search"
          selectionColor={colors.sepia}
          onFocus={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        />
        {stackSearch.length > 0 && (
          <PressableScale onPress={() => { Haptics.selectionAsync(); setStackSearch(''); }} style={st.searchClear} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
            <Text style={st.searchClearText}>✕</Text>
          </PressableScale>
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

      {/* Create CTA (Brass Lever) */}
      <PressableScale
        style={st.createStackBtn}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); router.push('/list-modal'); }}
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
  ), [section, stackSearch, stackFilter, filteredStacks.length, switchSection, switchStackFilter, router]);

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
          <PressableScale style={st.emptyBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/list-modal'); }}>
            <Text style={st.emptyBtnText}>CREATE COLLECTION</Text>
          </PressableScale>
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

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: import('react-native').ViewToken[] }) => {
    viewableItems.forEach((vi) => {
      // FeedItem has a film_id inside logs.
      if (vi.item && vi.item.film_id) {
        tmdb.detail(vi.item.film_id).catch((err: unknown) => {});
      }
    });
  }).current;

  // ══════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════
  return (
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
          renderItem={renderLogItem}
          contentContainerStyle={[st.listContent, { paddingTop: topPad }]}
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
          // Option 3: Celluloid Tension (Heavy Overscroll Physics)
          decelerationRate="fast"
          overScrollMode="never"
          bounces={true}
          scrollEventThrottle={32}
          estimatedItemSize={450}
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
          numColumns={2}
          renderItem={renderStackItem}
          contentContainerStyle={[st.listContent, { paddingTop: topPad, paddingBottom: 100, paddingHorizontal: 10 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={stackHeader}
          ListEmptyComponent={stackEmpty}
          onScroll={(e) => handleScroll(e, false)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          decelerationRate="fast"
          overScrollMode="never"
          scrollEventThrottle={32}
          estimatedItemSize={240}
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

      {/* Removed Hardware Vignette to eliminate scrolling GPU load & shadow cuts */}

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
  headerEyebrow: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 12, color: colors.sepia, opacity: 0.6, marginBottom: 8, fontWeight: '700' },
  headerTitle: { 
    fontFamily: fonts.display, fontSize: 36, color: '#F2ECD8', marginBottom: 4,
    ...effects.textGlowSepia, textShadowRadius: 25, textShadowColor: 'rgba(196,150,26, 0.4)', letterSpacing: 2
  },
  headerEstRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10, marginBottom: 4,
  },
  headerEstLine: { width: 32, height: StyleSheet.hairlineWidth },
  headerEst: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 8, color: colors.sepia, opacity: 0.5, fontWeight: '700' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveDotDefault: { backgroundColor: colors.sepia, shadowColor: colors.sepia, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  liveDotArchivist: { backgroundColor: colors.sepia, shadowColor: colors.sepia, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  liveDotAuteur: { backgroundColor: 'rgba(180,45,45,1)', shadowColor: 'rgba(125,31,31,1)', shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  liveText: { fontFamily: fonts.uiBold, fontSize: 8, letterSpacing: 4, color: colors.fog, opacity: 0.65 },

  // ── Tab Bar ──
  tabBarRow: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 12, marginBottom: 24, gap: 12
  },
  tabPill: {
    flex: 1, paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)',
    borderRadius: 4, backgroundColor: 'rgba(18,14,9,0.5)',
  },
  tabPillActive: {
    backgroundColor: 'rgba(18,14,9,0.95)',
    borderColor: 'rgba(139,105,20,0.4)',
    ...effects.shadowSurface,
  },
  tabPillText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 6, color: colors.fog, opacity: 0.6, fontWeight: '700' },
  tabPillTextActive: { color: '#E4DFCC', opacity: 1, ...effects.textGlowSepia, textShadowRadius: 10 },

  // ── Filter Row ──
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 12,
    marginBottom: 20, alignItems: 'center',
  },
  filterChip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)',
    backgroundColor: 'rgba(18,14,9,0.5)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(18,14,9,0.95)',
    borderColor: 'rgba(139,105,20,0.4)',
  },
  filterChipText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 4, color: colors.fog, opacity: 0.6, fontWeight: '700' },
  filterChipTextActive: { color: colors.sepia, opacity: 1 },
  filterActiveLine: { display: 'none' },
  resultCount: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 2, color: colors.fog, opacity: 0.5, fontWeight: '700' },
  filterSpacer: { flex: 1 },

  // ── Search ──
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

  // ── Create Stack CTA ──
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

  // ── Stack Card (Dossier Parity) ──
  stackGridRow: {
    paddingHorizontal: 12, gap: 12,
  },
  stackGridCell: { flex: 1, paddingHorizontal: 6 },
  stackCard: {
    flex: 1, backgroundColor: '#050402',
    borderWidth: 2, borderColor: '#3A2E1C',
    borderRadius: 6, overflow: 'hidden',
    height: 220,
    marginBottom: 14,
    position: 'relative',
    ...effects.shadowPrimary,
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
    lineHeight: 18, marginBottom: 8,
  },
  stackCardCuratorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stackCardCuratorDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: colors.sepia,
    opacity: 0.8,
  },
  stackCardCuratorName: { 
    fontFamily: fonts.uiBold, fontSize: 8, letterSpacing: 2, color: colors.fog 
  },

  // ── Empty States ──
  emptyWrap: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 },
  emptyGlyph: { fontSize: 32, color: colors.sepia, opacity: 0.2, marginBottom: 16 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment, opacity: 0.8, textAlign: 'center', marginBottom: 8 },
  emptySub: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, opacity: 0.5, fontStyle: 'italic', textAlign: 'center', lineHeight: 18, marginBottom: 24 },
  emptyBtn: {
    backgroundColor: 'rgba(14,11,8,0.9)', borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.3)', borderRadius: 2, borderStyle: 'dashed',
    paddingVertical: 12, paddingHorizontal: 28,
  },
  emptyBtnText: { fontFamily: fonts.uiBold, fontSize: 9, letterSpacing: 3, color: colors.sepia },

  // ── Auth Gate ──
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

  stackBottomSpacer: { height: 40 },
});

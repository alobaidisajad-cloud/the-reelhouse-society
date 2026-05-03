import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, useWindowDimensions
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import AnimatedRN, { FadeIn, useSharedValue, useAnimatedStyle, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import type { ProfileVaultItem, ProfileLog, ProfileWatchlistItem, ProfileList, HalfLifeEntry } from '@/src/types';
import { supabase } from '@/src/lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, fonts, effects, SEPIA_HASH } from '@/src/theme/theme';
import { SectionDivider , ReelRating } from '@/src/components/Decorative';
import { tmdb } from '@/src/lib/tmdb';
import { CinematicInsights } from '@/src/components/profile/CinematicInsights';
import { ProgrammesSection } from '@/src/components/profile/ProgrammesSection';
import { CinemaDNACard } from '@/src/components/profile/CinemaDNACard';
import { ProfileBackdrop } from '@/src/components/profile/ProfileBackdrop';
import { ProfileTriptych } from '@/src/components/profile/ProfileTriptych';
import { NoirPassport } from '@/src/components/profile/NoirPassport';
import NitrateCalendarGrid from '@/src/components/profile/NitrateCalendarGrid';
import { ProjectorRoom } from '@/src/components/profile/ProjectorRoom';
import { WatchlistRoulette } from '@/src/components/profile/WatchlistRoulette';
import { TasteMatch } from '@/src/components/profile/TasteMatch';
import { TasteDNA } from '@/src/components/profile/TasteDNA';
import { Achievements } from '@/src/components/profile/Achievements';
import ProfileArchiveTab from '@/src/components/profile/ProfileArchiveTab';
import ProfileLedgerTab from '@/src/components/profile/ProfileLedgerTab';
import ProfileWatchlistTab from '@/src/components/profile/ProfileWatchlistTab';
import { safeOpenURL } from '@/src/utils/linking';
import ProfileListsTab from '@/src/components/profile/ProfileListsTab';
import ProfilePhysicalTab from '@/src/components/profile/ProfilePhysicalTab';
import {
  Archive, BookOpen, Bookmark, LayoutList, Disc, LineChart,
  Star, Lock, Settings, ChevronLeft, Globe, Sparkles, Film as FilmIcon,
  ArrowLeft, X,
  Flame, Crown, Dna, CalendarDays,
} from 'lucide-react-native';
import PressableScale from '@/src/components/PressableScale';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedView = AnimatedRN.createAnimatedComponent(View);

type ProfileTab = 'archive' | 'ledger' | 'watchlist' | 'lists' | 'physical' | 'passport' | 'projector' | 'calendar';


interface SocialLink {
  title: string;
  url: string;
}



interface ProfileUser {
  id: string;
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
  role?: string;
  tier?: string;
  persona?: string | null;
  is_social_private?: boolean;
  followers_count?: number;
  following_count?: number;
  followers?: string[];
  following?: string[];
  favorite_films?: number[];
  preferences?: import('@/src/types').UserPreferences;
  created_at?: string;
  social_links?: SocialLink[] | Record<string, string>;
}

// ════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ════════════════════════════════════════════════════════════

function StatCard({ label, value, onPress, isLast }: { label: string; value: string | number; onPress?: () => void; isLast?: boolean }) {
  return (
    <>
      <PressableScale style={s.statCard} onPress={() => { if (onPress) { onPress(); } }} disabled={!onPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} haptic>
        <Text style={s.statValue} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.75}>{value}</Text>
        <Text style={s.statLabel} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.75}>{label}</Text>
      </PressableScale>
      {!isLast && <View style={s.statDivider} />}
    </>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <View style={s.sectionLabelWrap}>
      <Sparkles size={8} color={colors.sepia} strokeWidth={1.5} />
      <Text style={s.sectionLabelText}>{text}</Text>
      <Sparkles size={8} color={colors.sepia} strokeWidth={1.5} />
    </View>
  );
}

function GoldDivider() {
  return <View style={s.goldDivider} />;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ════════════════════════════════════════════════════════════
// MAIN PROFILE SCREEN
// ════════════════════════════════════════════════════════════

const TAB_TITLES: Record<string, string> = {
  archive: 'The Archive', ledger: 'The Ledger', watchlist: 'Watchlist',
  lists: 'The Stacks', physical: 'Physical Archive', passport: 'Passport',
  projector: 'Global Analytics', calendar: "The AUTEUR's Calendar",
};

export default function UserProfileScreen({ usernameOverride }: { usernameOverride?: string } = {}) {
  const params = useLocalSearchParams<{ username: string; tab?: string }>();
  const username = usernameOverride ?? params.username;
  const tab = params.tab;
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const followUser = useAuthStore(s => s.followUser);
  const unfollowUser = useAuthStore(s => s.unfollowUser);
  const myLogs = useFilmStore(s => s.logs);
  const myWatchlist = useFilmStore(s => s.watchlist);
  const myVault = useFilmStore(s => s.physicalArchive);
  const myLists = useFilmStore(s => s.lists);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const POSTER_COL_4 = (windowWidth - 32 - 18) / 4;
  const POSTER_COL_3 = (windowWidth - 32 - 16) / 3;

  // ── State ──
  const [targetUser, setTargetUser] = useState<ProfileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab | null>(null);
  const [dnaCardOpen, setDnaCardOpen] = useState(false);
  const [rouletteOpen, setRouletteOpen] = useState(false);

  // Elite Navigation Handlers
  const navToEditProfile = useCallback(() => router.push('/edit-profile' as never), [router]);
  const navToSettings = useCallback(() => router.push('/settings' as never), [router]);
  const navToMembership = useCallback(() => router.push('/membership' as never), [router]);
  const navToFollowers = useCallback(() => { 
    if (!targetUser?.id) return;
    router.push({ pathname: '/social-modal', params: { userId: targetUser.id, type: 'followers' } } as never);
  }, [router, targetUser?.id]);
  const navToFollowing = useCallback(() => { 
    if (!targetUser?.id) return;
    router.push({ pathname: '/social-modal', params: { userId: targetUser.id, type: 'following' } } as never);
  }, [router, targetUser?.id]);
  const navToCalendar = useCallback(() => router.push({ pathname: `/user/${username}`, params: { tab: 'calendar' } } as never), [router, username]);
  const openSocialLink = useCallback((url: string) => safeOpenURL(url.startsWith('http') ? url : `https://${url}`), []);
  const closeDnaCard = useCallback(() => setDnaCardOpen(false), []);
  const closeRoulette = useCallback(() => setRouletteOpen(false), []);
  const onRouletteSelect = useCallback((id: number) => { setRouletteOpen(false); router.push(`/film/${id}` as never); }, [router]);

  // Safe navigation handler
  const handleBack = useCallback(() => {
    Haptics.selectionAsync();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)' as never);
    }
  }, [router]);

  // Tab-specific filters
  const [archiveSieve, setArchiveSieve] = useState('all');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerRatingFilter, setLedgerRatingFilter] = useState<number | 'all'>('all');
  const [watchlistSearch, setWatchlistSearch] = useState('');
  const [watchlistSort, setWatchlistSort] = useState<'default' | 'az' | 'za'>('default');
  const [physicalFilter, setPhysicalFilter] = useState<string | null>(null);

  // Breathing avatar animation — purely on native thread
  const breatheAnim = useSharedValue(0.4);
  useEffect(() => {
    // Round 7: Removed infinite loop to allow UI thread idling
    breatheAnim.value = withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) });
    return () => cancelAnimation(breatheAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: breatheAnim.value }));

  // Tab sync from route
  useEffect(() => {
    if (tab) {
      const validTabs: ProfileTab[] = ['archive', 'ledger', 'watchlist', 'lists', 'physical', 'passport', 'projector', 'calendar'];
      const mapped = tab === 'diary' ? 'ledger' : tab;
      if (validTabs.includes(mapped as ProfileTab)) setActiveTab(mapped as ProfileTab);
    } else {
      setActiveTab(null);
    }
  }, [tab]);

  // ── Data ──
  const [logs, setLogs] = useState<ProfileLog[]>([]);
  const [analyticsLogs, setAnalyticsLogs] = useState<ProfileLog[]>([]);
  const [watchlist, setWatchlist] = useState<ProfileWatchlistItem[]>([]);
  const [vault, setVault] = useState<ProfileVaultItem[]>([]);
  const [lists, setLists] = useState<ProfileList[]>([]);

  // ── Pagination State ──
  const [logsPage, setLogsPage] = useState(0);
  const [hasMoreLogs, setHasMoreLogs] = useState(true);
  const [watchlistPage, setWatchlistPage] = useState(0);
  const [hasMoreWatchlist, setHasMoreWatchlist] = useState(true);
  const [vaultPage, setVaultPage] = useState(0);
  const [hasMoreVault, setHasMoreVault] = useState(true);
  const [listsPage, setListsPage] = useState(0);
  const [hasMoreLists, setHasMoreLists] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState<Record<string, boolean>>({});

  const isFollowing = user?.following?.includes(username);
  const isSelf = user?.username === username;
  const filmStore = useFilmStore();
  const { fetchLogs, fetchWatchlist, fetchPhysicalArchive, fetchLists } = filmStore;

  // ── Server-side counts (lightweight — no row data transferred) ──
  const [counts, setCounts] = useState({ logs: 0, ledger: 0, watchlist: 0, vault: 0, lists: 0 });
  const [tabDataLoaded, setTabDataLoaded] = useState<Record<string, boolean>>({});

  // ── Fetch profile metadata + counts only (initial load) ──
  const fetchUserData = useCallback(async () => {
    if (!username) return;
    try {
      const { data: profile, error } = await supabase
        .from('profiles').select('id, username, avatar_url, bio, role, tier, persona, is_social_private, followers_count, following_count, followers, following, favorite_films, preferences, created_at').eq('username', username).single();
      if (error || !profile) { setTargetUser(null); return; }
      setTargetUser(profile);
      
      const currentUserFollowing = user?.following ?? [];
      const isUserFollowing = currentUserFollowing.includes(username);
      if (profile.is_social_private && !isSelf && !isUserFollowing) return;

      // Server-side counts — zero data transfer, just numbers
      const [logsCount, ledgerCountRes, watchCount, vaultCount, listsCount] = await Promise.all([
        supabase.from('logs').select('id', { count: 'exact', head: true }).eq('user_id', profile.id),
        supabase.from('logs').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).or('rating.gt.0,review.neq.null'),
        supabase.from('watchlists').select('id', { count: 'exact', head: true }).eq('user_id', profile.id),
        supabase.from('physical_archive').select('id', { count: 'exact', head: true }).eq('user_id', profile.id),
        supabase.from('lists').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).eq('is_private', false),
      ]);
      setCounts({
        logs: logsCount.count ?? 0,
        ledger: ledgerCountRes.count ?? 0,
        watchlist: watchCount.count ?? 0,
        vault: vaultCount.count ?? 0,
        lists: listsCount.count ?? 0,
      });

      if (isSelf) {
        await fetchLogs();
        setTabDataLoaded(prev => ({ ...prev, archive: true, ledger: true }));
        return;
      }

      setLogsPage(0);
      const { data: initialLogs } = await supabase.from('logs')
        .select('id, film_id, film_title, poster_path, year, rating, review, status, watched_date, created_at, pull_quote, alt_poster, physical_media, watched_with, abandoned_reason')
        .eq('user_id', profile.id).order('watched_date', { ascending: false }).limit(50);
      
      const parsedLogs = (initialLogs ?? []).map(l => ({
        id: String(l.id), filmId: l.film_id, title: l.film_title ?? '', poster: l.poster_path, year: l.year,
        rating: l.rating ?? 0, review: l.review, status: l.status ?? 'watched', watchedDate: l.watched_date,
        pullQuote: l.pull_quote ?? '', altPoster: l.alt_poster ?? null, physicalMedia: l.physical_media ?? null,
        watchedWith: l.watched_with ?? null, abandonedReason: l.abandoned_reason ?? null, createdAt: l.created_at,
      }));
      setLogs(parsedLogs);
      setHasMoreLogs(parsedLogs.length === 50);
      setTabDataLoaded(prev => ({ ...prev, archive: true, ledger: true }));
    } catch (err: unknown) {
        if (__DEV__) console.warn('[ProfileFetch] fetchUserData error:', err);
    }
  }, [username, isSelf, fetchLogs, user?.following]);

  // Auto-sync: If user just followed a private profile, fetch their data
  useEffect(() => {
    if (targetUser?.is_social_private && !isSelf && isFollowing && !tabDataLoaded.archive) {
      fetchUserData();
    }
  }, [isFollowing, targetUser?.is_social_private, isSelf, tabDataLoaded.archive, fetchUserData]);

  // ── Lazy tab data loader — fetches data only when a tab is first opened ──
  const loadTabData = useCallback(async (tab: ProfileTab) => {
    if (tabDataLoaded[tab] || !targetUser) return;
    const uid = targetUser.id;
    try {
      if (tab === 'watchlist' && !tabDataLoaded.watchlist) {
        setTabDataLoaded(prev => ({ ...prev, watchlist: true })); // Optimistic update to prevent race conditions
        if (isSelf) {
          await fetchWatchlist();
        } else {
          setWatchlistPage(0);
          const { data } = await supabase.from('watchlists')
            .select('film_id, film_title, poster_path, year')
            .eq('user_id', uid).order('created_at', { ascending: false }).limit(50);
          const parsed = (data ?? []).map(w => ({ id: w.film_id, title: w.film_title, poster_path: w.poster_path, year: w.year }));
          setWatchlist(parsed);
          setHasMoreWatchlist(parsed.length === 50);
        }
      } else if (tab === 'physical' && !tabDataLoaded.physical) {
        setTabDataLoaded(prev => ({ ...prev, physical: true }));
        if (isSelf) {
          await fetchPhysicalArchive();
        } else {
          setVaultPage(0);
          const { data } = await supabase.from('physical_archive')
            .select('id, film_id, film_title, poster_path, year, formats, notes, condition, created_at')
            .eq('user_id', uid).order('created_at', { ascending: false }).limit(50);
          const parsed = (data ?? []).map(v => ({
            id: v.id, film_id: v.film_id, filmId: v.film_id, title: v.film_title, poster_path: v.poster_path, year: v.year,
            formats: v.formats ?? [], notes: v.notes ?? '', condition: v.condition ?? 'good', created_at: v.created_at, createdAt: v.created_at,
          }));
          setVault(parsed);
          setHasMoreVault(parsed.length === 50);
        }
      } else if (tab === 'lists' && !tabDataLoaded.lists) {
        setTabDataLoaded(prev => ({ ...prev, lists: true }));
        if (isSelf) {
          await fetchLists();
        } else {
          setListsPage(0);
          const { data: listsData } = await supabase.from('lists')
            .select('id, title, description, is_ranked, is_private, created_at')
            .eq('user_id', uid).eq('is_private', false).order('created_at', { ascending: false }).limit(50);
          const listIds = (listsData ?? []).map((l: { id: string }) => l.id);
          let allListItems: { list_id: string; film_id: number; film_title: string; poster_path: string | null }[] = [];
          if (listIds.length > 0) {
            const { data: items } = await supabase.from('list_items')
              .select('list_id, film_id, film_title, poster_path')
              .in('list_id', listIds)
              .order('position', { ascending: true })
              .order('created_at', { ascending: true })
              .limit(500);
            allListItems = items ?? [];
          }
          const itemsByList = new Map<string, typeof allListItems>();
          for (const item of allListItems) {
            const arr = itemsByList.get(item.list_id) ?? [];
            arr.push(item);
            itemsByList.set(item.list_id, arr);
          }
          const parsed = (listsData ?? []).map(l => ({
            id: l.id, title: l.title, description: l.description ?? '', isRanked: l.is_ranked ?? false,
            isPrivate: l.is_private ?? false, createdAt: l.created_at,
            films: (itemsByList.get(l.id) ?? []).map((i) => ({ id: i.film_id, title: i.film_title, poster: i.poster_path })),
          }));
          setLists(parsed);
          setHasMoreLists(parsed.length === 50);
        }
      } else if ((tab === 'projector' || tab === 'calendar') && !tabDataLoaded.analytics) {
        setTabDataLoaded(prev => ({ ...prev, analytics: true }));
        const { data } = await supabase.from('logs')
          .select('id, film_id, film_title, poster_path, year, rating, status, watched_date, created_at, physical_media')
          .eq('user_id', uid).order('watched_date', { ascending: false }).limit(2000);
        
        const parsedAnalytics = (data ?? []).map(l => ({
          id: String(l.id), filmId: l.film_id, title: l.film_title ?? '', poster: l.poster_path, year: l.year,
          rating: l.rating ?? 0, status: l.status ?? 'watched', watchedDate: l.watched_date,
          physicalMedia: l.physical_media ?? null, createdAt: l.created_at,
          review: null, pullQuote: '', altPoster: null, watchedWith: null, abandonedReason: null
        }));
        setAnalyticsLogs(parsedAnalytics);
      }
    } catch (err: unknown) {
        if (__DEV__) console.warn('[ProfileFetch] loadTabData error:', err);
    }
  }, [targetUser, tabDataLoaded, isSelf, fetchWatchlist, fetchPhysicalArchive, fetchLists]);

  // ── Infinite Scrolling Handlers ──
  const loadMoreLogs = useCallback(async () => {
    if (isSelf) return fetchLogs(true);
    if (!hasMoreLogs || isLoadingMore.logs || !targetUser) return;
    setIsLoadingMore(prev => ({ ...prev, logs: true }));
    try {
      const nextPage = logsPage + 1;
      const { data } = await supabase.from('logs')
        .select('id, film_id, film_title, poster_path, year, rating, review, status, watched_date, created_at, pull_quote, alt_poster, physical_media, watched_with, abandoned_reason')
        .eq('user_id', targetUser.id).order('watched_date', { ascending: false }).range(nextPage * 50, (nextPage + 1) * 50 - 1);
      
      const parsed = (data ?? []).map(l => ({
        id: String(l.id), filmId: l.film_id, title: l.film_title ?? '', poster: l.poster_path, year: l.year,
        rating: l.rating ?? 0, review: l.review, status: l.status ?? 'watched', watchedDate: l.watched_date,
        pullQuote: l.pull_quote ?? '', altPoster: l.alt_poster ?? null, physicalMedia: l.physical_media ?? null,
        watchedWith: l.watched_with ?? null, abandonedReason: l.abandoned_reason ?? null, createdAt: l.created_at,
      }));
      if (parsed.length > 0) {
        setLogs(prev => [...prev, ...parsed]);
        setLogsPage(nextPage);
      }
      setHasMoreLogs(parsed.length === 50);
    } catch (err) {
        if (__DEV__) console.warn('[ProfileFetch] loadMoreLogs error:', err);
    } finally {
      setIsLoadingMore(prev => ({ ...prev, logs: false }));
    }
  }, [isSelf, fetchLogs, hasMoreLogs, isLoadingMore.logs, targetUser, logsPage]);

  const loadMoreWatchlist = useCallback(async () => {
    if (isSelf) return fetchWatchlist(true);
    if (!hasMoreWatchlist || isLoadingMore.watchlist || !targetUser) return;
    setIsLoadingMore(prev => ({ ...prev, watchlist: true }));
    try {
      const nextPage = watchlistPage + 1;
      const { data } = await supabase.from('watchlists')
        .select('film_id, film_title, poster_path, year')
        .eq('user_id', targetUser.id).order('created_at', { ascending: false }).range(nextPage * 50, (nextPage + 1) * 50 - 1);
      
      const parsed = (data ?? []).map(w => ({ id: w.film_id, title: w.film_title, poster_path: w.poster_path, year: w.year }));
      if (parsed.length > 0) {
        setWatchlist(prev => [...prev, ...parsed]);
        setWatchlistPage(nextPage);
      }
      setHasMoreWatchlist(parsed.length === 50);
    } catch (err) {
        if (__DEV__) console.warn('[ProfileFetch] loadMoreWatchlist error:', err);
    } finally {
      setIsLoadingMore(prev => ({ ...prev, watchlist: false }));
    }
  }, [isSelf, fetchWatchlist, hasMoreWatchlist, isLoadingMore.watchlist, targetUser, watchlistPage]);

  const loadMoreVault = useCallback(async () => {
    if (isSelf) { fetchPhysicalArchive(); return; }
    if (!hasMoreVault || isLoadingMore.vault || !targetUser) return;
    setIsLoadingMore(prev => ({ ...prev, vault: true }));
    try {
      const nextPage = vaultPage + 1;
      const { data } = await supabase.from('physical_archive')
        .select('id, film_id, film_title, poster_path, year, formats, notes, condition, created_at')
        .eq('user_id', targetUser.id).order('created_at', { ascending: false }).range(nextPage * 50, (nextPage + 1) * 50 - 1);
      
      const parsed = (data ?? []).map(v => ({
        id: v.id, film_id: v.film_id, filmId: v.film_id, title: v.film_title, poster_path: v.poster_path, year: v.year,
        formats: v.formats ?? [], notes: v.notes ?? '', condition: v.condition ?? 'good', created_at: v.created_at, createdAt: v.created_at,
      }));
      if (parsed.length > 0) {
        setVault(prev => [...prev, ...parsed]);
        setVaultPage(nextPage);
      }
      setHasMoreVault(parsed.length === 50);
    } catch (err) {
        if (__DEV__) console.warn('[ProfileFetch] loadMoreVault error:', err);
    } finally {
      setIsLoadingMore(prev => ({ ...prev, vault: false }));
    }
  }, [isSelf, fetchPhysicalArchive, hasMoreVault, isLoadingMore.vault, targetUser, vaultPage]);

  const loadMoreLists = useCallback(async () => {
    if (isSelf) return fetchLists(true);
    if (!hasMoreLists || isLoadingMore.lists || !targetUser) return;
    setIsLoadingMore(prev => ({ ...prev, lists: true }));
    try {
      const nextPage = listsPage + 1;
      const { data: listsData } = await supabase.from('lists')
        .select('id, title, description, is_ranked, is_private, created_at')
        .eq('user_id', targetUser.id).eq('is_private', false).order('created_at', { ascending: false }).range(nextPage * 50, (nextPage + 1) * 50 - 1);
      
      const listIds = (listsData ?? []).map((l: { id: string }) => l.id);
      let allListItems: { list_id: string; film_id: number; film_title: string; poster_path: string | null }[] = [];
      if (listIds.length > 0) {
        const { data: items } = await supabase.from('list_items').select('list_id, film_id, film_title, poster_path').in('list_id', listIds).order('position', { ascending: true }).order('created_at', { ascending: true }).limit(500);
        allListItems = items ?? [];
      }
      const itemsByList = new Map<string, typeof allListItems>();
      for (const item of allListItems) {
        const arr = itemsByList.get(item.list_id) ?? [];
        arr.push(item);
        itemsByList.set(item.list_id, arr);
      }
      const parsed = (listsData ?? []).map(l => ({
        id: l.id, title: l.title, description: l.description ?? '', isRanked: l.is_ranked ?? false,
        isPrivate: l.is_private ?? false, createdAt: l.created_at,
        films: (itemsByList.get(l.id) ?? []).map((i) => ({ id: i.film_id, title: i.film_title, poster: i.poster_path })),
      }));
      if (parsed.length > 0) {
        setLists(prev => [...prev, ...parsed]);
        setListsPage(nextPage);
      }
      setHasMoreLists(parsed.length === 50);
    } catch (err) {
        if (__DEV__) console.warn('[ProfileFetch] loadMoreLists error:', err);
    } finally {
      setIsLoadingMore(prev => ({ ...prev, lists: false }));
    }
  }, [isSelf, fetchLists, hasMoreLists, isLoadingMore.lists, targetUser, listsPage]);

  // Trigger lazy load when tab changes
  useEffect(() => {
    if (activeTab) {
      loadTabData(activeTab);
      // Reset cross-tab filters when navigating away to prevent state leakage
      setArchiveSieve('all');
      setLedgerSearch('');
      setLedgerRatingFilter('all');
      setWatchlistSearch('');
      setWatchlistSort('default');
      setPhysicalFilter(null);
    }
  }, [activeTab, loadTabData]);

  useEffect(() => { setLoading(true); fetchUserData().finally(() => setLoading(false)); }, [fetchUserData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await fetchUserData();
    
    // Force reload lazy tabs if they are currently active
    if (activeTab && activeTab !== 'archive' && activeTab !== 'ledger') {
      setTabDataLoaded(prev => ({ ...prev, [activeTab]: false }));
      await loadTabData(activeTab);
    }
    
    setRefreshing(false);
  }, [fetchUserData, activeTab, loadTabData]);

  const [followLoading, setFollowLoading] = useState(false);
  const toggleFollow = useCallback(async () => {
    if (!isAuthenticated) return router.push('/login' as any);
    if (followLoading) return; // Guard against double-taps
    setFollowLoading(true);

    // Optimistic UI for Followers Count
    setTargetUser((prev) => {
      if (!prev) return prev;
      const current = prev.followers_count || 0;
      const nextCount = isFollowing ? Math.max(0, current - 1) : current + 1;
      return { ...prev, followers_count: nextCount };
    });

    try {
      if (isFollowing) { await unfollowUser(username); } else { await followUser(username); }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      // Revert optimism on failure
      setTargetUser((prev) => {
        if (!prev) return prev;
        const current = prev.followers_count || 0;
        const nextCount = isFollowing ? current + 1 : Math.max(0, current - 1);
        return { ...prev, followers_count: nextCount };
      });
    } finally {
      setFollowLoading(false);
    }
  }, [isAuthenticated, isFollowing, username, followUser, unfollowUser, followLoading, router]);

  // ── Computed Values ──
  const tier = targetUser?.role ?? targetUser?.tier ?? 'free';
  const isArchivistPlus = ['archivist', 'auteur'].includes(tier);
  const isPrivate = targetUser?.is_social_private && !isSelf && !isFollowing;

  // Real-time synchronization for self-profile
  const displayLogs = isSelf ? (myLogs as unknown as ProfileLog[]) : logs;
  const displayWatchlist = isSelf ? (myWatchlist as unknown as ProfileWatchlistItem[]) : watchlist;
  const displayVault = isSelf ? (myVault as unknown as ProfileVaultItem[]) : vault;
  const displayLists = isSelf ? (myLists as unknown as ProfileList[]) : lists;

  const totalFilms = isSelf ? Math.max(counts.logs, displayLogs.length) : (counts.logs || displayLogs.length);

  // Stats level — matches web's cineStats computation exactly
  const statsLevel = totalFilms > 50 ? 'THE ORACLE' : totalFilms > 20 ? 'MIDNIGHT DEVOTEE' : totalFilms > 5 ? 'THE REGULAR' : 'FIRST REEL';
  const statsColor = totalFilms > 50 ? colors.sepia : totalFilms > 20 ? colors.bloodReel : colors.flicker;
  const statsProgress = (totalFilms % 20) * 5;

  // Daily streak
  const streak = useMemo(() => {
    const dates = new Set<string>();
    const sourceLogs = analyticsLogs.length > 0 ? analyticsLogs : displayLogs;
    for (const log of sourceLogs) {
      const d = log.watchedDate ?? log.createdAt;
      if (d) dates.add(new Date(d).toISOString().slice(0, 10));
    }
    let count = 0;
    const now = new Date();
    for (let i = 0; i < 365; i++) {
      const check = new Date(now);
      check.setDate(check.getDate() - i);
      const key = check.toISOString().slice(0, 10);
      if (dates.has(key)) count++;
      else if (i === 0) continue;
      else break;
    }
    return count;
  }, [displayLogs, analyticsLogs]);

  // Archive filtering
  const archiveFiltered = useMemo(() => {
    if (archiveSieve === 'all') return displayLogs;
    return displayLogs.filter(l => l.status === archiveSieve);
  }, [displayLogs, archiveSieve]);

  // Ledger filtering (rated/reviewed only)
  const ledgerFiltered = useMemo(() => {
    return displayLogs.filter(log => {
      if (!log.poster && !log.altPoster) return false;
      if (!log.rating && !log.review) return false;
      if (ledgerRatingFilter !== 'all' && log.rating !== ledgerRatingFilter) return false;
      if (ledgerSearch.trim() && !(log.title || '').toLowerCase().includes(ledgerSearch.toLowerCase())) return false;
      return true;
    });
  }, [displayLogs, ledgerSearch, ledgerRatingFilter]);

  // Half-Life tracking
  const halfLifeMap = useMemo(() => {
    const byFilm: Record<number, { rating: number; date: string }[]> = {};
    for (const log of displayLogs) {
      if (!log.filmId || !log.rating) continue;
      if (!byFilm[log.filmId]) byFilm[log.filmId] = [];
      byFilm[log.filmId].push({ rating: log.rating, date: log.watchedDate ?? log.createdAt ?? new Date().toISOString() });
    }
    const result: Record<number, HalfLifeEntry> = {};
    for (const [filmId, entries] of Object.entries(byFilm)) {
      if (entries.length < 2) continue;
      const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const first = sorted[0].rating, last = sorted[sorted.length - 1].rating;
      result[Number(filmId)] = { count: sorted.length, trajectory: last > first ? 'ASCENDING' : last < first ? 'DECAYING' : 'ETERNAL', delta: last - first };
    }
    return result;
  }, [displayLogs]);

  // Watchlist filtering
  const watchlistFiltered = useMemo(() => {
    let result = [...displayWatchlist];
    if (watchlistSearch.trim()) {
      const q = watchlistSearch.toLowerCase();
      result = result.filter(f => (f.title ?? '').toLowerCase().includes(q));
    }
    if (watchlistSort === 'az') result.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
    else if (watchlistSort === 'za') result.sort((a, b) => (b.title ?? '').localeCompare(a.title ?? ''));
    return result;
  }, [displayWatchlist, watchlistSearch, watchlistSort]);

  // Physical archive filtering
  const physicalFiltered = useMemo(() => {
    if (!physicalFilter) return displayVault;
    return displayVault.filter((item: ProfileVaultItem) => item.formats?.includes(physicalFilter));
  }, [displayVault, physicalFilter]);

  const physicalFormatCounts = useMemo(() => {
    const FORMATS = [
      { id: '4k', label: '4K UHD', color: '#a855f7' }, { id: 'bluray', label: 'Blu-ray', color: '#3b82f6' },
      { id: 'dvd', label: 'DVD', color: '#f59e0b' }, { id: 'vhs', label: 'VHS', color: '#ef4444' },
      { id: 'laserdisc', label: 'LaserDisc', color: '#10b981' }, { id: 'steelbook', label: 'Steelbook', color: '#6366f1' },
      { id: 'criterion', label: 'Criterion', color: colors.sepia },
    ];
    return FORMATS.map(f => ({ ...f, count: displayVault.filter((item: ProfileVaultItem) => item.formats?.includes(f.id)).length })).filter(f => f.count > 0);
  }, [displayVault]);

  // Group by month helper
  const groupByMonth = useCallback((items: ProfileLog[] | ProfileVaultItem[], dateKey = 'watchedDate') => {
    const grouped: Record<string, (ProfileLog | ProfileVaultItem)[]> = {};
    for (const item of items) {
      const d = new Date((item as any)[dateKey] || item.createdAt || new Date().toISOString());
      const title = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
      if (!grouped[title]) grouped[title] = [];
      grouped[title].push(item);
    }
    return grouped;
  }, []);

  // Social links parsing (matches web exactly)
  const socialLinks = useMemo(() => {
    const raw = targetUser?.social_links ?? [];
    if (Array.isArray(raw)) return raw.filter((l: SocialLink) => l.url && l.url.trim());
    if (typeof raw === 'object') {
      return Object.entries(raw)
        .filter(([, v]) => v && (v as string).trim())
        .map(([k, v]) => ({ title: k.charAt(0).toUpperCase() + k.slice(1), url: v as string }));
    }
    return [] as SocialLink[];
  }, [targetUser]);

  // Legacy JS interpolations removed for native thread performance

  // ── Collection Cards (use server-side counts for instant display, zero data transfer) ──
  const COLLECTION_CARDS = useMemo(() => [
    { id: 'archive' as ProfileTab, label: 'Archive', desc: 'WATCHED', count: totalFilms, Icon: Archive, disabled: false, highlight: false },
    { id: 'ledger' as ProfileTab, label: 'The Ledger', desc: 'DIARY', count: isSelf ? Math.max(counts.ledger, displayLogs.filter(l => l.rating > 0 || (l.review && l.review.length > 0)).length) : (counts.ledger || displayLogs.filter(l => l.rating > 0 || (l.review && l.review.length > 0)).length), Icon: BookOpen, disabled: false, highlight: false },
    { id: 'watchlist' as ProfileTab, label: 'Watchlist', desc: 'TO SEE', count: isSelf ? Math.max(counts.watchlist, displayWatchlist.length) : (counts.watchlist || displayWatchlist.length), Icon: Bookmark, disabled: false, highlight: false },
    { id: 'lists' as ProfileTab, label: 'Stacks', desc: 'LISTS', count: isSelf ? Math.max(counts.lists, displayLists.length) : (counts.lists || displayLists.length), Icon: LayoutList, disabled: false, highlight: false },
    { id: 'physical' as ProfileTab, label: 'Physical Archive', desc: 'COLLECTION', count: isArchivistPlus ? (isSelf ? Math.max(counts.vault, displayVault.length) : (counts.vault || displayVault.length)) : 0, Icon: Disc, disabled: !isArchivistPlus, highlight: false },
    { id: 'projector' as ProfileTab, label: 'Analytics', desc: 'PROJECTOR', count: 0, Icon: LineChart, disabled: false, highlight: true },
  ], [counts, displayLogs, displayWatchlist.length, displayLists.length, displayVault.length, isArchivistPlus, isSelf, totalFilms]);

  // ════════════════════════════════════════════════════════════
  // POSTER CARD — Reusable log poster with tier glow
  // ════════════════════════════════════════════════════════════
  const renderPosterCard = useCallback((item: ProfileLog | ProfileVaultItem | ProfileWatchlistItem, width: number, showRating = false, showTimeAgo = false, navigateToLog = false) => {
    const log = item as any;
    const posterUri = tmdb.poster(log.altPoster ?? log.poster ?? log.poster_path, 'w185');
    const glowStyle = tier === 'auteur' ? s.auteurGlow : tier === 'archivist' ? s.archivistGlow : {};
    return (
      <PressableScale
        key={log.id ?? log.filmId ?? log.film_id}
        style={[{ aspectRatio: 2 / 3, position: 'relative' }, width > 0 ? { width } : { flex: 1 }, isArchivistPlus ? glowStyle : {}]}
        onPress={() => {
          if (navigateToLog && log.id) {
            router.push(`/log/${log.id}` as any);
          } else {
            const fid = log.filmId ?? log.film_id;
            if (fid) router.push(`/film/${fid}` as any);
          }
        }}
        haptic
      >
        {posterUri ? (
          <Image source={{ uri: posterUri }} style={s.posterImg} cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={200} />
        ) : (
          <View style={[s.posterImg, s.posterPlaceholder]}>
            <FilmIcon size={18} color={colors.sepia} strokeWidth={1} />
          </View>
        )}
        {/* Bottom gradient overlay */}
        {(showRating || showTimeAgo) && (
          <View style={s.posterBottomGrad}>
            {showRating && log.rating > 0 && (
              <View style={s.posterRatingRow}>
                <ReelRating rating={log.rating} size={10} />
              </View>
            )}
            {showTimeAgo && (
              <Text style={s.posterTimeAgo}>{timeAgo(log.watchedDate ?? log.createdAt)}</Text>
            )}
          </View>
        )}
        {/* Status badges */}
        {log.status === 'rewatched' && <View style={s.statusBadge}><Sparkles size={7} color={colors.sepia} strokeWidth={1.5} /></View>}
        {log.status === 'abandoned' && (
          <View style={[s.statusBadge, s.statusBadgeAbandoned]}>
            <X size={7} color={colors.bloodReel} strokeWidth={2} />
          </View>
        )}
      </PressableScale>
    );
  }, [tier, isArchivistPlus, router]);

  // ════════════════════════════════════════════════════════════
  // EARLY RETURNS
  // ════════════════════════════════════════════════════════════
  if (loading) return (
    <View style={[s.container, s.centeredFull]}>
      <View style={s.loadingRow}>
        <Sparkles size={9} color={colors.sepia} strokeWidth={1.5} />
        <Text style={s.loadingText}>RETRIEVING DOSSIER</Text>
        <Sparkles size={9} color={colors.sepia} strokeWidth={1.5} />
      </View>
    </View>
  );

  if (!targetUser) return (
    <View style={[s.container, s.centeredPadded]}>
      <FilmIcon size={48} color={colors.sepia} strokeWidth={1} style={s.notFoundIcon} />
      <Text style={s.notFoundTitle}>Member Not Found</Text>
      {/* eslint-disable-next-line react/no-unescaped-entities */}
      <Text style={s.notFoundBody}>This member doesn't exist yet, or has been removed.</Text>
      <PressableScale style={s.ghostBtn} onPress={handleBack} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic>
        <View style={s.ghostBtnRow}>
          <ArrowLeft size={12} color={colors.bone} strokeWidth={1.5} />
          <Text style={s.ghostBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>GO BACK</Text>
        </View>
      </PressableScale>
    </View>
  );

  // Privacy gate
  if (isPrivate) return (
    <View style={[s.container, s.centeredPadded]}>
      <Lock size={48} color={colors.sepia} strokeWidth={1} style={s.notFoundIcon} />
      <Text style={s.notFoundTitle}>@{targetUser.username?.toUpperCase()}</Text>
      <Text style={s.privateBody}>
        This profile is private. Only the owner can view their activity.
      </Text>
      {isAuthenticated && (
        <PressableScale style={s.primaryBtn} onPress={toggleFollow} accessibilityRole="button" accessibilityLabel="Follow to view profile" pressedScale={0.92} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="medium">
          <Text style={s.primaryBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>FOLLOW TO VIEW</Text>
        </PressableScale>
      )}
    </View>
  );



  // ════════════════════════════════════════════════════════════
  // TAB PAGE MODE
  // ════════════════════════════════════════════════════════════
  if (activeTab) {
    return (
      <View style={s.container}>
        {/* ── Tab Header ── */}
        <View style={[s.tabPageHeader, { paddingTop: Math.max(insets.top + 10, 40) }]}>
          <PressableScale onPress={() => router.push(`/user/${username}` as any)} style={s.topNavBtn} accessibilityRole="button" accessibilityLabel="Back to profile" hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} haptic>
            <ChevronLeft size={22} color={colors.sepia} />
          </PressableScale>
          <View style={s.tabHeaderTextWrap}>
            <Text style={s.tabHeaderUsername} adjustsFontSizeToFit numberOfLines={1}>@{username}</Text>
            <Text style={s.tabHeaderTitle} accessibilityRole="header" adjustsFontSizeToFit numberOfLines={1}>{TAB_TITLES[activeTab] ?? activeTab}</Text>
          </View>
        </View>

        {['archive', 'ledger', 'watchlist', 'lists', 'physical'].includes(activeTab) ? (
          <View style={{ flex: 1 }}>
            {/* ═══ ARCHIVE TAB ═══ */}
            {activeTab === 'archive' && (
              <ProfileArchiveTab
                logs={displayLogs}
                isSelf={isSelf}
                archiveSieve={archiveSieve}
                setArchiveSieve={setArchiveSieve}
                archiveFiltered={archiveFiltered}
                renderPosterCard={renderPosterCard as any}
                groupByMonth={groupByMonth as any}
                POSTER_COL_4={POSTER_COL_4}
                onLoadMore={loadMoreLogs}
                isLoadingMore={isSelf ? filmStore._fetchingLogs : isLoadingMore.logs}
              />
            )}

            {/* ═══ LEDGER TAB ═══ */}
            {activeTab === 'ledger' && (
              <ProfileLedgerTab
                logs={displayLogs}
                ledgerSearch={ledgerSearch}
                setLedgerSearch={setLedgerSearch}
                ledgerRatingFilter={ledgerRatingFilter}
                setLedgerRatingFilter={setLedgerRatingFilter}
                ledgerFiltered={ledgerFiltered}
                halfLifeMap={halfLifeMap}
                renderPosterCard={renderPosterCard as any}
                groupByMonth={groupByMonth as any}
                POSTER_COL_4={POSTER_COL_4}
                onLoadMore={loadMoreLogs}
                isLoadingMore={isSelf ? filmStore._fetchingLogs : isLoadingMore.logs}
                isSelf={isSelf}
              />
            )}

            {/* ═══ WATCHLIST TAB ═══ */}
            {activeTab === 'watchlist' && (
              <ProfileWatchlistTab
                watchlist={displayWatchlist}
                watchlistFiltered={watchlistFiltered}
                isSelf={isSelf}
                watchlistSearch={watchlistSearch}
                setWatchlistSearch={setWatchlistSearch}
                watchlistSort={watchlistSort}
                setWatchlistSort={setWatchlistSort}
                setRouletteOpen={setRouletteOpen}
                renderPosterCard={renderPosterCard as any}
                POSTER_COL_3={POSTER_COL_3}
                onLoadMore={loadMoreWatchlist}
                isLoadingMore={isSelf ? filmStore._fetchingWatchlist : isLoadingMore.watchlist}
              />
            )}

            {/* ═══ STACKS/LISTS TAB ═══ */}
            {activeTab === 'lists' && (
              <ProfileListsTab 
                lists={displayLists} 
                onLoadMore={loadMoreLists}
                isLoadingMore={isSelf ? filmStore._fetchingLists : isLoadingMore.lists}
                hasMore={isSelf ? filmStore.listsHasMore : hasMoreLists}
                isSelf={isSelf}
              />
            )}

            {/* ═══ PHYSICAL ARCHIVE TAB ═══ */}
            {activeTab === 'physical' && (
              <ProfilePhysicalTab
                isSelf={isSelf}
                vault={displayVault}
                physicalFilter={physicalFilter}
                setPhysicalFilter={setPhysicalFilter}
                physicalFormatCounts={physicalFormatCounts}
                physicalFiltered={physicalFiltered}
                groupByMonth={groupByMonth as any}
                onLoadMore={loadMoreVault}
                isLoadingMore={isSelf ? false : isLoadingMore.vault}
                hasMore={isSelf ? false : hasMoreVault}
              />
            )}
          </View>
        ) : (
          <ScrollView contentContainerStyle={[s.tabScrollContent, { paddingBottom: Math.max(insets.bottom + 80, 80) }]} showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} />}>
            {/* ═══ PASSPORT TAB ═══ */}
            {activeTab === 'passport' && <View style={s.tabContentPad}><NoirPassport {...{user: targetUser, logs: analyticsLogs.length > 0 ? analyticsLogs : displayLogs} as any} /></View>}

            {/* ═══ CALENDAR TAB ═══ */}
            {activeTab === 'calendar' && (
              <View style={s.tabContentPad}>
                <NitrateCalendarGrid logs={(analyticsLogs.length > 0 ? analyticsLogs : displayLogs) as any} isSelf={isSelf} />
              </View>
            )}

            {/* ═══ PROJECTOR / ANALYTICS TAB ═══ */}
            {activeTab === 'projector' && (
              <View style={s.projectorGap}>
                {/* Header */}
                <View style={s.projectorHeader}>
                  <Text style={s.projectorSuper}>GLOBAL ANALYTICS</Text>
                  <Text style={s.projectorTitle}>The Projector Room</Text>
                  <Text style={s.projectorSub}>Lifetime cinematic data & achievements.</Text>
                </View>

                {/* Cinema DNA CTA */}
                <View style={s.tabContentPad}>
                  <PressableScale style={s.ctaBtn} onPress={() => setDnaCardOpen(true)} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic>
                    <View style={s.ctaBtnRow}>
                      <Dna size={12} color={colors.sepia} strokeWidth={1.5} />
                      <Text style={s.ctaBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>VIEW CINEMA DNA</Text>
                    </View>
                  </PressableScale>
                </View>

                {/* Projector Room */}
                <ProjectorRoom stats={{ count: totalFilms, level: statsLevel, color: statsColor, progress: statsProgress }} user={targetUser} />

                <View style={s.projectorSectionsWrap}>
                  {/* Taste DNA */}
                  <View>
                    <SectionLabel text="TASTE FINGERPRINT" />
                    <TasteDNA logs={displayLogs as any} username={targetUser?.username || username} />
                  </View>

                  {/* Cinematic Insights */}
                  <View>
                    <SectionLabel text="REAL ANALYTICS" />
                    <CinematicInsights {...{logs: displayLogs} as any} />
                  </View>

                  {/* Society Honors */}
                  <View>
                    <SectionLabel text="SOCIETY HONORS" />
                    <Achievements {...{logs: analyticsLogs.length > 0 ? analyticsLogs : displayLogs} as any} />
                  </View>

                  {/* Your Favourites */}
                  {displayLogs.filter((l: ProfileLog) => l.rating >= 4).length > 0 && (
                    <View>
                      <SectionLabel text="HIGHEST RATED" />
                      <View style={s.card}>
                        {displayLogs.filter((l: ProfileLog) => l.rating >= 4).slice(0, 6).map((log: ProfileLog) => {
                          const posterUri = tmdb.poster(log.poster, 'w185');
                          return (
                            <PressableScale key={log.id} style={s.favouriteRow} onPress={() => log.filmId && router.push(`/film/${log.filmId}` as any)} haptic>
                              {posterUri && <Image source={{ uri: posterUri }} style={s.favPosterThumb} transition={50} cachePolicy="memory-disk" />}
                              <View style={s.favTextWrap}>
                                <Text style={s.favTitle} numberOfLines={1}>{log.title}</Text>
                                <View style={s.favRatingRow}>
                                  <ReelRating rating={log.rating} size={10} />
                                </View>
                              </View>
                            </PressableScale>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Passport */}
                  <View>
                    <SectionLabel text="CINEMATIC PASSPORT" />
                    <NoirPassport {...{user: targetUser, logs: analyticsLogs.length > 0 ? analyticsLogs : displayLogs} as any} />
                  </View>

                  {/* Taste Match (other users only) */}
                  {!isSelf && myLogs.length >= 5 && (
                    <TasteMatch {...{myLogs, theirLogs: displayLogs, theirUsername: targetUser.username} as any} />
                  )}

                  {/* Programmes */}
                  <ProgrammesSection programmes={(targetUser?.preferences as any)?.programmes ?? []} user={targetUser as any} uniqueFilms={displayLogs.map((l: any) => ({ id: l.filmId || l.film_id, title: l.title, poster_path: l.poster || l.poster_path || '' })) as any} isOwnProfile={isSelf} />
                </View>
              </View>
            )}

            {/* ═══ CALENDAR TAB ═══ */}
            {activeTab === 'calendar' && (
              <View style={s.tabContentPad}>
                {isArchivistPlus ? (
                  <View>
                    <SectionLabel text="VIEWING HISTORY" />
                    <NitrateCalendarGrid {...{logs: analyticsLogs.length > 0 ? analyticsLogs : displayLogs, isSelf} as any} />
                  </View>
                ) : (
                  <View style={s.emptyState}>
                    <Lock size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
                    <Text style={s.emptyTitle}>Archivist+ Feature</Text>
                    <Text style={s.emptyDesc}>Upgrade to Archivist or Auteur to unlock the viewing calendar.</Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        )}

        {dnaCardOpen && <CinemaDNACard {...{logs: analyticsLogs.length > 0 ? analyticsLogs : displayLogs, user: targetUser, onClose: () => setDnaCardOpen(false)} as any} />}
        <WatchlistRoulette visible={rouletteOpen} watchlist={displayWatchlist} onClose={() => setRouletteOpen(false)} onSelect={(id: number) => { setRouletteOpen(false); router.push(`/film/${id}` as any); }} />
      </View>
    );
  }

  // ════════════════════════════════════════════════════════════
  // PROFILE MODE — Main profile view
  // ════════════════════════════════════════════════════════════
  return (
    <View style={s.container}>
      {/* Back button (only when navigated to, not on own tab) */}
      {!usernameOverride && (
        <View style={[s.topNav, { paddingTop: Math.max(insets.top + 10, 40) }]}>
          <PressableScale onPress={handleBack} style={s.topNavBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} haptic>
            <ChevronLeft size={24} color={colors.parchment} strokeWidth={1.5} />
          </PressableScale>
        </View>
      )}

      <ScrollView contentContainerStyle={[s.mainScrollContent, { paddingBottom: Math.max(insets.bottom + 60, 60) }]} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} />}>

        {/* ═══ ATMOSPHERIC HEADER ═══ */}
        <View style={s.headerWrap}>
          {/* Tier-specific backdrop rendering */}
          {tier === 'auteur' ? (
            <ProfileBackdrop {...{user: targetUser, logs: displayLogs} as any} />
          ) : tier === 'archivist' ? (
            <View style={s.headerArchivistBase}>
               <LinearGradient colors={['rgba(196,150,26,0.15)', 'rgba(10,8,5,0.95)', colors.ink]} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFillObject} />
               <AnimatedView style={[StyleSheet.absoluteFillObject, pulseStyle]} pointerEvents="none">
                 <LinearGradient colors={['rgba(196,150,26,0.1)', 'transparent']} style={StyleSheet.absoluteFillObject} />
               </AnimatedView>
            </View>
          ) : (
            <View style={s.headerDarkBase} />
          )}

          {/* Projector spotlight — dynamic per tier */}
          <View style={[s.projectorSpotlight, tier === 'auteur' && s.spotlightAuteur, tier === 'archivist' && s.spotlightArchivist]} />

          {/* Film grain texture overlay */}
          <View style={s.filmGrainOverlay} />

          {/* Bottom structural edge */}
          <View style={s.headerGoldEdge} />

          {/* ── Header Content ── */}
          <View style={s.headerContent}>

            {/* ── Avatar with Tier-Specific Enclosure ── */}
            <View style={s.avatarWrap}>
              <AnimatedView style={[
                s.avatarRing, 
                tier === 'auteur' ? s.avatarRingAuteur : tier === 'archivist' ? s.avatarRingArchivist : s.avatarRingCinephile,
                pulseStyle
              ]}>
                {targetUser.avatar_url ? (
                  <Image source={{ uri: targetUser.avatar_url }} style={s.avatar} cachePolicy="memory-disk" />
                ) : (
                  <View style={[s.avatar, s.avatarPlaceholder]}>
                    <Text style={s.avatarInitial}>{(targetUser.username || '?')[0].toUpperCase()}</Text>
                  </View>
                )}
              </AnimatedView>

              {/* Level badge */}
              <View style={[s.levelBadge, { borderColor: statsColor }]}>
                <View style={s.levelBadgeRow}>
                  <Sparkles size={7} color={statsColor} strokeWidth={1.5} />
                  <Text style={[s.levelBadgeText, { color: statsColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{statsLevel}</Text>
                </View>
              </View>
            </View>

            {/* ── Username + Tier Badge ── */}
            <View style={s.usernameRow}>
              <Text style={s.displayName} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.5}>@{targetUser.username.toUpperCase()}</Text>
              {tier === 'auteur' && (
                <View style={s.auteurBadge}>
                  <Star size={9} color={'#FFB3B3'} fill={'#FFB3B3'} />
                  <Text style={s.auteurBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>AUTEUR</Text>
                </View>
              )}
              {tier === 'archivist' && (
                <View style={s.archivistBadge}>
                  <Archive size={8} color={'#F2ECD8'} strokeWidth={1.5} />
                  <Text style={s.archivistBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>ARCHIVIST</Text>
                </View>
              )}
            </View>

            {/* ── Society Founder's Mark ── */}
            <View style={s.founderMark}>
              <View style={s.founderLine} />
              <Text style={s.founderText}>EST. 1924</Text>
              <View style={s.founderLine} />
            </View>

            {/* ── Member Since ── */}
            {targetUser.created_at && (
              <Text style={s.memberSince}>
                MEMBER SINCE {new Date(targetUser.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()}
              </Text>
            )}

            {/* ── Bio ── */}
            <Text style={s.bio} numberOfLines={4} adjustsFontSizeToFit>
              {targetUser.bio || (isSelf ? "No bio yet. Tell the society who you are." : "No bio on file.")}
            </Text>

            {/* ── Social Links ── */}
            {socialLinks.length > 0 && (
              <View style={s.socialLinksRow}>
                {socialLinks.map((link: SocialLink, i: number) => (
                  <PressableScale key={i} style={s.socialLinkChip} onPress={() => openSocialLink(link.url)} haptic>
                    <Globe size={10} color={colors.fog} />
                    <Text style={s.socialLinkText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{(link.title || '').toUpperCase()}</Text>
                  </PressableScale>
                ))}
              </View>
            )}

            {/* ── Follow / Edit Buttons ── */}
            {isSelf ? (
              <View style={s.editRow}>
                <PressableScale style={s.editBtn} onPress={navToEditProfile} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic accessibilityRole="button" accessibilityLabel="Edit profile">
                  <Text style={s.editBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>EDIT PROFILE</Text>
                </PressableScale>
                <PressableScale style={s.settingsBtn} onPress={navToSettings} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic accessibilityRole="button" accessibilityLabel="Open settings">
                  <Settings size={14} color={colors.fog} />
                </PressableScale>
              </View>
            ) : (
              <PressableScale style={[s.followBtn, isFollowing && s.followingBtn, followLoading && { opacity: 0.5 }]} onPress={toggleFollow} disabled={followLoading} pressedScale={0.92} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="medium" accessibilityRole="button" accessibilityLabel={isFollowing ? "Unfollow user" : "Follow user"}>
                <AnimatedRN.Text entering={FadeIn.duration(300)} style={[s.followBtnText, isFollowing && s.followingBtnText]} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.75}>
                  {followLoading ? '...' : isFollowing ? 'SYNDICATED' : '+ FOLLOW'}
                </AnimatedRN.Text>
              </PressableScale>
            )}

            {/* ── Stats Row ── */}
            <View style={s.statsGrid}>
              <StatCard label="FILMS" value={totalFilms} />
              <StatCard label="FOLLOWERS" value={targetUser.followers_count || 0} onPress={navToFollowers} />
              <StatCard label="FOLLOWING" value={targetUser.following_count || 0} onPress={navToFollowing} />
              <StatCard label="WATCHLIST" value={counts.watchlist} isLast />
            </View>

            {/* ── Streak ── */}
            {streak > 1 && (
              <View style={s.streakBadge}>
                <Flame size={10} color={colors.sepia} strokeWidth={1.5} />
                <Text style={s.streakText}>{streak}-DAY STREAK</Text>
              </View>
            )}

            {/* ── Favorite Films Triptych ── */}
            <View style={s.triptychWrap}>
              <SectionLabel text="FAVORITE FILMS" />
              <ProfileTriptych user={targetUser} isOwnProfile={isSelf} userRole={tier} />
            </View>

            {/* ── Recently Watched ── */}
            {(() => {
              const recentLogs = displayLogs.filter((l: ProfileLog) => l.poster && l.poster.length > 5).slice(0, 3);
              if (recentLogs.length === 0) return null;
              return (
                <View style={s.triptychWrapRecent}>
                  <GoldDivider />
                  <SectionLabel text="RECENTLY WATCHED" />
                  <View style={s.recentRow}>
                    {recentLogs.map((log: ProfileLog) => (
                      <View key={log.id} style={s.recentItem}>
                        {renderPosterCard(log, 0, true, true)}
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()}
          </View>
        </View>

        {/* ═══ OPAQUE CONTENT AREA ═══ */}
        <View style={s.contentArea}>

          {/* ── Society Seal ── */}
          <View style={s.societySealWrap}>
            <View style={s.sealLine} />
            <View style={s.sealCenter}>
              <FilmIcon size={14} color={colors.sepia} strokeWidth={1} />
              <Text style={s.sealText}>THE REELHOUSE SOCIETY</Text>
            </View>
            <View style={s.sealLine} />
          </View>

          <SectionDivider label="COLLECTION" />

          {/* ── Collection Grid ── */}
          <View style={s.collectionSection}>
            <SectionLabel text="THE COLLECTION" />
            <View style={s.collectionGrid}>
              {COLLECTION_CARDS.map((item, idx) => (
                <View key={item.id}>
                <PressableScale
                  style={[s.collectionCard, item.disabled && s.collectionCardDisabled, item.highlight && s.collectionCardHighlight]}
                  disabled={item.disabled}
                  onPress={() => router.push({ pathname: `/user/${username}`, params: { tab: item.id } } as any)}
                  haptic
                >
                  {/* Icon circle */}
                  <View style={[s.collectionIconCircle, item.highlight && s.collectionIconHighlight]}>
                    <item.Icon size={16} strokeWidth={1.5} color={item.highlight ? colors.sepia : colors.bone} />
                  </View>
                  {/* Label */}
                  <Text style={[s.collectionCardLabel, item.highlight && s.collectionHighlightText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{item.label}</Text>
                  {/* Description */}
                  <Text style={s.collectionCardDesc} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{item.desc}</Text>
                  {/* Count */}
                  <Text style={[s.collectionCardCount, item.highlight && s.collectionHighlightText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{item.count}</Text>
                </PressableScale>
                </View>
              ))}
            </View>
          </View>

          {/* Calendar card for Archivist+ */}
          {isSelf && (
            <View style={s.calendarCtaWrap}>
              <PressableScale
                style={[s.collectionCardWide, !isArchivistPlus && s.collectionCardDisabled]}
                disabled={!isArchivistPlus}
                onPress={navToCalendar}
                haptic
              >
                {!isArchivistPlus && <Lock size={12} color={colors.fog} strokeWidth={1.5} style={s.lockIconMr} />}
                {isArchivistPlus && <CalendarDays size={12} color={colors.sepia} strokeWidth={1.5} style={s.lockIconMr} />}
                {/* eslint-disable-next-line react/no-unescaped-entities */}
                <Text style={[s.calendarCtaText, isArchivistPlus && s.collectionHighlightText]}>THE AUTEUR'S CALENDAR</Text>
              </PressableScale>
            </View>
          )}

          {/* ── Account & Settings (self only) ── */}
          {isSelf && (
            <View style={s.accountSection}>
              <SectionDivider label="ACCOUNT & SETTINGS" />
              <PressableScale style={s.accountRow} onPress={navToMembership} haptic>
                <Crown size={13} color={colors.sepia} strokeWidth={1.5} />
                <Text style={s.accountRowText}>THE SOCIETY RANKS</Text>
              </PressableScale>
              <PressableScale style={[s.accountRow, s.accountRowLast]} onPress={navToSettings} haptic>
                <Settings size={13} color={colors.sepia} strokeWidth={1.5} />
                <Text style={s.accountRowText}>SETTINGS & PROFILE</Text>
              </PressableScale>
            </View>
          )}
        </View>
      </ScrollView>

        {dnaCardOpen && <CinemaDNACard {...{logs: analyticsLogs.length > 0 ? analyticsLogs : displayLogs, user: targetUser, onClose: closeDnaCard} as any} />}
        <WatchlistRoulette visible={rouletteOpen} watchlist={displayWatchlist} onClose={closeRoulette} onSelect={onRouletteSelect} />
    </View>
  );
}

// ════════════════════════════════════════════════════════════
// STYLES — Nitrate Noir Design System
// ════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },

  // ── Top Navigation ──
  topNav: { paddingTop: 56, paddingHorizontal: 16, paddingBottom: 8, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  topNavBtn: { width: 40, height: 40, justifyContent: 'center' },

  // ── Tab Page Header ──
  tabPageHeader: {
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(8,6,4,0.98)',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,105,20,0.15)',
  },

  // ── Atmospheric Header ──
  headerWrap: {
    position: 'relative', overflow: 'hidden',
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.15)',
  },
  headerDarkBase: {
    ...StyleSheet.absoluteFillObject, zIndex: 0,
    backgroundColor: colors.ink,
  },
  headerArchivistBase: {
    ...StyleSheet.absoluteFillObject, zIndex: 0,
    backgroundColor: colors.ink,
  },
  projectorSpotlight: {
    position: 'absolute', top: -40, left: '10%', right: '10%', height: 300,
    backgroundColor: 'rgba(139,105,20,0.12)',
    borderRadius: 200, zIndex: 1, opacity: 0.7,
  },
  spotlightAuteur: { backgroundColor: 'rgba(180,45,45,0.15)', height: 400 },
  spotlightArchivist: { backgroundColor: 'rgba(196,150,26,0.15)', height: 350 },
  filmGrainOverlay: {
    ...StyleSheet.absoluteFillObject, zIndex: 2, opacity: 0.03,
    backgroundColor: 'rgba(139,105,20,0.05)',
  },
  headerGoldEdge: {
    position: 'absolute', bottom: 0, left: '5%', right: '5%', height: 1.5,
    backgroundColor: 'rgba(139,105,20,0.3)', zIndex: 3,
  },
  headerContent: {
    position: 'relative', zIndex: 4,
    alignItems: 'center', paddingHorizontal: 20, paddingTop: 120, paddingBottom: 28,
  },

  // ── Avatar ──
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatarRing: {
    width: 116, height: 116, borderRadius: 58, 
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', 
    backgroundColor: '#050402',
  },
  avatarRingAuteur: {
    borderWidth: 3, borderColor: '#8B1A1A', // Auteur Ruby
    ...effects.shadowPrimary, shadowColor: '#8B1A1A', shadowRadius: 15,
  },
  avatarRingArchivist: {
    borderWidth: 3, borderColor: '#C4961A', // Archivist Champagne Gold
    ...effects.shadowSurface, shadowColor: '#C4961A', shadowRadius: 10,
  },
  avatarRingCinephile: {
    borderWidth: 2, borderColor: colors.soot,
  },
  avatar: { width: 108, height: 108, borderRadius: 54 },

  // ── Level Badge ──
  levelBadge: {
    position: 'absolute', bottom: -8, alignSelf: 'center',
    backgroundColor: '#050402', paddingHorizontal: 14, paddingVertical: 4,
    borderWidth: 1.5, borderRadius: 4, zIndex: 5, borderColor: 'rgba(139,105,20,0.5)',
    ...effects.shadowSurface,
  },
  levelBadgeText: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 3, fontWeight: '700' },

  // ── Display Name ──
  displayName: {
    fontFamily: fonts.display, fontSize: 26, color: '#F2ECD8', textAlign: 'center',
    letterSpacing: 2, ...effects.textGlowSepia, textShadowRadius: 12,
  },

  // ── Tier Badges ──
  auteurBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#2A0505', paddingHorizontal: 10, paddingVertical: 4, 
    borderRadius: 4, borderWidth: 1.5, borderColor: '#8B1A1A',
    ...effects.shadowPrimary, shadowColor: '#8B1A1A',
  },
  auteurBadgeText: { fontFamily: fonts.mono, fontWeight: '700', fontSize: 9, letterSpacing: 3, color: '#FFB3B3', ...effects.textGlowSepia, textShadowColor: '#8B1A1A' },
  archivistBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(20,15,10,0.95)', borderWidth: 1.5, borderColor: '#C4961A',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4,
    ...effects.shadowSurface, shadowColor: '#C4961A',
  },
  archivistBadgeText: { fontFamily: fonts.mono, fontWeight: '700', fontSize: 9, letterSpacing: 3, color: '#F2ECD8' },

  // ── Bio ──
  bio: {
    fontFamily: fonts.body, fontSize: 12, color: colors.bone, textAlign: 'center',
    lineHeight: 18, marginTop: 10, paddingHorizontal: 24, fontStyle: 'italic', opacity: 0.85,
  },

  // ── Social Links ──
  socialLinksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 14 },
  socialLinkChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', borderRadius: 3,
  },
  socialLinkText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.5, color: colors.fog },

  // ── Buttons ──
  editBtn: {
    backgroundColor: 'rgba(18,14,9,0.9)', borderWidth: 1.5, borderColor: 'rgba(139,105,20,0.3)',
    borderRadius: 4, paddingVertical: 12, paddingHorizontal: 24, ...effects.shadowSurface,
  },
  editBtnText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 3, color: colors.sepia, fontWeight: '700' },
  settingsBtn: {
    backgroundColor: 'rgba(18,14,9,0.9)', borderWidth: 1.5, borderColor: 'rgba(139,105,20,0.3)',
    borderRadius: 4, paddingVertical: 12, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', ...effects.shadowSurface,
  },
  followBtn: { 
    marginTop: 14, backgroundColor: 'rgba(18,14,9,0.9)', borderWidth: 1.5, borderColor: 'rgba(139,105,20,0.4)', 
    borderRadius: 4, paddingVertical: 14, paddingHorizontal: 32, ...effects.shadowSurface,
  },
  followingBtn: { backgroundColor: 'rgba(5,3,2,0.95)', borderWidth: 1.5, borderColor: 'rgba(139,105,20,0.2)' },
  followBtnText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 3, color: '#F2ECD8', textAlign: 'center', fontWeight: '700', ...effects.textGlowSepia },
  followingBtnText: { color: colors.fog, textShadowRadius: 0 },
  ghostBtn: { paddingVertical: 14, paddingHorizontal: 28, borderWidth: 1.5, borderColor: 'rgba(139,105,20,0.3)', borderRadius: 4, backgroundColor: 'rgba(10,8,5,0.8)' },
  ghostBtnText: { fontFamily: fonts.mono, fontWeight: '700', fontSize: 10, letterSpacing: 3, color: '#F2ECD8' },
  primaryBtn: { backgroundColor: 'rgba(18,14,9,0.9)', borderWidth: 1.5, borderColor: 'rgba(139,105,20,0.4)', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 4, ...effects.shadowSurface },
  primaryBtnText: { fontFamily: fonts.mono, fontWeight: '700', fontSize: 10, letterSpacing: 3, color: '#F2ECD8', ...effects.textGlowSepia },
  ctaBtn: { borderWidth: 1.5, borderColor: 'rgba(139,105,20,0.4)', backgroundColor: 'rgba(14,11,8,0.9)', paddingVertical: 14, alignItems: 'center', borderRadius: 4, marginBottom: 16, ...effects.shadowSurface },
  ctaBtnText: { fontFamily: fonts.mono, fontWeight: '700', fontSize: 10, letterSpacing: 3, color: '#F2ECD8', ...effects.textGlowSepia },

  // ── Stats ──
  statsGrid: { 
    flexDirection: 'row', width: '100%', marginTop: 24, 
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(10,8,5,0.85)',
    borderWidth: 1.5, borderColor: 'rgba(139,105,20,0.15)',
    borderRadius: 6,
    ...effects.shadowSurface,
  },
  statCard: { flex: 1, paddingVertical: 16, paddingHorizontal: 4, alignItems: 'center' },
  statValue: { fontFamily: fonts.mono, fontSize: 18, color: '#F2ECD8', lineHeight: 22, ...effects.textGlowSepia, fontWeight: '700' },
  statLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.5, color: colors.fog, marginTop: 4, opacity: 0.8 },
  statDivider: { width: 1.5, height: 32, backgroundColor: 'rgba(139,105,20,0.15)' },

  // ── Streak ──
  streakBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 12, backgroundColor: 'rgba(196,150,26,0.08)', borderWidth: 1, borderColor: 'rgba(196,150,26,0.2)',
    borderRadius: 2, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'center',
  },
  streakText: { fontFamily: fonts.uiBold, fontSize: 8, letterSpacing: 1.5, color: colors.sepia },

  // ── Section Label ──
  sectionLabelText: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 3.5, color: colors.sepia,
    textAlign: 'center', ...effects.textGlowSepia,
  },

  // ── Gold Divider ──
  goldDivider: { height: 1, backgroundColor: 'rgba(139,105,20,0.2)', marginBottom: 14 },

  // ── Recently Watched poster overlays ──
  posterImg: { width: '100%', height: '100%', borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(139,105,20,0.2)' },
  posterBottomGrad: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.65)', borderBottomLeftRadius: 4, borderBottomRightRadius: 4,
    overflow: 'hidden', flexWrap: 'wrap',
  },
  posterRating: { fontFamily: fonts.uiBold, fontSize: 9, color: colors.sepia },
  posterTimeAgo: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1, color: colors.fog },

  // ── Tier Borders (Shadows Purged) ──
  auteurGlow: {
    borderWidth: 1, borderColor: 'rgba(107,26,10,0.8)', borderRadius: 2, borderStyle: 'solid',
  },
  archivistGlow: {
    borderWidth: 1, borderColor: 'rgba(196,150,26,0.5)', borderRadius: 2, borderStyle: 'solid',
  },

  // ── Collection Grid ──
  collectionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  collectionCard: {
    width: '31%', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 18, paddingHorizontal: 4,
    backgroundColor: 'rgba(10,8,5,0.85)', borderWidth: 1.5, borderColor: 'rgba(139,105,20,0.2)', borderRadius: 6,
    ...effects.shadowSurface,
  },
  collectionIconCircle: {
    width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: 'rgba(139,105,20,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center',
    ...effects.shadowSurface,
  },
  collectionCardLabel: { fontFamily: fonts.mono, fontSize: 10, color: '#F2ECD8', textAlign: 'center', letterSpacing: 1.5, fontWeight: '700' },
  collectionCardDesc: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.fog, fontStyle: 'italic' },
  collectionCardCount: { fontFamily: fonts.display, fontSize: 16, color: colors.sepia },
  collectionCardWide: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderWidth: 1.5, borderColor: 'rgba(139,105,20,0.2)',
    borderRadius: 6, backgroundColor: 'rgba(15,10,5,0.85)',
    ...effects.shadowSurface,
  },

  // ── Tab Content: Grids ──
  grid4: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  grid3: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthHeader: {
    fontFamily: fonts.ui, fontSize: 9, letterSpacing: 3, color: colors.sepia, marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,105,20,0.15)', paddingBottom: 8,
  },

  // ── Badges ──
  statusBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(10,7,3,0.85)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.35)', borderRadius: 2, paddingHorizontal: 4, paddingVertical: 2 },
  halfLifeBadge: { position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(10,7,3,0.9)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', borderRadius: 2, paddingHorizontal: 4, paddingVertical: 2 },
  formatBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(10,5,0,0.95)', borderWidth: 1, borderRadius: 2, paddingHorizontal: 5, paddingVertical: 2 },

  // ── Filters & Search ──
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, backgroundColor: 'transparent' },
  filterChipActive: { borderColor: colors.sepia, backgroundColor: 'rgba(196,150,26,0.1)' },
  filterChipText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.5, color: colors.fog },
  filterChipTextActive: { color: colors.sepia },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(22,18,12,0.6)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)', borderRadius: 2, paddingHorizontal: 10 },
  searchIcon: { fontSize: 14, color: colors.fog, opacity: 0.5, marginRight: 6 },
  searchInput: { flex: 1, fontFamily: fonts.sub, fontSize: 11, color: colors.parchment, paddingVertical: 10 },
  searchClear: { padding: 4 },

  // ── Empty State ──
  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(139,105,20,0.3)', borderRadius: 2, backgroundColor: 'rgba(14,11,8,0.7)' },
  emptyIcon: { fontSize: 40, color: colors.sepia, marginBottom: 16, opacity: 0.6 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.parchment, marginBottom: 8 },
  emptyDesc: { fontFamily: fonts.body, fontSize: 10, color: colors.fog, textAlign: 'center', lineHeight: 16, fontStyle: 'italic' },

  // ── Stacks ──
  stacksGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stackCard: { borderRadius: 2, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(139,105,20,0.2)', backgroundColor: colors.soot },
  stackPosterWrap: { width: '100%', height: 80, position: 'relative', overflow: 'hidden' },
  stackPosterPanel: { position: 'absolute', top: 0, height: '100%' },
  stackOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,7,3,0.55)' },
  stackContent: { padding: 12 },
  stackBadge: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.5, color: colors.sepia, backgroundColor: 'rgba(196,150,26,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 1, alignSelf: 'flex-start', overflow: 'hidden', marginBottom: 4 },
  stackTitle: { fontFamily: fonts.display, fontSize: 11, color: colors.parchment, letterSpacing: 0.5, lineHeight: 14 },
  stackDesc: { fontFamily: fonts.body, fontSize: 9, color: colors.fog, fontStyle: 'italic', lineHeight: 13, marginTop: 4 },

  // ── Projector Tab ──
  card: { backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', borderRadius: 2, padding: 16, gap: 10 },
  favouriteRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  // ── Account Section ──
  accountRow: {
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,105,20,0.15)',
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  accountRowText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.bone },



  // ── NEW: Early Return States ──
  centeredFull: { justifyContent: 'center', alignItems: 'center' },
  centeredPadded: { justifyContent: 'center', alignItems: 'center', padding: 40 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  loadingText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 3, color: colors.sepia },
  notFoundIcon: { marginBottom: 16, opacity: 0.4 },
  notFoundTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginBottom: 8 },
  notFoundBody: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, fontStyle: 'italic', textAlign: 'center', marginBottom: 24 },
  privateBody: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, opacity: 0.7, textAlign: 'center', lineHeight: 18, marginBottom: 24 },
  ghostBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // ── NEW: SectionLabel ──
  sectionLabelWrap: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 12 },

  // ── NEW: Tab Header ──
  tabHeaderTextWrap: { flex: 1 },
  tabHeaderUsername: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2.5, color: colors.fog },
  tabHeaderTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, lineHeight: 22 },
  tabScrollContent: { paddingBottom: 80, paddingTop: 8 },
  tabContentPad: { paddingHorizontal: 16 },
  tabGap: { gap: 28 },
  filterGroupCol: { marginBottom: 16, gap: 10 },
  filterScrollMargin: { marginBottom: 16 },
  filterChipRow: { gap: 8 },
  filterChipRowTight: { gap: 6 },
  searchIconStyle: { opacity: 0.5, marginRight: 6 },
  searchWrapFlex: { flex: 1 },
  searchNoResults: { textAlign: 'center', padding: 24, color: colors.fog, fontFamily: fonts.body, fontSize: 11 },

  // ── NEW: Poster Cards ──
  posterPlaceholder: { backgroundColor: '#050402', justifyContent: 'center', alignItems: 'center' },
  posterRatingRow: { flexDirection: 'row', gap: 2 },
  posterCardWrap: { aspectRatio: 2 / 3, position: 'relative' },
  statusBadgeAbandoned: { borderColor: 'rgba(139,30,30,0.4)' },
  formatBadgeText: { fontSize: 7, fontFamily: fonts.uiBold, letterSpacing: 1 },

  // ── NEW: Half-Life ──
  halfLifeContent: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  halfLifeText: { fontSize: 7, fontFamily: fonts.ui },

  // ── NEW: Watchlist ──
  watchlistControlRow: { flexDirection: 'row', gap: 8, marginBottom: 16, alignItems: 'center' },
  sortRow: { flexDirection: 'row', gap: 4 },
  ctaBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // ── NEW: Stacks ──
  stackEmptyBg: { flex: 1, backgroundColor: 'rgba(8,6,4,0.98)' },

  // ── NEW: Projector Tab ──
  projectorGap: { gap: 32 },
  projectorHeader: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  projectorSuper: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2.5, color: colors.sepia, marginBottom: 6 },
  projectorTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, lineHeight: 28, textAlign: 'center' },
  projectorSub: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, fontStyle: 'italic', marginTop: 6 },
  projectorSectionsWrap: { paddingHorizontal: 16, gap: 32 },

  // ── NEW: Favourites ──
  favPosterThumb: { width: 28, height: 42, borderRadius: 2 },
  favTextWrap: { flex: 1 },
  favTitle: { fontFamily: fonts.sub, fontSize: 11, color: colors.parchment, lineHeight: 14 },
  favRatingRow: { flexDirection: 'row', gap: 2, marginTop: 2 },

  // ── NEW: Calendar ──
  comingSoonText: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, textAlign: 'center', fontStyle: 'italic' },
  emptyLockIcon: { marginBottom: 12, opacity: 0.5 },

  // ── NEW: Avatar ──
  avatarPlaceholder: { backgroundColor: '#050402', justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontFamily: fonts.display, fontSize: 36, color: colors.sepia },

  // ── NEW: Level Badge ──
  levelBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  // ── NEW: Username Row ──
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' },

  // ── NEW: Edit Row ──
  editRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 14 },

  // ── NEW: Triptych ──
  triptychWrap: { width: '100%', maxWidth: 380, alignSelf: 'center', marginTop: 16 },
  triptychWrapRecent: { width: '100%', maxWidth: 380, alignSelf: 'center', marginTop: 20 },
  recentRow: { flexDirection: 'row', gap: 8 },
  recentItem: { flex: 1 },

  // ── NEW: Content Area ──
  contentArea: { backgroundColor: colors.ink },
  collectionSection: { paddingHorizontal: 16, marginTop: 8, paddingBottom: 24 },
  collectionCardDisabled: { opacity: 0.3 },
  collectionCardHighlight: { borderColor: 'rgba(139,105,20,0.25)' },
  collectionIconHighlight: { backgroundColor: 'rgba(139,105,20,0.1)' },
  collectionHighlightText: { color: colors.sepia },

  // ── NEW: Calendar CTA ──
  calendarCtaWrap: { paddingHorizontal: 16, marginBottom: 24 },
  calendarCtaText: { fontFamily: fonts.uiBold, fontSize: 9, letterSpacing: 2, color: colors.fog },
  lockIconMr: { marginRight: 6 },

  // ── NEW: Account ──
  accountSection: { paddingHorizontal: 16, paddingBottom: 40 },
  accountRowLast: { borderBottomWidth: 0 },

  // ── Main Scroll ──
  mainScrollContent: { paddingBottom: 60 },

  // ── Founder's Mark ──
  founderMark: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 6, marginBottom: 2,
  },
  founderLine: {
    flex: 1, height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(139,105,20,0.25)',
  },
  founderText: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 4,
    color: 'rgba(196,150,26,0.55)', textAlign: 'center',
  },

  // ── Member Since ──
  memberSince: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2.5,
    color: colors.fog, opacity: 0.6, marginBottom: 4,
  },

  // ── Society Seal ──
  societySealWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 32, paddingVertical: 20,
  },
  sealLine: {
    flex: 1, height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(139,105,20,0.2)',
  },
  sealCenter: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  sealText: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 3,
    color: 'rgba(196,150,26,0.45)',
  },
});

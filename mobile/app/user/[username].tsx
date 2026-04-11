import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  RefreshControl, TextInput, Dimensions, Linking, Animated as RNAnimated,
} from 'react-native';
import AnimatedRN, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { supabase } from '@/src/lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, fonts, spacing, effects } from '@/src/theme/theme';
import { SectionDivider } from '@/src/components/Decorative';
import { tmdb } from '@/src/lib/tmdb';
import { CinematicInsights } from '@/src/components/profile/CinematicInsights';
import { ProgrammesSection } from '@/src/components/profile/ProgrammesSection';
import { CinemaDNACard } from '@/src/components/profile/CinemaDNACard';
import { ProfileBackdrop } from '@/src/components/profile/ProfileBackdrop';
import { ProfileTriptych } from '@/src/components/profile/ProfileTriptych';
import { NoirPassport } from '@/src/components/profile/NoirPassport';
import { ProjectorRoom } from '@/src/components/profile/ProjectorRoom';
import { WatchlistRoulette } from '@/src/components/profile/WatchlistRoulette';
import { TasteMatch } from '@/src/components/profile/TasteMatch';
import { TasteDNA } from '@/src/components/profile/TasteDNA';
import { Achievements } from '@/src/components/profile/Achievements';
import {
  Archive, BookOpen, Bookmark, LayoutList, Disc, LineChart,
  Star, Lock, Settings, ChevronLeft, Globe, Sparkles, Film as FilmIcon,
  ArrowLeft, LogIn, Search, X, TrendingUp, TrendingDown, Minus,
  Flame, Crown, Dna, Dice5, CalendarDays,
} from 'lucide-react-native';
import { ReelRating } from '@/src/components/Decorative';

const AnimatedView = AnimatedRN.createAnimatedComponent(View);
const SCREEN_W = Dimensions.get('window').width;
const POSTER_COL_4 = (SCREEN_W - 32 - 18) / 4;
const POSTER_COL_3 = (SCREEN_W - 32 - 16) / 3;

type ProfileTab = 'archive' | 'ledger' | 'watchlist' | 'lists' | 'physical' | 'passport' | 'projector' | 'calendar';

// ════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ════════════════════════════════════════════════════════════

function StatCard({ label, value, onPress, isLast }: { label: string; value: string | number; onPress?: () => void; isLast?: boolean }) {
  return (
    <>
      <TouchableOpacity style={s.statCard} activeOpacity={onPress ? 0.7 : 1} onPress={onPress} disabled={!onPress}>
        <Text style={s.statValue}>{value}</Text>
        <Text style={s.statLabel}>{label}</Text>
      </TouchableOpacity>
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

export default function UserProfileScreen({ usernameOverride }: { usernameOverride?: string } = {}) {
  const params = useLocalSearchParams<{ username: string; tab?: string }>();
  const username = usernameOverride || params.username;
  const tab = params.tab;
  const router = useRouter();
  const { user, isAuthenticated, followUser, unfollowUser } = useAuthStore();
  const { logs: myLogs } = useFilmStore();

  // ── State ──
  const [targetUser, setTargetUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab | null>(null);
  const [dnaCardOpen, setDnaCardOpen] = useState(false);
  const [rouletteOpen, setRouletteOpen] = useState(false);

  // Tab-specific filters
  const [archiveSieve, setArchiveSieve] = useState('all');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerRatingFilter, setLedgerRatingFilter] = useState<number | 'all'>('all');
  const [watchlistSearch, setWatchlistSearch] = useState('');
  const [watchlistSort, setWatchlistSort] = useState<'default' | 'az' | 'za'>('default');
  const [physicalFilter, setPhysicalFilter] = useState<string | null>(null);

  // Breathing avatar animation
  const breatheAnim = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(breatheAnim, { toValue: 1, duration: 2400, useNativeDriver: false }),
        RNAnimated.timing(breatheAnim, { toValue: 0, duration: 2400, useNativeDriver: false }),
      ])
    ).start();
  }, []);

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
  const [logs, setLogs] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [vault, setVault] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);

  const isFollowing = user?.following?.includes(username);
  const isSelf = user?.username === username;

  // ── Fetch all profile data ──
  const fetchUserData = useCallback(async () => {
    if (!username) return;
    try {
      const { data: profile, error } = await supabase
        .from('profiles').select('*').eq('username', username).single();
      if (error || !profile) { setTargetUser(null); return; }
      setTargetUser(profile);
      if (profile.is_social_private && !isSelf) return;

      const [logsResp, watchResp, vaultResp, listsResp] = await Promise.all([
        supabase.from('logs')
          .select('id, film_id, film_title, poster_path, year, rating, review, status, watched_date, created_at, pull_quote, alt_poster, physical_media, watched_with')
          .eq('user_id', profile.id).order('watched_date', { ascending: false }).limit(2000),
        supabase.from('watchlists')
          .select('film_id, film_title, poster_path, year')
          .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(200),
        supabase.from('physical_archive')
          .select('id, film_id, film_title, poster_path, year, formats, notes, condition, created_at')
          .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(500),
        supabase.from('lists')
          .select('id, title, description, is_ranked, is_private, created_at')
          .eq('user_id', profile.id).eq('is_private', false).order('created_at', { ascending: false }).limit(50),
      ]);

      setLogs((logsResp.data || []).map(l => ({
        id: String(l.id), filmId: l.film_id, title: l.film_title || '', poster: l.poster_path, year: l.year,
        rating: l.rating, review: l.review, status: l.status || 'watched', watchedDate: l.watched_date,
        pullQuote: l.pull_quote || '', altPoster: l.alt_poster || null, physicalMedia: l.physical_media || null,
        watchedWith: l.watched_with || null, createdAt: l.created_at,
      })));
      setWatchlist((watchResp.data || []).map(w => ({ id: w.film_id, title: w.film_title, poster_path: w.poster_path, year: w.year })));
      setVault((vaultResp.data || []).map(v => ({
        id: v.id, film_id: v.film_id, filmId: v.film_id, title: v.film_title, poster_path: v.poster_path, year: v.year,
        formats: v.formats || [], notes: v.notes || '', condition: v.condition || 'good', created_at: v.created_at, createdAt: v.created_at,
      })));

      // Fetch list items
      const listIds = (listsResp.data || []).map((l: any) => l.id);
      let allListItems: any[] = [];
      if (listIds.length > 0) {
        const { data: items } = await supabase.from('list_items').select('list_id, film_id, film_title, poster_path').in('list_id', listIds).limit(1000);
        allListItems = items || [];
      }
      const itemsByList = new Map<string, any[]>();
      for (const item of allListItems) {
        const arr = itemsByList.get(item.list_id) || [];
        arr.push(item);
        itemsByList.set(item.list_id, arr);
      }
      setLists((listsResp.data || []).map(l => ({
        id: l.id, title: l.title, description: l.description || '', isRanked: l.is_ranked || false,
        isPrivate: l.is_private || false, createdAt: l.created_at,
        films: (itemsByList.get(l.id) || []).map((i: any) => ({ id: i.film_id, title: i.film_title, poster: i.poster_path })),
      })));
    } catch { }
  }, [username, isSelf]);

  useEffect(() => { setLoading(true); fetchUserData().finally(() => setLoading(false)); }, [fetchUserData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await fetchUserData();
    setRefreshing(false);
  }, [fetchUserData]);

  const toggleFollow = useCallback(async () => {
    if (!isAuthenticated) return router.push('/login');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isFollowing) { await unfollowUser(username); } else { await followUser(username); }
  }, [isAuthenticated, isFollowing, username]);

  // ── Computed Values ──
  const tier = targetUser?.role || targetUser?.tier || 'free';
  const isArchivistPlus = ['archivist', 'auteur'].includes(tier);
  const isPrivate = targetUser?.is_social_private && !isSelf;
  const totalFilms = logs.length;

  // Stats level — matches web's cineStats computation exactly
  const statsLevel = totalFilms > 50 ? 'THE ORACLE' : totalFilms > 20 ? 'MIDNIGHT DEVOTEE' : totalFilms > 5 ? 'THE REGULAR' : 'FIRST REEL';
  const statsColor = totalFilms > 50 ? colors.sepia : totalFilms > 20 ? colors.bloodReel : colors.flicker;
  const statsProgress = (totalFilms % 20) * 5;

  // Daily streak
  const streak = useMemo(() => {
    const dates = new Set<string>();
    for (const log of logs) {
      const d = log.watchedDate || log.createdAt;
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
  }, [logs]);

  // Archive filtering
  const archiveFiltered = useMemo(() => {
    if (archiveSieve === 'all') return logs;
    return logs.filter(l => l.status === archiveSieve);
  }, [logs, archiveSieve]);

  // Ledger filtering (rated/reviewed only)
  const ledgerFiltered = useMemo(() => {
    return logs.filter(log => {
      if (!log.poster && !log.altPoster) return false;
      if (!log.rating && !log.review) return false;
      if (ledgerRatingFilter !== 'all' && log.rating !== ledgerRatingFilter) return false;
      if (ledgerSearch.trim() && !(log.title || '').toLowerCase().includes(ledgerSearch.toLowerCase())) return false;
      return true;
    });
  }, [logs, ledgerSearch, ledgerRatingFilter]);

  // Half-Life tracking
  const halfLifeMap = useMemo(() => {
    const byFilm: Record<number, { rating: number; date: string }[]> = {};
    for (const log of logs) {
      if (!log.filmId || !log.rating) continue;
      if (!byFilm[log.filmId]) byFilm[log.filmId] = [];
      byFilm[log.filmId].push({ rating: log.rating, date: log.watchedDate || log.createdAt || new Date().toISOString() });
    }
    const result: Record<number, any> = {};
    for (const [filmId, entries] of Object.entries(byFilm)) {
      if (entries.length < 2) continue;
      const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const first = sorted[0].rating, last = sorted[sorted.length - 1].rating;
      result[Number(filmId)] = { count: sorted.length, trajectory: last > first ? 'ASCENDING' : last < first ? 'DECAYING' : 'ETERNAL', delta: last - first };
    }
    return result;
  }, [logs]);

  // Watchlist filtering
  const watchlistFiltered = useMemo(() => {
    let result = [...watchlist];
    if (watchlistSearch.trim()) {
      const q = watchlistSearch.toLowerCase();
      result = result.filter(f => (f.title || '').toLowerCase().includes(q));
    }
    if (watchlistSort === 'az') result.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else if (watchlistSort === 'za') result.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
    return result;
  }, [watchlist, watchlistSearch, watchlistSort]);

  // Physical archive filtering
  const physicalFiltered = useMemo(() => {
    if (!physicalFilter) return vault;
    return vault.filter((item: any) => item.formats?.includes(physicalFilter));
  }, [vault, physicalFilter]);

  const physicalFormatCounts = useMemo(() => {
    const FORMATS = [
      { id: '4k', label: '4K UHD', color: '#a855f7' }, { id: 'bluray', label: 'Blu-ray', color: '#3b82f6' },
      { id: 'dvd', label: 'DVD', color: '#f59e0b' }, { id: 'vhs', label: 'VHS', color: '#ef4444' },
      { id: 'laserdisc', label: 'LaserDisc', color: '#10b981' }, { id: 'steelbook', label: 'Steelbook', color: '#6366f1' },
      { id: 'criterion', label: 'Criterion', color: colors.sepia },
    ];
    return FORMATS.map(f => ({ ...f, count: vault.filter((item: any) => item.formats?.includes(f.id)).length })).filter(f => f.count > 0);
  }, [vault]);

  // Group by month helper
  const groupByMonth = useCallback((items: any[], dateKey = 'watchedDate') => {
    const grouped: Record<string, any[]> = {};
    for (const item of items) {
      const d = new Date(item[dateKey] || item.createdAt || new Date().toISOString());
      const title = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
      if (!grouped[title]) grouped[title] = [];
      grouped[title].push(item);
    }
    return grouped;
  }, []);

  // Social links parsing (matches web exactly)
  const socialLinks = useMemo(() => {
    const raw = targetUser?.social_links || [];
    if (Array.isArray(raw)) return raw.filter((l: any) => l.url && l.url.trim());
    if (typeof raw === 'object') {
      return Object.entries(raw)
        .filter(([, v]: any) => v && (v as string).trim())
        .map(([k, v]: any) => ({ title: k.charAt(0).toUpperCase() + k.slice(1), url: v }));
    }
    return [];
  }, [targetUser]);

  // Breathing glow interpolation
  const breatheShadowRadius = breatheAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 40] });
  const breatheShadowOpacity = breatheAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] });

  // ── Collection Cards ──
  const COLLECTION_CARDS = [
    { id: 'archive' as ProfileTab, label: 'Archive', desc: 'WATCHED', count: logs.length, Icon: Archive, disabled: false, highlight: false },
    { id: 'ledger' as ProfileTab, label: 'The Ledger', desc: 'DIARY', count: logs.filter(l => l.rating > 0 || (l.review && l.review.length > 0)).length, Icon: BookOpen, disabled: false, highlight: false },
    { id: 'watchlist' as ProfileTab, label: 'Watchlist', desc: 'TO SEE', count: watchlist.length, Icon: Bookmark, disabled: false, highlight: false },
    { id: 'lists' as ProfileTab, label: 'Stacks', desc: 'LISTS', count: lists.length, Icon: LayoutList, disabled: false, highlight: false },
    { id: 'physical' as ProfileTab, label: 'Physical Archive', desc: 'COLLECTION', count: isArchivistPlus ? vault.length : 'LOCKED' as any, Icon: Disc, disabled: !isArchivistPlus, highlight: false },
    { id: 'projector' as ProfileTab, label: 'Analytics', desc: 'PROJECTOR', count: 'LIFETIME' as any, Icon: LineChart, disabled: false, highlight: true },
  ];

  const tabTitles: Record<string, string> = {
    archive: 'The Archive', ledger: 'The Ledger', watchlist: 'Watchlist',
    lists: 'The Stacks', physical: 'Physical Archive', passport: 'Passport',
    projector: 'Global Analytics', calendar: "The AUTEUR's Calendar",
  };

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
      <Text style={s.notFoundBody}>This member doesn't exist yet, or has been removed.</Text>
      <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}>
        <View style={s.ghostBtnRow}>
          <ArrowLeft size={12} color={colors.bone} strokeWidth={1.5} />
          <Text style={s.ghostBtnText}>GO BACK</Text>
        </View>
      </TouchableOpacity>
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
        <TouchableOpacity style={s.primaryBtn} onPress={toggleFollow}>
          <Text style={s.primaryBtnText}>FOLLOW TO VIEW</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ════════════════════════════════════════════════════════════
  // POSTER CARD — Reusable log poster with tier glow
  // ════════════════════════════════════════════════════════════
  const renderPosterCard = (log: any, width: number, showRating = false, showTimeAgo = false, navigateToLog = false) => {
    const posterUri = tmdb.poster(log.altPoster || log.poster || log.poster_path, 'w185');
    const glowStyle = tier === 'auteur' ? s.auteurGlow : tier === 'archivist' ? s.archivistGlow : {};
    return (
      <TouchableOpacity
        key={log.id || log.filmId || log.film_id}
        style={[{ aspectRatio: 2 / 3, position: 'relative' }, width > 0 ? { width } : { flex: 1 }, isArchivistPlus ? glowStyle : {}]}
        onPress={() => {
          if (navigateToLog && log.id) {
            router.push(`/log/${log.id}`);
          } else {
            const fid = log.filmId || log.film_id;
            if (fid) router.push(`/film/${fid}`);
          }
        }}
        activeOpacity={0.7}
      >
        {posterUri ? (
          <Image source={{ uri: posterUri }} style={s.posterImg} />
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
              <Text style={s.posterTimeAgo}>{timeAgo(log.watchedDate || log.createdAt)}</Text>
            )}
          </View>
        )}
        {/* Status badges */}
        {log.status === 'rewatched' && <View style={s.statusBadge}><Sparkles size={7} color={colors.sepia} strokeWidth={1.5} /></View>}
        {log.status === 'abandoned' && <View style={[s.statusBadge, s.statusBadgeAbandoned]}><X size={7} color={colors.bloodReel} strokeWidth={2} /></View>}
      </TouchableOpacity>
    );
  };

  // ════════════════════════════════════════════════════════════
  // TAB PAGE MODE
  // ════════════════════════════════════════════════════════════
  if (activeTab) {
    return (
      <View style={s.container}>
        {/* ── Tab Header ── */}
        <View style={s.tabPageHeader}>
          <TouchableOpacity onPress={() => router.push(`/user/${username}`)} style={s.topNavBtn} activeOpacity={0.7}>
            <ChevronLeft size={22} color={colors.sepia} />
          </TouchableOpacity>
          <View style={s.tabHeaderTextWrap}>
            <Text style={s.tabHeaderUsername}>@{username}</Text>
            <Text style={s.tabHeaderTitle}>{tabTitles[activeTab] || activeTab}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={s.tabScrollContent} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} />}>

          {/* ═══ ARCHIVE TAB ═══ */}
          {activeTab === 'archive' && (
            <View style={s.tabContentPad}>
              {logs.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
                  {[{ id: 'all', label: 'All' }, { id: 'watched', label: 'Watched' }, { id: 'rewatched', label: 'Rewatched' }, { id: 'abandoned', label: 'Abandoned' }].map(sv => (
                    <TouchableOpacity key={sv.id} style={[s.filterChip, archiveSieve === sv.id && s.filterChipActive]} onPress={() => setArchiveSieve(sv.id)}>
                      <Text style={[s.filterChipText, archiveSieve === sv.id && s.filterChipTextActive]}>{sv.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              {archiveFiltered.length === 0 ? (
                <View style={s.emptyState}>
                  <FilmIcon size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
                  <Text style={s.emptyTitle}>The Archive is Empty</Text>
                  <Text style={s.emptyDesc}>{logs.length === 0 ? (isSelf ? 'No films watched yet.' : "This member hasn't watched any films yet.") : 'No films match this filter.'}</Text>
                </View>
              ) : (
                <View style={s.tabGap}>
                  {Object.entries(groupByMonth(archiveFiltered)).map(([month, items]) => (
                    <View key={month}>
                      <Text style={s.monthHeader}>{month}</Text>
                      <View style={s.grid4}>
                        {(items as any[]).map((log: any) => renderPosterCard(log, POSTER_COL_4))}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ═══ LEDGER TAB ═══ */}
          {activeTab === 'ledger' && (
            <View style={s.tabContentPad}>
              {logs.length > 0 && (
                <View style={s.filterGroupCol}>
                  <View style={s.searchWrap}>
                    <Search size={12} color={colors.fog} strokeWidth={1.5} style={s.searchIconStyle} />
                    <TextInput style={s.searchInput} value={ledgerSearch} onChangeText={setLedgerSearch} placeholder="Search your archive..." placeholderTextColor={colors.fog} />
                    {ledgerSearch.length > 0 && <TouchableOpacity onPress={() => setLedgerSearch('')} style={s.searchClear}><X size={14} color={colors.fog} strokeWidth={1.5} /></TouchableOpacity>}
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {(['all', 1, 2, 3, 4, 5] as const).map(r => (
                      <TouchableOpacity key={String(r)} style={[s.filterChip, ledgerRatingFilter === r && s.filterChipActive]} onPress={() => setLedgerRatingFilter(r)}>
                        {r === 'all' ? (
                          <Text style={[s.filterChipText, ledgerRatingFilter === r && s.filterChipTextActive]}>ALL</Text>
                        ) : (
                          <ReelRating rating={r} size={8} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
              {ledgerFiltered.length === 0 ? (
                <View style={s.emptyState}>
                  <FilmIcon size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
                  <Text style={s.emptyTitle}>{ledgerSearch ? 'No Results' : 'The Ledger is Empty'}</Text>
                  <Text style={s.emptyDesc}>{ledgerSearch ? `No entries match "${ledgerSearch}"` : 'No rated or reviewed films yet.'}</Text>
                </View>
              ) : (
                <View style={s.tabGap}>
                  {Object.entries(groupByMonth(ledgerFiltered)).map(([month, items]) => (
                    <View key={month}>
                      <Text style={s.monthHeader}>{month}</Text>
                      <View style={s.grid4}>
                        {(items as any[]).map((log: any) => {
                          const hl = halfLifeMap[log.filmId];
                          return (
                            <View key={log.id} style={s.posterCardWrap}>
                              {renderPosterCard(log, POSTER_COL_4, false, false, true)}
                              {hl && (
                                <View style={s.halfLifeBadge}>
                                  <View style={s.halfLifeContent}>
                                    {hl.trajectory === 'ASCENDING' ? <TrendingUp size={7} color="#22c55e" strokeWidth={2} /> : hl.trajectory === 'DECAYING' ? <TrendingDown size={7} color="#ef4444" strokeWidth={2} /> : <Minus size={7} color={colors.sepia} strokeWidth={2} />}
                                    <Text style={[s.halfLifeText, { color: hl.trajectory === 'ASCENDING' ? '#22c55e' : hl.trajectory === 'DECAYING' ? '#ef4444' : colors.sepia }]}>x{hl.count}</Text>
                                  </View>
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ═══ WATCHLIST TAB ═══ */}
          {activeTab === 'watchlist' && (
            <View style={s.tabContentPad}>
              {watchlist.length === 0 ? (
                <View style={s.emptyState}>
                  <Bookmark size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
                  <Text style={s.emptyTitle}>The Queue is Empty</Text>
                  <Text style={s.emptyDesc}>{isSelf ? 'No films saved yet.' : "This member hasn't saved any films yet."}</Text>
                </View>
              ) : (<>
                {isSelf && watchlist.length > 1 && (
                  <TouchableOpacity style={s.ctaBtn} onPress={() => setRouletteOpen(true)} activeOpacity={0.7}>
                    <View style={s.ctaBtnRow}>
                      <Dice5 size={12} color={colors.sepia} strokeWidth={1.5} />
                      <Text style={s.ctaBtnText}>SPIN WATCHLIST ROULETTE</Text>
                    </View>
                  </TouchableOpacity>
                )}
                {watchlist.length > 5 && (
                  <View style={s.watchlistControlRow}>
                    <View style={[s.searchWrap, s.searchWrapFlex]}>
                      <Search size={12} color={colors.fog} strokeWidth={1.5} style={s.searchIconStyle} />
                      <TextInput style={s.searchInput} value={watchlistSearch} onChangeText={setWatchlistSearch} placeholder="Search watchlist..." placeholderTextColor={colors.fog} />
                      {watchlistSearch.length > 0 && <TouchableOpacity onPress={() => setWatchlistSearch('')} style={s.searchClear}><X size={14} color={colors.fog} strokeWidth={1.5} /></TouchableOpacity>}
                    </View>
                    <View style={s.sortRow}>
                      {([{ id: 'default' as const, label: 'RECENT' }, { id: 'az' as const, label: 'A-Z' }, { id: 'za' as const, label: 'Z-A' }]).map(sv => (
                        <TouchableOpacity key={sv.id} style={[s.filterChip, watchlistSort === sv.id && s.filterChipActive]} onPress={() => setWatchlistSort(sv.id)}>
                          <Text style={[s.filterChipText, watchlistSort === sv.id && s.filterChipTextActive]}>{sv.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                {watchlistFiltered.length === 0 && watchlistSearch ? (
                  <Text style={s.searchNoResults}>No films match "{watchlistSearch}"</Text>
                ) : (
                  <View style={s.grid3}>
                    {watchlistFiltered.map((film: any) => renderPosterCard(film, POSTER_COL_3))}
                  </View>
                )}
              </>)}
            </View>
          )}

          {/* ═══ STACKS/LISTS TAB ═══ */}
          {activeTab === 'lists' && (
            <View style={s.tabContentPad}>
              {lists.length === 0 ? (
                <View style={s.emptyState}><LayoutList size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} /><Text style={s.emptyTitle}>The Stacks are Empty</Text><Text style={s.emptyDesc}>No lists yet.</Text></View>
              ) : (
                <View style={s.stacksGrid}>
                  {lists.map((list: any) => {
                    const posters = (list.films || []).filter((f: any) => f.poster).slice(0, 3).map((f: any) => tmdb.poster(f.poster, 'w185'));
                    return (
                      <TouchableOpacity key={list.id} style={s.stackCard} activeOpacity={0.7} onPress={() => router.push({ pathname: '/list-modal' as any, params: { listId: list.id } })}>
                        <View style={s.stackPosterWrap}>
                          {posters.length > 0 ? posters.map((uri: string, i: number) => <Image key={i} source={{ uri }} style={[s.stackPosterPanel, { left: `${(i * 100) / posters.length}%` as any, width: `${100 / posters.length}%` as any }]} />) : <View style={s.stackEmptyBg} />}
                          <View style={s.stackOverlay} />
                        </View>
                        <View style={s.stackContent}>
                          <Text style={s.stackBadge}>{(list.films || []).length} FILMS</Text>
                          <Text style={s.stackTitle} numberOfLines={2}>{(list.title || '').toUpperCase()}</Text>
                          {list.description ? <Text style={s.stackDesc} numberOfLines={2}>{list.description}</Text> : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* ═══ PHYSICAL ARCHIVE TAB ═══ */}
          {activeTab === 'physical' && (
            <View style={s.tabContentPad}>
              {physicalFormatCounts.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 6 }}>
                  <TouchableOpacity style={[s.filterChip, !physicalFilter && s.filterChipActive]} onPress={() => setPhysicalFilter(null)}>
                    <Text style={[s.filterChipText, !physicalFilter && s.filterChipTextActive]}>ALL ({vault.length})</Text>
                  </TouchableOpacity>
                  {physicalFormatCounts.map((f: any) => (
                    <TouchableOpacity key={f.id} style={[s.filterChip, physicalFilter === f.id && { borderColor: f.color, backgroundColor: `${f.color}15` }]} onPress={() => setPhysicalFilter(physicalFilter === f.id ? null : f.id)}>
                      <Text style={[s.filterChipText, physicalFilter === f.id && { color: f.color }]}>{f.label} ({f.count})</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              {physicalFiltered.length === 0 ? (
                <View style={s.emptyState}><Disc size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} /><Text style={s.emptyTitle}>Physical Archive is Empty</Text>
                  <Text style={s.emptyDesc}>{isSelf ? 'No physical media catalogued yet.' : 'No physical media.'}</Text></View>
              ) : (
                <View style={s.tabGap}>
                  {Object.entries(groupByMonth(physicalFiltered, 'created_at')).map(([month, items]) => (
                    <View key={month}>
                      <Text style={s.monthHeader}>{month}</Text>
                      <View style={s.grid4}>
                        {(items as any[]).map((item: any) => {
                          const posterUri = tmdb.poster(item.poster_path, 'w185');
                          const fmt = (item.formats || [])[0];
                          const FC: Record<string, string> = { '4k': '#a855f7', bluray: '#3b82f6', dvd: '#f59e0b', vhs: '#ef4444', laserdisc: '#10b981', steelbook: '#6366f1', criterion: colors.sepia };
                          const FL: Record<string, string> = { '4k': '4K', bluray: 'BD', dvd: 'DVD', vhs: 'VHS', laserdisc: 'LD', steelbook: 'SB', criterion: 'CC' };
                          return (
                            <TouchableOpacity key={item.id} style={s.posterCardWrap} activeOpacity={0.7} onPress={() => item.film_id && router.push(`/film/${item.film_id}`)}>
                              {posterUri ? <Image source={{ uri: posterUri }} style={s.posterImg} /> : <View style={[s.posterImg, s.posterPlaceholder]}><FilmIcon size={14} color={colors.sepia} strokeWidth={1} /></View>}
                              {fmt && <View style={[s.formatBadge, { borderColor: FC[fmt] || colors.sepia }]}><Text style={[s.formatBadgeText, { color: FC[fmt] || colors.sepia }]}>{FL[fmt] || fmt.toUpperCase()}</Text></View>}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ═══ PASSPORT TAB ═══ */}
          {activeTab === 'passport' && <View style={s.tabContentPad}><NoirPassport user={targetUser} logs={logs} /></View>}

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
                <TouchableOpacity style={s.ctaBtn} onPress={() => setDnaCardOpen(true)} activeOpacity={0.7}>
                  <View style={s.ctaBtnRow}>
                    <Dna size={12} color={colors.sepia} strokeWidth={1.5} />
                    <Text style={s.ctaBtnText}>VIEW CINEMA DNA</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Projector Room */}
              <ProjectorRoom stats={{ count: logs.length, level: statsLevel, color: statsColor, progress: statsProgress }} user={targetUser} />

              <View style={s.projectorSectionsWrap}>
                {/* Taste DNA */}
                <View>
                  <SectionLabel text="TASTE FINGERPRINT" />
                  <TasteDNA logs={logs} />
                </View>

                {/* Cinematic Insights */}
                <View>
                  <SectionLabel text="REAL ANALYTICS" />
                  <CinematicInsights logs={logs} />
                </View>

                {/* Society Honors */}
                <View>
                  <SectionLabel text="SOCIETY HONORS" />
                  <Achievements logs={logs} />
                </View>

                {/* Your Favourites */}
                {logs.filter((l: any) => l.rating >= 4).length > 0 && (
                  <View>
                    <SectionLabel text="HIGHEST RATED" />
                    <View style={s.card}>
                      {logs.filter((l: any) => l.rating >= 4).slice(0, 6).map((log: any) => {
                        const posterUri = tmdb.poster(log.poster, 'w185');
                        return (
                          <TouchableOpacity key={log.id} style={s.favouriteRow} onPress={() => log.filmId && router.push(`/film/${log.filmId}`)} activeOpacity={0.7}>
                            {posterUri && <Image source={{ uri: posterUri }} style={s.favPosterThumb} />}
                            <View style={s.favTextWrap}>
                              <Text style={s.favTitle} numberOfLines={1}>{log.title}</Text>
                              <View style={s.favRatingRow}>
                                <ReelRating rating={log.rating} size={10} />
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Passport */}
                <View>
                  <SectionLabel text="CINEMATIC PASSPORT" />
                  <NoirPassport user={targetUser} logs={logs} />
                </View>

                {/* Taste Match (other users only) */}
                {!isSelf && myLogs.length >= 5 && (
                  <TasteMatch myLogs={myLogs} theirLogs={logs} theirUsername={targetUser.username} />
                )}

                {/* Programmes */}
                <ProgrammesSection programmes={[]} user={targetUser} uniqueFilms={logs.map((l: any) => ({ id: l.filmId, title: l.title, poster_path: l.poster || '' }))} isOwnProfile={isSelf} />
              </View>
            </View>
          )}

          {/* ═══ CALENDAR TAB ═══ */}
          {activeTab === 'calendar' && (
            <View style={s.tabContentPad}>
              {isArchivistPlus ? (
                <View>
                  <SectionLabel text="VIEWING HISTORY" />
                  <Text style={s.comingSoonText}>Activity calendar coming soon.</Text>
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

        {dnaCardOpen && <CinemaDNACard logs={logs} user={targetUser} onClose={() => setDnaCardOpen(false)} />}
        <WatchlistRoulette visible={rouletteOpen} watchlist={watchlist} onClose={() => setRouletteOpen(false)} onSelect={(id: number) => { setRouletteOpen(false); router.push(`/film/${id}`); }} />
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
        <View style={s.topNav}>
          <TouchableOpacity onPress={() => router.back()} style={s.topNavBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ChevronLeft size={24} color={colors.parchment} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={s.mainScrollContent} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} />}>

        {/* ═══ ATMOSPHERIC HEADER ═══ */}
        <View style={s.headerWrap}>
          {/* Auteur backdrop or dark base */}
          {tier === 'auteur' ? (
            <ProfileBackdrop user={targetUser} logs={logs} />
          ) : (
            <View style={s.headerDarkBase} />
          )}

          {/* Projector spotlight — golden radial glow from top center */}
          <View style={s.projectorSpotlight} />

          {/* Film grain texture overlay */}
          <View style={s.filmGrainOverlay} />

          {/* Bottom gold edge */}
          <View style={s.headerGoldEdge} />

          {/* ── Header Content ── */}
          <View style={s.headerContent}>

            {/* ── Avatar with Breathing Glow ── */}
            <View style={s.avatarWrap}>
              <RNAnimated.View style={[s.avatarRing, {
                borderColor: statsColor,
                shadowColor: statsColor,
                shadowRadius: breatheShadowRadius,
                shadowOpacity: breatheShadowOpacity,
                shadowOffset: { width: 0, height: 0 },
              }]}>
                {targetUser.avatar_url ? (
                  <Image source={{ uri: targetUser.avatar_url }} style={s.avatar} />
                ) : (
                  <View style={[s.avatar, s.avatarPlaceholder]}>
                    <Text style={s.avatarInitial}>{(targetUser.username || '?')[0].toUpperCase()}</Text>
                  </View>
                )}
              </RNAnimated.View>

              {/* Level badge */}
              <View style={[s.levelBadge, { borderColor: statsColor }]}>
                <View style={s.levelBadgeRow}>
                  <Sparkles size={7} color={statsColor} strokeWidth={1.5} />
                  <Text style={[s.levelBadgeText, { color: statsColor }]}>{statsLevel}</Text>
                </View>
              </View>
            </View>

            {/* ── Username + Tier Badge ── */}
            <View style={s.usernameRow}>
              <Text style={s.displayName}>@{targetUser.username.toUpperCase()}</Text>
              {tier === 'auteur' && (
                <View style={s.auteurBadge}>
                  <Star size={9} color={colors.ink} fill={colors.ink} />
                  <Text style={s.auteurBadgeText}>AUTEUR</Text>
                </View>
              )}
              {tier === 'archivist' && (
                <View style={s.archivistBadge}>
                  <Archive size={8} color={colors.sepia} strokeWidth={1.5} />
                  <Text style={s.archivistBadgeText}>ARCHIVIST</Text>
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
            <Text style={s.bio}>
              {targetUser.bio || (isSelf ? "No bio yet. Tell the society who you are." : "No bio on file.")}
            </Text>

            {/* ── Social Links ── */}
            {socialLinks.length > 0 && (
              <View style={s.socialLinksRow}>
                {socialLinks.map((link: any, i: number) => (
                  <TouchableOpacity key={i} style={s.socialLinkChip} onPress={() => Linking.openURL(link.url.startsWith('http') ? link.url : `https://${link.url}`)} activeOpacity={0.7}>
                    <Globe size={10} color={colors.fog} />
                    <Text style={s.socialLinkText}>{(link.title || '').toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ── Follow / Edit Buttons ── */}
            {isSelf ? (
              <View style={s.editRow}>
                <TouchableOpacity style={s.editBtn} onPress={() => router.push('/settings')} activeOpacity={0.7}>
                  <Text style={s.editBtnText}>EDIT PROFILE</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.settingsBtn} onPress={() => router.push('/settings')} activeOpacity={0.7}>
                  <Settings size={14} color={colors.fog} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[s.followBtn, isFollowing && s.followingBtn]} onPress={toggleFollow} activeOpacity={0.7}>
                <Text style={[s.followBtnText, isFollowing && s.followingBtnText]}>{isFollowing ? 'UNFOLLOW' : '+ FOLLOW'}</Text>
              </TouchableOpacity>
            )}

            {/* ── Stats Row ── */}
            <AnimatedView entering={FadeInDown.duration(500).delay(100)} style={s.statsGrid}>
              <StatCard label="FILMS" value={totalFilms} />
              <StatCard label="FOLLOWERS" value={targetUser.followers_count || 0} onPress={() => router.push({ pathname: '/social-modal', params: { userId: targetUser.id, type: 'followers' } })} />
              <StatCard label="FOLLOWING" value={targetUser.following_count || 0} onPress={() => router.push({ pathname: '/social-modal', params: { userId: targetUser.id, type: 'following' } })} />
              <StatCard label="WATCHLIST" value={watchlist.length} isLast />
            </AnimatedView>

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
              const recentLogs = logs.filter((l: any) => l.poster && l.poster.length > 5).slice(0, 3);
              if (recentLogs.length === 0) return null;
              return (
                <View style={s.triptychWrapRecent}>
                  <GoldDivider />
                  <SectionLabel text="RECENTLY WATCHED" />
                  <View style={s.recentRow}>
                    {recentLogs.map((log: any) => (
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
          <AnimatedView entering={FadeInDown.duration(500).delay(200)} style={s.collectionSection}>
            <SectionLabel text="THE COLLECTION" />
            <View style={s.collectionGrid}>
              {COLLECTION_CARDS.map((item, idx) => (
                <AnimatedView
                  key={item.id}
                  entering={FadeInDown.duration(400).delay(300 + idx * 60)}
                >
                <TouchableOpacity
                  style={[s.collectionCard, item.disabled && s.collectionCardDisabled, item.highlight && s.collectionCardHighlight]}
                  activeOpacity={0.7}
                  disabled={item.disabled}
                  onPress={() => {
                    Haptics.selectionAsync();
                    router.push({ pathname: `/user/${username}` as any, params: { tab: item.id } });
                  }}
                >
                  {/* Icon circle */}
                  <View style={[s.collectionIconCircle, item.highlight && s.collectionIconHighlight]}>
                    <item.Icon size={16} strokeWidth={1.5} color={item.highlight ? colors.sepia : colors.bone} />
                  </View>
                  {/* Label */}
                  <Text style={[s.collectionCardLabel, item.highlight && s.collectionHighlightText]} numberOfLines={1}>{item.label}</Text>
                  {/* Description */}
                  <Text style={s.collectionCardDesc}>{item.desc}</Text>
                  {/* Count */}
                  <Text style={[s.collectionCardCount, item.highlight && s.collectionHighlightText]} numberOfLines={1} adjustsFontSizeToFit>{item.count}</Text>
                </TouchableOpacity>
                </AnimatedView>
              ))}
            </View>
          </AnimatedView>

          {/* Calendar card for Archivist+ */}
          {isSelf && (
            <View style={s.calendarCtaWrap}>
              <TouchableOpacity
                style={[s.collectionCardWide, !isArchivistPlus && s.collectionCardDisabled]}
                activeOpacity={0.7}
                disabled={!isArchivistPlus}
                onPress={() => {
                  Haptics.selectionAsync();
                  router.push({ pathname: `/user/${username}` as any, params: { tab: 'calendar' } });
                }}
              >
                {!isArchivistPlus && <Lock size={12} color={colors.fog} strokeWidth={1.5} style={s.lockIconMr} />}
                {isArchivistPlus && <CalendarDays size={12} color={colors.sepia} strokeWidth={1.5} style={s.lockIconMr} />}
                <Text style={[s.calendarCtaText, isArchivistPlus && s.collectionHighlightText]}>THE AUTEUR'S CALENDAR</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Account & Settings (self only) ── */}
          {isSelf && (
            <View style={s.accountSection}>
              <SectionDivider label="ACCOUNT & SETTINGS" />
              <TouchableOpacity style={s.accountRow} onPress={() => router.push('/membership')} activeOpacity={0.7}>
                <Crown size={13} color={colors.sepia} strokeWidth={1.5} />
                <Text style={s.accountRowText}>THE SOCIETY RANKS</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.accountRow, s.accountRowLast]} onPress={() => router.push('/settings')} activeOpacity={0.7}>
                <Settings size={13} color={colors.sepia} strokeWidth={1.5} />
                <Text style={s.accountRowText}>SETTINGS & PROFILE</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {dnaCardOpen && <CinemaDNACard logs={logs} user={targetUser} onClose={() => setDnaCardOpen(false)} />}
      <WatchlistRoulette visible={rouletteOpen} watchlist={watchlist} onClose={() => setRouletteOpen(false)} onSelect={(id: number) => { setRouletteOpen(false); router.push(`/film/${id}`); }} />
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
  topNavBtnText: { fontFamily: fonts.ui, fontSize: 24, color: '#FFF', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },

  // ── Tab Page Header ──
  tabPageHeader: {
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.soot,
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
  projectorSpotlight: {
    position: 'absolute', top: -40, left: '10%', right: '10%', height: 300,
    backgroundColor: 'rgba(139,105,20,0.12)',
    borderRadius: 200, zIndex: 1, opacity: 0.7,
  },
  filmGrainOverlay: {
    ...StyleSheet.absoluteFillObject, zIndex: 2, opacity: 0.03,
    backgroundColor: 'rgba(139,105,20,0.05)',
  },
  headerGoldEdge: {
    position: 'absolute', bottom: 0, left: '10%', right: '10%', height: 1,
    backgroundColor: 'rgba(139,105,20,0.35)', zIndex: 3,
  },
  headerContent: {
    position: 'relative', zIndex: 4,
    alignItems: 'center', paddingHorizontal: 20, paddingTop: 80, paddingBottom: 28,
  },

  // ── Avatar ──
  avatarWrap: { position: 'relative', marginBottom: 10 },
  avatarRing: {
    width: 110, height: 110, borderRadius: 55, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.ink, overflow: 'hidden', elevation: 10,
  },
  avatar: { width: 102, height: 102, borderRadius: 51 },

  // ── Level Badge ──
  levelBadge: {
    position: 'absolute', bottom: -8, alignSelf: 'center',
    backgroundColor: 'rgba(11,10,8,0.95)', paddingHorizontal: 12, paddingVertical: 3,
    borderWidth: 1, borderRadius: 3, zIndex: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10,
  },
  levelBadgeText: { fontFamily: fonts.uiBold, fontSize: 7, letterSpacing: 2 },

  // ── Display Name ──
  displayName: {
    fontFamily: fonts.display, fontSize: 26, color: colors.parchment, textAlign: 'center',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(196,150,26,0.25)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 16,
  },

  // ── Tier Badges ──
  auteurBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.bloodReel, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2,
  },
  auteurBadgeText: { fontFamily: fonts.uiBold, fontSize: 7, letterSpacing: 2, color: colors.ink },
  archivistBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(196,150,26,0.15)', borderWidth: 1, borderColor: colors.sepia,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2,
  },
  archivistBadgeText: { fontFamily: fonts.uiBold, fontSize: 7, letterSpacing: 2, color: colors.sepia },

  // ── Bio ──
  bio: {
    fontFamily: fonts.body, fontSize: 14, color: colors.bone, textAlign: 'center',
    lineHeight: 22, marginTop: 10, paddingHorizontal: 24, fontStyle: 'italic', opacity: 0.8,
  },

  // ── Social Links ──
  socialLinksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 14 },
  socialLinkChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.12)', borderRadius: 3,
  },
  socialLinkText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.5, color: colors.fog },

  // ── Buttons ──
  editBtn: {
    backgroundColor: 'rgba(15,10,5,0.65)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.25)',
    paddingVertical: 10, paddingHorizontal: 20, borderRadius: 2,
  },
  editBtnText: { fontFamily: fonts.uiBold, fontSize: 9, letterSpacing: 2, color: colors.sepia },
  settingsBtn: {
    backgroundColor: 'rgba(15,10,5,0.65)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)',
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 2, justifyContent: 'center', alignItems: 'center',
  },
  followBtn: { marginTop: 14, backgroundColor: colors.sepia, borderRadius: 2, paddingVertical: 12, paddingHorizontal: 28 },
  followingBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.ash },
  followBtnText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.ink, textAlign: 'center' },
  followingBtnText: { color: colors.fog },
  ghostBtn: { paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: colors.ash, borderRadius: 2 },
  ghostBtnText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2, color: colors.bone },
  primaryBtn: { backgroundColor: colors.sepia, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 2 },
  primaryBtnText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.ink },
  ctaBtn: { borderWidth: 1, borderColor: colors.sepia, backgroundColor: 'rgba(196,150,26,0.1)', paddingVertical: 12, alignItems: 'center', borderRadius: 2, marginBottom: 16 },
  ctaBtnText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.sepia },

  // ── Stats ──
  statsGrid: { flexDirection: 'row', width: '100%', marginTop: 20, justifyContent: 'center', alignItems: 'center' },
  statCard: { flex: 1, paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.15)' },
  statValue: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, lineHeight: 26, ...effects.textGlowSepia },
  statLabel: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2, color: colors.fog, marginTop: 4, opacity: 0.7 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: 'rgba(139,105,20,0.2)' },

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
    padding: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.65)', borderBottomLeftRadius: 4, borderBottomRightRadius: 4,
  },
  posterRating: { fontFamily: fonts.uiBold, fontSize: 9, color: colors.sepia },
  posterTimeAgo: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1, color: colors.fog },

  // ── Tier Glow Effects ──
  auteurGlow: {
    borderWidth: 1, borderColor: 'rgba(107,26,10,0.4)', borderRadius: 4,
    shadowColor: '#6B1A0A', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4,
  },
  archivistGlow: {
    borderWidth: 1, borderColor: 'rgba(196,150,26,0.3)', borderRadius: 4,
    shadowColor: colors.sepia, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4,
  },

  // ── Collection Grid ──
  collectionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  collectionCard: {
    width: (SCREEN_W - 32 - 16) / 3, alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, paddingHorizontal: 4,
    backgroundColor: 'rgba(15,10,5,0.85)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)', borderRadius: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 3,
  },
  collectionIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.03)', alignItems: 'center', justifyContent: 'center',
  },
  collectionCardLabel: { fontFamily: fonts.display, fontSize: 13, color: colors.parchment, textAlign: 'center', letterSpacing: 0.5 },
  collectionCardDesc: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.5, color: colors.fog },
  collectionCardCount: { fontFamily: fonts.display, fontSize: 15, color: colors.parchment },
  collectionCardWide: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)',
    borderRadius: 2, backgroundColor: 'rgba(15,10,5,0.85)',
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
  searchInput: { flex: 1, fontFamily: fonts.sub, fontSize: 13, color: colors.parchment, paddingVertical: 10 },
  searchClear: { padding: 4 },

  // ── Empty State ──
  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, backgroundColor: colors.soot },
  emptyIcon: { fontSize: 40, color: colors.sepia, marginBottom: 16, opacity: 0.6 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginBottom: 8 },
  emptyDesc: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, textAlign: 'center', lineHeight: 20, fontStyle: 'italic' },

  // ── Stacks ──
  stacksGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stackCard: { width: (SCREEN_W - 32 - 10) / 2, borderRadius: 2, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(139,105,20,0.2)', backgroundColor: colors.soot },
  stackPosterWrap: { width: '100%', height: 80, position: 'relative', overflow: 'hidden' },
  stackPosterPanel: { position: 'absolute', top: 0, height: '100%', resizeMode: 'cover' },
  stackOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,7,3,0.55)' },
  stackContent: { padding: 12 },
  stackBadge: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.5, color: colors.sepia, backgroundColor: 'rgba(196,150,26,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 1, alignSelf: 'flex-start', overflow: 'hidden', marginBottom: 4 },
  stackTitle: { fontFamily: fonts.display, fontSize: 13, color: colors.parchment, letterSpacing: 0.5, lineHeight: 18 },
  stackDesc: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, fontStyle: 'italic', lineHeight: 16, marginTop: 4 },

  // ── Projector Tab ──
  card: { backgroundColor: colors.soot, borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)', borderRadius: 2, padding: 16, gap: 10 },
  favouriteRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  // ── Account Section ──
  accountRow: {
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,105,20,0.15)',
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  accountRowText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.bone },

  // ── Private Profile ──
  privateSection: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },

  // ── NEW: Early Return States ──
  centeredFull: { justifyContent: 'center', alignItems: 'center' },
  centeredPadded: { justifyContent: 'center', alignItems: 'center', padding: 40 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  loadingText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 3, color: colors.sepia },
  notFoundIcon: { marginBottom: 16, opacity: 0.4 },
  notFoundTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 8 },
  notFoundBody: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, fontStyle: 'italic', textAlign: 'center', marginBottom: 24 },
  privateBody: { fontFamily: fonts.body, fontSize: 14, color: colors.bone, opacity: 0.7, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  ghostBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // ── NEW: SectionLabel ──
  sectionLabelWrap: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 12 },

  // ── NEW: Tab Header ──
  tabHeaderTextWrap: { flex: 1 },
  tabHeaderUsername: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2.5, color: colors.fog },
  tabHeaderTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, lineHeight: 24 },
  tabScrollContent: { paddingBottom: 80, paddingTop: 8 },
  tabContentPad: { paddingHorizontal: 16 },
  tabGap: { gap: 28 },
  filterGroupCol: { marginBottom: 16, gap: 10 },
  searchIconStyle: { opacity: 0.5, marginRight: 6 },
  searchWrapFlex: { flex: 1 },
  searchNoResults: { textAlign: 'center', padding: 24, color: colors.fog, fontFamily: fonts.body, fontSize: 13 },

  // ── NEW: Poster Cards ──
  posterPlaceholder: { backgroundColor: colors.soot, justifyContent: 'center', alignItems: 'center' },
  posterRatingRow: { flexDirection: 'row', gap: 2 },
  posterCardWrap: { width: POSTER_COL_4, aspectRatio: 2 / 3, position: 'relative' },
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
  stackEmptyBg: { flex: 1, backgroundColor: colors.soot },

  // ── NEW: Projector Tab ──
  projectorGap: { gap: 32 },
  projectorHeader: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  projectorSuper: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2.5, color: colors.sepia, marginBottom: 6 },
  projectorTitle: { fontFamily: fonts.display, fontSize: 28, color: colors.parchment, lineHeight: 32, textAlign: 'center' },
  projectorSub: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, fontStyle: 'italic', marginTop: 6 },
  projectorSectionsWrap: { paddingHorizontal: 16, gap: 32 },

  // ── NEW: Favourites ──
  favPosterThumb: { width: 28, height: 42, borderRadius: 2 },
  favTextWrap: { flex: 1 },
  favTitle: { fontFamily: fonts.sub, fontSize: 12, color: colors.parchment, lineHeight: 16 },
  favRatingRow: { flexDirection: 'row', gap: 2, marginTop: 2 },

  // ── NEW: Calendar ──
  comingSoonText: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, textAlign: 'center', fontStyle: 'italic' },
  emptyLockIcon: { marginBottom: 12, opacity: 0.5 },

  // ── NEW: Avatar ──
  avatarPlaceholder: { backgroundColor: colors.soot, justifyContent: 'center', alignItems: 'center' },
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
    color: 'rgba(196,150,26,0.5)', textAlign: 'center',
  },

  // ── Member Since ──
  memberSince: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2.5,
    color: colors.fog, opacity: 0.5, marginBottom: 4,
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
    color: 'rgba(196,150,26,0.4)',
  },
});

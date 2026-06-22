 
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import {
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions
} from 'react-native';
import AnimatedRN, { Easing, FadeIn, cancelAnimation, useAnimatedReaction, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
 
import { useFilmStore } from '@/src/stores/films';
 
import type { ProfileLog, ProfileVaultItem, ProfileWatchlistItem } from '@/src/types';
 
import { globalScrollY } from '@/src/lib/scrollBridge';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
 
import { ReelRating, SectionDivider } from '@/src/components/Decorative';
import { CinematicInsights } from '@/src/components/profile/CinematicInsights';
import { ProgrammesSection } from '@/src/components/profile/ProgrammesSection';
import { tmdb } from '@/src/lib/tmdb';
import { colors } from '@/src/theme/theme';
// CinematicMap is missing from workspace, commenting out to avoid compilation errors
// import { CinematicMap } from '@/src/components/profile/CinematicMap';
 
import { useProfileController } from '@/src/hooks/useProfileController';
 
import { Achievements } from '@/src/components/profile/Achievements';
import { CinemaDNACard } from '@/src/components/profile/CinemaDNACard';
import NitrateCalendarGrid from '@/src/components/profile/NitrateCalendarGrid';
import { NoirPassport } from '@/src/components/profile/NoirPassport';
import ProfileArchiveTab from '@/src/components/profile/ProfileArchiveTab';
import { ProfileBackdrop } from '@/src/components/profile/ProfileBackdrop';
import ProfileLedgerTab from '@/src/components/profile/ProfileLedgerTab';
import { ProfileTriptych } from '@/src/components/profile/ProfileTriptych';
import ProfileWatchlistTab from '@/src/components/profile/ProfileWatchlistTab';
import { ProjectorRoom } from '@/src/components/profile/ProjectorRoom';
import { TasteDNA } from '@/src/components/profile/TasteDNA';
import { TasteMatch } from '@/src/components/profile/TasteMatch';
import { WatchlistRoulette } from '@/src/components/profile/WatchlistRoulette';
import { useProfileComputed } from './profileComputed';
import { s } from './profileStyles';
 
import { CinematicScrollView } from '@/src/components/layout/CinematicScrollView';
import PressableScale from '@/src/components/PressableScale';
import ProfileListsTab from '@/src/components/profile/ProfileListsTab';
import ProfilePhysicalTab from '@/src/components/profile/ProfilePhysicalTab';
import { isArchivistPlusTier, isAuteurPlusTier, resolveTier } from '@/src/utils/tier';
import {
     
    Archive,
     
    ArrowLeft,
    CalendarDays,
    ChevronLeft,
    Crown, Dna,
    Film as FilmIcon,
    Flame,
    Globe,
    Lock,
    MoreVertical,
    Settings,
    Sparkles,
    Star
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ════════════════════════════════════════════════════════════

import { ContentActionSheet } from '@/src/components/moderation/ContentActionSheet';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import { GoldDivider, SectionLabel, StatCard } from '@/src/components/profile/ProfileHelpers';
import { ProfilePosterCard } from '@/src/components/profile/ProfilePosterCard';
import { useBlockStore } from '@/src/stores/blockStore';
 

const AnimatedView = AnimatedRN.createAnimatedComponent(View);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type ProfileTab = 'archive' | 'ledger' | 'watchlist' | 'lists' | 'physical' | 'passport' | 'projector' | 'calendar';


interface SocialLink {
  title: string;
  url: string;
}



// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
// MAIN PROFILE SCREEN
// ════════════════════════════════════════════════════════════

const TAB_TITLES: Record<string, string> = {
  archive: 'The Archive', ledger: 'The Ledger', watchlist: 'Watchlist',
  lists: 'The Stacks', physical: 'Physical Archive', passport: 'Passport',
  projector: 'Global Analytics', calendar: "The AUTEUR's Calendar",
};

export default function UserProfileScreen({ usernameOverride, isRootTab = false }: { usernameOverride?: string, isRootTab?: boolean } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const params = useLocalSearchParams<{ username: string; tab?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const scrollY = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      if (isRootTab) {
        globalScrollY.value = withTiming(scrollY.value, { duration: 250 });
      }
    }, [scrollY, isRootTab])
  );

  useAnimatedReaction(
    () => scrollY.value,
    (current) => {
      if (isRootTab) {
        globalScrollY.value = current;
      }
    }
  );

  // ── State controller ──
  const ctrl = useProfileController(usernameOverride);
  const { nav, data } = ctrl;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { targetUser, loading, counts, mainLogs, archiveLogs, ledgerLogs, watchlist, vault, lists, analyticsLogs, calendarData, serverAnalytics, serverStreak, setTargetUser } = data;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { username, isSelf, isFollowing, isRequested, activeTab, myLogs, myWatchlist, myVault, myLists, setActiveTab } = ctrl;
  const { archiveSieve, ledgerSearch, ledgerRatingFilter, watchlistSearch, watchlistSort, physicalFilter, setArchiveSieve, setLedgerSearch, setLedgerRatingFilter, setWatchlistSearch, setWatchlistSort, setPhysicalFilter } = ctrl;

  
  const filmStore = useFilmStore();

  // ── Moderation State ──
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const isBlocked = useBlockStore((state) => state.isBlocked(targetUser?.id ?? ''));
  const isMuted = useBlockStore((state) => state.isMuted(targetUser?.id ?? ''));
  const blockStore = useBlockStore();

  const POSTER_COL_4 = (windowWidth - 32 - 18) / 4;
  const POSTER_COL_3 = (windowWidth - 32 - 16) / 3;

  // Breathing avatar animation — purely on native thread (capped to save battery)
  const breatheAnim = useSharedValue(0.4);
  useEffect(() => {
    // Capped at 20 repeats (approx 72 seconds) to allow UI thread idling and prevent battery drain
    breatheAnim.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }), 20, true);
    return () => cancelAnimation(breatheAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: breatheAnim.value }));


  const { refreshing, onRefresh, dnaCardOpen, setDnaCardOpen, rouletteOpen, setRouletteOpen, followLoading, toggleFollow } = ctrl;
  const { toEditProfile: navToEditProfile, toSettings: navToSettings, toMembership: navToMembership, toFollowers: navToFollowers, toFollowing: navToFollowing, toCalendar: navToCalendar, openSocialLink, handleBack } = nav;
  const closeDnaCard = useCallback(() => setDnaCardOpen(false), [setDnaCardOpen]);
  const closeRoulette = useCallback(() => setRouletteOpen(false), [setRouletteOpen]);
  const onRouletteSelect = useCallback((id: number) => { setRouletteOpen(false); (router.push as any)(`/film/${id}` as never); }, [setRouletteOpen, router]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { fetchLogs, fetchWatchlist, fetchPhysicalArchive, fetchLists } = filmStore;
  const loadMoreLogs = data.loadMoreLogs;
  const loadMoreWatchlist = data.loadMoreWatchlist;
  const loadMoreVault = data.loadMoreVault;
  const loadMoreLists = data.loadMoreLists;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const hasMoreMainLogs = data.hasMoreMainLogs;
  const hasMoreArchiveLogs = data.hasMoreArchiveLogs;
  const hasMoreLedgerLogs = data.hasMoreLedgerLogs;
  const hasMoreWatchlist = data.hasMoreWatchlist;
  const hasMoreVault = data.hasMoreVault;
  const hasMoreLists = data.hasMoreLists;
  const isLoadingMore = data.isLoadingMore;

  const tier = resolveTier(targetUser);
  const isArchivistPlus = isArchivistPlusTier(targetUser);
  const isAuteurPlus = isAuteurPlusTier(targetUser);
  const isPrivate = targetUser?.is_social_private && !isSelf && !isFollowing;

  const {
    displayLogs,
    displayWatchlist,
    displayVault,
    displayLists,
    totalFilms,
    statsLevel,
    statsColor,
    statsProgress,
    streak,
    archiveFiltered,
    ledgerFiltered,
    halfLifeMap,
    watchlistFiltered,
    physicalFiltered,
    physicalFormatCounts,
    recentLogs,
    uniqueFilms,
    socialLinks,
    COLLECTION_CARDS
  } = useProfileComputed({
    targetUser,
    isSelf,
    isArchivistPlus,
    isAuteurPlus,
    myLogs,
    myWatchlist,
    myVault,
    myLists,
    mainLogs,
    archiveLogs,
    ledgerLogs,
    watchlist,
    vault,
    lists,
    counts,
    serverStreak,
    username: typeof username === 'string' ? username : '',
    analyticsLogs,
    archiveSieve,
    ledgerSearch,
    ledgerRatingFilter,
    watchlistSearch,
    watchlistSort,
    physicalFilter,
  });

  // Group by month helper
  const groupByMonth = useCallback(<T extends ProfileLog | ProfileVaultItem>(items: T[], dateKey = 'watchedDate') => {
    const grouped: Record<string, T[]> = {};
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    for (const item of items) {
      const d = (item as any)[dateKey] || (item as any).createdAt || new Date().toISOString();
      let year = 1970;
      let month = 0;
      if (typeof d === 'string') {
        const parts = d.substring(0, 10).split('-');
        if (parts.length === 3) {
          year = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10) - 1;
        } else {
          const dateObj = new Date(d);
          if (!isNaN(dateObj.getTime())) {
            year = dateObj.getFullYear();
            month = dateObj.getMonth();
          }
        }
      } else {
        const dateObj = new Date(d);
        if (!isNaN(dateObj.getTime())) {
          year = dateObj.getFullYear();
          month = dateObj.getMonth();
        }
      }
      const title = `${months[month]} ${year}`.toUpperCase();
      if (!grouped[title]) grouped[title] = [];
      grouped[title].push(item);
    }
    return grouped;
  }, []);
  // ════════════════════════════════════════════════════════════
  // POSTER CARD — Reusable log poster with tier glow
  // ════════════════════════════════════════════════════════════
  const renderPosterCard = useCallback((item: ProfileLog | ProfileVaultItem | ProfileWatchlistItem, width: number, showRating = false, showTimeAgo = false, navigateToLog = false) => {
    return (
      <ProfilePosterCard
        item={item}
        width={width}
        showRating={showRating}
        showTimeAgo={showTimeAgo}
        navigateToLog={navigateToLog}
        isAuteurPlus={isAuteurPlus}
        isArchivistPlus={isArchivistPlus}
      />
    );
  }, [isAuteurPlus, isArchivistPlus]);

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


  // ════════════════════════════════════════════════════════════
  // MODALS
  // ════════════════════════════════════════════════════════════
  const modals = (
    <>
      {dnaCardOpen && <CinemaDNACard {...{logs: analyticsLogs.length > 0 ? analyticsLogs : displayLogs, user: targetUser, analytics: serverAnalytics, onClose: closeDnaCard} as any} />}
      <WatchlistRoulette visible={rouletteOpen} watchlist={watchlistFiltered} onClose={closeRoulette} onSelect={onRouletteSelect} />
      {!isSelf && (
        <>
          <ContentActionSheet
            visible={actionSheetVisible}
            targetUserId={targetUser.id}
            targetUsername={targetUser.username || ''}
            contentType="profile"
            contentId={targetUser.id}
            onClose={() => setActionSheetVisible(false)}
            onReport={() => { setActionSheetVisible(false); setReportSheetVisible(true); }}
            onBlock={() => { setActionSheetVisible(false); blockStore.blockUser(targetUser.id); }}
            onMute={() => { setActionSheetVisible(false); blockStore.muteUser(targetUser.id); }}
            onUnblock={() => { setActionSheetVisible(false); blockStore.unblockUser(targetUser.id); }}
            onUnmute={() => { setActionSheetVisible(false); blockStore.unmuteUser(targetUser.id); }}
            showUnblock={isBlocked}
            showUnmute={isMuted}
          />
          <ReportSheet
            visible={reportSheetVisible}
            contentType="profile"
            contentId={targetUser.id}
            targetUserId={targetUser.id}
            targetUsername={targetUser.username || ''}
            onDismiss={() => setReportSheetVisible(false)}
          />
        </>
      )}
    </>
  );

  // ════════════════════════════════════════════════════════════
  // TAB PAGE MODE
  // ════════════════════════════════════════════════════════════
  if (activeTab) {
    return (
      <View style={s.container}>
        {/* ── Tab Header ── */}
        <View style={[s.tabPageHeader, { paddingTop: Math.max(insets.top + 10, 40) }]}>
          <PressableScale onPress={() => (router.push as any)(`/user/${username}` as any)} style={s.topNavBtn} accessibilityRole="button" accessibilityLabel="Back to profile" hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} haptic>
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
                renderPosterCard={renderPosterCard}
                groupByMonth={groupByMonth}
                POSTER_COL_4={POSTER_COL_4}
                onLoadMore={(isSelf && archiveSieve === 'all') ? (filmStore.archiveHasMore ? loadMoreLogs : undefined) : (hasMoreArchiveLogs ? loadMoreLogs : undefined)}
                isLoadingMore={(isSelf && archiveSieve === 'all') ? filmStore._fetchingLogs : isLoadingMore.logs_archive}
                refreshing={refreshing}
                onRefresh={onRefresh}
                bottomInset={insets.bottom}
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
                renderPosterCard={renderPosterCard}
                groupByMonth={groupByMonth}
                POSTER_COL_4={POSTER_COL_4}
                onLoadMore={(isSelf && ledgerSearch.trim() === '' && ledgerRatingFilter === 'all') ? (filmStore.logsHasMore ? loadMoreLogs : undefined) : (hasMoreLedgerLogs ? loadMoreLogs : undefined)}
                isLoadingMore={(isSelf && ledgerSearch.trim() === '' && ledgerRatingFilter === 'all') ? filmStore._fetchingLogs : isLoadingMore.logs_ledger}
                isSelf={isSelf}
                refreshing={refreshing}
                onRefresh={onRefresh}
                bottomInset={insets.bottom}
              />
            )}

            {/* ═══ WATCHLIST TAB ═══ */}
            {activeTab === 'watchlist' && (
              <ProfileWatchlistTab
                watchlist={displayWatchlist}
                watchlistSearch={watchlistSearch}
                setWatchlistSearch={setWatchlistSearch}
                watchlistSort={watchlistSort}
                setWatchlistSort={setWatchlistSort}
                watchlistFiltered={watchlistFiltered}
                renderPosterCard={renderPosterCard}
                POSTER_COL_3={POSTER_COL_3}
                onLoadMore={(isSelf && watchlistSearch.trim() === '' && watchlistSort === 'default') ? (filmStore.watchlistHasMore ? loadMoreWatchlist : undefined) : (hasMoreWatchlist ? loadMoreWatchlist : undefined)}
                isLoadingMore={(isSelf && watchlistSearch.trim() === '' && watchlistSort === 'default') ? filmStore._fetchingWatchlist : isLoadingMore.watchlist}
                isSelf={isSelf}
                setRouletteOpen={setRouletteOpen}
                refreshing={refreshing}
                onRefresh={onRefresh}
                bottomInset={insets.bottom}
              />
            )}

            {/* ═══ STACKS/LISTS TAB ═══ */}
            {activeTab === 'lists' && (
              <ProfileListsTab 
                lists={displayLists} 
                onLoadMore={hasMoreLists ? loadMoreLists : undefined}
                isLoadingMore={isSelf ? filmStore._fetchingLists : isLoadingMore.lists}
                hasMore={isSelf ? filmStore.listsHasMore : hasMoreLists}
                isSelf={isSelf}
                refreshing={refreshing}
                onRefresh={onRefresh}
                bottomInset={insets.bottom}
              />
            )}

            {/* ═══ PHYSICAL ARCHIVE TAB ═══ */}
            {activeTab === 'physical' && (
              isArchivistPlus ? (
                <ProfilePhysicalTab
                  isSelf={isSelf}
                  vault={displayVault}
                  physicalFilter={physicalFilter}
                  setPhysicalFilter={setPhysicalFilter}
                  physicalFormatCounts={physicalFormatCounts}
                  physicalFiltered={physicalFiltered}
                  groupByMonth={groupByMonth}
                  onLoadMore={(isSelf && physicalFilter === 'all') ? (filmStore.archiveHasMore ? loadMoreVault : undefined) : (hasMoreVault ? loadMoreVault : undefined)}
                  isLoadingMore={(isSelf && physicalFilter === 'all') ? filmStore._fetchingArchive : isLoadingMore.vault}
                  hasMore={(isSelf && physicalFilter === 'all') ? filmStore.archiveHasMore : hasMoreVault}
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  bottomInset={insets.bottom}
                />
              ) : (
                <View style={s.tabContentPad}>
                  <View style={s.emptyState}>
                    <Lock size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
                    <Text style={s.emptyTitle}>Archivist+ Feature</Text>
                    <Text style={s.emptyDesc}>
                      {isSelf ? "Upgrade to Archivist or Auteur to unlock the physical archive." : "This member hasn't unlocked the physical archive yet."}
                    </Text>
                  </View>
                </View>
              )
            )}
          </View>
        ) : (
          <ScrollView contentContainerStyle={[s.tabScrollContent, { paddingBottom: Math.max(insets.bottom + 80, 80) }]} showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} />}>
            {/* ═══ PASSPORT TAB ═══ */}
            {activeTab === 'passport' && (
              isAuteurPlus ? (
                <View style={s.tabContentPad}><NoirPassport {...{user: targetUser, logs: analyticsLogs.length > 0 ? analyticsLogs : displayLogs, analytics: serverAnalytics} as any} /></View>
              ) : (
                <View style={s.tabContentPad}>
                  <View style={s.emptyState}>
                    <Lock size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
                    <Text style={s.emptyTitle}>Auteur+ Feature</Text>
                    <Text style={s.emptyDesc}>
                      {isSelf ? "Upgrade to Auteur to unlock the cinematic passport." : "This member hasn't unlocked the cinematic passport yet."}
                    </Text>
                  </View>
                </View>
              )
            )}

            {/* ═══ PROJECTOR / ANALYTICS TAB ═══ */}
            {activeTab === 'projector' && (
              isAuteurPlus ? (
                <View style={s.projectorGap}>
                  {/* Header */}
                  <View style={s.projectorHeader}>
                    <Text style={s.projectorSuper}>GLOBAL ANALYTICS</Text>
                    <Text style={s.projectorTitle}>The Projector Room</Text>
                    <Text style={s.projectorSub}>Lifetime cinematic data & achievements.</Text>
                  </View>

                  {/* Cinema DNA CTA */}
                  <View style={s.tabContentPad}>
                    <PressableScale style={s.ctaBtn} onPress={() => { setDnaCardOpen(true); data.loadTabData('projector'); }} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic>
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
                      <TasteDNA logs={(analyticsLogs.length > 0 ? analyticsLogs : displayLogs) as any} username={targetUser?.username || username} />
                    </View>

                    {/* Cinematic Insights */}
                    <View>
                      <SectionLabel text="REAL ANALYTICS" />
                      <CinematicInsights {...{logs: analyticsLogs.length > 0 ? analyticsLogs : displayLogs} as any} />
                    </View>

                    {/* Society Honors */}
                    <View>
                      <SectionLabel text="SOCIETY HONORS" />
                      <Achievements {...{logs: analyticsLogs.length > 0 ? analyticsLogs : displayLogs, analytics: serverAnalytics} as any} />
                    </View>

                    {/* Your Favourites */}
                    {displayLogs.filter((l: ProfileLog) => l.rating >= 4).length > 0 && (
                      <View>
                        <SectionLabel text="HIGHEST RATED" />
                        <View style={s.card}>
                          {displayLogs.filter((l: ProfileLog) => l.rating >= 4).slice(0, 6).map((log: ProfileLog) => {
                            const posterUri = tmdb.poster(log.poster, 'w185');
                            return (
                              <PressableScale key={log.id} style={s.favouriteRow} onPress={() => log.filmId && (router.push as any)(`/film/${log.filmId}` as any)} haptic>
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
                      <NoirPassport {...{user: targetUser, logs: analyticsLogs.length > 0 ? analyticsLogs : displayLogs, analytics: serverAnalytics} as any} />
                    </View>

                    {/* Taste Match (other users only) */}
                    {!isSelf && myLogs.length >= 5 && (
                      <TasteMatch {...{myLogs, theirLogs: analyticsLogs.length > 0 ? analyticsLogs : displayLogs, theirUsername: targetUser.username} as any} />
                    )}

                    {/* Programmes */}
                    <ProgrammesSection programmes={(targetUser?.preferences as any)?.programmes ?? []} user={targetUser as any} uniqueFilms={uniqueFilms as any} isOwnProfile={isSelf} />
                  </View>
                </View>
              ) : (
                <View style={s.tabContentPad}>
                  <View style={s.emptyState}>
                    <Lock size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
                    <Text style={s.emptyTitle}>Auteur+ Feature</Text>
                    <Text style={s.emptyDesc}>
                      {isSelf ? "Upgrade to Auteur to unlock the global analytics projector room." : "This member hasn't unlocked the global analytics projector room yet."}
                    </Text>
                  </View>
                </View>
              )
            )}

            {/* ═══ CALENDAR TAB ═══ */}
            {activeTab === 'calendar' && (
              <View style={s.tabContentPad}>
                {isArchivistPlus ? (
                  <View>
                    <SectionLabel text="VIEWING HISTORY" />
                    <NitrateCalendarGrid {...{logs: calendarData.length > 0 ? calendarData : (analyticsLogs.length > 0 ? analyticsLogs : displayLogs), isSelf} as any} />
                  </View>
                ) : (
                  <View style={s.emptyState}>
                    <Lock size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
                    <Text style={s.emptyTitle}>Archivist+ Feature</Text>
                    <Text style={s.emptyDesc}>
                      {isSelf ? "Upgrade to Archivist or Auteur to unlock the viewing calendar." : "This member hasn't unlocked the viewing calendar yet."}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        )}

        {modals}
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

      <CinematicScrollView contentContainerStyle={[s.mainScrollContent, { paddingBottom: Math.max(insets.bottom + 60, 60) }]} showsVerticalScrollIndicator={false}
        externalScrollY={scrollY} bottomInset={Math.max(insets.bottom + 60, 60)} scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} />}>

        {/* ═══ ATMOSPHERIC HEADER ═══ */}
        <View style={s.headerWrap}>
          {/* Tier-specific backdrop rendering */}
          {isAuteurPlus ? (
            <ProfileBackdrop {...{user: targetUser, logs: displayLogs} as any} />
          ) : isArchivistPlus ? (
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
          <View style={[s.projectorSpotlight, isAuteurPlus && s.spotlightAuteur, (!isAuteurPlus && isArchivistPlus) && s.spotlightArchivist]} />

          {/* Film grain texture overlay */}
          <View style={s.filmGrainOverlay} />

          {/* Bottom structural edge */}
          <View style={s.headerGoldEdge} />

          {/* ── Header Content ── */}
          <View style={s.headerContent}>

            {/* ── Avatar with Tier-Specific Enclosure ── */}
            <View style={s.avatarWrap}>
              <View style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center' }}>
                <AnimatedView style={[
                  StyleSheet.absoluteFillObject,
                  s.avatarRing, 
                  isAuteurPlus ? s.avatarRingAuteur : isArchivistPlus ? s.avatarRingArchivist : s.avatarRingCinephile,
                  pulseStyle
                ]} />
                {targetUser.avatar_url ? (
                  <Image source={{ uri: targetUser.avatar_url }} style={s.avatar} cachePolicy="memory-disk" />
                ) : (
                  <View style={[s.avatar, { backgroundColor: colors.ink }]} />
                )}
              </View>

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
              <Text style={s.displayName} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.5}>
                {targetUser.persona ? targetUser.persona.toUpperCase() : (targetUser.display_name ? targetUser.display_name.toUpperCase() : `@${(targetUser.username || 'unknown').toUpperCase()}`)}
              </Text>
              {isAuteurPlus && (
                <View style={s.auteurBadge}>
                  <Star size={9} color={'#FFB3B3'} fill={'#FFB3B3'} />
                  <Text style={s.auteurBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>AUTEUR</Text>
                </View>
              )}
              {(!isAuteurPlus && isArchivistPlus) && (
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
              <View style={s.profileActionRow}>
                <PressableScale style={[s.followBtn, (isFollowing || isRequested) && s.followingBtn, followLoading && { opacity: 0.5 }]} onPress={toggleFollow} disabled={followLoading || isRequested} pressedScale={0.92} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="medium" accessibilityRole="button" accessibilityLabel={isFollowing ? "Unfollow user" : "Follow user"}>
                  <AnimatedRN.Text entering={FadeIn.duration(300)} style={[s.followBtnText, (isFollowing || isRequested) && s.followingBtnText]} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.75}>
                    {followLoading ? '...' : isFollowing ? 'SYNDICATED' : isRequested ? 'REQUESTED' : targetUser.is_social_private ? '+ REQUEST' : '+ FOLLOW'}
                  </AnimatedRN.Text>
                </PressableScale>
                <PressableScale
                  style={s.moreBtn}
                  onPress={() => setActionSheetVisible(true)}
                  hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                  haptic="selection"
                  pressedScale={0.92}
                  accessibilityLabel="More options for this member"
                >
                  <MoreVertical size={18} color={colors.fog} strokeWidth={1.5} />
                </PressableScale>
              </View>
            )}

            {/* ── Stats Row ── */}
            {(!targetUser.preferences?.hide_stats || isSelf) && (
              <View style={s.statsGrid}>
                <StatCard label="FILMS" value={totalFilms} />
                <StatCard label="FOLLOWERS" value={targetUser.followers_count || 0} onPress={isPrivate ? undefined : navToFollowers} />
                <StatCard label="FOLLOWING" value={targetUser.following_count || 0} onPress={isPrivate ? undefined : navToFollowing} />
                <StatCard label="WATCHLIST" value={counts.watchlist} isLast />
              </View>
            )}

            {isPrivate ? (
              <View style={{ alignItems: 'center', paddingTop: 60, paddingBottom: 60, backgroundColor: 'transparent' }}>
                <Lock size={48} color={colors.sepia} strokeWidth={1} style={{ marginBottom: 16, opacity: 0.8 }} />
                <Text style={s.notFoundTitle}>Private Account</Text>
                <Text style={[s.privateBody, { textAlign: 'center', maxWidth: 280, marginTop: 8 }]}>
                  Follow to see their logs, lists, and watchlists.
                </Text>
              </View>
            ) : (
              <>
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
                  <ProfileTriptych 
                    user={{ 
                      id: targetUser.id, 
                      preferences: targetUser.preferences ? { favorites: targetUser.preferences.favorites as import('@/src/components/profile/ProfileTriptych').TriptychFilm[] } : null 
                    }} 
                    isOwnProfile={isSelf} 
                    userRole={tier} 
                  />
                </View>

                {/* ── Recently Watched ── */}
                {recentLogs.length > 0 && (
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
                )}
              </>
            )}
          </View>
        </View>

        {/* ═══ OPAQUE CONTENT AREA ═══ */}
        {!isPrivate && (
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
              {COLLECTION_CARDS.map((item: any, idx: number) => (
                <View key={item.id}>
                <PressableScale
                  style={[s.collectionCard, item.disabled && s.collectionCardDisabled, item.highlight && s.collectionCardHighlight]}
                  disabled={item.disabled}
                  onPress={() => (router.push as any)({ pathname: `/user/${username}`, params: { tab: item.id } } as any)}
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
          <View style={s.calendarCtaWrap}>
            <PressableScale
              style={s.collectionCardWide}
              onPress={navToCalendar}
              haptic
            >
              {!isArchivistPlus && <Lock size={12} color={colors.fog} strokeWidth={1.5} style={s.lockIconMr} />}
              {isArchivistPlus && <CalendarDays size={12} color={colors.sepia} strokeWidth={1.5} style={s.lockIconMr} />}
              { }
              <Text style={[s.calendarCtaText, isArchivistPlus && s.collectionHighlightText]}>
                {isSelf ? "THE AUTEUR'S CALENDAR" : "VIEWING CALENDAR"}
              </Text>
            </PressableScale>
          </View>

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
        )}
      </CinematicScrollView>

        {modals}
    </View>
  );
}


import { isNarrowed, ROOMS, type Room } from '@/src/utils/roomFilters';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '@/src/components/text';
import AnimatedRN, { Easing, Extrapolation, FadeIn, cancelAnimation, interpolate, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient as SvgRadialGradient, Stop } from 'react-native-svg';

import { useFilmStore } from '@/src/stores/films';
import { useShallow } from 'zustand/react/shallow';

import type { ProfileLog, ProfileVaultItem, ProfileWatchlistItem } from '@/src/types';

import { globalScrollY } from '@/src/lib/scrollBridge';
import { useFocusEffect, useRouter } from 'expo-router';
import { nav } from '@/src/utils/typedRouter';
import { useClearance } from '@/src/hooks/useClearance';

import { ReelRating, SectionDivider } from '@/src/components/Decorative';
import { CinematicInsights } from '@/src/components/profile/CinematicInsights';
import { tmdb } from '@/src/lib/tmdb';
import { colors } from '@/src/theme/theme';

import { useProfileController } from '@/src/hooks/useProfileController';

import { Achievements } from '@/src/components/profile/Achievements';
import { CinemaDNACard } from '@/src/components/profile/CinemaDNACard';
import { portraitInitial } from '@/src/components/profile/portraitInitial';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import NitrateCalendarGrid from '@/src/components/profile/NitrateCalendarGrid';
import { NoirPassport } from '@/src/components/profile/NoirPassport';
import ProfileArchiveTab from '@/src/components/profile/ProfileArchiveTab';
import { ProfileBackdrop, backdropSource } from '@/src/components/profile/ProfileBackdrop';
import ArchiveLock, { ArchiveLockedLine, useArchiveLock } from '@/src/components/profile/ArchiveLock';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import ProfileLedgerTab from '@/src/components/profile/ProfileLedgerTab';
import { ProfileTriptych } from '@/src/components/profile/ProfileTriptych';
import ProfileWatchlistTab from '@/src/components/profile/ProfileWatchlistTab';
import { ProjectorRoom } from '@/src/components/profile/ProjectorRoom';
import { TasteDNA } from '@/src/components/profile/TasteDNA';
import { TasteMatch } from '@/src/components/profile/TasteMatch';
import { WatchlistRoulette } from '@/src/components/profile/WatchlistRoulette';
import { useProfileComputed, tally } from '@/src/components/profile/profileComputed';
import { s } from '@/src/components/profile/profileStyles';
import { RoomPlate, RoomSealed, RoomFoot, RoomRetrieving, RoomUnreachable } from '@/src/components/profile/RoomParts';

import { CinematicScrollView } from '@/src/components/layout/CinematicScrollView';
import PressableScale from '@/src/components/PressableScale';
import ProfileListsTab from '@/src/components/profile/ProfileListsTab';
import ProfilePhysicalTab from '@/src/components/profile/ProfilePhysicalTab';
import { isArchivistPlusTier, isAuteurPlusTier, resolveTier } from '@/src/utils/tier';
import { RankBadge, rankOf } from '@/src/components/RankBadge';
import { formatDateMonthYear, timeAgo } from '@/src/utils/timeAgo';
import {
    ArrowLeft,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Dna,
    Film as FilmIcon,
    Globe,
    KeyRound,
    MoreVertical,
    Settings,
    Sparkles
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ════════════════════════════════════════════════════════════

import { ContentActionSheet } from '@/src/components/moderation/ContentActionSheet';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import { StatCard } from '@/src/components/profile/ProfileHelpers';
import { ProfilePosterCard } from '@/src/components/profile/ProfilePosterCard';
import { useBlockStore } from '@/src/stores/blockStore';
import { decorativeTextProps, displayTextProps, scaledTextProps } from '@/src/constants/textScaling';
import { useTextScale } from '@/src/hooks/useTextScale';
import { heroNameSize } from '@/src/components/profile/heroNameSize';
import { softBreak } from '@/src/utils/softBreak';
import { useScreenReady } from '@/src/hooks/useScreenReady';
import { EmptyOffline } from '@/src/components/EmptyStates';
import Buster, { BusterEyes } from '@/src/components/Buster';


const AnimatedView = AnimatedRN.createAnimatedComponent(View);

type ProfileTab = 'archive' | 'ledger' | 'watchlist' | 'lists' | 'physical' | 'passport' | 'projector' | 'calendar';


interface SocialLink {
  title: string;
  url: string;
}

// ════════════════════════════════════════════════════════════
// MAIN PROFILE SCREEN
// ════════════════════════════════════════════════════════════

// The six rooms of the member's private wing — one voice, every door named.
const TAB_TITLES: Record<string, string> = {
  archive: 'The Archive', ledger: 'The Ledger', watchlist: 'The Watchlist',
  lists: 'The Stacks', physical: 'The Physical Archive', passport: 'The Cinematic Passport',
  projector: 'The Projector Room', calendar: 'The Viewing Calendar',
};

// ── The projector's pool of light — a true radial, tier-tinted, painted once ──
function SpotlightPool({ tint, opacity }: { tint: string; opacity: number }) {
  return (
    <View style={spotStyles.wrap} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <SvgRadialGradient id="plateSpot" cx="50%" cy="22%" rx="58%" ry="62%">
            <Stop offset="0%" stopColor={tint} stopOpacity={String(opacity)} />
            <Stop offset="100%" stopColor={tint} stopOpacity="0" />
          </SvgRadialGradient>
        </Defs>
        <Ellipse cx="50%" cy="28%" rx="62%" ry="58%" fill="url(#plateSpot)" />
      </Svg>
    </View>
  );
}
const spotStyles = StyleSheet.create({
  wrap: { position: 'absolute', top: -30, left: 0, right: 0, height: 340, zIndex: 1 },
});

/** Small numbers read better as words on a plate. */
const WORD = ['no', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];

// ── The velvet rope — locked rooms invite, they never dead-end ──
function VelvetGate({ title, line, isSelf, onAscend }: { title: string; line: string; isSelf: boolean; onAscend: () => void }) {
  return (
    <View style={s.emptyState}>
      <KeyRound size={26} color={colors.sepia} strokeWidth={1.5} style={s.emptyLockIcon} />
      <Text {...scaledTextProps} style={s.emptyTitle}>{title}</Text>
      <Text {...scaledTextProps} style={s.emptyDesc}>{line}</Text>
      {isSelf && (
        <PressableScale
          style={s.ascendBtn}
          onPress={onAscend}
          haptic="medium"
          accessibilityRole="button"
          accessibilityLabel="Ascend the ranks — opens membership"
        >
          <Text {...scaledTextProps} style={s.ascendBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>✦ ASCEND THE RANKS</Text>
        </PressableScale>
      )}
    </View>
  );
}

export default function UserProfileScreen({ usernameOverride, isRootTab = false }: { usernameOverride?: string, isRootTab?: boolean } = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
  const { nav: doors, data } = ctrl;
  const { targetUser, loading, counts, mainLogs, archiveLogs, ledgerLogs, watchlist, vault, lists, analyticsLogs, calendarData, serverAnalytics, serverStreak, analyticsShape, taste } = data;
  const { username, isSelf, repairingHandle, isFollowing, isRequested, activeTab, myLogs, myWatchlist, myVault, myLists } = ctrl;
  const readyMark = useScreenReady('member', !loading && !repairingHandle);
  // Your own Archive, wherever this page shows it, behind one lock (Settings).
  const archiveLock = useArchiveLock(isSelf);
  const { archiveSieve, archiveSearch, listsSearch, physicalSearch, ledgerSearch, ledgerRatingFilter, watchlistSearch, watchlistSort, watchlistDecade, physicalFilter, physicalSort, listsSort, setArchiveSieve, setArchiveSearch, setListsSearch, setPhysicalSearch, setLedgerSearch, setLedgerRatingFilter, setWatchlistSearch, setWatchlistSort, setWatchlistDecade, setPhysicalFilter, setPhysicalSort, setListsSort } = ctrl;


  // The eight fields this page reads, compared shallowly: the whole store
  // redrew this page on every log, watchlist or stack change anywhere.
  const filmStore = useFilmStore(useShallow((st) => ({
    logsHasMore: st.logsHasMore, watchlistHasMore: st.watchlistHasMore,
    listsHasMore: st.listsHasMore, archiveHasMore: st.archiveHasMore,
    _fetchingLogs: st._fetchingLogs, _fetchingWatchlist: st._fetchingWatchlist,
    _fetchingLists: st._fetchingLists, _fetchingArchive: st._fetchingArchive,
  })));

  // ── Moderation State ──
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const isBlocked = useBlockStore((state) => state.isBlocked(targetUser?.id ?? ''));
  const isMuted = useBlockStore((state) => state.isMuted(targetUser?.id ?? ''));
  const blockStore = useBlockStore();

  const breatheAnim = useSharedValue(0.4);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: breatheAnim.value }));

  // ── THE DEVELOPING PLATE ──────────────────────────────────────
  // The dossier photo develops in the Society's darkroom: one-shot,
  // three beats — atmosphere breathes up, the portrait develops from a
  // faint ghost, the member Nº stamps down last. Pure timing curve
  // (no bounce, per the motion law); reduce-motion → quick plain fade;
  // re-runs only when a different member's dossier is opened.
  const reducedMotion = useReducedMotion();
  const plate = useSharedValue(0);
  useEffect(() => {
    plate.value = 0;
    plate.value = withTiming(1, {
      duration: reducedMotion ? 250 : 900,
      easing: Easing.bezier(0.33, 0, 0.15, 1),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUser?.id, reducedMotion]);

  const atmosphereDevelop = useAnimatedStyle(() => ({
    opacity: interpolate(plate.value, [0, 0.55], [0, 1], Extrapolation.CLAMP),
  }));
  const portraitDevelop = useAnimatedStyle(() => ({
    opacity: interpolate(plate.value, [0.15, 0.75], [0.25, 1], Extrapolation.CLAMP),
  }));
  const stampDevelop = useAnimatedStyle(() => {
    const p = interpolate(plate.value, [0.6, 1], [0, 1], Extrapolation.CLAMP);
    return { opacity: p, transform: [{ scale: 1.12 - 0.12 * p }] };
  });


  const { refreshing, onRefresh, dnaCardOpen, setDnaCardOpen, rouletteOpen, setRouletteOpen, followLoading, toggleFollow } = ctrl;
  const { toEditProfile: navToEditProfile, toSettings: navToSettings, toMembership: navToMembership, toFollowers: navToFollowers, toFollowing: navToFollowing, toCalendar: navToCalendar, openSocialLink, handleBack } = doors;
  const closeDnaCard = useCallback(() => setDnaCardOpen(false), [setDnaCardOpen]);
  // The locked Physical Archive's own rope, so the Society page names what was reached for.
  const shelfRope = useClearance('physical-archive');
  const closeRoulette = useCallback(() => setRouletteOpen(false), [setRouletteOpen]);
  const onRouletteSelect = useCallback((id: number) => { setRouletteOpen(false); nav.push(`/film/${id}`); }, [setRouletteOpen]);

  const loadMoreLogs = data.loadMoreLogs;
  const loadMoreWatchlist = data.loadMoreWatchlist;
  const loadMoreVault = data.loadMoreVault;
  const loadMoreLists = data.loadMoreLists;
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

  // The breathing gold wash: only on an Archivist's plate, the one place it is
  // painted, and still under reduce-motion.
  const showsPulse = isArchivistPlus && !isAuteurPlus;
  useEffect(() => {
    if (!showsPulse || reducedMotion) return;
    // 20 half-breaths of 1.8s, about 36 seconds, then the UI thread rests.
    breatheAnim.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }), 20, true);
    return () => cancelAnimation(breatheAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showsPulse, reducedMotion]);

  // The rank's colour, echoed through the plate: brass, champagne, ruby.
  const tierLine = isAuteurPlus ? 'rgba(180,45,45,0.45)' : isArchivistPlus ? 'rgba(196,150,26,0.5)' : 'rgba(184,137,26,0.3)';
  // For WORDS, solid inks (the ruby pigment is 2.78:1 on this card); the line,
  // border and spot are marks and keep their pigments.
  const tierText = isAuteurPlus ? colors.crimsonInk : isArchivistPlus ? colors.champagne : colors.sepia;
  const tierStatsBorder = isAuteurPlus ? 'rgba(180,45,45,0.5)' : isArchivistPlus ? 'rgba(196,150,26,0.6)' : 'rgba(184,137,26,0.3)';
  const tierSpot = isAuteurPlus ? '#B42D2D' : isArchivistPlus ? colors.champagne : '#B8891A';
  const tierSpotOpacity = isAuteurPlus ? 0.2 : isArchivistPlus ? 0.26 : 0.18;

  // MEMBER Nº: the real serial, padded to four digits; hidden when there is none.
  const memberNo = (targetUser as any)?.member_no
    ? String((targetUser as any).member_no).padStart(4, '0')
    : null;

  // The portrait initial — no member ever faces a dead black circle.
  const avatarInitial = portraitInitial(targetUser as Parameters<typeof portraitInitial>[0]);

  // Favorites presence — guards the THE TRIPTYCH label so it never
  // floats orphaned over an altarpiece that rendered null for visitors.
  const hasFavorites = Array.isArray(targetUser?.preferences?.favorites)
    && (targetUser!.preferences!.favorites as unknown[]).filter(Boolean).length > 0;

  // ════════════════════════════════════════════════════════════
  // THE PARTICULARS — the member's name block, set beside their portrait
  // ════════════════════════════════════════════════════════════

  const heroName = String(
    targetUser?.persona || (targetUser as any)?.display_name || targetUser?.username || 'unknown',
  ).toUpperCase();
  const heroHandle = `@${(targetUser?.username || 'unknown').toUpperCase()}`;

  /** The handle's line, only when it is not the name again (no display name, or the same). */
  const showHandle = heroHandle.slice(1) !== heroName;

  const { width: windowWidth } = useWindowDimensions();
  // Letters widen with the text size (capped at 1.2); the spacing never does.
  const nameScale = useTextScale(displayTextProps.maxFontSizeMultiplier);
  // Fixed steps (heroNameSize.ts), not `adjustsFontSizeToFit`: one name, one size.
  const nameSize = heroNameSize(heroName, windowWidth, nameScale);
  const nameStyle = { fontSize: nameSize, lineHeight: Math.round(nameSize * 1.16), letterSpacing: nameSize >= 26 ? 1.4 : 1 };

  const bioText = targetUser?.bio?.trim() || (isSelf ? 'No bio yet. Tell the society who you are.' : 'No bio on file.');
  // Same reasoning as the name: fixed steps, and the longest bios get more
  // lines rather than smaller type.
  const bioSize = bioText.length <= 90 ? 12.5 : bioText.length <= 170 ? 11.5 : 10.5;
  const bioStyle = { fontSize: bioSize, lineHeight: Math.round(bioSize * 1.52) };
  const bioLines = bioText.length <= 90 ? 4 : bioText.length <= 170 ? 5 : 6;

  // `Nº 0147 · ADMITTED MARCH 2026`, the month by the house formatter (no Intl).
  // At large text it may wrap, only where a reader would: no-break spaces keep
  // `Nº 0147` and `MARCH 2026` whole, so the year is never the part cut.
  const NBSP = ' ';
  const admittedFull = formatDateMonthYear(targetUser?.created_at);
  const admitted = (() => {
    const [mon, yr] = admittedFull.split(' ');
    return mon && yr ? `ADMITTED ${mon.toUpperCase()}${NBSP}${yr}` : '';
  })();
  const serialLine = [memberNo ? `Nº${NBSP}${memberNo}` : '', admitted].filter(Boolean).join(' · ');

  // Founding is a FLAG, not a rank (`RankBadge` decides the rank): its own line.
  const isFounding = !!(targetUser as any)?.is_founding;

  // Your own file is a tab, with no back button; a pushed one clears the button,
  // from the expression the button itself is placed by.
  const heroTop = usernameOverride
    ? insets.top + 16
    : Math.max(insets.top + 10, 40) + 46;   // topNav padding + the 40pt button + 6


  const {
    displayLogs,
    displayWatchlist,
    displayVault,
    displayLists,
    totalFilms,
    totalWatchlist,
    // Reconciled totals, never the room's windowed array (it caps at 150).
    totalLedger,
    totalLists,
    totalVault,
    statsLevel,
    statsColor,
    statsProgress,
    streak,
    archiveFiltered,
    ledgerFiltered,
    halfLifeMap,
    watchlistFiltered,
    watchlistDecadeCounts,
    physicalFiltered,
    physicalFormatCounts,
    recentLogs,
    socialLinks,
    COLLECTION_CARDS
  } = useProfileComputed({
    targetUser,
    isSelf,
    isArchivistPlus,
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
    archiveSearch,
    listsSearch,
    physicalSearch,
    ledgerSearch,
    ledgerRatingFilter,
    watchlistSearch,
    watchlistSort,
    watchlistDecade,
    physicalFilter,
    physicalSort,
    listsSort,
    serverDecades: analyticsShape?.watchlist_decades,
  });

  // The reading lamp hangs from the backdrop's hem (the plate's laid-out height),
  // and the same film's colour blooms onto the page beneath.
  const heroArt = backdropSource(targetUser as never);
  const [plateH, setPlateH] = useState(0);
  const lit = heroArt && plateH > 0 ? { hem: plateH, art: heroArt } : {};

  // True at every rank: it counts the rooms it DRAWS locked, not a number from
  // the tier's name; an Archivist, none locked, is still told of rooms above.
  const lockedRooms = COLLECTION_CARDS.filter((c: any) => c.locked).length;
  const ranksSub = isAuteurPlus
    ? 'You hold the highest rank. Every door in the house is open to you.'
    : lockedRooms > 0
      ? `${WORD[lockedRooms] ?? lockedRooms} room${lockedRooms === 1 ? '' : 's'} remain${lockedRooms === 1 ? 's' : ''} closed to you.`
      : 'There are rooms above this one.';

  // ════════════════════════════════════════════════════════════
  // THE ROOMS
  // ════════════════════════════════════════════════════════════

  // What a room holds, from the reconciled totals through the profile's `tally`.
  const roomCount = useMemo(() => {
    const say = (n: number, one: string, many: string) => `${tally(n)} ${n === 1 ? one : many}`;
    switch (activeTab) {
      case 'archive':   return say(totalFilms, 'FILM', 'FILMS');
      case 'ledger':    return say(totalLedger, 'ENTRY', 'ENTRIES');
      case 'watchlist': return say(totalWatchlist, 'FILM', 'FILMS');
      case 'lists':     return say(totalLists, 'STACK', 'STACKS');
      case 'physical':  return say(totalVault, 'FILM', 'FILMS');
      default:          return say(totalFilms, 'FILM', 'FILMS');
    }
  }, [activeTab, totalFilms, totalLedger, totalWatchlist, totalLists, totalVault]);

  // A room was pushed, so a room pops (a push would pile up Android's history).
  const handleRoomBack = useCallback(() => {
    if (router.canGoBack()) nav.back();
    else nav.replace(`/user/${encodeURIComponent(username ?? '')}`);
  }, [router, username]);

  // Whether each room is narrowed by its filters (src/utils/roomFilters): then it
  // shows, and pages, the filtered read; otherwise your own room shows your
  // store. One answer, so the rows, the paging and "is there more" agree.
  const narrowed = useMemo(() => ({
    archive: isNarrowed('archive', { status: archiveSieve, search: archiveSearch }),
    ledger: isNarrowed('ledger', { search: ledgerSearch, rating: ledgerRatingFilter }),
    watchlist: isNarrowed('watchlist', { search: watchlistSearch, sort: watchlistSort, decade: watchlistDecade }),
    physical: isNarrowed('physical', { filter: physicalFilter, sort: physicalSort, search: physicalSearch }),
    // Your own stacks are filtered on the phone, from your store.
    lists: !isSelf && isNarrowed('lists', { sort: listsSort, search: listsSearch }),
  }), [isSelf, archiveSieve, archiveSearch, ledgerSearch, ledgerRatingFilter, watchlistSearch, watchlistSort, watchlistDecade, physicalFilter, physicalSort, physicalSearch, listsSort, listsSearch]);
  const ownStore = (room: Room) => isSelf && !narrowed[room];

  // A room whose read failed: the way to ask again, and the room says so.
  const retryRoomOf = data.retryRoom;
  const retryRoom = useCallback(() => {
    if (activeTab) void retryRoomOf(activeTab as ProfileTab);
  }, [retryRoomOf, activeTab]);
  const roomFailed = !!activeTab && !!data.tabFailed[activeTab as ProfileTab];
  const roomUnreachable = roomFailed ? retryRoom : undefined;
  const roomNarrowed = !!activeTab && (ROOMS as readonly string[]).includes(activeTab) && narrowed[activeTab as Room];

  // Whether a room's data has ARRIVED, before it may call itself empty. A
  // filtered read that failed is never shown as the last search's rows. Your own
  // room keeps what it holds, and with nothing held after a failed read says so;
  // a visitor's arrives once the count proves it.
  const roomReady = useMemo(() => {
    if (roomFailed && roomNarrowed) return false;
    if (isSelf) {
      if (!roomFailed) return true;
      switch (activeTab) {
        case 'archive':
        case 'ledger':    return displayLogs.length > 0;
        case 'watchlist': return displayWatchlist.length > 0;
        case 'lists':     return displayLists.length > 0;
        case 'physical':  return displayVault.length > 0;
        default:          return true;
      }
    }
    switch (activeTab) {
      case 'archive':   return displayLogs.length > 0 || counts.logs === 0;
      case 'ledger':    return displayLogs.length > 0 || counts.ledger === 0;
      case 'watchlist': return displayWatchlist.length > 0 || counts.watchlist === 0;
      case 'lists':     return displayLists.length > 0 || counts.lists === 0;
      case 'physical':  return displayVault.length > 0 || counts.vault === 0;
      default:          return true;
    }
  }, [isSelf, activeTab, displayLogs.length, displayWatchlist.length, displayLists.length, displayVault.length, counts, roomFailed, roomNarrowed]);

  // The six rated highest over the whole record (the server's read), as the title says.
  const highestRated = data.highestRated;

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
  const renderPosterCard = useCallback((item: ProfileLog | ProfileVaultItem | ProfileWatchlistItem, width: number) => {
    return (
      <ProfilePosterCard
        item={item}
        width={width}
        isAuteurPlus={isAuteurPlus}
        isArchivistPlus={isArchivistPlus}
      />
    );
  }, [isAuteurPlus, isArchivistPlus]);

  // ════════════════════════════════════════════════════════════
  // EARLY RETURNS
  // ════════════════════════════════════════════════════════════
  // repairingHandle: the route is our own stale handle, being corrected, so not
  // "Member Not Found"; it clears itself after 4s, never a permanent spinner.
  if (loading || repairingHandle) return (
    <View style={[s.container, s.centeredFull]}>
      <RoomLight room="member" />
      {readyMark}
      <BusterEyes style={s.loadingEyes} />
      <View style={s.loadingRow}>
        <Sparkles size={9} color={colors.sepia} strokeWidth={1.5} />
        <Text {...scaledTextProps} style={s.loadingText}>RETRIEVING DOSSIER</Text>
        <Sparkles size={9} color={colors.sepia} strokeWidth={1.5} />
      </View>
    </View>
  );

  // Could not be asked — not "Member Not Found", which it said of any member
  // opened with no signal (the not-found answer is `targetUser` null, no error).
  if (!targetUser && data.error) return (
    <View style={[s.container, s.centeredPadded]}>
      <RoomLight room="member" />
      {readyMark}
      <EmptyOffline onRetry={() => { void data.fetchUserData(); }} wayOut={{ label: 'Go back', onPress: handleBack }} />
    </View>
  );

  if (!targetUser) return (
    <View style={[s.container, s.centeredPadded]}>
      <RoomLight room="member" />
      {readyMark}
      <Buster size={80} mood="suspicious" style={s.notFoundBuster} />
      <Text {...scaledTextProps} style={s.notFoundTitle}>Member Not Found</Text>
      {/* eslint-disable-next-line react/no-unescaped-entities */}
      <Text {...scaledTextProps} style={s.notFoundBody}>This member doesn't exist yet, or has been removed.</Text>
      <PressableScale style={s.ghostBtn} onPress={handleBack} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic>
        <View style={s.ghostBtnRow}>
          <ArrowLeft size={12} color={colors.bone} strokeWidth={1.5} />
          <Text {...scaledTextProps} style={s.ghostBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>GO BACK</Text>
        </View>
      </PressableScale>
    </View>
  );


  // ════════════════════════════════════════════════════════════
  // MODALS
  // ════════════════════════════════════════════════════════════
  const modals = (
    <>
      {dnaCardOpen && <CinemaDNACard user={targetUser as never} analytics={serverAnalytics} failed={!!data.tabFailed.projector} onRetry={() => { void data.retryRoom('projector'); }} onClose={closeDnaCard} />}
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
      <View style={[s.container, { paddingTop: Math.max(insets.top + 6, 36) }]}>
        <RoomLight room="member" />
        {/* ── THE ROOM PLATE — one threshold for all six ── */}
        <RoomPlate
          /* Title case, as the display face is set everywhere; caps are the sub face's. */
          name={TAB_TITLES[activeTab] ?? activeTab}
          member={heroName}
          count={roomCount}
          sealed={!!isPrivate}
          tier={tier}
          onBack={handleRoomBack}
        />

        {/* ── THE SEALED ROOM ──
            A private member's room says it is sealed, never "no films yet":
            this branch runs before the profile's own privacy check. */}
        {isPrivate ? (
          // Straight into the container, so it carries the room inset itself.
          <View style={s.sealedPad}>
            <RoomSealed />
            <RoomFoot tier={tier} />
          </View>
        ) :['archive', 'ledger', 'watchlist', 'lists', 'physical'].includes(activeTab) ? (
          <View style={{ flex: 1 }}>
            {/* While the lock stands, the rooms that hold the Archive are not drawn at all. */}
            {archiveLock.locked && (activeTab === 'archive' || activeTab === 'ledger') && (
              <View style={{ flex: 1 }}><ArchiveLock onUnlocked={archiveLock.opened} /></View>
            )}

            {/* ═══ ARCHIVE TAB ═══ */}
            {activeTab === 'archive' && !archiveLock.locked && (
              <ProfileArchiveTab
                logs={displayLogs}
                isSelf={isSelf}
                archiveSieve={archiveSieve}
                setArchiveSieve={setArchiveSieve}
                archiveFiltered={archiveFiltered}
                renderPosterCard={renderPosterCard}
                groupByMonth={groupByMonth}
                ready={roomReady}
                unreachable={roomUnreachable}
                tier={tier}
                monthCounts={analyticsShape?.monthly_activity}
                totalFilms={totalFilms}
                archiveSearch={archiveSearch}
                setArchiveSearch={setArchiveSearch}
                onLoadMore={ownStore('archive') ? (filmStore.logsHasMore ? loadMoreLogs : undefined) : (hasMoreArchiveLogs ? loadMoreLogs : undefined)}
                isLoadingMore={ownStore('archive') ? filmStore._fetchingLogs : isLoadingMore.logs_archive}
                moreFailed={!!data.moreFailed.logs}
                refreshing={refreshing}
                onRefresh={onRefresh}
                bottomInset={insets.bottom}
              />
            )}

            {/* ═══ LEDGER TAB ═══ */}
            {activeTab === 'ledger' && !archiveLock.locked && (
              <ProfileLedgerTab
                logs={displayLogs}
                ledgerSearch={ledgerSearch}
                setLedgerSearch={setLedgerSearch}
                ledgerRatingFilter={ledgerRatingFilter}
                setLedgerRatingFilter={setLedgerRatingFilter}
                ledgerFiltered={ledgerFiltered}
                halfLifeMap={halfLifeMap}
                groupByMonth={groupByMonth}
                ready={roomReady}
                unreachable={roomUnreachable}
                tier={tier}
                ratingCounts={analyticsShape?.rating_distribution}
                onLoadMore={ownStore('ledger') ? (filmStore.logsHasMore ? loadMoreLogs : undefined) : (hasMoreLedgerLogs ? loadMoreLogs : undefined)}
                isLoadingMore={ownStore('ledger') ? filmStore._fetchingLogs : isLoadingMore.logs_ledger}
                moreFailed={!!data.moreFailed.logs}
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
                watchlistDecade={watchlistDecade}
                setWatchlistDecade={setWatchlistDecade}
                decades={watchlistDecadeCounts}
                totalWatchlist={totalWatchlist}
                watchlistFiltered={watchlistFiltered}
                renderPosterCard={renderPosterCard}
                ready={roomReady}
                unreachable={roomUnreachable}
                tier={tier}
                /* With any filter live the room reads the SERVER's pages, so it
                   pages by the server's cursor, not the unfiltered local store. */
                onLoadMore={ownStore('watchlist') ? (filmStore.watchlistHasMore ? loadMoreWatchlist : undefined) : (hasMoreWatchlist ? loadMoreWatchlist : undefined)}
                isLoadingMore={ownStore('watchlist') ? filmStore._fetchingWatchlist : isLoadingMore.watchlist}
                moreFailed={!!data.moreFailed.watchlist}
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
                listsSort={listsSort}
                setListsSort={setListsSort}
                listsSearch={listsSearch}
                setListsSearch={setListsSearch}
                totalLists={totalLists}
                ready={roomReady}
                unreachable={roomUnreachable}
                tier={tier}
                onLoadMore={ownStore('lists') ? (filmStore.listsHasMore ? loadMoreLists : undefined) : (hasMoreLists ? loadMoreLists : undefined)}
                isLoadingMore={ownStore('lists') ? filmStore._fetchingLists : isLoadingMore.lists}
                moreFailed={!!data.moreFailed.lists}
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
                  physicalSort={physicalSort}
                  setPhysicalSort={setPhysicalSort}
                  physicalFormatCounts={physicalFormatCounts}
                  physicalFiltered={physicalFiltered}
                  ready={roomReady}
                  unreachable={roomUnreachable}
                  tier={tier}
                  totalVault={totalVault}
                  vaultFormats={analyticsShape?.vault_formats}
                  physicalSearch={physicalSearch}
                  setPhysicalSearch={setPhysicalSearch}
                  /* No filter is `null` (the chip's own state), not 'all'. */
                  onLoadMore={ownStore('physical') ? (filmStore.archiveHasMore ? loadMoreVault : undefined) : (hasMoreVault ? loadMoreVault : undefined)}
                  isLoadingMore={ownStore('physical') ? filmStore._fetchingArchive : isLoadingMore.vault}
                  moreFailed={!!data.moreFailed.vault}
                  hasMore={(isSelf && !physicalFilter) ? filmStore.archiveHasMore : hasMoreVault}
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  bottomInset={insets.bottom}
                />
              ) : (
                <View style={s.tabContentPad}>
                  <VelvetGate
                    title="The Physical Archive"
                    line={isSelf ? 'Physical media tracking awaits the Archivist rank.' : "This member's shelves have not been opened."}
                    isSelf={isSelf}
                    onAscend={shelfRope.open}
                  />
                </View>
              )
            )}
          </View>
        ) : (
          <ScrollView contentContainerStyle={[s.tabScrollContent, { paddingBottom: Math.max(insets.bottom + 80, 80) }]} showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} colors={[colors.sepia]} progressBackgroundColor={colors.ink} />}>
            {/* ═══ PASSPORT TAB ═══ */}
            {/* Passport is a base feature (see the tiers page) — open to every member. */}
            {activeTab === 'passport' && (
                <View style={s.tabContentPad}><NoirPassport analytics={serverAnalytics} failed={roomFailed} onRetry={retryRoom} /></View>
            )}

            {/* ═══ PROJECTOR / ANALYTICS TAB ═══ */}
            {/* Analytics is a base feature (see the tiers page) — open to every member. */}
            {activeTab === 'projector' && (
                <View style={s.projectorGap}>
                  {/* Cinema DNA CTA (the plate above already names the room) */}
                  <View style={s.tabContentPad}>
                    <PressableScale style={s.ctaBtn} onPress={() => { setDnaCardOpen(true); data.loadTabData('projector'); }} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic accessibilityRole="button" accessibilityLabel="View cinema DNA">
                      <View style={s.ctaBtnRow}>
                        <Dna size={12} color={colors.sepia} strokeWidth={1.5} />
                        <Text {...scaledTextProps} style={s.ctaBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>VIEW CINEMA DNA</Text>
                      </View>
                    </PressableScale>
                  </View>

                  {/* Your Year in Cinema — your own annual retrospective */}
                  {isSelf && (
                    <View style={s.tabContentPad}>
                      <PressableScale style={s.ctaBtn} onPress={() => nav.push('/year-in-cinema')} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic accessibilityRole="button" accessibilityLabel="Your Year in Cinema">
                        <View style={s.ctaBtnRow}>
                          <CalendarDays size={12} color={colors.sepia} strokeWidth={1.5} />
                          <Text {...scaledTextProps} style={s.ctaBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>YOUR YEAR IN CINEMA</Text>
                        </View>
                      </PressableScale>
                    </View>
                  )}

                  {/* Projector Room, inset like its neighbours; its 140pt dial
                      fits the smallest phone. */}
                  <View style={s.tabContentPad}>
                    <ProjectorRoom stats={{ count: totalFilms, level: statsLevel, color: statsColor, progress: statsProgress }} user={targetUser} isSelf={isSelf} record={analyticsShape} streak={streak} />
                  </View>

                  <View style={s.projectorSectionsWrap}>
                    {/* Taste DNA */}
                    <View>
                      <SectionDivider label="TASTE FINGERPRINT" />
                      <TasteDNA taste={taste} username={targetUser?.username || username} memberNo={memberNo} isSelf={isSelf} failed={roomFailed} onRetry={retryRoom} />
                    </View>

                    {/* Cinematic Insights */}
                    <View>
                      <SectionDivider label="REAL ANALYTICS" />
                      <CinematicInsights taste={taste} isSelf={isSelf} failed={roomFailed} onRetry={retryRoom} />
                    </View>

                    {/* Society Honors */}
                    <View>
                      <SectionDivider label="SOCIETY HONORS" />
                      <Achievements analytics={serverAnalytics} totalFilms={totalFilms} failed={roomFailed} onRetry={retryRoom} />
                    </View>

                    {/* HIGHEST RATED (`highestRated`): films of the Archive, so behind its lock. */}
                    {highestRated.length > 0 && archiveLock.locked && (
                      <View>
                        <SectionDivider label="HIGHEST RATED" />
                        <ArchiveLockedLine onUnlocked={archiveLock.opened} />
                      </View>
                    )}
                    {highestRated.length > 0 && !archiveLock.locked && (
                      <View>
                        <SectionDivider label="HIGHEST RATED" />
                        <View style={s.card}>
                          {highestRated.map((log: ProfileLog) => {
                            const posterUri = tmdb.poster(log.poster, 'w185');
                            return (
                              <PressableScale
                                key={log.id}
                                style={s.favouriteRow}
                                onPress={() => { if (log.filmId) nav.push(`/film/${log.filmId}`); }}
                                // 5, half the 10pt gap: the 15pt default let a
                                // row's tap open the film below. 42 + 10 clears 44.
                                hitSlop={{ top: 5, bottom: 5, left: 8, right: 8 }}
                                haptic
                                accessibilityRole="button"
                                accessibilityLabel={`${log.title}${log.rating > 0 ? `, rated ${log.rating} of 5` : ''}`}
                              >
                                {posterUri
                                  ? <Image source={{ uri: posterUri }} style={s.favPosterThumb} transition={50} cachePolicy="memory-disk" />
                                  /* A blank frame keeps every row at one indent. */
                                  : <View style={[s.favPosterThumb, s.favPosterEmpty]} />}
                                <View style={s.favTextWrap}>
                                  <Text {...scaledTextProps} style={s.favTitle} numberOfLines={1}>{log.title}</Text>
                                  <View style={s.favRatingRow}>
                                    <ReelRating rating={log.rating} size={10} />
                                  </View>
                                </View>
                                {!!log.year && <Text {...scaledTextProps} style={s.favYear}>{String(log.year)}</Text>}
                              </PressableScale>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {/* Passport */}
                    <View>
                      <SectionDivider label="CINEMATIC PASSPORT" />
                      <NoirPassport analytics={serverAnalytics} failed={roomFailed} onRetry={retryRoom} />
                    </View>

                    {/* Taste Match (other members only), over both whole records */}
                    {!isSelf && targetUser?.id ? (
                      <TasteMatch userId={targetUser.id} theirUsername={targetUser.username} />
                    ) : null}
                  </View>
                </View>
            )}

            {/* ═══ CALENDAR TAB ═══ */}
            {/* Every member's: a calendar of your own evenings brings you back. */}
            {activeTab === 'calendar' && (
              <View style={s.tabContentPad}>
                <SectionDivider label="VIEWING HISTORY" />
                {/* Its own read, never the member's logs standing in for their year. */}
                {archiveLock.locked
                  ? <ArchiveLock inline onUnlocked={archiveLock.opened} />
                  : calendarData
                  ? <NitrateCalendarGrid logs={calendarData} isSelf={isSelf} />
                  : roomFailed ? <RoomUnreachable room="the calendar" onRetry={retryRoom} /> : <RoomRetrieving room="the calendar" />}
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
      <RoomLight room="member" {...lit} />
      {readyMark}
      {/* Back button (only when navigated to, not on own tab) */}
      {!usernameOverride && (
        <View style={[s.topNav, { paddingTop: Math.max(insets.top + 10, 40) }]}>
          {/* Icon-only: the label is its only name for a screen reader. */}
          <PressableScale
            onPress={handleBack}
            style={s.topNavBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            haptic
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={24} color={colors.parchment} strokeWidth={1.5} />
          </PressableScale>
        </View>
      )}

      <CinematicScrollView contentContainerStyle={[s.mainScrollContent, { paddingBottom: Math.max(insets.bottom + 60, 60) }]} showsVerticalScrollIndicator={false}
        externalScrollY={scrollY} bottomInset={Math.max(insets.bottom + 60, 60)} scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} colors={[colors.sepia]} progressBackgroundColor={colors.ink} />}>

        {/* ═══ THE MEMBERSHIP PLATE — atmosphere ends at the stats grid ═══ */}
        <View style={s.headerWrap} onLayout={(e) => setPlateH(Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height))}>
          {/* Tier atmosphere — breathes up as the plate develops */}
          <AnimatedView style={[StyleSheet.absoluteFillObject, atmosphereDevelop]} pointerEvents="none">
            {isAuteurPlus ? (
              <ProfileBackdrop user={targetUser as never} hem={plateH || undefined} scrollY={scrollY} />
            ) : isArchivistPlus ? (
              /* Brass fading to NOTHING, so the room's light shows through. */
              <View style={s.headerArchivistBase}>
                 <LinearGradient colors={['rgba(196,150,26,0.15)', 'rgba(196,150,26,0)']} locations={[0, 0.4]} style={StyleSheet.absoluteFillObject} />
                 <AnimatedView style={[StyleSheet.absoluteFillObject, pulseStyle]} pointerEvents="none">
                   <LinearGradient colors={['rgba(196,150,26,0.1)', 'transparent']} style={StyleSheet.absoluteFillObject} />
                 </AnimatedView>
              </View>
            ) : null}

            {/* The projector's pool of light — true radial, tier-tinted */}
            <SpotlightPool tint={tierSpot} opacity={tierSpotOpacity} />
          </AnimatedView>

          {/* Film grain texture overlay */}
          <View style={s.filmGrainOverlay} pointerEvents="none" />

          {/* Dark at the very top, so the status bar and back button read on a bright backdrop. */}
          <LinearGradient colors={['rgba(6,5,4,0.72)', 'transparent']} style={s.heroTopFade} pointerEvents="none" />

          {/* Bottom structural edge */}
          <View style={[s.headerGoldEdge, isAuteurPlus && { backgroundColor: 'rgba(180,45,45,0.35)' }]} pointerEvents="none" />

          {/* ── Header Content ── no shared padding: each block sets its own. */}
          <View style={[s.headerContent, { paddingTop: heroTop }]}>

            {/* ══ THE IDENT — a mounted print, and the particulars beside it ══ */}
            <AnimatedView style={[s.identRow, portraitDevelop]}>
              <View style={s.portraitWrap}>
                <View style={s.plate}>
                  {targetUser.avatar_url ? (
                    <Image
                      source={{ uri: targetUser.avatar_url }}
                      style={s.plateImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={150}
                      accessibilityIgnoresInvertColors
                    />
                  ) : (
                    <View style={s.plateInitialWrap}>
                      <Text {...decorativeTextProps} {...UNSPOKEN} style={s.plateInitial}>{avatarInitial}</Text>
                    </View>
                  )}
                  {/* The grain is inside the frame, over the photograph — it is
                      the PRINT that is old, not the screen. */}
                  <View style={s.plateGrain} pointerEvents="none" />
                  <View style={[s.corner, s.cornerTL]} pointerEvents="none" />
                  <View style={[s.corner, s.cornerTR]} pointerEvents="none" />
                  <View style={[s.corner, s.cornerBL]} pointerEvents="none" />
                  <View style={[s.corner, s.cornerBR]} pointerEvents="none" />
                </View>

                {/* The rank, stamped on the corner at a hand's angle, on the
                    develop's last beat. `style` is the position only: the mark's
                    look is RankBadge's alone. */}
                <AnimatedView style={stampDevelop}>
                  <RankBadge rank={rankOf(targetUser)} style={s.tierStamp} />
                </AnimatedView>
              </View>

              <View style={s.particulars}>
                <Text {...displayTextProps} style={[s.heroName, nameStyle]} numberOfLines={2}>{heroName}</Text>
                <LinearGradient
                  colors={[tierLine, 'transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={s.nameRule}
                />
                {showHandle && <Text {...scaledTextProps} style={s.heroHandle} numberOfLines={1}>{heroHandle}</Text>}
                {isFounding && (
                  <Text {...scaledTextProps} style={[s.heroStand, { color: tierText }]} numberOfLines={1}>✦ FOUNDING MEMBER</Text>
                )}
                {!!serialLine && <Text {...scaledTextProps} style={s.heroSerial} numberOfLines={2}>{serialLine}</Text>}
              </View>
            </AnimatedView>

            {/* ── The bio, in the house's own quotation marks ── */}
            <Text {...scaledTextProps} style={[s.heroBio, bioStyle]} numberOfLines={bioLines}>
              {/* The guillemets grow with the bio they sit inside. */}
              <Text {...scaledTextProps} style={isAuteurPlus ? s.bioMarkRuby : s.bioMark}>« </Text>
              {/* A bio is the member's own words, and may hold a pasted link:
                  offered a place to wrap at its joints, as the Dispatch does. */}
              {softBreak(bioText)}
              <Text {...scaledTextProps} style={isAuteurPlus ? s.bioMarkRuby : s.bioMark}> »</Text>
            </Text>

            {/* ── Social Links ── */}
            {socialLinks.length > 0 && (
              <View style={s.socialLinksRow}>
                {socialLinks.map((link: SocialLink, i: number) => (
                  <PressableScale
                    key={i}
                    style={s.socialLinkChip}
                    onPress={() => openSocialLink(link.url)}
                    // Wrapping chips 8pt apart on both axes: 4 a side; 36+8 clears 44.
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    haptic
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${link.title || 'link'}`}
                  >
                    <Globe size={10} color={colors.fog} />
                    <Text {...scaledTextProps} style={s.socialLinkText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{(link.title || '').toUpperCase()}</Text>
                  </PressableScale>
                ))}
              </View>
            )}

            {/* ── The four figures, in the two pairs a reader compares ──
                No "hide stats": privacy is `is_social_private`, which the
                database enforces; hiding numbers whose films stay readable is not. */}
            <View style={[s.statsBox, { borderColor: tierStatsBorder }]}>
              <StatCard label="FILMS" value={tally(totalFilms)} />
              <StatCard label="WATCHLIST" value={tally(totalWatchlist)} rule />
              <StatCard label="FOLLOWERS" value={tally(targetUser.followers_count || 0)} onPress={isPrivate ? undefined : navToFollowers} rule />
              <StatCard label="FOLLOWING" value={tally(targetUser.following_count || 0)} onPress={isPrivate ? undefined : navToFollowing} rule />
            </View>

            {/* ── The two acts ── */}
            {isSelf ? (
              <View style={s.actsRow}>
                <PressableScale
                  style={s.act}
                  onPress={navToEditProfile}
                  // 48pt tall already; 5 a side is half the 10pt between the pair.
                  hitSlop={{ top: 0, bottom: 0, left: 5, right: 5 }}
                  haptic
                  accessibilityRole="button"
                  accessibilityLabel="Edit your file"
                >
                  <Text {...scaledTextProps} style={s.actText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>EDIT YOUR FILE</Text>
                </PressableScale>
                <PressableScale
                  style={[s.act, s.actGhost]}
                  onPress={navToSettings}
                  hitSlop={{ top: 0, bottom: 0, left: 5, right: 5 }}
                  haptic
                  accessibilityRole="button"
                  accessibilityLabel="Open settings"
                >
                  <Settings size={15} color={colors.fog} strokeWidth={1.7} />
                </PressableScale>
              </View>
            ) : (
              <View style={s.actsRow}>
                <PressableScale
                  style={[s.act, !isFollowing && !isRequested && s.actSolid, followLoading && { opacity: 0.5 }]}
                  onPress={toggleFollow}
                  disabled={followLoading || isRequested}
                  pressedScale={0.96}
                  hitSlop={{ top: 0, bottom: 0, left: 5, right: 5 }}
                  haptic="medium"
                  accessibilityRole="button"
                  accessibilityLabel={isFollowing ? 'Unfollow this member' : isRequested ? 'Follow request sent' : 'Follow this member'}
                >
                  <AnimatedRN.Text
                    entering={FadeIn.duration(300)}
                    style={[s.actText, !isFollowing && !isRequested && s.actTextSolid]}
                    adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.75}
                  >
                    {followLoading ? '...' : isFollowing ? 'FOLLOWING' : isRequested ? 'REQUESTED' : targetUser.is_social_private ? '+ REQUEST' : '+ FOLLOW'}
                  </AnimatedRN.Text>
                </PressableScale>
                <PressableScale
                  style={[s.act, s.actGhost]}
                  onPress={() => setActionSheetVisible(true)}
                  hitSlop={{ top: 0, bottom: 0, left: 5, right: 5 }}
                  haptic="selection"
                  pressedScale={0.96}
                  accessibilityRole="button"
                  accessibilityLabel="More options for this member"
                >
                  <MoreVertical size={16} color={colors.fog} strokeWidth={1.8} />
                </PressableScale>
              </View>
            )}

          </View>
        </View>

        {/* ═══ The plate ends above; the rooms begin here, on the lit room ═══ */}
        {isPrivate ? (
          /* ── THE SEALED DOSSIER ── */
          <View style={s.sealedWrap}>
            <View style={s.sealedCard}>
              <Text {...scaledTextProps} style={s.sealedTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>✦ THIS DOSSIER IS SEALED ✦</Text>
              <Text {...scaledTextProps} style={s.sealedBody}>
                The member keeps their records private.{'\n'}Follow to request the key.
              </Text>
            </View>
          </View>
        ) : (
        <View style={s.contentArea}>

          {/* ══ THE TRIPTYCH — three favourites, hung as an altarpiece ══ */}
          {(hasFavorites || isSelf) && (
            <View style={s.triptychWrap}>
              <SectionDivider label="THE TRIPTYCH" />
              <ProfileTriptych
                user={{
                  id: targetUser.id,
                  preferences: targetUser.preferences ? { favorites: targetUser.preferences.favorites as import('@/src/components/profile/ProfileTriptych').TriptychFilm[] } : null
                }}
                isOwnProfile={isSelf}
                userRole={tier}
              />
            </View>
          )}

          {/* ══ LATELY — a numbered ledger: the last films, in order, each with
              its title, year, rating, and whether it was a rewatch ══ */}
          {recentLogs.length > 0 && archiveLock.locked && (
            <View style={s.latelySection}>
              <SectionDivider label="LATELY" />
              <ArchiveLockedLine onUnlocked={archiveLock.opened} />
            </View>
          )}
          {recentLogs.length > 0 && !archiveLock.locked && (
            <View style={s.latelySection}>
              <SectionDivider label="LATELY" />
              <View style={s.latelyWrap}>
                {recentLogs.map((log: ProfileLog, i: number) => (
                  <PressableScale
                    key={log.id}
                    style={[s.latelyRow, i === recentLogs.length - 1 && s.latelyRowLast]}
                    onPress={() => nav.push(`/log/${log.id}`)}
                    // Edge-to-edge rows, 66pt tall: no vertical reach into the next.
                    hitSlop={{ top: 0, bottom: 0, left: 12, right: 12 }}
                    haptic
                    accessibilityRole="button"
                    accessibilityLabel={`${log.title}${log.year ? `, ${log.year}` : ''}${log.rating > 0 ? `, rated ${log.rating} of 5` : ''}`}
                  >
                    <Text {...decorativeTextProps} style={s.latelyIndex}>{String(i + 1).padStart(2, '0')}</Text>
                    <View style={[s.latelyPoster, !log.poster && s.latelyPosterEmpty]}>
                      {log.poster ? (
                        <Image source={{ uri: tmdb.poster(log.poster, 'w185') }} style={s.latelyPosterImg} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                      ) : (
                        <FilmIcon size={14} color={colors.sepia} strokeWidth={1.4} opacity={0.4} />
                      )}
                    </View>
                    <View style={s.latelyText}>
                      <Text {...scaledTextProps} style={s.latelyTitle} numberOfLines={1}>{(log.title || '').toUpperCase()}</Text>
                      {!!log.year && <Text {...scaledTextProps} style={s.latelyYear} numberOfLines={1}>{log.year}</Text>}
                    </View>
                    <View style={s.latelyRight}>
                      {log.rating > 0 && <ReelRating rating={log.rating} size={9} />}
                      {/* A rewatch says more than a date does. */}
                      {log.status === 'rewatched' ? (
                        <Text {...scaledTextProps} style={s.latelyRewatch} numberOfLines={1}>↺ REWATCHED</Text>
                      ) : (
                        <Text {...scaledTextProps} style={s.latelyWhen} numberOfLines={1}>{timeAgo(log.watchedDate ?? (log as any).createdAt).toUpperCase()}</Text>
                      )}
                    </View>
                  </PressableScale>
                ))}
              </View>
            </View>
          )}

          {/* ══ THE HOLDINGS ══ two columns of three, a dotted leader carrying
              the eye from each room to its count, as a printed index does. */}
          <SectionDivider label="THE HOLDINGS" />
          <View style={s.holdWrap}>
            {[0, 1].map(col => {
              const rooms = COLLECTION_CARDS.slice(col * 3, col * 3 + 3);
              return (
                <View key={col} style={s.holdCol}>
                  {rooms.map((item: any, i: number) => (
                    <PressableScale
                      key={item.id}
                      testID={`collection-card-${item.id}`}
                      style={[s.holdRow, i === rooms.length - 1 && s.holdRowLast]}
                      onPress={() => nav.push(`/user/${encodeURIComponent(username ?? '')}`, { tab: item.id })}
                      // None vertical (the row below); 7 fills half the 14pt gutter.
                      hitSlop={{ top: 0, bottom: 0, left: 7, right: 7 }}
                      haptic
                      accessibilityRole="button"
                      accessibilityLabel={item.locked
                        ? `${item.label}, ${item.desc.toLowerCase()}, locked`
                        // An em dash is a mark for the eye; spoken, it says nothing.
                        : `${item.label}, ${item.desc.toLowerCase()}, ${item.count === '—' ? 'none filed yet' : item.count}`}
                    >
                      <View style={s.holdNameRow}>
                        <Text {...scaledTextProps} style={s.holdName} numberOfLines={1}>{item.label}</Text>
                        {/* Locked rooms wear the brass key — informed taps only */}
                        {item.locked && <KeyRound size={9} color={colors.sepia} strokeWidth={2.2} style={s.roomKeyDim} />}
                      </View>
                      <View style={s.holdBase}>
                        <Text {...scaledTextProps} style={s.holdSub} numberOfLines={1}>{item.desc.toLowerCase()}</Text>
                        <View style={s.holdLeader} />
                        {/* The Projector shows its ★, never a lying zero */}
                        <Text {...scaledTextProps} style={[s.holdCount, item.locked && s.holdCountLock]} numberOfLines={1}>{item.count}</Text>
                      </View>
                    </PressableScale>
                  ))}
                </View>
              );
            })}
          </View>

          {/* The Viewing Calendar — every member's door */}
          <PressableScale
            style={s.doorRow}
            onPress={navToCalendar}
            hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
            haptic
            accessibilityRole="button"
            accessibilityLabel="The Viewing Calendar"
          >
            <CalendarDays size={13} color={colors.sepia} strokeWidth={1.6} />
            <Text {...scaledTextProps} style={s.doorText} numberOfLines={1}>THE VIEWING CALENDAR</Text>
            <ChevronRight size={11} color={colors.sepia} strokeWidth={2} />
          </PressableScale>

          {/* ══ THE DESK — your own file only (follow requests are in Notices) ══ */}
          {isSelf && (
            <>
              <SectionDivider label="THE DESK" />
              <View style={s.deskWrap}>
                <PressableScale
                  style={[s.deskRow, s.deskRowLast]}
                  onPress={navToSettings}
                  hitSlop={{ top: 0, bottom: 0, left: 12, right: 12 }}
                  haptic
                  accessibilityRole="button"
                  accessibilityLabel="Settings and profile"
                >
                  <Settings size={14} color={colors.sepia} strokeWidth={1.6} />
                  <Text {...scaledTextProps} style={s.deskText} numberOfLines={1}>SETTINGS &amp; PROFILE</Text>
                  <ChevronRight size={11} color={colors.fog} strokeWidth={2} />
                </PressableScale>
              </View>

              {/* The Society's door at EVERY rank; at the top it stops shouting. */}
              <View style={s.ranksPlate}>
                <Text {...scaledTextProps} style={s.ranksTitle} numberOfLines={1}>THE SOCIETY RANKS</Text>
                <Text {...scaledTextProps} style={s.ranksSub}>{ranksSub}</Text>
                <PressableScale
                  style={[s.ranksBtn, isAuteurPlus && s.ranksBtnQuiet]}
                  onPress={navToMembership}
                  hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
                  haptic="medium"
                  accessibilityRole="button"
                  accessibilityLabel={isAuteurPlus ? 'View and manage your rank' : 'Ascend the ranks'}
                >
                  <Text {...scaledTextProps} style={[s.ranksBtnText, isAuteurPlus && s.ranksBtnTextQuiet]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                    {isAuteurPlus ? 'VIEW & MANAGE' : '✦ ASCEND THE RANKS'}
                  </Text>
                </PressableScale>
              </View>
            </>
          )}

          {/* The foot of the file. */}
          <View style={s.footRow}>
            <View style={s.footRule} />
            <Text {...decorativeTextProps} style={[s.footMark, isAuteurPlus && s.footMarkRuby]}>✦</Text>
            <View style={s.footRule} />
          </View>
        </View>
        )}
      </CinematicScrollView>

        {modals}
    </View>
  );
}

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';

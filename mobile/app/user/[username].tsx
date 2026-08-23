 
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import AnimatedRN, { Easing, Extrapolation, FadeIn, cancelAnimation, interpolate, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient as SvgRadialGradient, Stop } from 'react-native-svg';
 
import { useFilmStore } from '@/src/stores/films';
 
import type { ProfileLog, ProfileVaultItem, ProfileWatchlistItem } from '@/src/types';
 
import { globalScrollY } from '@/src/lib/scrollBridge';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
 
import { ReelRating, SectionDivider } from '@/src/components/Decorative';
import { CinematicInsights } from '@/src/components/profile/CinematicInsights';
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
import { useProfileComputed, tally } from '@/src/components/profile/profileComputed';
import { s } from '@/src/components/profile/profileStyles';
import { RoomPlate, RoomSealed, RoomFoot } from '@/src/components/profile/RoomParts';
 
import { CinematicScrollView } from '@/src/components/layout/CinematicScrollView';
import PressableScale from '@/src/components/PressableScale';
import ProfileListsTab from '@/src/components/profile/ProfileListsTab';
import ProfilePhysicalTab from '@/src/components/profile/ProfilePhysicalTab';
import { isArchivistPlusTier, isAuteurPlusTier, resolveTier, getDisplayTier } from '@/src/utils/tier';
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

// The six rooms of the member's private wing — one voice, every door named.
const TAB_TITLES: Record<string, string> = {
  archive: 'The Archive', ledger: 'The Ledger', watchlist: 'The Watchlist',
  lists: 'The Stacks', physical: 'The Vault', passport: 'The Cinematic Passport',
  projector: 'The Projector Room', calendar: 'The Viewing Calendar',
};

// ── The projector's pool of light — a true radial, tier-tinted ──
// (Replaces the old rounded-rectangle "spotlight"; static SVG, painted once.)
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

/** Small numbers read better as words on a plate. Module scope: it is a
 *  constant, and rebuilding it on every render of the screen was waste. */
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const params = useLocalSearchParams<{ username: string; tab?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // The screen no longer measures the window: each room derives its own grid
  // from `posterColumns`, which re-runs on rotation where a value read once
  // here did not.

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
  const { username, isSelf, repairingHandle, isFollowing, isRequested, activeTab, myLogs, myWatchlist, myVault, myLists, setActiveTab } = ctrl;
  const { archiveSieve, ledgerSearch, ledgerRatingFilter, watchlistSearch, watchlistSort, watchlistDecade, physicalFilter, physicalSort, listsSort, setArchiveSieve, setLedgerSearch, setLedgerRatingFilter, setWatchlistSearch, setWatchlistSort, setWatchlistDecade, setPhysicalFilter, setPhysicalSort, setListsSort } = ctrl;

  
  const filmStore = useFilmStore();

  // ── Moderation State ──
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  // "At the door" used to be duplicated here, with its own count subscription
  // and its own refresh. It lives in Notices now — one place to check, one
  // place to keep in step. Notices refreshes the count on mount and owns the
  // same panel, so removing the copy took nothing with it.
  const isBlocked = useBlockStore((state) => state.isBlocked(targetUser?.id ?? ''));
  const isMuted = useBlockStore((state) => state.isMuted(targetUser?.id ?? ''));
  const blockStore = useBlockStore();

  // The poster grids used to be sized here — `(windowWidth - 32 - 18) / 4`,
  // reserving 18pt of gaps for a row that was then laid out with 24. Each room
  // derives its own from `posterColumns` now, from the gap it actually draws.

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

  /**
   * The breathing gold wash behind an Archivist's plate.
   *
   * ── IT NOW RUNS ONLY WHERE IT IS SEEN ────────────────────────────────────
   * `pulseStyle` used to drive the avatar ring as well, which every member had,
   * so starting the animation unconditionally was right. The composition
   * replaced that ring with a mounted print, and the ONLY consumer left is the
   * Archivist gradient below — a Cinephile renders a flat dark base and an
   * Auteur renders their backdrop, neither of which reads it. The animation
   * went on running anyway: a worklet re-evaluated every frame for seventy-two
   * seconds, on two members out of three, to set an opacity nothing painted.
   *
   * It also never asked about reduce-motion, which the developing plate below
   * has always honoured. A pulsing wash is atmosphere; it holds still for
   * anyone who has asked the system to stop things moving.
   */
  const showsPulse = isArchivistPlus && !isAuteurPlus;
  useEffect(() => {
    if (!showsPulse || reducedMotion) return;
    // Capped at 20 repeats (approx 72 seconds) to allow UI thread idling and prevent battery drain
    breatheAnim.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }), 20, true);
    return () => cancelAnimation(breatheAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showsPulse, reducedMotion]);

  // Tier echo — the member's tier color resonates through the hero (founder
  // mark + stats panel). Cinephile = house brass (understated); Archivist =
  // champagne; Auteur = ruby. The avatar ring/badge stay the primary signal.
  const tierLine = isAuteurPlus ? 'rgba(180,45,45,0.45)' : isArchivistPlus ? 'rgba(196,150,26,0.5)' : 'rgba(184,137,26,0.3)';
  const tierText = isAuteurPlus ? '#B42D2D' : isArchivistPlus ? colors.champagne : 'rgba(184,137,26,0.7)';
  const tierStatsBorder = isAuteurPlus ? 'rgba(180,45,45,0.5)' : isArchivistPlus ? 'rgba(196,150,26,0.6)' : 'rgba(184,137,26,0.3)';
  const tierSpot = isAuteurPlus ? '#B42D2D' : isArchivistPlus ? colors.champagne : '#B8891A';
  const tierSpotOpacity = isAuteurPlus ? 0.2 : isArchivistPlus ? 0.26 : 0.18;

  // MEMBER Nº — the real serial, padded to four while small, growing
  // naturally after; hidden gracefully until the migration has run.
  const memberNo = (targetUser as any)?.member_no
    ? String((targetUser as any).member_no).padStart(4, '0')
    : null;

  // The portrait initial — no member ever faces a dead black circle.
  const avatarInitial = (targetUser?.persona || (targetUser as any)?.display_name || targetUser?.username || '?')
    .charAt(0).toUpperCase();

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

  /**
   * The handle earns a line only when it says something the name does not.
   *
   * The old hero had no handle line at all — it fell back to `@username` in the
   * NAME slot and stopped there. Giving the composition a handle line beneath
   * the name reintroduced a duplicate for two very ordinary members: one who
   * has set no display name, and one whose display name simply IS their
   * handle. Both would have had the same word printed twice, stacked, in 26pt
   * and 9.5pt. The name keeps the fallback; the handle steps aside when it
   * would only be an echo.
   */
  const showHandle = heroHandle.slice(1) !== heroName;

  /**
   * A DETERMINISTIC step-down, not `adjustsFontSizeToFit`.
   *
   * Auto-shrinking measures at layout time and picks any fraction it likes, so
   * two members side by side get two different sizes for no reason a reader can
   * see, and on Android it interacts badly with a second line. Three fixed
   * steps mean the same name always renders at the same size, and the type
   * scale survives contact with a long one. Two lines at the smallest step hold
   * roughly 46 characters — past that it ellipsizes rather than shrinking into
   * illegibility.
   */
  const nameSize = heroName.length <= 16 ? 26 : heroName.length <= 28 ? 20 : 16;
  const nameStyle = { fontSize: nameSize, lineHeight: Math.round(nameSize * 1.16), letterSpacing: nameSize >= 26 ? 1.4 : 1 };

  const bioText = targetUser?.bio?.trim() || (isSelf ? 'No bio yet. Tell the society who you are.' : 'No bio on file.');
  // Same reasoning as the name: fixed steps, and the longest bios get more
  // lines rather than smaller type.
  const bioSize = bioText.length <= 90 ? 12.5 : bioText.length <= 170 ? 11.5 : 10.5;
  const bioStyle = { fontSize: bioSize, lineHeight: Math.round(bioSize * 1.52) };
  const bioLines = bioText.length <= 90 ? 4 : bioText.length <= 170 ? 5 : 6;

  /**
   * `Nº 0147 · ADMITTED MARCH 2026` — one line where there were two.
   *
   * The month is built by the house formatter, NOT `toLocaleDateString(…, {
   * month, year })`: those options travel through Intl, which this codebase
   * does not assume Hermes provides. When it is missing the options are ignored
   * silently and the line renders as `3/14/2026` — the failure looks like a
   * design choice, which is why it survives.
   */
  const admittedFull = formatDateMonthYear(targetUser?.created_at);
  const admitted = (() => {
    const [mon, yr] = admittedFull.split(' ');
    return mon && yr ? `ADMITTED ${mon.toUpperCase()} ${yr}` : '';
  })();
  const serialLine = [memberNo ? `Nº ${memberNo}` : '', admitted].filter(Boolean).join(' · ');

  // The rank is stamped on the corner of the print. `getDisplayTier` applies
  // the Highest Watermark Rule, so a founding member reads AUTEUR whatever
  // their nominal tier says.
  const stampLabel = getDisplayTier(tier);
  // Founding is a FLAG, not a rank — it cannot appear as "ARCHIVIST · FOUNDING".
  // It gets the one line the stamp cannot carry, and nobody else pays for it.
  const isFounding = !!(targetUser as any)?.is_founding;

  /**
   * Where the ident row starts.
   *
   * The old hero used a flat `paddingTop: 120` for both cases. Your OWN file is
   * a TAB — it has no back button — so 120 there was ~50pt of nothing above
   * your own portrait, on every phone. A pushed profile has the absolutely
   * positioned back button to clear, and how far down that sits depends on the
   * notch, so the number has to be derived from the same expression the button
   * itself uses rather than guessed at once.
   */
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
    // The Room Plate states what a room holds, from the same reconciled totals
    // the profile's own tab pills use — never from the windowed array a room
    // was handed, which caps at 150.
    totalLedger,
    totalLists,
    totalVault,
    statsLevel,
    statsColor,
    statsProgress,
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
    watchlistDecade,
    physicalFilter,
    physicalSort,
    listsSort,
  });

  /**
   * What the Society plate says, and it has to be TRUE at every rank.
   *
   * "One room remains closed to you" is only worth saying if the page can
   * actually count the closed rooms, so it counts the ones it draws as locked —
   * the holdings wearing a key, plus the calendar — rather than asserting a
   * number from the tier name. An Archivist has none of those locked but is
   * still not at the top, so that case gets its own line instead of the false
   * "every door is open".
   */
  const lockedRooms = COLLECTION_CARDS.filter((c: any) => c.locked).length + (isArchivistPlus ? 0 : 1);
  const ranksSub = isAuteurPlus
    ? 'You hold the highest rank. Every door in the house is open to you.'
    : lockedRooms > 0
      ? `${WORD[lockedRooms] ?? lockedRooms} room${lockedRooms === 1 ? '' : 's'} remain${lockedRooms === 1 ? 's' : ''} closed to you.`
      : 'There are rooms above this one.';

  // ════════════════════════════════════════════════════════════
  // THE ROOMS
  // ════════════════════════════════════════════════════════════

  /**
   * What the Room Plate says a room holds.
   *
   * From the RECONCILED totals, never from the array the room was handed —
   * those are windowed at 150, so a member with 247 films would have been told
   * 150 by any count taken from the list itself. This is the same number their
   * own profile shows, through the same `tally`: an em dash for a room nobody
   * has filed anything in, and thousands grouped without going near Intl.
   */
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

  /**
   * Leaving a room.
   *
   * The old header PUSHED `/user/:name` to go "back" — while opening a room
   * pushed the same route with a tab param. So profile → Archive → back →
   * Ledger → back left six entries in the history, and Android's system back
   * button then walked the member through every one of them instead of leaving
   * the profile. A room was pushed, so a room pops.
   */
  const handleRoomBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else (router.replace as any)(`/user/${username}` as never);
  }, [router, username]);

  /**
   * Whether a room may describe its own contents yet.
   *
   * A room decided it was empty by asking whether its list was empty, and never
   * whether the data had ARRIVED — so the first open of the Vault told a member
   * with 286 discs that nothing was on the shelves. Own rooms hydrate from the
   * local store before first paint, so they are ready immediately; a visitor's
   * room is ready once its fetch has landed, which the reconciled count proves.
   */
  const roomReady = useMemo(() => {
    if (isSelf) return true;
    switch (activeTab) {
      case 'archive':   return displayLogs.length > 0 || counts.logs === 0;
      case 'ledger':    return displayLogs.length > 0 || counts.ledger === 0;
      case 'watchlist': return displayWatchlist.length > 0 || counts.watchlist === 0;
      case 'lists':     return displayLists.length > 0 || counts.lists === 0;
      case 'physical':  return displayVault.length > 0 || counts.vault === 0;
      default:          return true;
    }
  }, [isSelf, activeTab, displayLogs.length, displayWatchlist.length, displayLists.length, displayVault.length, counts]);

  /**
   * The six films the member rated highest.
   *
   * `.filter(r >= 4).slice(0, 6)` took the six most RECENTLY logged films that
   * cleared four reels — which under a heading reading HIGHEST RATED is simply
   * untrue for anyone with more than six of them. Rating first, then recency to
   * settle a tie, so the card matches its own title.
   */
  const highestRated = useMemo(() => {
    return displayLogs
      .filter((l: ProfileLog) => l.rating >= 4)
      .slice()
      .sort((a: ProfileLog, b: ProfileLog) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return String(b.watchedDate ?? b.createdAt ?? '').localeCompare(String(a.watchedDate ?? a.createdAt ?? ''));
      })
      .slice(0, 6);
  }, [displayLogs]);

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
  // repairingHandle: we already know this handle is our own stale one and the route is
  // being corrected — showing "Member Not Found" on the way past would be a lie (#87).
  // It self-clears after 4s, so this can never become a permanent spinner.
  if (loading || repairingHandle) return (
    <View style={[s.container, s.centeredFull]}>
      <View style={s.loadingRow}>
        <Sparkles size={9} color={colors.sepia} strokeWidth={1.5} />
        <Text {...scaledTextProps} style={s.loadingText}>RETRIEVING DOSSIER</Text>
        <Sparkles size={9} color={colors.sepia} strokeWidth={1.5} />
      </View>
    </View>
  );

  if (!targetUser) return (
    <View style={[s.container, s.centeredPadded]}>
      <FilmIcon size={48} color={colors.sepia} strokeWidth={1} style={s.notFoundIcon} />
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
      <View style={[s.container, { paddingTop: Math.max(insets.top + 6, 36) }]}>
        {/* ── THE ROOM PLATE — one threshold for all six ── */}
        <RoomPlate
          /* Title case, not caps. The display face (Rye) is set title-case
             everywhere else in the app — "The Projector Room", "Certificate of
             Obsession" — and the ALL-CAPS treatment belongs to the sub face, on
             the member-and-count line directly beneath. */
          name={TAB_TITLES[activeTab] ?? activeTab}
          member={heroName}
          count={roomCount}
          sealed={!!isPrivate}
          tier={tier}
          onBack={handleRoomBack}
        />

        {/* ── THE SEALED ROOM ──
            `if (activeTab)` returns before the profile's own privacy check, so
            a private member's room rendered its ordinary empty state: "this
            member hasn't watched any films yet", to a visitor looking at
            someone with two thousand of them. No data ever leaked — the fetch
            layer has a hard gate — but the sentence was false, and the counts
            ARE fetched on the sealed path, so the plate above already knows the
            truth. */}
        {isPrivate ? (
          // The seal is rendered straight into the container, not into a list,
          // so it carries the room inset itself — every other room gets it from
          // `r.listContent`.
          <View style={s.sealedPad}>
            <RoomSealed />
            <RoomFoot tier={tier} />
          </View>
        ) :['archive', 'ledger', 'watchlist', 'lists', 'physical'].includes(activeTab) ? (
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
                ready={roomReady}
                tier={tier}
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
                groupByMonth={groupByMonth}
                ready={roomReady}
                tier={tier}
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
                watchlistDecade={watchlistDecade}
                setWatchlistDecade={setWatchlistDecade}
                decades={watchlistDecadeCounts}
                watchlistFiltered={watchlistFiltered}
                renderPosterCard={renderPosterCard}
                ready={roomReady}
                tier={tier}
                /* The decade belongs in this guard for the same reason the sort
                   does: with any filter live the room reads the SERVER page,
                   so paging must come from the server's cursor and not from
                   the unfiltered local store. */
                onLoadMore={(isSelf && watchlistSearch.trim() === '' && watchlistSort === 'default' && watchlistDecade === null) ? (filmStore.watchlistHasMore ? loadMoreWatchlist : undefined) : (hasMoreWatchlist ? loadMoreWatchlist : undefined)}
                isLoadingMore={(isSelf && watchlistSearch.trim() === '' && watchlistSort === 'default' && watchlistDecade === null) ? filmStore._fetchingWatchlist : isLoadingMore.watchlist}
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
                ready={roomReady}
                tier={tier}
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
                  physicalSort={physicalSort}
                  setPhysicalSort={setPhysicalSort}
                  physicalFormatCounts={physicalFormatCounts}
                  physicalFiltered={physicalFiltered}
                  ready={roomReady}
                  tier={tier}
                  /* `physicalFilter === 'all'` was never true: no filter is
                     `null`, and 'all' is not a format. So the member's OWN
                     vault took the visitor branch on all three of these — it
                     paged through a fixed 150-item window and stopped, while
                     the store had the rest. `!physicalFilter` is the state the
                     chip actually sets. */
                  onLoadMore={(isSelf && !physicalFilter) ? (filmStore.archiveHasMore ? loadMoreVault : undefined) : (hasMoreVault ? loadMoreVault : undefined)}
                  isLoadingMore={(isSelf && !physicalFilter) ? filmStore._fetchingArchive : isLoadingMore.vault}
                  hasMore={(isSelf && !physicalFilter) ? filmStore.archiveHasMore : hasMoreVault}
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  bottomInset={insets.bottom}
                />
              ) : (
                <View style={s.tabContentPad}>
                  <VelvetGate
                    title="The Vault"
                    line={isSelf ? 'Physical media tracking awaits the Archivist rank.' : "This member's vault has not been opened."}
                    isSelf={isSelf}
                    onAscend={navToMembership}
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
                <View style={s.tabContentPad}><NoirPassport {...{user: targetUser, logs: analyticsLogs.length > 0 ? analyticsLogs : displayLogs, analytics: serverAnalytics} as any} /></View>
            )}

            {/* ═══ PROJECTOR / ANALYTICS TAB ═══ */}
            {/* Analytics is a base feature (see the tiers page) — open to every member. */}
            {activeTab === 'projector' && (
                <View style={s.projectorGap}>
                  {/* The room used to announce itself TWICE: the header above
                      already reads THE PROJECTOR ROOM, and this block repeated
                      it in the display face directly underneath, with a third
                      line of prose under that. Three lines of chrome before a
                      single number. The plate says which room you are in. */}

                  {/* Cinema DNA CTA */}
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
                      <PressableScale style={s.ctaBtn} onPress={() => (router.push as any)('/year-in-cinema')} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic accessibilityRole="button" accessibilityLabel="Your Year in Cinema">
                        <View style={s.ctaBtnRow}>
                          <CalendarDays size={12} color={colors.sepia} strokeWidth={1.5} />
                          <Text {...scaledTextProps} style={s.ctaBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>YOUR YEAR IN CINEMA</Text>
                        </View>
                      </PressableScale>
                    </View>
                  )}

                  {/* Projector Room */}
                  <ProjectorRoom stats={{ count: totalFilms, level: statsLevel, color: statsColor, progress: statsProgress }} user={targetUser} />

                  <View style={s.projectorSectionsWrap}>
                    {/* Taste DNA */}
                    <View>
                      <SectionDivider label="TASTE FINGERPRINT" />
                      <TasteDNA logs={(analyticsLogs.length > 0 ? analyticsLogs : displayLogs) as any} username={targetUser?.username || username} memberNo={memberNo} />
                    </View>

                    {/* Cinematic Insights */}
                    <View>
                      <SectionDivider label="REAL ANALYTICS" />
                      <CinematicInsights {...{logs: analyticsLogs.length > 0 ? analyticsLogs : displayLogs} as any} />
                    </View>

                    {/* Society Honors */}
                    <View>
                      <SectionDivider label="SOCIETY HONORS" />
                      <Achievements {...{logs: analyticsLogs.length > 0 ? analyticsLogs : displayLogs, analytics: serverAnalytics} as any} />
                    </View>

                    {/* HIGHEST RATED — and now actually the highest rated.
                        This took the first six logs rated 4 or better in the
                        order they were LOGGED, so a member with two hundred
                        five-star films was shown whichever six they happened
                        to file most recently, under a heading promising the
                        best. Sorted by rating, then by recency to break a tie. */}
                    {highestRated.length > 0 && (
                      <View>
                        <SectionDivider label="HIGHEST RATED" />
                        <View style={s.card}>
                          {highestRated.map((log: ProfileLog) => {
                            const posterUri = tmdb.poster(log.poster, 'w185');
                            return (
                              <PressableScale
                                key={log.id}
                                style={s.favouriteRow}
                                onPress={() => log.filmId && (router.push as any)(`/film/${log.filmId}` as any)}
                                // Six rows stacked in a card with `gap: 10`, so
                                // each may claim 5 vertically. At the 15pt
                                // default they reached 20pt into each other and
                                // the LATER row won: tapping the bottom of one
                                // film opened the film below it. The row is
                                // 42pt tall, so 5 each side still clears 44.
                                hitSlop={{ top: 5, bottom: 5, left: 8, right: 8 }}
                                haptic
                                accessibilityRole="button"
                                accessibilityLabel={`${log.title}${log.rating > 0 ? `, rated ${log.rating} of 5` : ''}`}
                              >
                                {posterUri
                                  ? <Image source={{ uri: posterUri }} style={s.favPosterThumb} transition={50} cachePolicy="memory-disk" />
                                  /* An unposterd film used to collapse the row
                                     to the text alone, so a card of six sat at
                                     two different indents. */
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
                      <NoirPassport {...{user: targetUser, logs: analyticsLogs.length > 0 ? analyticsLogs : displayLogs, analytics: serverAnalytics} as any} />
                    </View>

                    {/* Taste Match (other users only) */}
                    {!isSelf && myLogs.length >= 5 && (
                      <TasteMatch {...{myLogs, theirLogs: analyticsLogs.length > 0 ? analyticsLogs : displayLogs, theirUsername: targetUser.username} as any} />
                    )}
                  </View>
                </View>
            )}

            {/* ═══ CALENDAR TAB ═══ */}
            {activeTab === 'calendar' && (
              <View style={s.tabContentPad}>
                {isArchivistPlus ? (
                  <View>
                    <SectionDivider label="VIEWING HISTORY" />
                    <NitrateCalendarGrid {...{logs: calendarData.length > 0 ? calendarData : (analyticsLogs.length > 0 ? analyticsLogs : displayLogs), isSelf} as any} />
                  </View>
                ) : (
                  <VelvetGate
                    title="The Viewing Calendar"
                    line={isSelf ? 'The nightly attendance record awaits the Archivist rank.' : "This member's calendar is not on display."}
                    isSelf={isSelf}
                    onAscend={navToMembership}
                  />
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
          {/* Icon-only, so it has NO text child to borrow a name from: without
              this label a screen reader announced nothing at all for the one
              control that leaves the page. The tab-view's back button has had
              a name all along; this one never did. */}
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
        <View style={s.headerWrap}>
          {/* Tier atmosphere — breathes up as the plate develops */}
          <AnimatedView style={[StyleSheet.absoluteFillObject, atmosphereDevelop]} pointerEvents="none">
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

            {/* The projector's pool of light — true radial, tier-tinted */}
            <SpotlightPool tint={tierSpot} opacity={tierSpotOpacity} />
          </AnimatedView>

          {/* Film grain texture overlay */}
          <View style={s.filmGrainOverlay} pointerEvents="none" />

          {/* A breath of dark at the very top so the status bar and the back
              button recede into the plate instead of competing with a bright
              backdrop for the same pixels. */}
          <LinearGradient colors={['rgba(6,5,3,0.72)', 'transparent']} style={s.heroTopFade} pointerEvents="none" />

          {/* Bottom structural edge */}
          <View style={[s.headerGoldEdge, isAuteurPlus && { backgroundColor: 'rgba(180,45,45,0.35)' }]} pointerEvents="none" />

          {/* ── Header Content ──
              No horizontal padding here: the ident row, the bio, the figures
              and the acts each set their own, exactly as the design does. A
              shared 20pt pad plus alignItems:'center' is what produced the old
              single centred column. */}
          <View style={[s.headerContent, { paddingTop: heroTop }]}>

            {/* ══ THE IDENT — a mounted print, and the particulars beside it ══
                This replaces ten centred blocks stacked down the middle of the
                screen. Everything that was in them is still here; it is set as
                a composition instead of a list, which is why it now fits in one
                glance instead of one and a half screens. */}
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
                      <Text {...decorativeTextProps} style={s.plateInitial}>{avatarInitial}</Text>
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

                {/* The rank, stamped on the corner at a hand's angle — and it
                    literally stamps down, on the last beat of the develop. */}
                <AnimatedView style={[s.tierStamp, isAuteurPlus && s.tierStampRuby, stampDevelop]}>
                  <Text
                    {...decorativeTextProps}
                    style={[s.tierStampText, isAuteurPlus && s.tierStampTextRuby]}
                    numberOfLines={1}
                  >{stampLabel}</Text>
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
                {!!serialLine && <Text {...scaledTextProps} style={s.heroSerial} numberOfLines={1}>{serialLine}</Text>}
              </View>
            </AnimatedView>

            {/* ── The bio, in the house's own quotation marks ── */}
            <Text {...scaledTextProps} style={[s.heroBio, bioStyle]} numberOfLines={bioLines}>
              {/* The guillemets sit INSIDE the bio and inherit its size, so they
                  must inherit its ceiling too. A blanket "anything called a
                  mark is decorative" rule had made them the one piece of text
                  on the page that would not grow — leaving the quote marks
                  small around a bio that had grown around them. */}
              <Text {...scaledTextProps} style={isAuteurPlus ? s.bioMarkRuby : s.bioMark}>« </Text>
              {bioText}
              {/* The guillemets sit INSIDE the bio and inherit its size, so they
                  must inherit its ceiling too. A blanket "anything called a
                  mark is decorative" rule had made them the one piece of text
                  on the page that would not grow — leaving the quote marks
                  small around a bio that had grown around them. */}
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
                    // The chips wrap, so a chip has neighbours on BOTH axes,
                    // 8pt away — 4 per side is the whole budget. The chip
                    // itself is 36pt tall so 36+8 still clears the 44pt floor;
                    // it used to be ~20pt tall with the full 15pt default,
                    // which was under the floor AND overlapping its neighbour.
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

            {/* ── The four figures ──
                This row was once gated on a `hide_stats` preference. That preference was
                removed: it hid these four numbers while the films they count stayed
                browsable in the tabs below and readable from the API by anyone, so it
                promised a privacy it never delivered. Members who want to be unreadable
                have `is_social_private`, which the database actually enforces.

                FILMS and WATCHLIST now sit together, and the two social counts
                together — the two pairs a reader actually compares. */}
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
                  // 48pt tall and flex:1 — no halo needed, and the pair is
                  // only 10pt apart, so 5 is the entire per-side budget.
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

        {/* ═══ SOLID GROUND — the plate ends above; the rooms begin here ═══ */}
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

          {/* ══ LATELY — a ledger, numbered ══
              Three poster tiles said "here are three pictures". A numbered
              ledger says "these are the last three films, in order, and here is
              what each one got". It is about 35pt TALLER than the three tiles
              were, and worth every point: a tile showed a poster and a date, a
              row shows the title, the year, the rating, and whether the film
              was a rewatch — which says more than any date does. */}
          {recentLogs.length > 0 && (
            <View style={s.latelySection}>
              <SectionDivider label="LATELY" />
              <View style={s.latelyWrap}>
                {recentLogs.map((log: ProfileLog, i: number) => (
                  <PressableScale
                    key={log.id}
                    style={[s.latelyRow, i === recentLogs.length - 1 && s.latelyRowLast]}
                    onPress={() => (router.push as any)(`/log/${log.id}` as never)}
                    // Rows sit edge to edge: the default 15pt of vertical slop
                    // would put the bottom of each row inside the NEXT one, and
                    // the later sibling wins. 66pt is target enough on its own.
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

          {/* ══ THE HOLDINGS ══
              Six 122pt cards in a 3-wide grid spent ~286pt saying six numbers,
              and put a decorative icon circle above each one. Three rows in two
              columns say the same six in ~156pt, and a dotted leader carries the
              eye from the room to its count the way a printed index does. That
              130pt is what pays for the altarpiece's centre being large. */}
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
                      onPress={() => (router.push as any)({ pathname: `/user/${username}`, params: { tab: item.id } } as any)}
                      // Vertical slop would spill into the row below (later
                      // sibling wins); 7pt horizontal exactly fills the 14pt
                      // gutter between the columns without crossing it.
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

          {/* The Viewing Calendar — Archivist+ door */}
          <PressableScale
            style={[s.doorRow, !isArchivistPlus && s.doorRowLocked]}
            onPress={navToCalendar}
            hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
            haptic
            accessibilityRole="button"
            accessibilityLabel={isArchivistPlus ? 'The Viewing Calendar' : 'The Viewing Calendar, locked'}
          >
            <CalendarDays size={13} color={isArchivistPlus ? colors.sepia : 'rgba(158,148,136,0.55)'} strokeWidth={1.6} />
            <Text {...scaledTextProps} style={[s.doorText, !isArchivistPlus && s.doorTextLocked]} numberOfLines={1}>THE VIEWING CALENDAR</Text>
            {isArchivistPlus
              ? <ChevronRight size={11} color={colors.sepia} strokeWidth={2} />
              : <KeyRound size={11} color={'rgba(158,148,136,0.55)'} strokeWidth={2} />}
          </PressableScale>

          {/* ══ THE DESK — your own file only ══
              "AT THE DOOR" used to live here as well as in Notices. Follow
              requests are notices; keeping a second, stateful copy of them on
              the profile meant two places to check and two places to get out of
              step. Notices already carries the pinned banner and the very same
              panel, so nothing was lost by taking this one out. */}
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

              {/* The way into the society page — at EVERY rank. This is the
                  door, not an upsell, so it does not disappear once you reach
                  the top; at the top it simply stops shouting. */}
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

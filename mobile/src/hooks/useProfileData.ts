import { useReducer, useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/src/utils/logger';
import { useLogStore, useWatchlistStore, useArchiveStore, useListStore } from '@/src/stores/films';
import type { ProfileLog, ProfileWatchlistItem, ProfileVaultItem, ProfileList, LedgerRating, WatchlistDecade, DecadeCount, ShelfSort } from '@/src/types';
import { ProfileDataService } from '@/src/services/ProfileDataService';
import type { ValidatedProfileUser } from '@/src/schemas/profile.schema';
import { useSocialStore } from '@/src/stores/followStore';
import { useAuthStore } from '@/src/stores/auth';
import { isArchivistPlusTier } from '@/src/utils/tier';
import { readCachedCounts, writeCachedCounts } from '@/src/utils/profileCountsCache';
import type { TasteProfile } from '@/src/constants/taste';
import { isNarrowed, ROOMS, type Room } from '@/src/utils/roomFilters';

export type ProfileTab = 'archive' | 'ledger' | 'watchlist' | 'lists' | 'physical' | 'passport' | 'projector' | 'calendar';
/** The paged collections a room asks "more" of (the archive and the ledger share the logs). */
export type MoreKey = 'logs' | 'watchlist' | 'vault' | 'lists';

/**
 * The shape of a member's collection, pre-aggregated by the server
 * (get_user_analytics) and read on every profile load. The rooms count from
 * it, never from whichever page has loaded: a month heading says the 40 films
 * March holds, and a member's only 1940s film has its 1940s chip though it sits
 * on page eight.
 */
export interface AnalyticsShape {
  total_logs?: number;
  avg_rating?: number | string | null;
  rating_distribution?: { rating: number; count: number }[] | null;
  /** The member's WHOLE history by month, `YYYY-MM`. */
  monthly_activity?: { month: string; count: number }[] | null;
  current_streak?: number | null;
  longest_streak?: number | null;
  /** `logs.format` — how a film was WATCHED. NOT the Vault. */
  format_breakdown?: { format: string; count: number }[] | null;
  /** `physical_archive.formats` — what the member OWNS. This is the Vault. */
  vault_formats?: { format: string; count: number }[] | null;
  watchlist_decades?: DecadeCount[] | null;
  /** Present instead of the data when the viewer may not see this member. */
  error?: string;
}

/** The member as the service boundary validated them (profile.schema). */
export type ProfileUser = ValidatedProfileUser;

// One reducer, so a load's many changes land in one render.

export interface ProfileState {
  targetUser: ProfileUser | null;
  loading: boolean;
  error: Error | null;
  refreshing: boolean;
  mainLogs: ProfileLog[];
  archiveLogs: ProfileLog[];
  ledgerLogs: ProfileLog[];
  analyticsLogs: ProfileLog[];
  /** The last year of viewings, by day. Null until its read has answered. */
  calendarData: { watchedDate: string; rating: number; status: string }[] | null;
  serverAnalytics: any | null;
  watchlist: ProfileWatchlistItem[];
  vault: ProfileVaultItem[];
  lists: ProfileList[];
  mainLogsCursor: string | null;
  archiveLogsCursor: string | null;
  ledgerLogsCursor: string | null;
  hasMoreMainLogs: boolean;
  hasMoreArchiveLogs: boolean;
  hasMoreLedgerLogs: boolean;
  watchlistCursor: string | null;
  hasMoreWatchlist: boolean;
  vaultCursor: string | null;
  hasMoreVault: boolean;
  listsCursor: string | null;
  hasMoreLists: boolean;
  isLoadingMore: Record<string, boolean>;
  counts: { logs: number; ledger: number; watchlist: number; vault: number; lists: number; followers?: number; following?: number };
  tabDataLoaded: Record<string, boolean>;
  serverStreak: number | null;
  /** Genres, actors and directors over the WHOLE archive. Null = not read. */
  taste: TasteProfile | null;
  /**
   * The whole pre-aggregated summary — month counts, format counts, rating
   * spread, streaks, average mark: real at any collection size, one round trip.
   *
   * Null when it could not be read or the viewer may not see this member, and
   * every consumer then falls SILENT rather than guess: a count that cannot be
   * known is not drawn at all.
   */
  analyticsShape: AnalyticsShape | null;
  activeFilters: {
    ledger?: { search?: string, rating?: LedgerRating, hasRatingOrReview?: boolean };
    watchlist?: { search?: string, sort?: ShelfSort, decade?: WatchlistDecade };
    physical?: { filter?: string, sort?: ShelfSort, search?: string };
    archive?: { status?: string, search?: string, titleOnly?: boolean };
    lists?: { sort?: ShelfSort, search?: string };
  };
}

export type ProfileAction =
  | { type: 'SET_USER'; payload: ProfileUser | null | ((prev: ProfileUser | null) => ProfileUser | null) }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: Error | null }
  | { type: 'SET_REFRESHING'; payload: boolean }
  | { type: 'SET_COUNTS'; payload: CountsRead }
  | { type: 'SET_TAB_LOADED'; tabs: Record<string, boolean> }
  | { type: 'SET_ANALYTICS'; payload: ProfileLog[] }
  | { type: 'SET_CALENDAR_DATA'; payload: { watchedDate: string; rating: number; status: string }[] }
  | { type: 'SET_SERVER_ANALYTICS'; payload: any }
  | { type: 'SET_TASTE'; payload: TasteProfile | null }
  | { type: 'SET_LOGS_PAGE'; tab: 'main' | 'archive' | 'ledger'; items: ProfileLog[]; cursor: string | null; append?: boolean }
  | { type: 'SET_WATCHLIST_PAGE'; items: ProfileWatchlistItem[]; cursor: string | null; append?: boolean }
  | { type: 'SET_VAULT_PAGE'; items: ProfileVaultItem[]; cursor: string | null; append?: boolean }
  | { type: 'SET_LISTS_PAGE'; items: ProfileList[]; cursor: string | null; append?: boolean }
  | { type: 'SET_LOADING_MORE'; key: string; value: boolean }
  | { type: 'USER_DATA_LOADED'; user: ProfileUser; counts: CountsRead; serverStreak: number | null; analyticsShape?: AnalyticsShape | null; logs?: ProfileLog[]; logsCursor?: string | null }
  | { type: 'SET_ACTIVE_FILTERS'; tab: 'archive' | 'ledger' | 'watchlist' | 'physical' | 'lists'; filters: any }
  | { type: 'RESET_STATE' };

export const initialState: ProfileState = {
  targetUser: null,
  loading: true,
  error: null,
  refreshing: false,
  mainLogs: [],
  archiveLogs: [],
  ledgerLogs: [],
  analyticsLogs: [],
  calendarData: null,
  serverAnalytics: null,
  watchlist: [],
  vault: [],
  lists: [],
  mainLogsCursor: null,
  archiveLogsCursor: null,
  ledgerLogsCursor: null,
  hasMoreMainLogs: true,
  hasMoreArchiveLogs: true,
  hasMoreLedgerLogs: true,
  watchlistCursor: null,
  hasMoreWatchlist: true,
  vaultCursor: null,
  hasMoreVault: true,
  listsCursor: null,
  hasMoreLists: true,
  isLoadingMore: {},
  counts: { logs: 0, ledger: 0, watchlist: 0, vault: 0, lists: 0 },
  tabDataLoaded: {},
  serverStreak: null,
  taste: null,
  analyticsShape: null,
  activeFilters: {
    archive: { status: 'all' },
    ledger: { search: '', rating: 'all', hasRatingOrReview: true },
    watchlist: { search: '', sort: 'default' },
    physical: { filter: undefined },
  },
};

/** Counts as read: one left undefined could not be read. */
export type CountsRead = { [K in keyof ProfileState['counts']]?: number | undefined };

/** A count that could not be read keeps the one on screen: no number is invented as zero. */
function withCounts(on: ProfileState['counts'], read: CountsRead): ProfileState['counts'] {
  return {
    logs: read.logs ?? on.logs,
    ledger: read.ledger ?? on.ledger,
    watchlist: read.watchlist ?? on.watchlist,
    vault: read.vault ?? on.vault,
    lists: read.lists ?? on.lists,
    followers: read.followers ?? on.followers,
    following: read.following ?? on.following,
  };
}

export function profileReducer(state: ProfileState, action: ProfileAction): ProfileState {
  switch (action.type) {
    case 'RESET_STATE':
      return { ...initialState };
    case 'SET_USER':
      return {
        ...state,
        targetUser: typeof action.payload === 'function'
          ? action.payload(state.targetUser)
          : action.payload
      };
    case 'SET_LOADING':
      return { ...state, loading: action.payload, error: action.payload ? null : state.error };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'SET_REFRESHING':
      return { ...state, refreshing: action.payload };
    case 'SET_COUNTS':
      return { ...state, counts: withCounts(state.counts, action.payload) };
    case 'SET_TAB_LOADED':
      return { ...state, tabDataLoaded: { ...state.tabDataLoaded, ...action.tabs } };
    case 'SET_ANALYTICS': return { ...state, analyticsLogs: action.payload };
    case 'SET_CALENDAR_DATA': return { ...state, calendarData: action.payload };
    case 'SET_SERVER_ANALYTICS': return { ...state, serverAnalytics: action.payload };
    case 'SET_TASTE': return { ...state, taste: action.payload };
    case 'SET_LOGS_PAGE': {
      if (action.tab === 'main') {
        const items = action.append ? (() => { const ids = new Set(state.mainLogs.map(p => p.id)); return [...state.mainLogs, ...action.items.filter(p => !ids.has(p.id))]; })() : action.items;
        return { ...state, mainLogs: items, mainLogsCursor: action.cursor, hasMoreMainLogs: action.cursor !== null };
      }
      if (action.tab === 'archive') {
        const items = action.append ? (() => { const ids = new Set(state.archiveLogs.map(p => p.id)); return [...state.archiveLogs, ...action.items.filter(p => !ids.has(p.id))]; })() : action.items;
        return { ...state, archiveLogs: items, archiveLogsCursor: action.cursor, hasMoreArchiveLogs: action.cursor !== null };
      }
      if (action.tab === 'ledger') {
        const items = action.append ? (() => { const ids = new Set(state.ledgerLogs.map(p => p.id)); return [...state.ledgerLogs, ...action.items.filter(p => !ids.has(p.id))]; })() : action.items;
        return { ...state, ledgerLogs: items, ledgerLogsCursor: action.cursor, hasMoreLedgerLogs: action.cursor !== null };
      }
      return state;
    }
    case 'SET_WATCHLIST_PAGE': {
      const items = action.append
        ? (() => { const ids = new Set(state.watchlist.map(p => p.id)); return [...state.watchlist, ...action.items.filter(p => !ids.has(p.id))]; })()
        : action.items;
      return { ...state, watchlist: items, watchlistCursor: action.cursor, hasMoreWatchlist: action.cursor !== null };
    }
    case 'SET_VAULT_PAGE': {
      const items = action.append
        ? (() => { const ids = new Set(state.vault.map(p => p.id)); return [...state.vault, ...action.items.filter(p => !ids.has(p.id))]; })()
        : action.items;
      return { ...state, vault: items, vaultCursor: action.cursor, hasMoreVault: action.cursor !== null };
    }
    case 'SET_LISTS_PAGE': {
      const items = action.append
        ? (() => { const ids = new Set(state.lists.map(p => p.id)); return [...state.lists, ...action.items.filter(p => !ids.has(p.id))]; })()
        : action.items;
      return { ...state, lists: items, listsCursor: action.cursor, hasMoreLists: action.cursor !== null };
    }
    case 'SET_LOADING_MORE':
      return { ...state, isLoadingMore: { ...state.isLoadingMore, [action.key]: action.value } };
    case 'USER_DATA_LOADED': {
      // Only seed the archive and ledger tabs with the base main logs when they
      // are not narrowed by any filter: a filtered room keeps its own page.
      const hasArchiveFilters = isNarrowed('archive', state.activeFilters.archive);
      const hasLedgerFilters = isNarrowed('ledger', state.activeFilters.ledger);

      return {
        ...state,
        targetUser: action.user,
        counts: withCounts(state.counts, action.counts),
        serverStreak: action.serverStreak,
        analyticsShape: action.analyticsShape ?? state.analyticsShape,
        mainLogs: action.logs ?? state.mainLogs,
        archiveLogs: hasArchiveFilters ? state.archiveLogs : (action.logs ?? state.archiveLogs),
        ledgerLogs: hasLedgerFilters ? state.ledgerLogs : (action.logs ?? state.ledgerLogs),
        mainLogsCursor: action.logsCursor !== undefined ? action.logsCursor : state.mainLogsCursor,
        archiveLogsCursor: action.logsCursor !== undefined ? (hasArchiveFilters ? state.archiveLogsCursor : action.logsCursor) : state.archiveLogsCursor,
        ledgerLogsCursor: action.logsCursor !== undefined ? (hasLedgerFilters ? state.ledgerLogsCursor : action.logsCursor) : state.ledgerLogsCursor,
        hasMoreMainLogs: action.logsCursor !== undefined ? action.logsCursor !== null : state.hasMoreMainLogs,
        hasMoreArchiveLogs: action.logsCursor !== undefined ? (hasArchiveFilters ? state.hasMoreArchiveLogs : action.logsCursor !== null) : state.hasMoreArchiveLogs,
        hasMoreLedgerLogs: action.logsCursor !== undefined ? (hasLedgerFilters ? state.hasMoreLedgerLogs : action.logsCursor !== null) : state.hasMoreLedgerLogs,
        tabDataLoaded: { ...state.tabDataLoaded, archive: true, ledger: true },
      };
    }
    case 'SET_ACTIVE_FILTERS':
      return { ...state, activeFilters: { ...state.activeFilters, [action.tab]: action.filters } };
    default:
      return state;
  }
}

/**
 * A room's reads, each with its own cancel switch, keyed by room ('archive',
 * 'ledger', 'watchlist', 'physical', 'lists'), 'analytics', 'calendar', or
 * 'main' (the logs below the rooms).
 */
type RoomSwitches = { current: Record<string, AbortController> };
function roomSignal(rooms: RoomSwitches, key: string): AbortSignal {
  return (rooms.current[key] ??= new AbortController()).signal;
}
/** Cancels what the room still has out (an older search, its more rows) and starts again. */
function restartRoom(rooms: RoomSwitches, key: string): AbortController {
  rooms.current[key]?.abort();
  return (rooms.current[key] = new AbortController());
}

export function useProfileData({
  username,
  isSelf,
  isFollowing,
  activeTab
}: {
  username: string;
  isSelf: boolean;
  isFollowing: boolean | undefined;
  activeTab: ProfileTab | null;
}) {
  const [state, dispatch] = useReducer(profileReducer, initialState);
  /** A room whose read failed, until it is asked again. */
  const [tabFailed, setTabFailed] = useState<Partial<Record<ProfileTab, boolean>>>({});

  const fetchLogs = useLogStore(s => s.fetchLogs);
  const fetchWatchlist = useWatchlistStore(s => s.fetchWatchlist);
  const fetchPhysicalArchive = useArchiveStore(s => s.fetchPhysicalArchive);
  const fetchLists = useListStore(s => s.fetchLists);

  // A sealed member's content is read only by the members who follow them.
  const canAccessData = useCallback(() => {
    if (!state.targetUser) return false;
    if (isSelf) return true;
    if (state.targetUser.is_social_private && !useSocialStore.getState().isFollowing(state.targetUser.username)) {
      return false;
    }
    return true;
  }, [state.targetUser, isSelf]);

  // A room the member's rank does not hold is never read. Only the shelf is
  // ranked (Archivist and above); the calendar, Projector and passport are every
  // member's (another member's full history is read only for an Auteur and
  // above, inside fetchAnalyticsLogs).
  const canAccessTierTab = useCallback((tab: ProfileTab) => {
    if (!state.targetUser) return false;
    if (tab === 'physical' && !isArchivistPlusTier(state.targetUser)) return false;
    return true;
  }, [state.targetUser]);

  // Track mounted state to prevent setState on unmounted component
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  /** A room whose "more" could not be read, until it is asked again. */
  const [moreFailed, setMoreFailed] = useState<Partial<Record<MoreKey, boolean>>>({});
  const noteMore = useCallback((key: MoreKey, read: boolean | void) => {
    if (isMounted.current) setMoreFailed((f) => (!!f[key] === (read === false) ? f : { ...f, [key]: read === false }));
    return read;
  }, []);

  // Each read is cancelled only by what makes it stale: the member's row and
  // first page by the next read of them, a room's reads by that room's next
  // filtered read, and all of them by leaving the member. One switch for all
  // cancelled a room in flight on every pull, and left it marked read and empty.
  const _fetchAbortRef = useRef<AbortController | null>(null);
  const _roomAbortRef = useRef<Record<string, AbortController>>({});

  // Track current target user ID to prevent cross-user data bleed
  const targetUserIdRef = useRef<string | undefined>(undefined);
  targetUserIdRef.current = state.targetUser?.id;

  const fetchUserData = useCallback(async (): Promise<boolean | void> => {
    if (!username) return;

    // A newer read of the member cancels the one still out.
    _fetchAbortRef.current?.abort();
    const controller = new AbortController();
    _fetchAbortRef.current = controller;
    const signal = controller.signal;

    try {
      // Validated at the service; another member's row is read without their preferences.
      const profile = await ProfileDataService.fetchProfile(username, isSelf, signal);
      if (signal.aborted) return;
      if (!profile) { if (isMounted.current) dispatch({ type: 'SET_USER', payload: null }); return; }
      if (!isMounted.current) return;
      const typedProfile = profile;

      const currentIsFollowing = useSocialStore.getState().isFollowing(username);
      if (typedProfile.is_social_private && !isSelf && !currentIsFollowing) {
        // Sealed profile: show the member and their REAL stats (the counts RPC is
        // SECURITY DEFINER, so it's privacy-safe), but never fetch the content
        // itself. This is what stops a private profile reading "0 films" — we
        // simply never asked for the counts before. The tabs stay locked.
        dispatch({ type: 'SET_USER', payload: typedProfile });
        try {
          const lockedCounts = await ProfileDataService.fetchCounts(typedProfile, false, signal);
          if (!signal.aborted && isMounted.current) {
            if (lockedCounts.followers != null) typedProfile.followers_count = lockedCounts.followers;
            if (lockedCounts.following != null) typedProfile.following_count = lockedCounts.following;
            dispatch({ type: 'SET_USER', payload: { ...typedProfile } });
            dispatch({ type: 'SET_COUNTS', payload: lockedCounts });
          }
        } catch { /* non-fatal: the sealed profile still renders without counts */ }
        return;
      }

      // Counts, summary and logs are independent, so they are read together.
      if (isSelf) {
        // Your logs are kept on the phone (MMKV): with some held, the file shows
        // at once and they are renewed behind it.
        const storeHasLogs = useLogStore.getState().logs.length > 0;

        const [countsResult, analyticsSummary, logsRead] = await Promise.all([
          ProfileDataService.fetchCounts(typedProfile, isSelf, signal),
          ProfileDataService.fetchAnalyticsSummary(typedProfile, signal),
          storeHasLogs ? Promise.resolve(true) : fetchLogs(),
        ]);
        if (signal.aborted || !isMounted.current) return;
        // With nothing held to show, a logs read that failed leaves the archive
        // and the ledger unread: said, never drawn as an empty record.
        if (logsRead === false) setTabFailed((f) => ({ ...f, archive: true, ledger: true }));

        // Heal the displayed follower/following counts with the live RPC values —
        // the profile row's denormalized columns drift (three maintainers). Optimistic
        // follow still bumps these fields, so the count ticks instantly on follow.
        if (countsResult.followers != null) typedProfile.followers_count = countsResult.followers;
        if (countsResult.following != null) typedProfile.following_count = countsResult.following;
        // These are exact. Keep them, so the NEXT cold start seeds the real totals
        // instead of counting the 150-entry window the film store persists.
        writeCachedCounts(typedProfile.id, countsResult);
        dispatch({ type: 'USER_DATA_LOADED', user: typedProfile, counts: countsResult, serverStreak: analyticsSummary?.current_streak ?? null, analyticsShape: analyticsSummary ?? null });

        // Background refresh: fetch fresh logs without blocking the spinner.
        // fetchLogs() has its own _fetchingLogs mutex so this is safe.
        if (storeHasLogs) fetchLogs();
        return;
      }

      const [countsResult, analyticsSummary, result] = await Promise.all([
        ProfileDataService.fetchCounts(typedProfile, isSelf, signal),
        ProfileDataService.fetchAnalyticsSummary(typedProfile, signal),
        // Never contaminate the root user data fetch with volatile tab filters.
        ProfileDataService.fetchOtherUserLogs(typedProfile.id, 50, undefined, signal, undefined),
      ]);
      if (signal.aborted || !isMounted.current) return;
      // Heal follower/following display with the live RPC values (see self path).
      if (countsResult.followers != null) typedProfile.followers_count = countsResult.followers;
      if (countsResult.following != null) typedProfile.following_count = countsResult.following;
      dispatch({
        type: 'USER_DATA_LOADED',
        user: typedProfile,
        counts: countsResult,
        serverStreak: analyticsSummary?.current_streak ?? null,
        analyticsShape: analyticsSummary ?? null,
        logs: result.items,
        logsCursor: result.nextCursor,
      });
    } catch (err: unknown) {
        if (signal.aborted) return; // cancelled by a newer read, or by leaving
        logger.warn('[ProfileFetch] fetchUserData error:', err);
        if (isMounted.current) {
          dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err : new Error(String(err)) });
        }
        // Said to the caller too: a pull over a page already shown says it reached nothing.
        return false;
    }
  }, [username, isSelf, fetchLogs]);

  useEffect(() => {
    if (state.targetUser?.is_social_private && !isSelf && isFollowing && !state.tabDataLoaded.archive) {
      fetchUserData();
    }
  }, [isFollowing, state.targetUser?.is_social_private, isSelf, state.tabDataLoaded.archive, fetchUserData]);

  const loadTabData = useCallback(async (tab: ProfileTab, forceRefresh = false) => {
    if ((state.tabDataLoaded[tab] && !forceRefresh) || !state.targetUser) return;

    if (!canAccessData()) return;
    if (!canAccessTierTab(tab)) return;

    const uid = state.targetUser.id;
    setTabFailed((f) => (f[tab] ? { ...f, [tab]: false } : f));
    try {
      if (tab === 'watchlist' && (!state.tabDataLoaded.watchlist || forceRefresh)) {
        dispatch({ type: 'SET_TAB_LOADED', tabs: { watchlist: true } });
        if (isSelf) {
          if (!(await fetchWatchlist())) throw new Error('The watchlist could not be read');
        } else {
          const result = await ProfileDataService.fetchOtherUserWatchlist(uid, undefined, undefined, roomSignal(_roomAbortRef, 'watchlist'), state.activeFilters.watchlist);
          if (uid !== targetUserIdRef.current) return;
          dispatch({ type: 'SET_WATCHLIST_PAGE', items: result.items, cursor: result.nextCursor });
        }
      } else if (tab === 'physical' && (!state.tabDataLoaded.physical || forceRefresh)) {
        dispatch({ type: 'SET_TAB_LOADED', tabs: { physical: true } });
        if (isSelf) {
          if (!(await fetchPhysicalArchive())) throw new Error('The shelf could not be read');
        } else {
          const result = await ProfileDataService.fetchOtherUserVault(state.targetUser, undefined, undefined, roomSignal(_roomAbortRef, 'physical'), state.activeFilters.physical);
          if (uid !== targetUserIdRef.current) return;
          dispatch({ type: 'SET_VAULT_PAGE', items: result.items, cursor: result.nextCursor });
        }
      } else if (tab === 'lists' && (!state.tabDataLoaded.lists || forceRefresh)) {
        dispatch({ type: 'SET_TAB_LOADED', tabs: { lists: true } });
        if (isSelf) {
          if (!(await fetchLists())) throw new Error('The stacks could not be read');
        } else {
          const result = await ProfileDataService.fetchOtherUserLists(uid, undefined, undefined, roomSignal(_roomAbortRef, 'lists'), state.activeFilters.lists);
          if (uid !== targetUserIdRef.current) return;
          dispatch({ type: 'SET_LISTS_PAGE', items: result.items, cursor: result.nextCursor });
        }
      } else if ((tab === 'projector' || tab === 'passport') && (!state.tabDataLoaded.analytics || forceRefresh)) {
        dispatch({ type: 'SET_TAB_LOADED', tabs: { analytics: true } });
        const [parsedAnalytics, serverAnalyticsPayload, tastePayload] = await Promise.all([
          ProfileDataService.fetchAnalyticsLogs(state.targetUser, isSelf, roomSignal(_roomAbortRef, 'analytics')),
          ProfileDataService.fetchProfileAnalytics(state.targetUser, roomSignal(_roomAbortRef, 'analytics')),
          // Replaces dozens of TMDB round trips from the phone with one call.
          ProfileDataService.fetchTasteProfile(state.targetUser, roomSignal(_roomAbortRef, 'analytics')),
        ]);
        // "Something changed — read whatever is outstanding." Fire and forget:
        // nothing on screen waits, and the function drains the whole backlog,
        // so a lost ping costs nothing.
        ProfileDataService.pingFilmSync();
        if (!isMounted.current || uid !== targetUserIdRef.current) return;
        dispatch({ type: 'SET_ANALYTICS', payload: parsedAnalytics });
        if (serverAnalyticsPayload) {
          dispatch({ type: 'SET_SERVER_ANALYTICS', payload: serverAnalyticsPayload });
        }
        dispatch({ type: 'SET_TASTE', payload: tastePayload });
      } else if (tab === 'calendar' && (!state.tabDataLoaded.calendar || forceRefresh)) {
        dispatch({ type: 'SET_TAB_LOADED', tabs: { calendar: true } });
        // Always its own read — three columns over the 52 weeks the grid draws.
        // The Projector's logs are not the member's year: for another member
        // below the Auteur rank it reads none.
        const calData = await ProfileDataService.fetchCalendarData(state.targetUser, roomSignal(_roomAbortRef, 'calendar'));
        if (!isMounted.current || uid !== targetUserIdRef.current) return;
        dispatch({ type: 'SET_CALENDAR_DATA', payload: calData.map(d => ({ watchedDate: d.date, rating: d.rating, status: d.status })) });
      }
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // Log in both dev and prod — routes to Sentry breadcrumbs in production
        logger.warn('[ProfileFetch] loadTabData error:', err);
        // Revert the loaded state so the user can try again — and say so: the
        // room stood at "RETRIEVING" for as long as the member stayed.
        if (isMounted.current) {
          setTabFailed((f) => ({ ...f, [tab]: true }));
          if (tab === 'projector' || tab === 'passport') {
            dispatch({ type: 'SET_TAB_LOADED', tabs: { analytics: false } });
          } else {
            dispatch({ type: 'SET_TAB_LOADED', tabs: { [tab]: false } });
          }
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.targetUser, state.tabDataLoaded, isSelf, fetchWatchlist, fetchPhysicalArchive, fetchLists]);

  const loadMoreLogs = useCallback(async () => {
    if (isSelf && (!activeTab || activeTab === 'archive' || activeTab === 'ledger')) {
      const hasSearch = (activeTab === 'archive' && isNarrowed('archive', state.activeFilters.archive))
        || (activeTab === 'ledger' && isNarrowed('ledger', state.activeFilters.ledger));
      if (!hasSearch) return noteMore('logs', await fetchLogs(true));
    }

    const targetCursor = activeTab === 'archive' ? state.archiveLogsCursor : activeTab === 'ledger' ? state.ledgerLogsCursor : state.mainLogsCursor;
    const hasMore = activeTab === 'archive' ? state.hasMoreArchiveLogs : activeTab === 'ledger' ? state.hasMoreLedgerLogs : state.hasMoreMainLogs;
    const lockKey = activeTab === 'archive' ? 'logs_archive' : activeTab === 'ledger' ? 'logs_ledger' : 'logs_main';

    if (!hasMore || state.isLoadingMore[lockKey] || !state.targetUser) return;
    if (!canAccessData()) return;
    const uid = state.targetUser.id;
    dispatch({ type: 'SET_LOADING_MORE', key: lockKey, value: true });
    try {
      const activeLogFilters = activeTab === 'archive' ? state.activeFilters.archive : activeTab === 'ledger' ? state.activeFilters.ledger : undefined;
      const tabLiteral = activeTab === 'archive' ? 'archive' : activeTab === 'ledger' ? 'ledger' : 'main';
      const result = await ProfileDataService.fetchOtherUserLogs(uid, 50, targetCursor ?? undefined, roomSignal(_roomAbortRef, tabLiteral), activeLogFilters);
      if (uid !== targetUserIdRef.current) return;
      dispatch({ type: 'SET_LOGS_PAGE', tab: tabLiteral, items: result.items, cursor: result.nextCursor, append: true });
      noteMore('logs', true);
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.warn('[ProfileFetch] loadMoreLogs error:', err);
        return noteMore('logs', false);
    } finally {
      if (isMounted.current) dispatch({ type: 'SET_LOADING_MORE', key: lockKey, value: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelf, fetchLogs, noteMore, state.hasMoreArchiveLogs, state.hasMoreLedgerLogs, state.hasMoreMainLogs, state.isLoadingMore.logs_main, state.isLoadingMore.logs_archive, state.isLoadingMore.logs_ledger, state.targetUser, state.archiveLogsCursor, state.ledgerLogsCursor, state.mainLogsCursor, state.activeFilters.ledger, state.activeFilters.archive, activeTab]);

  const loadMoreWatchlist = useCallback(async () => {
    if (isSelf && !isNarrowed('watchlist', state.activeFilters.watchlist)) return noteMore('watchlist', await fetchWatchlist(true));
    if (!state.hasMoreWatchlist || state.isLoadingMore.watchlist || !state.targetUser) return;
    if (!canAccessData()) return;
    const uid = state.targetUser.id;
    dispatch({ type: 'SET_LOADING_MORE', key: 'watchlist', value: true });
    try {
      const result = await ProfileDataService.fetchOtherUserWatchlist(uid, 50, state.watchlistCursor ?? undefined, roomSignal(_roomAbortRef, 'watchlist'), state.activeFilters.watchlist);
      if (uid !== targetUserIdRef.current) return;
      dispatch({ type: 'SET_WATCHLIST_PAGE', items: result.items, cursor: result.nextCursor, append: true });
      noteMore('watchlist', true);
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.warn('[ProfileFetch] loadMoreWatchlist error:', err);
        return noteMore('watchlist', false);
    } finally {
      if (isMounted.current) dispatch({ type: 'SET_LOADING_MORE', key: 'watchlist', value: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelf, fetchWatchlist, noteMore, state.hasMoreWatchlist, state.isLoadingMore.watchlist, state.targetUser, state.watchlistCursor, state.activeFilters.watchlist]);

  const loadMoreVault = useCallback(async () => {
    // Pass loadMore=true for self-view — without this, tapping "load more"
    // on your own vault resets the list instead of appending.
    if (isSelf && !isNarrowed('physical', state.activeFilters.physical)) return noteMore('vault', await fetchPhysicalArchive(undefined, true));
    if (!state.hasMoreVault || state.isLoadingMore.vault || !state.targetUser) return;
    if (!canAccessData()) return;
    if (!canAccessTierTab('physical')) return;
    const uid = state.targetUser.id;
    dispatch({ type: 'SET_LOADING_MORE', key: 'vault', value: true });
    try {
      const result = await ProfileDataService.fetchOtherUserVault(state.targetUser, 50, state.vaultCursor ?? undefined, roomSignal(_roomAbortRef, 'physical'), state.activeFilters.physical);
      if (uid !== targetUserIdRef.current) return;
      dispatch({ type: 'SET_VAULT_PAGE', items: result.items, cursor: result.nextCursor, append: true });
      noteMore('vault', true);
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.warn('[ProfileFetch] loadMoreVault error:', err);
        return noteMore('vault', false);
    } finally {
      if (isMounted.current) dispatch({ type: 'SET_LOADING_MORE', key: 'vault', value: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelf, fetchPhysicalArchive, noteMore, state.hasMoreVault, state.isLoadingMore.vault, state.targetUser, state.vaultCursor, state.activeFilters.physical]);

  const loadMoreLists = useCallback(async () => {
    if (isSelf) return noteMore('lists', await fetchLists(true));
    if (!state.hasMoreLists || state.isLoadingMore.lists || !state.targetUser) return;
    if (!canAccessData()) return;
    const uid = state.targetUser.id;
    dispatch({ type: 'SET_LOADING_MORE', key: 'lists', value: true });
    try {
      const result = await ProfileDataService.fetchOtherUserLists(uid, 50, state.listsCursor ?? undefined, roomSignal(_roomAbortRef, 'lists'), state.activeFilters.lists);
      if (uid !== targetUserIdRef.current) return;
      dispatch({ type: 'SET_LISTS_PAGE', items: result.items, cursor: result.nextCursor, append: true });
      noteMore('lists', true);
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.warn('[ProfileFetch] loadMoreLists error:', err);
        return noteMore('lists', false);
    } finally {
      if (isMounted.current) dispatch({ type: 'SET_LOADING_MORE', key: 'lists', value: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelf, fetchLists, noteMore, state.hasMoreLists, state.isLoadingMore.lists, state.targetUser, state.listsCursor]);

  useEffect(() => {
    // A new member starts from nothing: no row, room or failure of the last one.
    dispatch({ type: 'RESET_STATE' });
    setTabFailed({});
    setMoreFailed({});

    // Your own file opens at once from what the phone holds (the auth store's
    // member, the film store's logs), with no spinner, and is renewed behind it.
    // isSelf is true only when the handle IS the signed-in member's, so no other
    // member's file is ever seeded from it.
    const cachedSelf = isSelf ? useAuthStore.getState().user : null;
    if (cachedSelf) {
      dispatch({ type: 'SET_USER', payload: cachedSelf as unknown as ProfileUser });
      // The counts are the last EXACT totals this account read (the film store
      // keeps only its latest 150 entries, so counting it would say 150 of 815);
      // zeros only on the very first open, where reconcileCount's Math.max still
      // shows the rows held. The read behind corrects them within the beat.
      const seeded = readCachedCounts(cachedSelf.id);
      dispatch({ type: 'SET_COUNTS', payload: {
        logs: seeded?.logs ?? 0,
        ledger: seeded?.ledger ?? 0,
        watchlist: seeded?.watchlist ?? 0,
        vault: seeded?.vault ?? 0,
        lists: seeded?.lists ?? 0,
        followers: cachedSelf.followers_count ?? 0,
        following: cachedSelf.following_count ?? 0,
      } });
      dispatch({ type: 'SET_LOADING', payload: false });
      fetchUserData(); // silent background refresh — no spinner; errors don't render
    } else {
      dispatch({ type: 'SET_LOADING', payload: true });
      fetchUserData().finally(() => dispatch({ type: 'SET_LOADING', payload: false }));
    }
    // Leaving the member (or the screen) cancels every read still out.
    return () => {
      _fetchAbortRef.current?.abort();
      for (const c of Object.values(_roomAbortRef.current)) c.abort();
      _roomAbortRef.current = {};
    };
  }, [fetchUserData, isSelf]);


  /**
   * A room's filtered read. A failed one marks its room (the room then says it
   * could not be read, never showing the last search's rows under a new one);
   * an answered one clears it.
   */
  const refreshTabWithFilters = useCallback(async (tab: Room, filters: any, forceRefresh = false) => {
    if (!state.targetUser) return;

    // The same filters asked twice (a re-render, an optimistic update) are
    // asked once; and filters at rest that were at rest ask nothing: the room
    // as it stands is its own read (loadTabData, or the member's first page).
    const was = state.activeFilters[tab];
    if (!forceRefresh && (JSON.stringify(was) === JSON.stringify(filters) || (!isNarrowed(tab, was) && !isNarrowed(tab, filters)))) {
      if (JSON.stringify(was) !== JSON.stringify(filters)) dispatch({ type: 'SET_ACTIVE_FILTERS', tab, filters });
      return;
    }
    // Your own stacks are filtered on the phone, never from this read.
    if (isSelf && tab === 'lists') {
      dispatch({ type: 'SET_ACTIVE_FILTERS', tab, filters });
      return;
    }

    dispatch({ type: 'SET_ACTIVE_FILTERS', tab, filters });

    const controller = restartRoom(_roomAbortRef, tab);
    const uid = state.targetUser.id;

    if (tab === 'ledger' || tab === 'archive') {
      const lockKey = tab === 'archive' ? 'logs_archive' : 'logs_ledger';
      dispatch({ type: 'SET_LOADING_MORE', key: lockKey, value: true });
      try {
        const result = await ProfileDataService.fetchOtherUserLogs(uid, 50, undefined, controller.signal, filters);
        if (!isMounted.current || uid !== targetUserIdRef.current) return;
        dispatch({ type: 'SET_LOGS_PAGE', tab: tab as 'archive' | 'ledger', items: result.items, cursor: result.nextCursor, append: false });
        setTabFailed((f) => (f[tab as ProfileTab] ? { ...f, [tab]: false } : f));
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.warn('[ProfileFetch] refreshTabWithFilters logs error:', err);
        if (isMounted.current && uid === targetUserIdRef.current) setTabFailed((f) => ({ ...f, [tab]: true }));
      } finally {
        if (isMounted.current) dispatch({ type: 'SET_LOADING_MORE', key: lockKey, value: false });
      }
    } else if (tab === 'watchlist') {
      dispatch({ type: 'SET_LOADING_MORE', key: 'watchlist', value: true });
      try {
        const result = await ProfileDataService.fetchOtherUserWatchlist(uid, 50, undefined, controller.signal, filters);
        if (!isMounted.current || uid !== targetUserIdRef.current) return;
        dispatch({ type: 'SET_WATCHLIST_PAGE', items: result.items, cursor: result.nextCursor, append: false });
        setTabFailed((f) => (f['watchlist' as ProfileTab] ? { ...f, ['watchlist']: false } : f));
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.warn('[ProfileFetch] refreshTabWithFilters watchlist error:', err);
        if (isMounted.current && uid === targetUserIdRef.current) setTabFailed((f) => ({ ...f, ['watchlist']: true }));
      } finally {
        if (isMounted.current) dispatch({ type: 'SET_LOADING_MORE', key: 'watchlist', value: false });
      }
    } else if (tab === 'physical') {
      dispatch({ type: 'SET_LOADING_MORE', key: 'vault', value: true });
      try {
        const result = await ProfileDataService.fetchOtherUserVault(state.targetUser, 50, undefined, controller.signal, filters);
        if (!isMounted.current || uid !== targetUserIdRef.current) return;
        dispatch({ type: 'SET_VAULT_PAGE', items: result.items, cursor: result.nextCursor, append: false });
        setTabFailed((f) => (f['physical' as ProfileTab] ? { ...f, ['physical']: false } : f));
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.warn('[ProfileFetch] refreshTabWithFilters vault error:', err);
        if (isMounted.current && uid === targetUserIdRef.current) setTabFailed((f) => ({ ...f, ['physical']: true }));
      } finally {
        if (isMounted.current) dispatch({ type: 'SET_LOADING_MORE', key: 'vault', value: false });
      }
    } else if (tab === 'lists') {
      dispatch({ type: 'SET_LOADING_MORE', key: 'lists', value: true });
      try {
        const result = await ProfileDataService.fetchOtherUserLists(uid, 50, undefined, controller.signal, filters);
        if (!isMounted.current || uid !== targetUserIdRef.current) return;
        dispatch({ type: 'SET_LISTS_PAGE', items: result.items, cursor: result.nextCursor, append: false });
        setTabFailed((f) => (f.lists ? { ...f, lists: false } : f));
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.warn('[ProfileFetch] refreshTabWithFilters lists error:', err);
        if (isMounted.current && uid === targetUserIdRef.current) setTabFailed((f) => ({ ...f, lists: true }));
      } finally {
        if (isMounted.current) dispatch({ type: 'SET_LOADING_MORE', key: 'lists', value: false });
      }
    }
  }, [state.targetUser, state.activeFilters, isSelf]);

  /**
   * Ask a room again, after its read failed: the filtered read for a room that
   * is narrowed, your own logs for your archive and ledger, and otherwise the
   * room's own read.
   */
  const retryRoom = useCallback(async (tab: ProfileTab) => {
    if ((ROOMS as readonly string[]).includes(tab)) {
      const room = tab as Room;
      const filters = state.activeFilters[room];
      if (isNarrowed(room, filters as never) && !(isSelf && room === 'lists')) {
        return refreshTabWithFilters(room, filters, true);
      }
    }
    if (isSelf && (tab === 'archive' || tab === 'ledger')) {
      setTabFailed((f) => ({ ...f, archive: false, ledger: false }));
      if (!(await fetchLogs())) setTabFailed((f) => ({ ...f, archive: true, ledger: true }));
      return;
    }
    return loadTabData(tab, true);
  }, [state.activeFilters, isSelf, refreshTabWithFilters, fetchLogs, loadTabData]);

  return {
    targetUser: state.targetUser, setTargetUser: (u: ProfileUser | null | ((prev: ProfileUser | null) => ProfileUser | null)) => {
      dispatch({ type: 'SET_USER', payload: u });
    },
    loading: state.loading, error: state.error, refreshing: state.refreshing, setRefreshing: (v: boolean) => dispatch({ type: 'SET_REFRESHING', payload: v }),
    mainLogs: state.mainLogs, archiveLogs: state.archiveLogs, ledgerLogs: state.ledgerLogs, analyticsLogs: state.analyticsLogs, calendarData: state.calendarData, serverAnalytics: state.serverAnalytics, serverStreak: state.serverStreak, analyticsShape: state.analyticsShape, taste: state.taste, watchlist: state.watchlist, vault: state.vault, lists: state.lists,
    hasMoreMainLogs: state.hasMoreMainLogs, hasMoreArchiveLogs: state.hasMoreArchiveLogs, hasMoreLedgerLogs: state.hasMoreLedgerLogs, hasMoreWatchlist: state.hasMoreWatchlist, hasMoreVault: state.hasMoreVault, hasMoreLists: state.hasMoreLists,
    isLoadingMore: state.isLoadingMore,
    counts: state.counts, tabDataLoaded: state.tabDataLoaded, setTabDataLoaded: (v: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => {
      const next = typeof v === 'function' ? v(state.tabDataLoaded) : v;
      dispatch({ type: 'SET_TAB_LOADED', tabs: next });
    },
    fetchUserData, loadTabData, tabFailed, moreFailed,
    loadMoreLogs, loadMoreWatchlist, loadMoreVault, loadMoreLists,
    refreshTabWithFilters, retryRoom,
  };
}

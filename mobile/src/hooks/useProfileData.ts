import { useReducer, useCallback, useEffect, useRef } from 'react';
import { logger } from '@/src/utils/logger';
import { useLogStore, useWatchlistStore, useArchiveStore, useListStore } from '@/src/stores/films';
import type { ProfileLog, ProfileWatchlistItem, ProfileVaultItem, ProfileList, LedgerRating, WatchlistDecade, ShelfSort } from '@/src/types';
import { ProfileDataService } from '@/src/services/ProfileDataService';
import type { ValidatedProfileUser } from '@/src/schemas/profile.schema';
import { useSocialStore } from '@/src/stores/followStore';
import { useAuthStore } from '@/src/stores/auth';
import { isArchivistPlusTier } from '@/src/utils/tier';
import { readCachedCounts, writeCachedCounts } from '@/src/utils/profileCountsCache';
import type { TasteProfile } from '@/src/constants/taste';

export type ProfileTab = 'archive' | 'ledger' | 'watchlist' | 'lists' | 'physical' | 'passport' | 'projector' | 'calendar';

/**
 * The shape of a member's collection, pre-aggregated by the server.
 *
 * ── EVERY FIELD HERE IS ALREADY BEING FETCHED ────────────────────────────────
 * `fetchAnalyticsSummary` runs on both the self and the visitor path of every
 * profile load, and the app kept exactly one number out of it. These are the
 * counts the rooms were computing from whichever page happened to have loaded —
 * which is why a month heading said 7 films when March held 40, and why a
 * member's only 1940s film could sit on page eight with no 1940s filter to
 * reach it.
 *
 * `vault_formats` and `watchlist_decades` arrive only once the migration is
 * applied; until then they are absent and the rooms simply draw no counts.
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
  watchlist_decades?: { decade: number; count: number }[] | null;
  /** Present instead of the data when the viewer may not see this member. */
  error?: string;
}

// ProfileUser now extends ValidatedProfileUser from the Zod schema.
// This ensures the hook's interface stays in sync with the service boundary.
export type ProfileUser = ValidatedProfileUser;

// ── useReducer replaces 22 separate useState calls ──────────
// A single dispatch batches multiple state changes into one reconciliation
// pass, eliminating the micro-jank caused by 22 separate re-renders when
// loading a profile page.

export interface ProfileState {
  targetUser: ProfileUser | null;
  loading: boolean;
  error: Error | null;
  refreshing: boolean;
  mainLogs: ProfileLog[];
  archiveLogs: ProfileLog[];
  ledgerLogs: ProfileLog[];
  analyticsLogs: ProfileLog[];
  calendarData: { watchedDate: string; rating: number; status: string }[];
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
   * spread, streaks, average mark — fetched on EVERY profile load and, until
   * now, discarded except for one field. Real at any collection size, roughly
   * 2KB, one round trip.
   *
   * Null when the RPC is unavailable or the viewer may not see this member, and
   * every consumer is required to fall SILENT rather than guess: a count that
   * cannot be known is not drawn at all. That rule is what makes this safe to
   * wire up before the migration is applied.
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
  | { type: 'SET_COUNTS'; payload: ProfileState['counts'] }
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
  | { type: 'USER_DATA_LOADED'; user: ProfileUser; counts: ProfileState['counts']; serverStreak: number | null; analyticsShape?: AnalyticsShape | null; logs?: ProfileLog[]; logsCursor?: string | null }
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
  calendarData: [],
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
      return { ...state, counts: action.payload };
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
      // Only seed the archive and ledger tabs with the base main logs 
      // if they do not currently have active filters. If they are filtered, leave them alone.
      const hasArchiveFilters = state.activeFilters.archive && Object.keys(state.activeFilters.archive).length > 0 && state.activeFilters.archive.status !== 'all';
      const hasLedgerFilters = state.activeFilters.ledger && (state.activeFilters.ledger.search || state.activeFilters.ledger.rating !== 'all');
      
      return {
        ...state,
        targetUser: action.user,
        counts: action.counts,
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

  const fetchLogs = useLogStore(s => s.fetchLogs);
  const fetchWatchlist = useWatchlistStore(s => s.fetchWatchlist);
  const fetchPhysicalArchive = useArchiveStore(s => s.fetchPhysicalArchive);
  const fetchLists = useListStore(s => s.fetchLists);

  // Absolute deterministic privacy gate
  const canAccessData = useCallback(() => {
    if (!state.targetUser) return false;
    if (isSelf) return true;
    if (state.targetUser.is_social_private && !useSocialStore.getState().isFollowing(state.targetUser.username)) {
      return false;
    }
    return true;
  }, [state.targetUser, isSelf]);

  // Tier gating to protect network bandwidth for locked features
  const canAccessTierTab = useCallback((tab: ProfileTab) => {
    if (!state.targetUser) return false;
    
    if (tab === 'physical' && !isArchivistPlusTier(state.targetUser)) return false;
    if (tab === 'calendar' && !isArchivistPlusTier(state.targetUser)) return false;
    // Analytics (projector) + passport are base features (see the tiers page) — no tier
    // gate. Your own full analytics load regardless of tier; the heavy fetch for OTHERS
    // stays guarded inside fetchAnalyticsLogs (self + auteur-others) to protect bandwidth.
    return true;
  }, [state.targetUser]);

  // Track mounted state to prevent setState on unmounted component
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // AbortController ref — prevents ghost Supabase queries on rapid navigation
  const _fetchAbortRef = useRef<AbortController | null>(null);

  // Track current target user ID to prevent cross-user data bleed
  const targetUserIdRef = useRef<string | undefined>(undefined);
  targetUserIdRef.current = state.targetUser?.id;

  const fetchUserData = useCallback(async () => {
    if (!username) return;

    // P0-A: Abort any in-flight fetch before starting a new one
    _fetchAbortRef.current?.abort();
    const controller = new AbortController();
    _fetchAbortRef.current = controller;
    const signal = controller.signal;

    try {
      // Route through ProfileDataService for Zod validation + observability
      // Uses restricted column set for non-self queries (no preferences)
      const profile = await ProfileDataService.fetchProfile(username, isSelf, signal);
      if (signal.aborted) return;
      if (!profile) { if (isMounted.current) dispatch({ type: 'SET_USER', payload: null }); return; }
      if (!isMounted.current) return; // F-19: Bail if unmounted during fetch
      // fetchProfile now returns ValidatedProfileUser — no cast needed.
      // The Zod validation happens inside the service boundary.
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

      // PERF: Counts and logs are independent (both only need userId).
      // Firing them in parallel saves one full round-trip (~200-400ms).
      if (isSelf) {
        // PERF: FilmStore persists logs to MMKV via zustandMMKVStorage.
        // If the store already has hydrated data, we can show the profile
        // instantly (skipping the blocking fetchLogs) and refresh silently
        // in the background for freshness.
        const storeHasLogs = useLogStore.getState().logs.length > 0;

        const [countsResult, analyticsSummary] = await Promise.all([
          ProfileDataService.fetchCounts(typedProfile, isSelf, signal),
          ProfileDataService.fetchAnalyticsSummary(typedProfile, signal),
          storeHasLogs ? Promise.resolve() : fetchLogs(),
        ]);
        if (signal.aborted || !isMounted.current) return;

        // Heal the displayed follower/following counts with the live RPC values —
        // the profile row's denormalized columns drift (three maintainers). Optimistic
        // follow still bumps these fields, so the count ticks instantly on follow.
        if (countsResult.followers != null) typedProfile.followers_count = countsResult.followers;
        if (countsResult.following != null) typedProfile.following_count = countsResult.following;
        // These are exact. Keep them, so the NEXT cold start seeds the real totals
        // instead of counting the 150-entry window the film store persists.
        writeCachedCounts(typedProfile.id, countsResult);
        // T2-01: Single dispatch replaces 3 separate setState calls
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
      // T2-01: Single dispatch replaces 5 separate setState calls
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
        if (signal.aborted) return; // P0-A: Silently ignore aborted fetches
        logger.warn('[ProfileFetch] fetchUserData error:', err);
        if (isMounted.current) {
          dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err : new Error(String(err)) });
        }
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
    try {
      // All non-self queries now route through ProfileDataService
      // for Zod validation, consistent error logging, and AbortSignal support.
      if (tab === 'watchlist' && (!state.tabDataLoaded.watchlist || forceRefresh)) {
        dispatch({ type: 'SET_TAB_LOADED', tabs: { watchlist: true } });
        if (isSelf) {
          await fetchWatchlist();
        } else {
          const result = await ProfileDataService.fetchOtherUserWatchlist(uid, undefined, undefined, _fetchAbortRef.current?.signal, state.activeFilters.watchlist);
          if (uid !== targetUserIdRef.current) return;
          dispatch({ type: 'SET_WATCHLIST_PAGE', items: result.items, cursor: result.nextCursor });
        }
      } else if (tab === 'physical' && (!state.tabDataLoaded.physical || forceRefresh)) {
        dispatch({ type: 'SET_TAB_LOADED', tabs: { physical: true } });
        if (isSelf) {
          await fetchPhysicalArchive();
        } else {
          const result = await ProfileDataService.fetchOtherUserVault(state.targetUser, undefined, undefined, _fetchAbortRef.current?.signal, state.activeFilters.physical);
          if (uid !== targetUserIdRef.current) return;
          dispatch({ type: 'SET_VAULT_PAGE', items: result.items, cursor: result.nextCursor });
        }
      } else if (tab === 'lists' && (!state.tabDataLoaded.lists || forceRefresh)) {
        dispatch({ type: 'SET_TAB_LOADED', tabs: { lists: true } });
        if (isSelf) {
          await fetchLists();
        } else {
          const result = await ProfileDataService.fetchOtherUserLists(uid, undefined, undefined, _fetchAbortRef.current?.signal, state.activeFilters.lists);
          if (uid !== targetUserIdRef.current) return;
          dispatch({ type: 'SET_LISTS_PAGE', items: result.items, cursor: result.nextCursor });
        }
      } else if ((tab === 'projector' || tab === 'passport') && (!state.tabDataLoaded.analytics || forceRefresh)) {
        dispatch({ type: 'SET_TAB_LOADED', tabs: { analytics: true } });
        const [parsedAnalytics, serverAnalyticsPayload, tastePayload] = await Promise.all([
          ProfileDataService.fetchAnalyticsLogs(state.targetUser, isSelf, _fetchAbortRef.current?.signal),
          ProfileDataService.fetchProfileAnalytics(state.targetUser, _fetchAbortRef.current?.signal),
          // Replaces dozens of TMDB round trips from the phone with one call.
          ProfileDataService.fetchTasteProfile(state.targetUser, _fetchAbortRef.current?.signal),
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
        // If analytics logs are already loaded (Auteur+), use them, save bandwidth
        if (!state.tabDataLoaded.analytics || forceRefresh) {
          const calData = await ProfileDataService.fetchCalendarData(state.targetUser, _fetchAbortRef.current?.signal);
          if (!isMounted.current || uid !== targetUserIdRef.current) return;
          dispatch({ type: 'SET_CALENDAR_DATA', payload: calData.map(d => ({ watchedDate: d.date, rating: d.rating, status: d.status })) });
        }
      }
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // Log in both dev and prod — routes to Sentry breadcrumbs in production
        logger.warn('[ProfileFetch] loadTabData error:', err);
        // Revert the loaded state so the user can try again
        if (isMounted.current) {
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
      const hasSearch = (activeTab === 'archive' && state.activeFilters.archive?.status && state.activeFilters.archive.status !== 'all') || 
                        (activeTab === 'ledger' && (state.activeFilters.ledger?.search || state.activeFilters.ledger?.rating !== 'all'));
      if (!hasSearch) return fetchLogs(true);
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
      const result = await ProfileDataService.fetchOtherUserLogs(uid, 50, targetCursor ?? undefined, _fetchAbortRef.current?.signal, activeLogFilters);
      if (uid !== targetUserIdRef.current) return;
      const tabLiteral = activeTab === 'archive' ? 'archive' : activeTab === 'ledger' ? 'ledger' : 'main';
      dispatch({ type: 'SET_LOGS_PAGE', tab: tabLiteral, items: result.items, cursor: result.nextCursor, append: true });
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.warn('[ProfileFetch] loadMoreLogs error:', err);
    } finally {
      if (isMounted.current) dispatch({ type: 'SET_LOADING_MORE', key: lockKey, value: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelf, fetchLogs, state.hasMoreArchiveLogs, state.hasMoreLedgerLogs, state.hasMoreMainLogs, state.isLoadingMore.logs_main, state.isLoadingMore.logs_archive, state.isLoadingMore.logs_ledger, state.targetUser, state.archiveLogsCursor, state.ledgerLogsCursor, state.mainLogsCursor, state.activeFilters.ledger, state.activeFilters.archive, activeTab]);

  const loadMoreWatchlist = useCallback(async () => {
    if (isSelf) {
      const hasSearch = state.activeFilters.watchlist && Object.keys(state.activeFilters.watchlist).length > 0 && (state.activeFilters.watchlist.search?.trim() !== '' || state.activeFilters.watchlist.sort !== 'default');
      if (!hasSearch) return fetchWatchlist(true);
    }
    if (!state.hasMoreWatchlist || state.isLoadingMore.watchlist || !state.targetUser) return;
    if (!canAccessData()) return;
    const uid = state.targetUser.id;
    dispatch({ type: 'SET_LOADING_MORE', key: 'watchlist', value: true });
    try {
      const result = await ProfileDataService.fetchOtherUserWatchlist(uid, 50, state.watchlistCursor ?? undefined, _fetchAbortRef.current?.signal, state.activeFilters.watchlist);
      if (uid !== targetUserIdRef.current) return;
      dispatch({ type: 'SET_WATCHLIST_PAGE', items: result.items, cursor: result.nextCursor, append: true });
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.warn('[ProfileFetch] loadMoreWatchlist error:', err);
    } finally {
      if (isMounted.current) dispatch({ type: 'SET_LOADING_MORE', key: 'watchlist', value: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelf, fetchWatchlist, state.hasMoreWatchlist, state.isLoadingMore.watchlist, state.targetUser, state.watchlistCursor]);

  const loadMoreVault = useCallback(async () => {
    // Pass loadMore=true for self-view — without this, tapping "load more"
    // on your own vault resets the list instead of appending.
    if (isSelf) {
      const hasSearch = state.activeFilters.physical && Object.keys(state.activeFilters.physical).length > 0 && state.activeFilters.physical.filter !== undefined;
      if (!hasSearch) { fetchPhysicalArchive(undefined, true); return; }
    }
    if (!state.hasMoreVault || state.isLoadingMore.vault || !state.targetUser) return;
    if (!canAccessData()) return;
    if (!canAccessTierTab('physical')) return;
    const uid = state.targetUser.id;
    dispatch({ type: 'SET_LOADING_MORE', key: 'vault', value: true });
    try {
      const result = await ProfileDataService.fetchOtherUserVault(state.targetUser, 50, state.vaultCursor ?? undefined, _fetchAbortRef.current?.signal, state.activeFilters.physical);
      if (uid !== targetUserIdRef.current) return;
      dispatch({ type: 'SET_VAULT_PAGE', items: result.items, cursor: result.nextCursor, append: true });
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.warn('[ProfileFetch] loadMoreVault error:', err);
    } finally {
      if (isMounted.current) dispatch({ type: 'SET_LOADING_MORE', key: 'vault', value: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelf, fetchPhysicalArchive, state.hasMoreVault, state.isLoadingMore.vault, state.targetUser, state.vaultCursor]);

  const loadMoreLists = useCallback(async () => {
    if (isSelf) return fetchLists(true);
    if (!state.hasMoreLists || state.isLoadingMore.lists || !state.targetUser) return;
    if (!canAccessData()) return;
    const uid = state.targetUser.id;
    dispatch({ type: 'SET_LOADING_MORE', key: 'lists', value: true });
    try {
      const result = await ProfileDataService.fetchOtherUserLists(uid, 50, state.listsCursor ?? undefined, _fetchAbortRef.current?.signal, state.activeFilters.lists);
      if (uid !== targetUserIdRef.current) return;
      dispatch({ type: 'SET_LISTS_PAGE', items: result.items, cursor: result.nextCursor, append: true });
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.warn('[ProfileFetch] loadMoreLists error:', err);
    } finally {
      if (isMounted.current) dispatch({ type: 'SET_LOADING_MORE', key: 'lists', value: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelf, fetchLists, state.hasMoreLists, state.isLoadingMore.lists, state.targetUser, state.listsCursor]);

  useEffect(() => {
    // Instantly wipe existing data when navigating to a new user profile
    // This mathematically guarantees zero state contamination between Profile A and Profile B.
    dispatch({ type: 'RESET_STATE' });

    // CACHE-FIRST (own dossier only): the signed-in user is already persisted in
    // the auth store (MMKV) and their logs in the film store — there is nothing to
    // wait for. Seed the screen from that cache and drop the spinner immediately,
    // then let fetchUserData() refresh silently in the background. This mirrors the
    // existing silent stale-while-revalidate on focus (useProfileController) and
    // removes the ONE remaining spinner path: the first open of your own profile.
    // Gated to isSelf, which is provably true only when the viewed username IS the
    // auth user (controller compares lowercased usernames), so we can never seed
    // one member's dossier with another's data.
    const cachedSelf = isSelf ? useAuthStore.getState().user : null;
    if (cachedSelf) {
      dispatch({ type: 'SET_USER', payload: cachedSelf as unknown as ProfileUser });
      // Seed the visible counts from the last EXACT totals this account saw, falling
      // back to zeros only on the very first open (nothing cached yet), where
      // reconcileCount's Math.max still shows the locally-loaded rows.
      //
      // Zeros used to be unconditional, and that was the whole cold-start flash: the
      // film store persists only its most recent 150 entries, so a member with 815
      // watchlist items was shown 150 until the counts landed. The background refresh
      // below still corrects these within the same beat — this only decides what the
      // FIRST frame says, and the first frame should not be wrong.
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
    // P0-A: Abort in-flight queries when effect re-fires or component unmounts
    return () => { _fetchAbortRef.current?.abort(); };
  }, [fetchUserData, isSelf]);

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
    fetchUserData, loadTabData,
    loadMoreLogs, loadMoreWatchlist, loadMoreVault, loadMoreLists,
    refreshTabWithFilters: async (tab: 'archive' | 'ledger' | 'watchlist' | 'physical' | 'lists', filters: any, forceRefresh = false) => {
      if (!state.targetUser) return;
      
      // Deep equality check mathematically guarantees zero redundant network calls 
      // from optimistic UI updates or background render cycles.
      if (!forceRefresh && JSON.stringify(state.activeFilters[tab]) === JSON.stringify(filters)) {
        return;
      }
      
      dispatch({ type: 'SET_ACTIVE_FILTERS', tab, filters });
      
      // Abort previous search and fetch fresh paginated data with filters
      _fetchAbortRef.current?.abort();
      const controller = new AbortController();
      _fetchAbortRef.current = controller;
      const uid = state.targetUser.id;
      
      if (tab === 'ledger' || tab === 'archive') {
        const lockKey = tab === 'archive' ? 'logs_archive' : 'logs_ledger';
        dispatch({ type: 'SET_LOADING_MORE', key: lockKey, value: true });
        try {
          const result = await ProfileDataService.fetchOtherUserLogs(uid, 50, undefined, controller.signal, filters);
          if (!isMounted.current || uid !== targetUserIdRef.current) return;
          dispatch({ type: 'SET_LOGS_PAGE', tab: tab as 'archive' | 'ledger', items: result.items, cursor: result.nextCursor, append: false });
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return;
          logger.warn('[ProfileFetch] refreshTabWithFilters logs error:', err);
        } finally {
          if (isMounted.current) dispatch({ type: 'SET_LOADING_MORE', key: lockKey, value: false });
        }
      } else if (tab === 'watchlist') {
        dispatch({ type: 'SET_LOADING_MORE', key: 'watchlist', value: true });
        try {
          const result = await ProfileDataService.fetchOtherUserWatchlist(uid, 50, undefined, controller.signal, filters);
          if (!isMounted.current || uid !== targetUserIdRef.current) return;
          dispatch({ type: 'SET_WATCHLIST_PAGE', items: result.items, cursor: result.nextCursor, append: false });
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return;
          logger.warn('[ProfileFetch] refreshTabWithFilters watchlist error:', err);
        } finally {
          if (isMounted.current) dispatch({ type: 'SET_LOADING_MORE', key: 'watchlist', value: false });
        }
      } else if (tab === 'physical') {
        dispatch({ type: 'SET_LOADING_MORE', key: 'vault', value: true });
        try {
          const result = await ProfileDataService.fetchOtherUserVault(state.targetUser, 50, undefined, controller.signal, filters);
          if (!isMounted.current || uid !== targetUserIdRef.current) return;
          dispatch({ type: 'SET_VAULT_PAGE', items: result.items, cursor: result.nextCursor, append: false });
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return;
          logger.warn('[ProfileFetch] refreshTabWithFilters vault error:', err);
        } finally {
          if (isMounted.current) dispatch({ type: 'SET_LOADING_MORE', key: 'vault', value: false });
        }
      } else if (tab === 'lists') {
        dispatch({ type: 'SET_LOADING_MORE', key: 'lists', value: true });
        try {
          const result = await ProfileDataService.fetchOtherUserLists(uid, 50, undefined, controller.signal, filters);
          if (!isMounted.current || uid !== targetUserIdRef.current) return;
          dispatch({ type: 'SET_LISTS_PAGE', items: result.items, cursor: result.nextCursor, append: false });
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return;
          logger.warn('[ProfileFetch] refreshTabWithFilters lists error:', err);
        } finally {
          if (isMounted.current) dispatch({ type: 'SET_LOADING_MORE', key: 'lists', value: false });
        }
      }
    }
  };
}

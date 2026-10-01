import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import TactileEngine from '@/src/utils/TactileEngine';
import { useAuthStore } from '@/src/stores/auth';
import { useProfileData, ProfileTab } from '@/src/hooks/useProfileData';
import type { LedgerRating, WatchlistDecade, ShelfSort } from '@/src/types';
import { safeOpenURL, normalizeSocialUrl } from '@/src/utils/linking';
import { useFilmStore } from '@/src/stores/films';
import { useSocialStore } from '@/src/stores/socialStore';
import { followUser, unfollowUser } from '@/src/stores/domain/socialSlice';
import { shouldRepairHandleRoute, wasMyHandle } from '@/src/utils/handleHistory';
import { nav } from '@/src/utils/typedRouter';
import reelToast from '@/src/utils/reelToast';
import { REFRESH_FAILED } from '@/src/components/EmptyStates';
import { logger } from '@/src/utils/logger';
import { isNarrowed, ROOMS, type Room } from '@/src/utils/roomFilters';

export const normalizeSocialHash = (links?: any[] | Record<string, string> | null): string => {
  if (!links) return '';
  if (Array.isArray(links)) {
    return links.filter(l => l && l.url).map(l => `${l.title || ''}:${l.url}`).sort().join(',');
  }
  if (typeof links === 'object') {
    return Object.entries(links).filter(([, v]) => !!v).map(([k, v]) => `${k}:${v}`).sort().join(',');
  }
  return '';
};

// The follower-count delta applied by an optimistic follow/unfollow toggle.
// Used both to apply the optimistic update and, on failure, to roll it back
// (by subtracting the same delta) — kept as one function so the two can
// never drift out of sync.
export function computeFollowCountDelta(isFollowing: boolean, isRequested: boolean, isPrivate: boolean): number {
  if (isFollowing) return -1;
  if (isRequested) return 0;
  return isPrivate ? 0 : 1;
}

/** The room a tab is, if it is one of the five with filters. */
const roomOf = (tab: ProfileTab | null): Room | null => (tab && (ROOMS as readonly string[]).includes(tab) ? tab as Room : null);

export function useProfileController(usernameOverride?: string) {
  const params = useLocalSearchParams<{ username: string | string[]; tab?: string }>();
  const rawUsername = usernameOverride ?? params.username;
  // Prevent deep-link array mutation crashing the Supabase client
  const username = Array.isArray(rawUsername) ? rawUsername[0] : rawUsername;
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;

  const user = useAuthStore(s => s.user);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  const myLogs = useFilmStore(s => s.logs);
  const myWatchlist = useFilmStore(s => s.watchlist);
  const myVault = useFilmStore(s => s.physicalArchive);
  const myLists = useFilmStore(s => s.lists);

  const [activeTab, setActiveTab] = useState<ProfileTab | null>(null);
  const [dnaCardOpen, setDnaCardOpen] = useState(false);
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const [refreshingLocal, setRefreshingLocal] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // Tab-specific filters
  const [archiveSieve, setArchiveSieve] = useState('all');
  const [archiveSearch, setArchiveSearch] = useState('');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerRatingFilter, setLedgerRatingFilter] = useState<LedgerRating>('all');
  const [watchlistSearch, setWatchlistSearch] = useState('');
  const [watchlistSort, setWatchlistSort] = useState<'default' | 'az' | 'za'>('default');
  const [watchlistDecade, setWatchlistDecade] = useState<WatchlistDecade>(null);
  const [physicalFilter, setPhysicalFilter] = useState<string | null>(null);
  const [physicalSort, setPhysicalSort] = useState<ShelfSort>('default');
  const [listsSort, setListsSort] = useState<ShelfSort>('default');
  const [listsSearch, setListsSearch] = useState('');
  const [physicalSearch, setPhysicalSearch] = useState('');

  useEffect(() => {
    if (tab) {
      const validTabs: ProfileTab[] = ['archive', 'ledger', 'watchlist', 'lists', 'physical', 'passport', 'projector', 'calendar'];
      const mapped = tab === 'diary' ? 'ledger' : tab;
      if (validTabs.includes(mapped as ProfileTab)) setActiveTab(mapped as ProfileTab);
    } else {
      setActiveTab(null);
    }
  }, [tab]);

  // Following is read by handle from the social store, so it is known before the
  // member's row is (useProfileData needs it to open a sealed profile).
  const isSelf = Boolean(
    user?.username &&
    username &&
    typeof user.username === 'string' &&
    typeof username === 'string' &&
    user.username.toLowerCase() === username.toLowerCase()
  );
  const isFollowing = useSocialStore(s => s.isFollowing((username ?? '').toLowerCase()));
  const isRequested = useSocialStore(s => s.isRequested((username ?? '').toLowerCase()));

  const data = useProfileData({
    username,
    isSelf,
    isFollowing,
    activeTab,
  });

  // ── Your own rename: the route follows it, never stranding on the old handle ──
  // Renaming flips isSelf to false while this screen is still mounted underneath Edit
  // Profile, which would re-read a handle that no longer exists and tell the member
  // "Member Not Found" about themselves. utils/handleHistory.ts says why neither
  // isSelf nor the loaded targetUser can tell this apart.
  //
  // Both halves of the predicate are required:
  //   • the handle was ONCE ours — otherwise we have no business rewriting the route
  //   • it currently resolves to NOBODY — a freed handle can be claimed by someone
  //     else, and a visit to their profile must never be turned onto ours
  //
  // navigation.setParams, NOT router.setParams: the auth store moves ~750ms before
  // Edit Profile pops, so at the moment of repair THIS screen is not the focused one.
  // expo-router's imperative setParams targets whatever is focused (verified: it
  // dispatches SET_PARAMS with no `source`, and BaseRouter then falls back to
  // state.index) — it would rewrite Edit Profile's params instead. The per-route
  // navigation object dispatches with `source: route.key`, so it repairs this route
  // regardless of focus, in place, without pushing a history entry.
  const navigation = useNavigation();
  const wasOurHandle = useMemo(
    () => wasMyHandle(user?.id, username),
    [user?.id, username]
  );
  const repairRoute = shouldRepairHandleRoute({
    usernameOverride,
    routeUsername: username,
    liveUsername: user?.username,
    wasOurs: wasOurHandle,
    loading: data.loading,
    hasTargetUser: !!data.targetUser,
  });
  useEffect(() => {
    if (!repairRoute || !user?.username) return;
    navigation.setParams({ username: user.username } as never);
  }, [repairRoute, user?.username, navigation]);

  // Rewriting the route is not enough on its own: the repair is decided in the render
  // where the failed read has already produced the not-found state, and the read under
  // the corrected handle starts a commit later — so "Member Not Found" would paint for
  // a frame or two (plainly, when a stale link is opened cold). This holds it back.
  //
  // For four seconds at most: if the corrected handle fails too, the honest not-found
  // screen shows, with its GO BACK, rather than a spinner that never ends.
  const [repairingHandle, setRepairingHandle] = useState(false);
  useEffect(() => {
    if (!repairRoute) return;
    setRepairingHandle(true);
    const t = setTimeout(() => setRepairingHandle(false), 4000);
    return () => clearTimeout(t);
  }, [repairRoute]);
  useEffect(() => {
    if (data.targetUser) setRepairingHandle(false);
  }, [data.targetUser]);

  // Specific properties, never JSON.stringify of the whole row: a key order that
  // changed would read as a change and loop.
  const targetUserHash = [
    data.targetUser?.display_name,
    data.targetUser?.bio,
    data.targetUser?.avatar_url,
    data.targetUser?.is_social_private,
    data.targetUser?.persona,
    data.targetUser?.tier,
    data.targetUser?.role,
    normalizeSocialHash(data.targetUser?.social_links),
    data.targetUser?.preferences?.accent_color,
    data.targetUser?.preferences?.default_tab,
    data.targetUser?.favorite_films?.join(','),
    JSON.stringify(data.targetUser?.preferences?.favorites || []),
    JSON.stringify(data.targetUser?.preferences?.programmes || [])
  ].join('|');

  useEffect(() => {
    if (isSelf && user && data.targetUser) {
      const userSocialStr = normalizeSocialHash(user.social_links);
      const targetSocialStr = normalizeSocialHash(data.targetUser.social_links);

      const userPrefsStr = `${user.preferences?.accent_color}|${user.preferences?.default_tab}|${JSON.stringify(user.preferences?.favorites || [])}|${JSON.stringify(user.preferences?.programmes || [])}`;
      const targetPrefsStr = `${data.targetUser.preferences?.accent_color}|${data.targetUser.preferences?.default_tab}|${JSON.stringify(data.targetUser.preferences?.favorites || [])}|${JSON.stringify(data.targetUser.preferences?.programmes || [])}`;

      if (
        user.username !== data.targetUser.username ||
        user.display_name !== data.targetUser.display_name ||
        user.bio !== data.targetUser.bio ||
        user.avatar_url !== data.targetUser.avatar_url ||
        user.is_social_private !== data.targetUser.is_social_private ||
        user.persona !== data.targetUser.persona ||
        user.tier !== data.targetUser.tier ||
        user.role !== data.targetUser.role ||
        userSocialStr !== targetSocialStr ||
        userPrefsStr !== targetPrefsStr
      ) {
        data.setTargetUser(prev => prev ? {
          ...prev,
          username: user.username,
          display_name: user.display_name,
          bio: user.bio,
          avatar_url: user.avatar_url,
          is_social_private: user.is_social_private,
          persona: user.persona,
          tier: user.tier,
          role: user.role,
          social_links: user.social_links || [],
          preferences: user.preferences
        } as any : prev);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelf, user, data.targetUser?.username, targetUserHash]);

  // ── Self-profile freshness ──────────────────────────────────────────
  // Re-read our own dossier from the DB whenever this screen regains focus
  // (e.g. returning from Edit Profile), so saved edits are ALWAYS reflected —
  // a source-of-truth read, not a fragile in-memory hand-off. It's silent
  // stale-while-revalidate: fetchUserData() doesn't toggle the loading
  // spinner, so there is no flash. Gated to isSelf to avoid re-fetching other
  // members' profiles on every focus. The very first focus is skipped because
  // the mount effect in useProfileData already performs the initial fetch.
  const isFocused = useIsFocused();
  const didInitialFocusRef = useRef(false);
  const fetchUserDataRef = useRef(data.fetchUserData);
  fetchUserDataRef.current = data.fetchUserData;
  useEffect(() => {
    if (!isFocused) return;
    if (!didInitialFocusRef.current) { didInitialFocusRef.current = true; return; }
    if (isSelf) fetchUserDataRef.current();
  }, [isFocused, isSelf]);

  // The member whose filters these are: a new one wipes them all.
  const prevUserRef = useRef<string | null>(null);

  // The latest loadTabData, read without being a dependency (its identity changes
  // with every state change, and the effect would loop).
  const loadTabDataRef = useRef(data.loadTabData);
  loadTabDataRef.current = data.loadTabData;

  useEffect(() => {
    // Only fire when activeTab is selected and targetUser is fully populated
    if (activeTab && data.targetUser?.id) {
      loadTabDataRef.current(activeTab);

      // Force analytics fetch for Ledger so halfLifeMap has full historical data
      if (activeTab === 'ledger' && !isSelf) {
        loadTabDataRef.current('projector');
      }

      // Every filter is wiped when the MEMBER changes (and kept when only the
      // room does): one left behind would narrow the next member's room.
      if (data.targetUser.id !== prevUserRef.current) {
        setArchiveSieve('all');
        setArchiveSearch('');
        setLedgerSearch('');
        setLedgerRatingFilter('all');
        setWatchlistSearch('');
        setWatchlistSort('default');
        setWatchlistDecade(null);
        setPhysicalFilter(null);
        setPhysicalSort('default');
        setPhysicalSearch('');
        setListsSort('default');
        setListsSearch('');
        prevUserRef.current = data.targetUser.id;
      }
    }
  }, [activeTab, data.targetUser?.id, isSelf]);

  // Each room's filters, as the rooms send them.
  const roomFilters = useMemo(() => ({
    archive: { status: archiveSieve, search: archiveSearch, titleOnly: true },
    ledger: { search: ledgerSearch, rating: ledgerRatingFilter, hasRatingOrReview: true },
    watchlist: { search: watchlistSearch, sort: watchlistSort, decade: watchlistDecade },
    physical: { filter: physicalFilter, sort: physicalSort, search: physicalSearch },
    lists: { sort: listsSort, search: listsSearch },
  }), [archiveSieve, archiveSearch, ledgerSearch, ledgerRatingFilter, watchlistSearch, watchlistSort, watchlistDecade, physicalFilter, physicalSort, physicalSearch, listsSort, listsSearch]);

  const onRefresh = useCallback(async () => {
    setRefreshingLocal(true);
    TactileEngine.navigate();
    // `false`: the member could not be read. The page stays as it was, and says so.
    const read = await data.fetchUserData();

    const room = roomOf(activeTab);
    if (room && isNarrowed(room, roomFilters[room])) {
      // A narrowed room refreshes its filtered read, never the plain one, which
      // would fill a queue filtered to the 1970s with the whole queue while the
      // 1970s chip stayed lit.
      await data.refreshTabWithFilters(room, roomFilters[room], true);
    } else if (activeTab && activeTab !== 'archive' && activeTab !== 'ledger') {
      // (The archive and ledger at rest are the member's logs, read above.)
      data.setTabDataLoaded(prev => ({ ...prev, [activeTab]: false }));
      await data.loadTabData(activeTab, true);
    }

    setRefreshingLocal(false);
    if (read === false) reelToast.error(REFRESH_FAILED);
  }, [data, activeTab, roomFilters]);

  const toggleFollow = useCallback(async () => {
    if (!isAuthenticated) { nav.push('/login'); return; }
    if (followLoading) return;
    setFollowLoading(true);

    const prevUser = data.targetUser;
    const handle = (username ?? '').toLowerCase();
    const leaving = isFollowing || isRequested;

    data.setTargetUser((prev) => {
      if (!prev) return prev;
      const current = prev.followers_count || 0;
      const delta = computeFollowCountDelta(isFollowing, isRequested, !!prev.is_social_private);
      return { ...prev, followers_count: Math.max(0, current + delta) };
    });

    let success = false;
    try {
      success = leaving ? await unfollowUser(handle) : await followUser(handle);
      // On false the store has already said why (or held a throttled or doubled tap).
    } catch (err) {
      // The store says why on every failure it catches; this one it did not.
      logger.warn('[Profile] follow failed:', err);
      reelToast.error(`Could not ${leaving ? 'unfollow' : 'follow'} @${handle}. Please try again.`);
    }
    // Rolled back by the same delta, and only on the member it was applied to
    // (the screen may have moved to another member meanwhile).
    if (!success && prevUser) {
      data.setTargetUser(curr => {
        if (!curr || curr.id !== prevUser.id) return curr;
        const delta = computeFollowCountDelta(isFollowing, isRequested, !!prevUser.is_social_private);
        return { ...curr, followers_count: Math.max(0, (curr.followers_count || 0) - delta) };
      });
    }
    setFollowLoading(false);
  }, [isAuthenticated, isFollowing, isRequested, username, followLoading, data]);

  // A room's filters, sent to the server's paged read whenever they or the room
  // change (useProfileData asks nothing when they stay at rest).
  const refreshTabRef = useRef(data.refreshTabWithFilters);
  refreshTabRef.current = data.refreshTabWithFilters;

  useEffect(() => {
    const room = roomOf(activeTab);
    if (data.targetUser && room) refreshTabRef.current(room, roomFilters[room]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomFilters, activeTab, data.targetUser?.id]);

  return {
    username,
    isSelf,
    // Holds the not-found screen while the route follows your own rename.
    repairingHandle,
    isFollowing,
    isRequested,
    myLogs,
    myWatchlist,
    myVault,
    myLists,

    activeTab,
    setActiveTab,
    dnaCardOpen,
    setDnaCardOpen,
    rouletteOpen,
    setRouletteOpen,
    refreshing: refreshingLocal,
    onRefresh,
    followLoading,
    toggleFollow,

    archiveSieve, setArchiveSieve,
    ledgerSearch, setLedgerSearch,
    ledgerRatingFilter, setLedgerRatingFilter,
    watchlistDecade, setWatchlistDecade,
    physicalSort, setPhysicalSort,
    physicalSearch, setPhysicalSearch,
    listsSort, setListsSort,
    listsSearch, setListsSearch,
    archiveSearch, setArchiveSearch,
    watchlistSearch, setWatchlistSearch,
    watchlistSort, setWatchlistSort,
    physicalFilter, setPhysicalFilter,

    nav: {
      toEditProfile: useCallback(() => nav.push('/edit-profile'), []),
      toSettings: useCallback(() => nav.push('/settings'), []),
      toMembership: useCallback(() => nav.push('/membership'), []),
      toFollowers: useCallback(() => {
        if (!data.targetUser?.id) return;
        nav.push('/social-modal', { userId: data.targetUser.id, type: 'followers' });
      }, [data.targetUser?.id]),
      toFollowing: useCallback(() => {
        if (!data.targetUser?.id) return;
        nav.push('/social-modal', { userId: data.targetUser.id, type: 'following' });
      }, [data.targetUser?.id]),
      toCalendar: useCallback(() => { if (username) nav.push(`/user/${encodeURIComponent(username)}`, { tab: 'calendar' }); }, [username]),
      openSocialLink: useCallback((url: string) => {
        // Same rule the write-time validator uses (utils/linking.ts) — a link accepted
        // on save is a link that opens, and neither side can drift from the other.
        const target = normalizeSocialUrl(url);
        return target ? safeOpenURL(target) : Promise.resolve(false);
      }, []),
      handleBack: useCallback(() => {
        TactileEngine.selection();
        nav.back();
      }, []),
    },

    data,
  };
}

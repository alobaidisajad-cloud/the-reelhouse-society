import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
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

export function useProfileController(usernameOverride?: string) {
  const params = useLocalSearchParams<{ username: string | string[]; tab?: string }>();
  const rawUsername = usernameOverride ?? params.username;
  // Prevent deep-link array mutation crashing the Supabase client
  const username = Array.isArray(rawUsername) ? rawUsername[0] : rawUsername;
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const router = useRouter();
  
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

  // We need to pass isFollowing to useProfileData, but we need targetUser first.
  // We can use a ref to the latest targetUser from data, or just use useProfileData first
  // and compute it. But hooks must be called unconditionally.
  // However, we can use useProfileData without isFollowing initially, or we can use the 
  // authStore's following list and check if it contains the fetched user's ID inside useProfileData.
  // The cleanest way is to extract targetUser from useProfileData, but since useProfileData
  // is a custom hook, we can't access its return value before calling it.
  
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

  // ── #87: follow our own rename instead of stranding on the old handle ──────────
  // Renaming flips isSelf to false while this screen is still mounted underneath Edit
  // Profile, which re-fires the fetch under a handle that no longer exists and lands
  // the member on "Member Not Found" about themselves. See utils/handleHistory.ts for
  // why neither isSelf nor the loaded targetUser can be used to detect this.
  //
  // Both halves of the predicate are required:
  //   • the handle was ONCE ours — otherwise we have no business rewriting the route
  //   • it currently resolves to NOBODY — a freed handle can be claimed by someone
  //     else, and redirecting a visit to their profile onto ours would be far worse
  //     than the bug being fixed
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

  // Rewriting the route is not quite enough on its own. The repair is decided in the
  // render where the failed fetch has already produced the not-found state, and the
  // refetch under the corrected handle cannot start until the next commit — so without
  // this the screen still paints "Member Not Found" for a frame or two on the way past.
  //
  // Invisible on the path this finding describes (the screen is behind Edit Profile at
  // that moment), but plainly visible when a stale link is opened cold, and a member
  // being told their account is gone — even briefly — is the entire bug.
  //
  // The timeout is the point of this being state rather than a naked flag: if the
  // corrected handle somehow fails too, this falls back to the honest not-found screen
  // WITH its GO BACK button after four seconds. A hanging spinner would be a worse
  // failure than the one being fixed, so it is not reachable from here.
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

  // Replaced JSON.stringify with specific property mapping to prevent infinite loops from arbitrary key ordering
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

  // Prevent ghost filter resets on background re-renders
  const prevTabRef = useRef<ProfileTab | null>(null);
  const prevUserRef = useRef<string | null>(null);

  // Decouple loadTabData to prevent infinite React render loops
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

      // Dual-Reference wipe mathematically guarantees zero state contamination across profiles.
      // We only wipe filters when the USER changes, preserving filter state when just switching tabs.
      if (data.targetUser.id !== prevUserRef.current) {
        setArchiveSieve('all');
        setLedgerSearch('');
        setLedgerRatingFilter('all');
        setWatchlistSearch('');
        setWatchlistSort('default');
        setPhysicalFilter(null);
        prevUserRef.current = data.targetUser.id;
      }
      
      if (activeTab !== prevTabRef.current) {
        prevTabRef.current = activeTab;
      }
    }
   
  }, [activeTab, data.targetUser?.id, isSelf]); // Deliberately excludes loadTabData

  const onRefresh = useCallback(async () => {
    setRefreshingLocal(true);
    TactileEngine.navigate();
    await data.fetchUserData();
    
    if (activeTab) {
      if (activeTab === 'archive') {
        if (archiveSieve !== 'all' || archiveSearch) {
          await data.refreshTabWithFilters('archive', { status: archiveSieve, search: archiveSearch, titleOnly: true }, true);
        }
      } else if (activeTab === 'ledger') {
        if (ledgerSearch || ledgerRatingFilter !== 'all') {
          await data.refreshTabWithFilters('ledger', { search: ledgerSearch, rating: ledgerRatingFilter, hasRatingOrReview: true }, true);
        }
      // The Watchlist and the Vault fell through to the plain reload below,
      // which fetches the tab UNFILTERED — so pulling to refresh a queue
      // filtered to the 1970s silently refilled it with the whole queue while
      // the 1970s chip stayed lit. Two of the four tabs that carry filters were
      // handled and two were not; the sort was already live before this pass,
      // so the bug is older than the decade filter that surfaced it.
      } else if (activeTab === 'watchlist') {
        if (watchlistSearch || watchlistSort !== 'default' || watchlistDecade !== null) {
          await data.refreshTabWithFilters('watchlist', { search: watchlistSearch, sort: watchlistSort, decade: watchlistDecade }, true);
        } else {
          data.setTabDataLoaded(prev => ({ ...prev, [activeTab]: false }));
          await data.loadTabData(activeTab, true);
        }
      } else if (activeTab === 'physical') {
        if (physicalFilter || physicalSort !== 'default' || physicalSearch) {
          await data.refreshTabWithFilters('physical', { filter: physicalFilter, sort: physicalSort, search: physicalSearch }, true);
        } else {
          data.setTabDataLoaded(prev => ({ ...prev, [activeTab]: false }));
          await data.loadTabData(activeTab, true);
        }
      } else if (activeTab === 'lists') {
        if (listsSort !== 'default' || listsSearch) {
          await data.refreshTabWithFilters('lists', { sort: listsSort, search: listsSearch }, true);
        } else {
          data.setTabDataLoaded(prev => ({ ...prev, [activeTab]: false }));
          await data.loadTabData(activeTab, true);
        }
      } else {
        data.setTabDataLoaded(prev => ({ ...prev, [activeTab]: false }));
        await data.loadTabData(activeTab, true);
      }
    }

    setRefreshingLocal(false);
  }, [data, activeTab, archiveSieve, archiveSearch, ledgerSearch, ledgerRatingFilter, watchlistSearch, watchlistSort, watchlistDecade, physicalFilter, physicalSort, physicalSearch, listsSort, listsSearch]);

  const toggleFollow = useCallback(async () => {
    if (!isAuthenticated) return (router.push as any)('/login' as any);
    if (followLoading) return;
    setFollowLoading(true);

    const prevUser = data.targetUser;

    data.setTargetUser((prev) => {
      if (!prev) return prev;
      const current = prev.followers_count || 0;
      const delta = computeFollowCountDelta(isFollowing, isRequested, !!prev.is_social_private);
      return { ...prev, followers_count: Math.max(0, current + delta) };
    });

    try {
      let success = false;
      if (isFollowing || isRequested) {
        success = await unfollowUser((username ?? '').toLowerCase());
      } else {
        success = await followUser((username ?? '').toLowerCase());
      }

      if (!success) {
        // Only rollback if the user being viewed is exactly the one we attempted to follow.
        // This prevents UI state bleed when swiping profiles during slow network requests.
        if (prevUser) {
          data.setTargetUser(curr => {
            if (!curr || curr.id !== prevUser.id) return curr;
            // Calculate exact applied optimistic delta to prevent drift on failure
            const optimisticDelta = computeFollowCountDelta(isFollowing, isRequested, !!prevUser.is_social_private);
            return { ...curr, followers_count: Math.max(0, (curr.followers_count || 0) - optimisticDelta) };
          });
        }
        console.warn('Failed to toggle follow status, rolling back UI');
      }
    } catch (err) {
      if (prevUser) {
        data.setTargetUser(curr => {
          if (!curr || curr.id !== prevUser.id) return curr;
          // Calculate exact applied optimistic delta to prevent drift on failure
          const optimisticDelta = computeFollowCountDelta(isFollowing, isRequested, !!prevUser.is_social_private);
          return { ...curr, followers_count: Math.max(0, (curr.followers_count || 0) - optimisticDelta) };
        });
      }
      console.warn('Failed to toggle follow status with exception, rolling back UI', err);
    } finally {
      setFollowLoading(false);
    }
  }, [isAuthenticated, isFollowing, isRequested, username, followLoading, router, data]);

  // Hybrid Cache Architecture connects UI filters to server pagination
  const refreshTabRef = useRef(data.refreshTabWithFilters);
  refreshTabRef.current = data.refreshTabWithFilters;
  
  useEffect(() => {
    if (data.targetUser) {
      if (activeTab === 'archive') {
        refreshTabRef.current('archive', { status: archiveSieve, search: archiveSearch, titleOnly: true });
      } else if (activeTab === 'ledger') {
        refreshTabRef.current('ledger', { search: ledgerSearch, rating: ledgerRatingFilter, hasRatingOrReview: true });
      } else if (activeTab === 'watchlist') {
        refreshTabRef.current('watchlist', { search: watchlistSearch, sort: watchlistSort, decade: watchlistDecade });
      } else if (activeTab === 'physical') {
        refreshTabRef.current('physical', { filter: physicalFilter, sort: physicalSort, search: physicalSearch });
      } else if (activeTab === 'lists') {
        refreshTabRef.current('lists', { sort: listsSort, search: listsSearch });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveSieve, archiveSearch, ledgerSearch, ledgerRatingFilter, watchlistSearch, watchlistSort, watchlistDecade, physicalFilter, physicalSort, physicalSearch, listsSort, listsSearch, activeTab, data.targetUser?.id]);

  return {
    username,
    isSelf,
    // #87: hold the not-found screen while the route is being corrected.
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
      toEditProfile: useCallback(() => (router.push as any)('/edit-profile' as never), [router]),
      toSettings: useCallback(() => (router.push as any)('/settings' as never), [router]),
      toMembership: useCallback(() => (router.push as any)('/membership' as never), [router]),
      toFollowers: useCallback(() => { 
        if (!data.targetUser?.id) return;
        (router.push as any)({ pathname: '/social-modal', params: { userId: data.targetUser.id, type: 'followers' } } as never);
      }, [router, data.targetUser?.id]),
      toFollowing: useCallback(() => { 
        if (!data.targetUser?.id) return;
        (router.push as any)({ pathname: '/social-modal', params: { userId: data.targetUser.id, type: 'following' } } as never);
      }, [router, data.targetUser?.id]),
      toCalendar: useCallback(() => (router.push as any)({ pathname: `/user/${username}`, params: { tab: 'calendar' } } as never), [router, username]),
      openSocialLink: useCallback((url: string) => {
        // Same rule the write-time validator uses (utils/linking.ts) — a link accepted
        // on save is a link that opens, and neither side can drift from the other.
        const target = normalizeSocialUrl(url);
        return target ? safeOpenURL(target) : Promise.resolve(false);
      }, []),
      handleBack: useCallback(() => {
        TactileEngine.selection();
        if (router.canGoBack()) {
          router.back();
        } else {
          (router.replace as any)('/(tabs)' as never);
        }
      }, [router]),
    },

    data,
  };
}

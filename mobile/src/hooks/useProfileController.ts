import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import TactileEngine from '@/src/utils/TactileEngine';
import { useAuthStore } from '@/src/stores/auth';
import { useProfileData, ProfileTab } from '@/src/hooks/useProfileData';
import { safeOpenURL } from '@/src/utils/linking';
import { useFilmStore } from '@/src/stores/films';
import { useSocialStore } from '@/src/stores/socialStore';
import { followUser, unfollowUser } from '@/src/stores/domain/socialSlice';

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
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerRatingFilter, setLedgerRatingFilter] = useState<number | 'all'>('all');
  const [watchlistSearch, setWatchlistSearch] = useState('');
  const [watchlistSort, setWatchlistSort] = useState<'default' | 'az' | 'za'>('default');
  const [physicalFilter, setPhysicalFilter] = useState<string | null>(null);

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
    data.targetUser?.preferences?.hide_stats,
    data.targetUser?.favorite_films?.join(','),
    JSON.stringify(data.targetUser?.preferences?.favorites || []),
    JSON.stringify(data.targetUser?.preferences?.programmes || [])
  ].join('|');

  useEffect(() => {
    if (isSelf && user && data.targetUser) {
      const userSocialStr = normalizeSocialHash(user.social_links);
      const targetSocialStr = normalizeSocialHash(data.targetUser.social_links);
      
      const userPrefsStr = `${user.preferences?.accent_color}|${user.preferences?.default_tab}|${user.preferences?.hide_stats}|${JSON.stringify(user.preferences?.favorites || [])}|${JSON.stringify(user.preferences?.programmes || [])}`;
      const targetPrefsStr = `${data.targetUser.preferences?.accent_color}|${data.targetUser.preferences?.default_tab}|${data.targetUser.preferences?.hide_stats}|${JSON.stringify(data.targetUser.preferences?.favorites || [])}|${JSON.stringify(data.targetUser.preferences?.programmes || [])}`;

      if (
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
        if (archiveSieve !== 'all') {
          await data.refreshTabWithFilters('archive', { status: archiveSieve }, true);
        }
      } else if (activeTab === 'ledger') {
        if (ledgerSearch || ledgerRatingFilter !== 'all') {
          await data.refreshTabWithFilters('ledger', { search: ledgerSearch, rating: ledgerRatingFilter, hasRatingOrReview: true }, true);
        }
      } else {
        data.setTabDataLoaded(prev => ({ ...prev, [activeTab]: false }));
        await data.loadTabData(activeTab, true);
      }
    }
    
    setRefreshingLocal(false);
  }, [data, activeTab, archiveSieve, ledgerSearch, ledgerRatingFilter]);

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
        refreshTabRef.current('archive', { status: archiveSieve });
      } else if (activeTab === 'ledger') {
        refreshTabRef.current('ledger', { search: ledgerSearch, rating: ledgerRatingFilter, hasRatingOrReview: true });
      } else if (activeTab === 'watchlist') {
        refreshTabRef.current('watchlist', { search: watchlistSearch, sort: watchlistSort });
      } else if (activeTab === 'physical') {
        refreshTabRef.current('physical', { filter: physicalFilter });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveSieve, ledgerSearch, ledgerRatingFilter, watchlistSearch, watchlistSort, physicalFilter, activeTab, data.targetUser?.id]);

  return {
    username,
    isSelf,
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
      openSocialLink: useCallback((url: string) => safeOpenURL(url.startsWith('http') ? url : `https://${url}`), []),
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

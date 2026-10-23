/**
 * A member's file as useProfileController hands it to the screen, loaded: the
 * shape zz-memberfile.gen.test.tsx draws, cut to what the page-top tests need.
 */
const noop = () => {};

const USER = {
  id: 'me', username: 'kane', display_name: 'Kane', persona: 'The Archivist',
  bio: 'Nitrate, mostly.', role: 'archivist', tier: 'archivist', is_founding: false,
  is_social_private: false, followers_count: 3, following_count: 2,
  created_at: '2024-11-02T00:00:00Z', member_no: 42, avatar_url: null,
  social_links: [], preferences: { favorites: [] },
};

export function memberFile(over: { activeTab?: string | null; dnaCardOpen?: boolean; isSelf?: boolean } = {}) {
  return {
    nav: {
      toEditProfile: noop, toSettings: noop, toMembership: noop, toFollowers: noop,
      toFollowing: noop, toCalendar: noop, openSocialLink: noop, handleBack: noop,
    },
    data: {
      targetUser: USER, loading: false,
      counts: { logs: 0, ledger: 0, watchlist: 0, vault: 0, lists: 0 },
      mainLogs: [], archiveLogs: [], ledgerLogs: [], watchlist: [], vault: [], lists: [],
      analyticsLogs: [], calendarData: [], serverStreak: 0,
      serverAnalytics: null, highestRated: [], analyticsShape: null, taste: null,
      setTargetUser: noop, hasMoreLogs: false, hasMoreWatchlist: false, hasMoreVault: false,
      hasMoreLists: false, isLoadingMore: false, loadMoreLogs: noop, loadTabData: noop,
      tabFailed: {}, tabAnswered: { archive: true, ledger: true, watchlist: true, lists: true, physical: true }, moreFailed: {}, retryRoom: noop, fetchUserData: noop, error: null,
    },
    username: 'kane', isSelf: over.isSelf ?? true, repairingHandle: false,
    isFollowing: false, isRequested: false, activeTab: over.activeTab ?? null,
    myLogs: [], myWatchlist: [], myVault: [], myLists: [], setActiveTab: noop,
    archiveSieve: 'all', ledgerSearch: '', ledgerRatingFilter: 'all',
    watchlistSearch: '', watchlistSort: 'default', physicalFilter: null,
    archiveSearch: '', listsSearch: '', physicalSearch: '', watchlistDecade: null,
    setArchiveSieve: noop, setLedgerSearch: noop, setLedgerRatingFilter: noop,
    setWatchlistSearch: noop, setWatchlistSort: noop, setPhysicalFilter: noop,
    setArchiveSearch: noop, setListsSearch: noop, setPhysicalSearch: noop,
    setWatchlistDecade: noop, setListsSort: noop, setPhysicalSort: noop,
    listsSort: 'default', physicalSort: 'default',
    refreshing: false, onRefresh: noop,
    dnaCardOpen: over.dnaCardOpen ?? false, setDnaCardOpen: noop,
    rouletteOpen: false, setRouletteOpen: noop,
    followLoading: false, toggleFollow: noop,
  };
}

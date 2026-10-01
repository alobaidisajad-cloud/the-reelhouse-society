/**
 * aRoomReadsOneAnswer.test.tsx — a profile room's rows, paging and failure,
 * decided by one answer to "is this room narrowed?".
 *
 * Each place asked it its own way, and four got it wrong: your own Archive's
 * "load more" read the shelf's paging flag (and ignored a search), your own
 * Stacks read the visitor's flag (true forever), your own shelf ignored its
 * sort and search. And your own rooms never said a failed read: a cold start
 * with no signal drew "empty" over a record the member has. The rooms are
 * stood in for here, so what each is HANDED can be read.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import UserProfileScreen from '@/app/user/[username]';

const mockProps: Record<string, Record<string, unknown>> = {};
const room = (name: string) => () => {
  const R = require('react');
  return (p: Record<string, unknown>) => { mockProps[name] = p; return R.createElement('Room', { name }); };
};
jest.mock('@/src/components/profile/ProfileArchiveTab', () => ({ __esModule: true, default: room('archive')() }));
jest.mock('@/src/components/profile/ProfileLedgerTab', () => ({ __esModule: true, default: room('ledger')() }));
jest.mock('@/src/components/profile/ProfileWatchlistTab', () => ({ __esModule: true, default: room('watchlist')() }));
jest.mock('@/src/components/profile/ProfileListsTab', () => ({ __esModule: true, default: room('lists')() }));
jest.mock('@/src/components/profile/ProfilePhysicalTab', () => ({ __esModule: true, default: room('physical')() }));

let mockStore: Record<string, unknown> = {};
jest.mock('@/src/stores/films', () => ({ useFilmStore: () => mockStore }));
let mockCtl: Record<string, unknown>;
jest.mock('@/src/hooks/useProfileController', () => ({ useProfileController: () => mockCtl }));
jest.mock('@/src/stores/blockStore', () => {
  const s = { isBlocked: () => false, isMuted: () => false, blockUser: jest.fn(), muteUser: jest.fn() };
  const useBlockStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useBlockStore as unknown as { getState: () => unknown }).getState = () => s;
  return { useBlockStore };
});
jest.mock('@/src/stores/auth', () => {
  const s = { user: { id: 'u1', preferences: {} }, updateUser: jest.fn() };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => s;
  return { useAuthStore };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ username: 'tomasreyes' }),
  useFocusEffect: () => {},
}));
jest.mock('@/src/lib/supabase', () => ({ supabase: { rpc: jest.fn(() => Promise.resolve({ error: null })), from: jest.fn() } }));

const USER = {
  id: 'u1', username: 'tomasreyes', display_name: 'Tomas', persona: null, bio: '', role: 'archivist', tier: 'archivist',
  is_founding: false, is_social_private: false, followers_count: 0, following_count: 0,
  created_at: '2026-03-14T00:00:00Z', member_no: 147, avatar_url: null, social_links: [], preferences: { favorites: [] },
};
const FILM = { id: 603, filmId: 603, title: 'The Matrix', poster: null, poster_path: null, year: 1999, rating: 4, status: 'watched', createdAt: '2026-09-01T00:00:00Z' };

const loadMoreLogs = jest.fn();
const loadMoreLists = jest.fn();
const loadMoreVault = jest.fn();
const loadMoreWatchlist = jest.fn();

async function open(activeTab: string, over: Record<string, unknown> = {}, data: Record<string, unknown> = {}) {
  for (const k of Object.keys(mockProps)) delete mockProps[k];
  mockCtl = {
    nav: { toEditProfile: jest.fn(), toSettings: jest.fn(), toMembership: jest.fn(), toFollowers: jest.fn(), toFollowing: jest.fn(), toCalendar: jest.fn(), openSocialLink: jest.fn(), handleBack: jest.fn() },
    data: {
      targetUser: USER, loading: false, counts: { logs: 1, ledger: 1, watchlist: 1, vault: 1, lists: 1 },
      mainLogs: [], archiveLogs: [], ledgerLogs: [], watchlist: [], vault: [], lists: [],
      analyticsLogs: [], calendarData: [], serverAnalytics: null, serverStreak: null, setTargetUser: jest.fn(),
      hasMoreMainLogs: true, hasMoreArchiveLogs: true, hasMoreLedgerLogs: true, hasMoreWatchlist: true, hasMoreVault: true, hasMoreLists: true,
      isLoadingMore: {}, loadMoreLogs, loadMoreLists, loadMoreVault, loadMoreWatchlist,
      tabFailed: {}, loadTabData: jest.fn(), retryRoom: jest.fn(),
      ...data,
    },
    username: 'tomasreyes', isSelf: true, repairingHandle: false, isFollowing: false, isRequested: false, activeTab,
    myLogs: [], myWatchlist: [], myVault: [], myLists: [], setActiveTab: jest.fn(),
    archiveSieve: 'all', archiveSearch: '', ledgerSearch: '', ledgerRatingFilter: 'all',
    watchlistSearch: '', watchlistSort: 'default', watchlistDecade: null,
    physicalFilter: null, physicalSort: 'default', physicalSearch: '', listsSort: 'default', listsSearch: '',
    setArchiveSieve: jest.fn(), setArchiveSearch: jest.fn(), setLedgerSearch: jest.fn(), setLedgerRatingFilter: jest.fn(),
    setWatchlistSearch: jest.fn(), setWatchlistSort: jest.fn(), setWatchlistDecade: jest.fn(),
    setPhysicalFilter: jest.fn(), setPhysicalSort: jest.fn(), setPhysicalSearch: jest.fn(), setListsSort: jest.fn(), setListsSearch: jest.fn(),
    refreshing: false, onRefresh: jest.fn(), dnaCardOpen: false, setDnaCardOpen: jest.fn(), rouletteOpen: false, setRouletteOpen: jest.fn(),
    followLoading: false, toggleFollow: jest.fn(),
    ...over,
  };
  await act(async () => { render(<UserProfileScreen />); });
  return mockProps[activeTab];
}

beforeEach(() => {
  mockStore = { logsHasMore: false, archiveHasMore: false, watchlistHasMore: false, listsHasMore: false, _fetchingLogs: false };
});

describe('your own rooms page from your own store, by the right flag', () => {
  it('the Archive pages by the LOGS, never by the shelf', async () => {
    mockStore = { ...mockStore, logsHasMore: true, archiveHasMore: false };
    expect((await open('archive')).onLoadMore).toBe(loadMoreLogs);
    mockStore = { ...mockStore, logsHasMore: false, archiveHasMore: true };
    expect((await open('archive')).onLoadMore).toBeUndefined();
  });

  it('a searched Archive pages the search, not the store', async () => {
    mockStore = { ...mockStore, logsHasMore: false };
    const p = await open('archive', { archiveSearch: 'noir' }, { hasMoreArchiveLogs: true });
    expect(p.onLoadMore).toBe(loadMoreLogs);
  });

  it('your Stacks page by your store, never by the visitor’s flag (true until read)', async () => {
    mockStore = { ...mockStore, listsHasMore: false };
    expect((await open('lists', {}, { hasMoreLists: true })).onLoadMore).toBeUndefined();
  });

  it('a shelf narrowed by sort or search pages the filtered read', async () => {
    mockStore = { ...mockStore, archiveHasMore: false };
    expect((await open('physical', { physicalSort: 'az' }, { hasMoreVault: true })).onLoadMore).toBe(loadMoreVault);
    expect((await open('physical', { physicalSearch: 'criterion' }, { hasMoreVault: true })).onLoadMore).toBe(loadMoreVault);
  });
});

describe('a room whose read failed', () => {
  it('your own, holding nothing, says so — never "empty" over a record you have', async () => {
    const p = await open('watchlist', {}, { tabFailed: { watchlist: true } });
    expect(p.ready).toBe(false);
    expect(typeof p.unreachable).toBe('function');
  });

  it('your own, holding something, keeps it', async () => {
    const p = await open('watchlist', { myWatchlist: [FILM] }, { tabFailed: { watchlist: true } });
    expect(p.ready).toBe(true);
  });

  it('a filtered read that failed never shows the last search’s rows', async () => {
    const p = await open('watchlist', { isSelf: false, watchlistSearch: 'noir' },
      { tabFailed: { watchlist: true }, watchlist: [{ id: 1, title: 'Stale' }] });
    expect(p.ready).toBe(false);
    expect(typeof p.unreachable).toBe('function');
  });

  it('the Archive and the Ledger can say it too', async () => {
    expect(typeof (await open('archive', {}, { tabFailed: { archive: true } })).unreachable).toBe('function');
    expect(typeof (await open('ledger', {}, { tabFailed: { ledger: true } })).unreachable).toBe('function');
  });
});

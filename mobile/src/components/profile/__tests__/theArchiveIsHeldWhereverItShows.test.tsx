/**
 * theArchiveIsHeldWhereverItShows.test.tsx — the lock on your own Archive
 * holds every place your own file shows it, and one opening opens them all.
 *
 * Settings promised the phone's own lock "before your own Archive opens", and
 * it stood in front of the Archive room alone: the Ledger beside it, the
 * calendar and LATELY on the page itself showed the same films with nothing
 * asked.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import UserProfileScreen from '@/app/user/[username]';

jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));

type Ctl = Record<string, unknown>;
let mockCtl: Ctl;
const me = {
  id: 'u1', username: 'tomasreyes', display_name: 'Tomas', persona: null, bio: '', role: 'cinephile',
  tier: 'cinephile', is_founding: false, is_social_private: false, followers_count: 0, following_count: 0,
  created_at: '2026-03-14T00:00:00Z', member_no: 147, avatar_url: null, social_links: [], preferences: { favorites: [] },
};
const STALKER = { id: 'l1', filmId: 42, title: 'Stalker', year: 1979, rating: 4, review: 'A zone of its own.', status: 'watched', watchedDate: '2026-03-01', poster: null };

const ctl = (over: Record<string, unknown> = {}): Ctl => ({
  nav: {
    toEditProfile: jest.fn(), toSettings: jest.fn(), toMembership: jest.fn(), toFollowers: jest.fn(),
    toFollowing: jest.fn(), toCalendar: jest.fn(), openSocialLink: jest.fn(), handleBack: jest.fn(),
  },
  data: {
    targetUser: me, loading: false, counts: { logs: 1, ledger: 1, watchlist: 0, vault: 0, lists: 0 },
    mainLogs: [], archiveLogs: [], ledgerLogs: [], watchlist: [], vault: [], lists: [],
    analyticsLogs: [], calendarData: [STALKER], serverAnalytics: null, highestRated: [STALKER], serverStreak: null, setTargetUser: jest.fn(),
    hasMoreLogs: false, hasMoreWatchlist: false, hasMoreVault: false, hasMoreLists: false,
    isLoadingMore: false, loadMoreLogs: jest.fn(), tabFailed: {}, moreFailed: {}, loadTabData: jest.fn(), retryRoom: jest.fn(),
  },
  username: 'tomasreyes', isSelf: true, repairingHandle: false, isFollowing: false, isRequested: false,
  activeTab: null, myLogs: [STALKER], myWatchlist: [], myVault: [], myLists: [], setActiveTab: jest.fn(),
  archiveSieve: 'all', ledgerSearch: '', ledgerRatingFilter: 'all', watchlistSearch: '', watchlistSort: 'default',
  physicalFilter: null, setArchiveSieve: jest.fn(), setLedgerSearch: jest.fn(), setLedgerRatingFilter: jest.fn(),
  setWatchlistSearch: jest.fn(), setWatchlistSort: jest.fn(), setPhysicalFilter: jest.fn(),
  refreshing: false, onRefresh: jest.fn(), dnaCardOpen: false, setDnaCardOpen: jest.fn(),
  rouletteOpen: false, setRouletteOpen: jest.fn(), followLoading: false, toggleFollow: jest.fn(),
  ...over,
});

jest.mock('@/src/hooks/useProfileController', () => ({ useProfileController: () => mockCtl }));
jest.mock('@/src/stores/films', () => ({ useFilmStore: () => ({
  fetchLogs: jest.fn(), fetchWatchlist: jest.fn(), fetchPhysicalArchive: jest.fn(), fetchLists: jest.fn(),
}) }));
jest.mock('@/src/stores/blockStore', () => {
  const s = { isBlocked: () => false, isMuted: () => false, blockUser: jest.fn(), muteUser: jest.fn() };
  const useBlockStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useBlockStore as unknown as { getState: () => unknown }).getState = () => s;
  return { useBlockStore };
});
jest.mock('@/src/stores/auth', () => {
  const s = { user: { id: 'u1', preferences: { biometric_lock: true } }, updateUser: jest.fn() };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => s;
  return { useAuthStore };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ username: 'tomasreyes' }),
  useFocusEffect: () => {},
}));
jest.mock('@/src/lib/supabase', () => ({ supabase: { rpc: jest.fn(() => Promise.resolve({ error: null })), from: jest.fn() } }));

const LA = LocalAuthentication as unknown as { getEnrolledLevelAsync: jest.Mock; authenticateAsync: jest.Mock };
const mount = async (over?: Record<string, unknown>) => {
  mockCtl = ctl(over);
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<UserProfileScreen />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return r;
};
/** Anywhere in the tree, hidden or not: a film behind the lock is not drawn at all. */
const filmShown = (r: ReturnType<typeof render>) => r.queryAllByText(/stalker/i, { includeHiddenElements: true }).length > 0;

beforeEach(() => {
  jest.clearAllMocks();
  LA.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG);
  LA.authenticateAsync.mockReturnValue(new Promise(() => {}));   // the prompt still up
});

describe('your own file, with the lock on', () => {
  it.each(['archive', 'ledger', 'calendar'])('the %s room is held, and asks at once', async (room) => {
    const r = await mount({ activeTab: room });
    expect(filmShown(r)).toBe(false);
    expect(r.getByText('RESTRICTED ACCESS')).toBeTruthy();
    expect(LA.authenticateAsync).toHaveBeenCalledTimes(1);
  });

  it('the Projector\'s HIGHEST RATED is held, and asks only when tapped', async () => {
    const r = await mount({ activeTab: 'projector' });
    expect(r.getByText('HIGHEST RATED', { exact: false })).toBeTruthy();
    expect(filmShown(r)).toBe(false);
    expect(LA.authenticateAsync).not.toHaveBeenCalled();
  });

  it('LATELY is held on the page, and asks only when tapped', async () => {
    const r = await mount();
    expect(filmShown(r)).toBe(false);
    expect(r.getByText("Your recent films are behind your Archive's lock.")).toBeTruthy();
    expect(LA.authenticateAsync).not.toHaveBeenCalled();
  });

  it('one opening opens all of it, for the visit', async () => {
    LA.authenticateAsync.mockResolvedValue({ success: true });
    const r = await mount();
    await act(async () => { fireEvent.press(r.getByLabelText('Authenticate to open your Archive')); });
    expect(filmShown(r)).toBe(true);
    mockCtl = ctl({ activeTab: 'ledger' });
    await act(async () => { r.rerender(<UserProfileScreen />); });
    expect(filmShown(r)).toBe(true);
    expect(LA.authenticateAsync).toHaveBeenCalledTimes(1);
  });

  it('a refusal keeps it shut', async () => {
    LA.authenticateAsync.mockResolvedValue({ success: false, error: 'authentication_failed' });
    const r = await mount();
    await act(async () => { fireEvent.press(r.getByLabelText('Authenticate to open your Archive')); });
    expect(filmShown(r)).toBe(false);
    expect(r.getByText('Authentication Failed')).toBeTruthy();
  });
});

it("another member's file is never held by your lock", async () => {
  const r = await mount({ isSelf: false, myLogs: [], data: { ...(ctl().data as object), mainLogs: [STALKER] } });
  expect(r.queryByText('RESTRICTED ACCESS')).toBeNull();
  expect(filmShown(r)).toBe(true);
});

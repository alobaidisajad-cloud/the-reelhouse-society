/**
 * On a member's file, what leaves fades first and then is gone from the tree, by state:
 * the Cinema DNA card when it is closed, and the Archive's lock when it is opened
 * (Presence; exitingIsNeverUsed.guard.test.ts says why). The harness is the lock's
 * own (theArchiveIsHeldWhereverItShows.test.tsx): the real screen, its controller stubbed.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import UserProfileScreen from '@/app/user/[username]';
import { ARRIVAL_GRACE_MS } from '@/src/hooks/useArrival';
import { PRESET_MS } from '@/src/components/motion/Presence';

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
const RECORD = {
  stamps: {
    total_logs: 120, pre_1960_count: 0, perfect_ratings_count: 0, has_physical_media: false,
    has_abandoned: false, decades_logged_count: 3, has_rewatched: false,
    reviews_count: 0, genres_count: 0, busiest_day_count: 0, unrated_count: 0,
  },
  dna: { avg_rating: 3.6, top_decades: [{ '1970s': 40 }], obscurity_index: 73, obscurity_films: 118 },
};

const ctl = (over: Record<string, unknown> = {}): Ctl => ({
  nav: {
    toEditProfile: jest.fn(), toSettings: jest.fn(), toMembership: jest.fn(), toFollowers: jest.fn(),
    toFollowing: jest.fn(), toCalendar: jest.fn(), openSocialLink: jest.fn(), handleBack: jest.fn(),
  },
  data: {
    targetUser: me, loading: false, counts: { logs: 1, ledger: 1, watchlist: 0, vault: 0, lists: 0 },
    mainLogs: [], archiveLogs: [], ledgerLogs: [], watchlist: [], vault: [], lists: [],
    analyticsLogs: [], calendarData: [STALKER], serverAnalytics: RECORD, highestRated: [STALKER], serverStreak: null, setTargetUser: jest.fn(),
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
/** What is leaving is hidden from the screen reader; these look past that. */
const ALL = { includeHiddenElements: true } as const;
const EXIT = PRESET_MS + ARRIVAL_GRACE_MS;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  LA.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG);
  LA.authenticateAsync.mockReturnValue(new Promise(() => {}));
});
afterEach(() => jest.useRealTimers());

it('the Cinema DNA card, closed, fades and then leaves the tree', async () => {
  const r = await mount({ dnaCardOpen: true });
  expect(r.getByText('CINEMA DNA')).toBeTruthy();
  mockCtl = ctl({ dnaCardOpen: false });
  await act(async () => { r.rerender(<UserProfileScreen />); });
  expect(r.getByText('CINEMA DNA', ALL)).toBeTruthy();
  expect(r.queryByText('CINEMA DNA')).toBeNull();
  await act(() => { jest.advanceTimersByTime(EXIT - 1); });
  expect(r.getByText('CINEMA DNA', ALL)).toBeTruthy();
  await act(() => { jest.advanceTimersByTime(1); });
  expect(r.queryByText('CINEMA DNA', ALL)).toBeNull();
});

it('the Archive\'s lock, opened, fades over the calendar and then leaves the tree', async () => {
  // The prompt asked on sight is still up; the tap is what opens it.
  const s = await mount({ activeTab: 'calendar' });
  expect(s.getByText('RESTRICTED ACCESS')).toBeTruthy();
  LA.authenticateAsync.mockResolvedValue({ success: true });
  await act(async () => { await fireEvent.press(s.getByLabelText('Authenticate to open your Archive')); });
  // Still drawn while it fades, and already gone from the screen reader and the thumb.
  expect(s.getByText('RESTRICTED ACCESS', ALL)).toBeTruthy();
  expect(s.queryByText('RESTRICTED ACCESS')).toBeNull();
  await act(() => { jest.advanceTimersByTime(EXIT); });
  expect(s.queryByText('RESTRICTED ACCESS', ALL)).toBeNull();
});

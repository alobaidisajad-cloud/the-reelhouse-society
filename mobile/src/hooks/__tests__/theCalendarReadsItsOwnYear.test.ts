/**
 * theCalendarReadsItsOwnYear.test.ts — the Viewing Calendar, after the Projector.
 * ─────────────────────────────────────────────────────────────────────────────
 * The calendar tab skipped its own read whenever the Projector had loaded first,
 * to reuse those logs. But the Projector reads NOTHING for another member below
 * the Auteur rank (fetchAnalyticsLogs returns [] for them), so the calendar was
 * left drawing the first page of that member's logs as if it were their year.
 *
 * While the calendar was locked below the Archivist rank that path was narrow.
 * With the calendar every member's, it is the ordinary one: open a Cinephile's
 * profile, look at the Projector, then the calendar.
 *
 * Driven through the real hook, in the order a member taps.
 */
import { renderHook, act } from '@testing-library/react-native';
import { useProfileData } from '../useProfileData';
import { ProfileDataService } from '@/src/services/ProfileDataService';

jest.mock('@/src/services/ProfileDataService', () => ({
  ProfileDataService: {
    fetchProfile: jest.fn(),
    fetchCounts: jest.fn(),
    fetchAnalyticsSummary: jest.fn(),
    fetchOtherUserLogs: jest.fn(),
    fetchAnalyticsLogs: jest.fn(),
    fetchProfileAnalytics: jest.fn(),
    fetchTasteProfile: jest.fn(),
    pingFilmSync: jest.fn(),
    fetchCalendarData: jest.fn(),
  },
}));
jest.mock('@/src/stores/films', () => {
  const store = (state: Record<string, unknown>) =>
    Object.assign((sel: (s: Record<string, unknown>) => unknown) => sel(state), { getState: () => state });
  return {
    useLogStore: store({ fetchLogs: jest.fn(), logs: [] }),
    useWatchlistStore: store({ fetchWatchlist: jest.fn() }),
    useArchiveStore: store({ fetchPhysicalArchive: jest.fn() }),
    useListStore: store({ fetchLists: jest.fn() }),
  };
});
jest.mock('@/src/stores/followStore', () => ({
  useSocialStore: { getState: () => ({ isFollowing: () => false }) },
}));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: null }) } }));
jest.mock('@/src/utils/profileCountsCache', () => ({ readCachedCounts: () => null, writeCachedCounts: jest.fn() }));
jest.mock('@/src/utils/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const svc = ProfileDataService as unknown as Record<string, jest.Mock>;

/** A Cinephile — the rank the Projector reads nothing for, when it is someone else. */
const CINEPHILE = { id: 'u2', username: 'marguerite', tier: 'free', role: 'user', is_founding: false, is_social_private: false };
const YEAR = [{ date: '2026-09-01', rating: 4, status: 'watched' }];

beforeEach(() => {
  jest.clearAllMocks();
  svc.fetchProfile.mockResolvedValue({ ...CINEPHILE });
  svc.fetchCounts.mockResolvedValue({});
  svc.fetchAnalyticsSummary.mockResolvedValue(null);
  svc.fetchOtherUserLogs.mockResolvedValue({ items: [], nextCursor: null });
  svc.fetchAnalyticsLogs.mockResolvedValue([]);        // what the service really returns here
  svc.fetchProfileAnalytics.mockResolvedValue(null);
  svc.fetchTasteProfile.mockResolvedValue(null);
  svc.fetchCalendarData.mockResolvedValue(YEAR);
});

const openProfile = async () => {
  const hook = await renderHook(() =>
    useProfileData({ username: CINEPHILE.username, isSelf: false, isFollowing: false, activeTab: null }));
  await act(async () => { await Promise.resolve(); });
  expect(hook.result.current.targetUser?.id).toBe(CINEPHILE.id);
  return hook;
};

describe('the Viewing Calendar reads its own year', () => {
  it('after the Projector — the order a member taps', async () => {
    const { result } = await openProfile();
    await act(async () => { await result.current.loadTabData('projector'); });
    expect(svc.fetchAnalyticsLogs).toHaveBeenCalled();
    expect(result.current.analyticsLogs).toEqual([]);

    await act(async () => { await result.current.loadTabData('calendar'); });
    expect(svc.fetchCalendarData).toHaveBeenCalledWith(expect.objectContaining({ id: CINEPHILE.id }), expect.anything());
    expect(result.current.calendarData).toEqual([{ watchedDate: '2026-09-01', rating: 4, status: 'watched' }]);
  });

  it('on its own, for a member of any rank', async () => {
    const { result } = await openProfile();
    await act(async () => { await result.current.loadTabData('calendar'); });
    expect(result.current.calendarData).toHaveLength(1);
  });
});

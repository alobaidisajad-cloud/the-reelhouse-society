/**
 * theFileFollowsEveryRecordChange.test.tsx — round 11 (useProfileData).
 *
 * A member's own file read its Viewing Calendar, its Projector (and passport) and its summary (the
 * run, the months) as it opened, and never again for a seal: a rewatch made from the Log sheet, or a
 * viewing the queue delivered later, left the night off the calendar and the run, and the Projector
 * as it was, until the member pulled. The file now hears every change to the member's records
 * (hearRecordsChanged, as the Reel's cards do): the summary is read again, the room in front is read
 * again now, and a room read before is read again when it is next opened. Another member's file
 * is not theirs to change, and reads nothing.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { reelMayHaveChanged, recordsMayHaveChanged } from '@/src/components/feed/reelRead';
import { useFilmStore } from '@/src/stores/films';
import { useProfileData, type ProfileTab } from '../useProfileData';

const mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const NIGHT_ONE = { date: '2026-11-10', count: 1 };
const NIGHT_TWO = { date: '2026-11-14', count: 1 };
const mockService = {
  fetchProfile: jest.fn(),
  fetchCounts: jest.fn(async () => ({ logs: 4, ledger: 0, watchlist: 0, vault: 0, lists: 0, followers: 0, following: 0 })),
  fetchAnalyticsSummary: jest.fn(async () => null),
  fetchOtherUserLogs: jest.fn(async () => ({ items: [], nextCursor: null })),
  fetchCalendarData: jest.fn(),
  fetchProfileAnalytics: jest.fn(async () => null),
};
jest.mock('@/src/services/ProfileDataService', () => ({
  ProfileDataService: new Proxy({}, { get: (_t, k: string) => (mockService as Record<string, jest.Mock>)[k] ?? jest.fn(async () => null) }),
}));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

const ME = { id: 'u1', username: 'vesper', tier: 'cinephile', role: 'cinephile', is_founding: false, is_social_private: false };

/** The member's own file, or another's, open on a room. */
async function openFile(isSelf: boolean, activeTab: ProfileTab) {
  const r = await renderHook(() => useProfileData({ username: 'vesper', isSelf, isFollowing: false, activeTab }));
  await waitFor(() => expect(r.result.current.targetUser?.id).toBe('u1'));
  // The rooms the screen opens, as useProfileController asks for them.
  await act(async () => { await r.result.current.loadTabData('calendar'); });
  await act(async () => { await r.result.current.loadTabData('projector'); });
  return r;
}

beforeEach(() => {
  for (const fn of Object.values(mockService)) fn.mockClear();
  mockService.fetchProfile.mockResolvedValue(ME);
  mockService.fetchCalendarData.mockReset().mockResolvedValueOnce([NIGHT_ONE]).mockResolvedValue([NIGHT_ONE, NIGHT_TWO]);
  // The member's records held on the phone, so the file reads its logs behind what it shows.
  useFilmStore.setState({ logs: [{ id: 'l1', filmId: 1 }], fetchLogs: jest.fn(async () => true) } as never);
});

it('a seal on the member\'s own file reads the calendar in front again, and the summary with its run', async () => {
  const r = await openFile(true, 'calendar');
  expect(r.result.current.calendarData).toEqual([NIGHT_ONE]);
  const summaries = mockService.fetchAnalyticsSummary.mock.calls.length;

  // A rewatch sealed from the Log sheet (or the queue delivering one): what logOperations tells.
  await act(async () => { reelMayHaveChanged(); });
  await waitFor(() => expect(r.result.current.calendarData).toEqual([NIGHT_ONE, NIGHT_TWO]));
  expect(mockService.fetchCalendarData).toHaveBeenCalledTimes(2);
  expect(mockService.fetchAnalyticsSummary.mock.calls.length).toBeGreaterThan(summaries);
  // The Projector, not in front, is read again when it is next opened.
  expect(r.result.current.tabDataLoaded.analytics).toBe(false);
  expect(mockService.fetchProfileAnalytics).toHaveBeenCalledTimes(1);
  await act(async () => { await r.result.current.loadTabData('projector'); });
  expect(mockService.fetchProfileAnalytics).toHaveBeenCalledTimes(2);
  await act(async () => { await r.unmount(); });
});

it('a film an older build marked watched, delivered by the queue, is heard too', async () => {
  const r = await openFile(true, 'calendar');
  await act(async () => { recordsMayHaveChanged(); });
  await waitFor(() => expect(r.result.current.calendarData).toEqual([NIGHT_ONE, NIGHT_TWO]));
  await act(async () => { await r.unmount(); });
});

it('another member\'s file is not the reader\'s records, and reads nothing again', async () => {
  const r = await openFile(false, 'calendar');
  await act(async () => { reelMayHaveChanged(); });
  await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  expect(mockService.fetchCalendarData).toHaveBeenCalledTimes(1);
  expect(r.result.current.calendarData).toEqual([NIGHT_ONE]);
  await act(async () => { await r.unmount(); });
});

/**
 * aRoomSaysItCouldNotBeRead.test.tsx — a visitor's room, read and failed.
 *
 * loadTabData reverted a failed room to "not loaded", and the room then stood
 * at RETRIEVING for as long as the member stayed. It now records the failure
 * (`tabFailed`), the screen says so, and asking again clears it.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useProfileData } from '../useProfileData';

const mockService = {
  fetchProfile: jest.fn(),
  fetchCounts: jest.fn(async () => ({ logs: 3, ledger: 0, watchlist: 9, vault: 0, lists: 0, followers: 1, following: 1 })),
  fetchAnalyticsSummary: jest.fn(async () => null),
  fetchOtherUserLogs: jest.fn(async () => ({ items: [], nextCursor: null })),
  fetchOtherUserWatchlist: jest.fn(),
  fetchOtherUserVault: jest.fn(),
  fetchOtherUserLists: jest.fn(),
};
jest.mock('@/src/services/ProfileDataService', () => ({
  ProfileDataService: new Proxy({}, { get: (_t, k: string) => (mockService as Record<string, unknown>)[k] ?? jest.fn(async () => null) }),
}));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

const MEMBER = { id: 'u9', username: 'vesper', tier: 'cinephile', role: 'cinephile', is_founding: false, is_social_private: false };

beforeEach(() => {
  mockService.fetchProfile.mockResolvedValue(MEMBER);
});

it('a room whose read failed says so — and asking again clears it', async () => {
  mockService.fetchOtherUserWatchlist
    .mockRejectedValueOnce(new Error('Network request failed'))
    .mockResolvedValueOnce({ items: [], nextCursor: null });
  const { result } = await renderHook(() => useProfileData({ username: 'vesper', isSelf: false, isFollowing: false, activeTab: null as never }));
  await waitFor(() => expect(result.current.targetUser?.id).toBe('u9'));

  await act(async () => { await result.current.loadTabData('watchlist'); });
  expect(result.current.tabFailed.watchlist).toBe(true);
  expect(result.current.tabDataLoaded.watchlist).toBeFalsy();

  await act(async () => { await result.current.loadTabData('watchlist', true); });
  expect(result.current.tabFailed.watchlist).toBe(false);
  expect(result.current.tabDataLoaded.watchlist).toBe(true);
});

it('a member whose read failed answers false, so a pull over a file already shown can say so', async () => {
  const { result } = await renderHook(() => useProfileData({ username: 'vesper', isSelf: false, isFollowing: false, activeTab: null as never }));
  await waitFor(() => expect(result.current.targetUser?.id).toBe('u9'));

  mockService.fetchProfile.mockRejectedValueOnce(new Error('Network request failed'));
  let read: boolean | void = true;
  await act(async () => { read = await result.current.fetchUserData(); });
  expect(read).toBe(false);
  // The file already drawn stays drawn.
  expect(result.current.targetUser?.id).toBe('u9');
});

it('a filtered read that failed marks its room, and asking again asks for the filtered read', async () => {
  const { result } = await renderHook(() => useProfileData({ username: 'vesper', isSelf: false, isFollowing: false, activeTab: null as never }));
  await waitFor(() => expect(result.current.targetUser?.id).toBe('u9'));

  const noir = { search: 'noir', sort: 'default', decade: null };
  mockService.fetchOtherUserWatchlist.mockReset()
    .mockRejectedValueOnce(new Error('Network request failed'))
    .mockResolvedValueOnce({ items: [{ id: 1, title: 'Night and the City' }], nextCursor: null });
  await act(async () => { await result.current.refreshTabWithFilters('watchlist', noir); });
  expect(result.current.tabFailed.watchlist).toBe(true);

  // Asked again through the room's one door: the SEARCH, not the plain room.
  await act(async () => { await result.current.retryRoom('watchlist'); });
  expect(mockService.fetchOtherUserWatchlist).toHaveBeenLastCalledWith('u9', 50, undefined, expect.anything(), noir);
  expect(result.current.tabFailed.watchlist).toBe(false);
  expect(result.current.watchlist).toEqual([{ id: 1, title: 'Night and the City' }]);
});

it('and a new member on the screen starts with no room failed: the last member’s failure is not theirs', async () => {
  mockService.fetchOtherUserWatchlist.mockReset().mockRejectedValueOnce(new Error('Network request failed'));
  const { result, rerender } = await renderHook(
    ({ username }: { username: string }) => useProfileData({ username, isSelf: false, isFollowing: false, activeTab: null as never }),
    { initialProps: { username: 'vesper' } },
  );
  await waitFor(() => expect(result.current.targetUser?.id).toBe('u9'));
  await act(async () => { await result.current.loadTabData('watchlist'); });
  expect(result.current.tabFailed.watchlist).toBe(true);

  mockService.fetchProfile.mockResolvedValue({ ...MEMBER, id: 'u7', username: 'ana' });
  await act(async () => { rerender({ username: 'ana' }); });
  await waitFor(() => expect(result.current.targetUser?.id).toBe('u7'));
  expect(result.current.tabFailed.watchlist).toBeFalsy();
});

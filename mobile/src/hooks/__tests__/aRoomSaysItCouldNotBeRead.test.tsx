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

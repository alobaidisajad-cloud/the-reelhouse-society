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

// A room of your own with nothing held called itself empty while its first read was out, and a
// search called itself empty before its rows came (P0.112): the hook now says which reads have
// answered, and for which filters.
describe('what a room\'s read has answered', () => {
  const open = async (username = 'vesper') => {
    const hook = await renderHook(
      ({ name }: { name: string }) => useProfileData({ username: name, isSelf: false, isFollowing: false, activeTab: null as never }),
      { initialProps: { name: username } },
    );
    await waitFor(() => expect(hook.result.current.targetUser?.id).toBe('u9'));
    return hook;
  };

  it('a room is answered once its read comes back, not when it is asked, and not by a failed one', async () => {
    mockService.fetchOtherUserWatchlist.mockReset()
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const { result } = await open();
    expect(result.current.tabAnswered.watchlist).toBeFalsy();
    await act(async () => { await result.current.loadTabData('watchlist'); });
    expect(result.current.tabAnswered.watchlist).toBeFalsy();
    await act(async () => { await result.current.loadTabData('watchlist', true); });
    expect(result.current.tabAnswered.watchlist).toBe(true);
  });

  it('a search records the filters its rows answer; a search overtaken lands neither its rows nor its filters', async () => {
    const noir = { search: 'noir', sort: 'default', decade: null };
    const kane = { search: 'kane', sort: 'default', decade: null };
    let release: (v: unknown) => void = () => {};
    mockService.fetchOtherUserWatchlist.mockReset()
      .mockImplementationOnce(() => new Promise((r) => { release = r; }))
      .mockResolvedValueOnce({ items: [{ id: 2, title: 'Citizen Kane' }], nextCursor: null });
    const { result } = await open();

    let slow: Promise<void> = Promise.resolve();
    await act(async () => { slow = result.current.refreshTabWithFilters('watchlist', noir); });
    await act(async () => { await result.current.refreshTabWithFilters('watchlist', kane); });
    await act(async () => { release({ items: [{ id: 1, title: 'Night and the City' }], nextCursor: null }); await slow; });

    expect(result.current.answeredFilters.watchlist).toEqual(kane);
    expect(result.current.watchlist).toEqual([{ id: 2, title: 'Citizen Kane' }]);
    expect(result.current.isLoadingMore.watchlist).toBe(false);
  });

  it('a new member on the screen starts with nothing answered: the last member\'s answers are not theirs', async () => {
    mockService.fetchOtherUserWatchlist.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    const { result, rerender } = await open();
    await act(async () => { await result.current.loadTabData('watchlist'); });
    await act(async () => { await result.current.refreshTabWithFilters('watchlist', { search: 'noir', sort: 'default', decade: null }); });
    expect(result.current.tabAnswered.watchlist).toBe(true);

    mockService.fetchProfile.mockResolvedValue({ ...MEMBER, id: 'u7', username: 'ana' });
    await act(async () => { await rerender({ name: 'ana' }); });
    await waitFor(() => expect(result.current.targetUser?.id).toBe('u7'));
    expect({ answered: result.current.tabAnswered.watchlist, filters: result.current.answeredFilters.watchlist })
      .toEqual({ answered: undefined, filters: undefined });
    mockService.fetchProfile.mockResolvedValue(MEMBER);
  });
});

describe('your own file', () => {
  it('your own Archive and Ledger are answered once your logs are read, held or fetched', async () => {
    const { useAuthStore } = require('@/src/stores/auth');
    const { useLogStore } = require('@/src/stores/films');
    const before = { auth: useAuthStore.getState(), logs: useLogStore.getState() };
    let answer: (ok: boolean) => void = () => {};
    const fetchLogs = jest.fn(() => new Promise<boolean>((r) => { answer = r; }));
    useAuthStore.setState({ user: { ...MEMBER, followers_count: 0, following_count: 0 } });
    useLogStore.setState({ logs: [], fetchLogs });
    try {
      const { result, unmount } = await renderHook(() => useProfileData({ username: 'vesper', isSelf: true, isFollowing: false, activeTab: null as never }));
      await waitFor(() => expect(fetchLogs).toHaveBeenCalled());
      expect(result.current.tabAnswered.archive).toBeFalsy();
      await act(async () => { answer(true); });
      await waitFor(() => expect(result.current.tabAnswered).toMatchObject({ archive: true, ledger: true }));
      await act(async () => { await unmount(); });
    } finally {
      useAuthStore.setState(before.auth);
      useLogStore.setState(before.logs);
    }
  });
});

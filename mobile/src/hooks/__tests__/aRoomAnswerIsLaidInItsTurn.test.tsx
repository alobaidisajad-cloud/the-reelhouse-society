/**
 * aRoomAnswerIsLaidInItsTurn.test.tsx — a member's file lays no older answer over a newer state.
 *
 * Each read here is held open while a newer read or search of the same thing is made and answered,
 * then let go: what is on screen afterwards is the newer state. A room asked again (a tab opened
 * twice, a retry, a new search), a next page whose list was read again, the member's file read
 * again, the spinner of a member left, and the summary asked again (useProfileData, its turns).
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useProfileData } from '../useProfileData';

const mockService = {
  fetchProfile: jest.fn(),
  fetchCounts: jest.fn(async () => ({ logs: 3, ledger: 0, watchlist: 9, vault: 2, lists: 1, followers: 1, following: 1 })),
  fetchAnalyticsSummary: jest.fn(),
  fetchOtherUserLogs: jest.fn(),
  fetchOtherUserWatchlist: jest.fn(),
  fetchOtherUserVault: jest.fn(),
  fetchOtherUserLists: jest.fn(),
};
jest.mock('@/src/services/ProfileDataService', () => ({
  ProfileDataService: new Proxy({}, { get: (_t, k: string) => (mockService as Record<string, unknown>)[k] ?? jest.fn(async () => null) }),
}));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

/** An archivist, so every room (the shelf too) is theirs to read. */
const MEMBER = { id: 'u9', username: 'vesper', tier: 'archivist', role: 'archivist', is_founding: false, is_social_private: false };
const row = (id: string) => ({ id, title: id });
const page = (ids: string[], nextCursor: string | null) => ({ items: ids.map(row), nextCursor });

/** An answer held open until the test lets it go. */
function held<T>() {
  let resolve: (v: T) => void = () => {};
  let reject: (e: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  for (const fn of Object.values(mockService)) fn.mockReset();
  mockService.fetchProfile.mockResolvedValue(MEMBER);
  mockService.fetchCounts.mockResolvedValue({ logs: 3, ledger: 0, watchlist: 9, vault: 2, lists: 1, followers: 1, following: 1 });
  mockService.fetchAnalyticsSummary.mockResolvedValue(null);
  mockService.fetchOtherUserLogs.mockResolvedValue(page(['l1'], null));
});

const open = async (username = 'vesper') => {
  const hook = await renderHook(
    ({ name }: { name: string }) => useProfileData({ username: name, isSelf: false, isFollowing: false, activeTab: null }),
    { initialProps: { name: username } },
  );
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

describe('a room asked again while its read is out', () => {
  it('opened twice: the later read is laid, whichever lands last', async () => {
    const first = held<unknown>();
    mockService.fetchOtherUserWatchlist.mockImplementationOnce(() => first.promise).mockResolvedValueOnce(page(['w2'], null));
    const { result } = await open();

    let older: Promise<void> = Promise.resolve();
    await act(async () => { older = result.current.loadTabData('watchlist'); });
    await act(async () => { await result.current.loadTabData('watchlist', true); });
    await act(async () => { first.resolve(page(['w1'], 'after-w1')); await older; });

    expect(result.current.watchlist).toEqual([row('w2')]);
    expect(result.current.hasMoreWatchlist).toBe(false);
  });

  it('searched again: an older search that fails says nothing over the newer one that answered', async () => {
    const first = held<unknown>();
    mockService.fetchOtherUserWatchlist.mockImplementationOnce(() => first.promise).mockResolvedValueOnce(page(['kane'], null));
    const { result } = await open();

    let older: Promise<void> = Promise.resolve();
    await act(async () => { older = result.current.refreshTabWithFilters('watchlist', { search: 'noir', sort: 'default', decade: null }); });
    await act(async () => { await result.current.refreshTabWithFilters('watchlist', { search: 'kane', sort: 'default', decade: null }); });
    await act(async () => { first.reject(new Error('Network request failed')); await older; });

    expect(result.current.tabFailed.watchlist).toBeFalsy();
    expect(result.current.watchlist).toEqual([row('kane')]);
  });

  it('your own logs retried twice: the later retry says how the read went', async () => {
    const { useAuthStore } = require('@/src/stores/auth');
    const { useLogStore } = require('@/src/stores/films');
    const before = { auth: useAuthStore.getState(), logs: useLogStore.getState() };
    const first = held<boolean>();
    const fetchLogs = jest.fn(async () => true).mockResolvedValueOnce(true).mockImplementationOnce(() => first.promise);
    useAuthStore.setState({ user: { ...MEMBER, followers_count: 0, following_count: 0 } });
    useLogStore.setState({ logs: [], fetchLogs });
    try {
      const { result, unmount } = await renderHook(() => useProfileData({ username: 'vesper', isSelf: true, isFollowing: false, activeTab: null }));
      await waitFor(() => expect(result.current.tabAnswered).toMatchObject({ archive: true, ledger: true }));

      let older: Promise<void> = Promise.resolve();
      await act(async () => { older = result.current.retryRoom('archive'); });
      await act(async () => { await result.current.retryRoom('ledger'); });
      await act(async () => { first.resolve(false); await older; });

      expect({ failed: result.current.tabFailed.archive, answered: result.current.tabAnswered.archive }).toEqual({ failed: false, answered: true });
      await act(async () => { await unmount(); });
    } finally {
      useAuthStore.setState(before.auth);
      useLogStore.setState(before.logs);
    }
  });
});

/** The paged rooms of another member: the room's read, its next page, its search, and its "still reading" flag. */
const ROOMS = {
  watchlist: { tab: 'watchlist', read: 'fetchOtherUserWatchlist', more: 'loadMoreWatchlist', list: 'watchlist', flag: 'watchlist', narrowed: { search: 'noir', sort: 'default', decade: null } },
  physical: { tab: 'physical', read: 'fetchOtherUserVault', more: 'loadMoreVault', list: 'vault', flag: 'vault', narrowed: { search: 'noir' } },
  lists: { tab: 'lists', read: 'fetchOtherUserLists', more: 'loadMoreLists', list: 'lists', flag: 'lists', narrowed: { search: 'noir' } },
} as const;
type PagedRoom = (typeof ROOMS)[keyof typeof ROOMS];

describe('a next page is laid only on the list it follows', () => {
  const pageOnNoNewList = async (room: PagedRoom) => {
    const nextPage = held<unknown>();
    mockService[room.read].mockResolvedValueOnce(page(['a'], 'after-a'))
      .mockImplementationOnce(() => nextPage.promise)
      .mockResolvedValueOnce(page(['n'], null));
    const { result } = await open();
    await act(async () => { await result.current.loadTabData(room.tab); });

    let more: Promise<unknown> = Promise.resolve();
    await act(async () => { more = result.current[room.more](); });
    await act(async () => { await result.current.refreshTabWithFilters(room.tab, room.narrowed); });
    await act(async () => { nextPage.resolve(page(['b'], 'after-b')); await more; });

    expect({ shown: result.current[room.list], more: result.current.isLoadingMore[room.flag] }).toEqual({ shown: [row('n')], more: false });
  };
  it('the watchlist: searched while its next page is out, the page lands on no new list', () => pageOnNoNewList(ROOMS.watchlist));
  it('the shelf: searched while its next page is out, the page lands on no new list', () => pageOnNoNewList(ROOMS.physical));
  it('the stacks: searched while their next page is out, the page lands on no new list', () => pageOnNoNewList(ROOMS.lists));

  const flagNotLowered = async (room: PagedRoom) => {
    const nextPage = held<unknown>();
    const search = held<unknown>();
    mockService[room.read].mockResolvedValueOnce(page(['a'], 'after-a'))
      .mockImplementationOnce(() => nextPage.promise)
      .mockImplementationOnce(() => search.promise);
    const { result } = await open();
    await act(async () => { await result.current.loadTabData(room.tab); });

    let more: Promise<unknown> = Promise.resolve();
    let searched: Promise<void> = Promise.resolve();
    await act(async () => { more = result.current[room.more](); });
    await act(async () => { searched = result.current.refreshTabWithFilters(room.tab, room.narrowed); });
    await act(async () => { nextPage.resolve(page(['b'], 'after-b')); await more; });
    expect(result.current.isLoadingMore[room.flag]).toBe(true);

    await act(async () => { search.resolve(page(['n'], null)); await searched; });
    expect({ shown: result.current[room.list], more: result.current.isLoadingMore[room.flag] }).toEqual({ shown: [row('n')], more: false });
  };
  it('the watchlist: a page let go lowers no flag a newer search of the room raised', () => flagNotLowered(ROOMS.watchlist));
  it('the shelf: a page let go lowers no flag a newer search of the room raised', () => flagNotLowered(ROOMS.physical));
  it('the stacks: a page let go lowers no flag a newer search of the room raised', () => flagNotLowered(ROOMS.lists));

  it('the member\'s logs: read again while a next page is out, the page lands on no new first page', async () => {
    const nextPage = held<unknown>();
    mockService.fetchOtherUserLogs.mockReset()
      .mockResolvedValueOnce(page(['l1'], 'after-l1'))
      .mockImplementationOnce(() => nextPage.promise)
      .mockResolvedValueOnce(page(['l0'], 'after-l0'));
    const { result } = await open();
    expect(result.current.mainLogs).toEqual([row('l1')]);

    let more: Promise<unknown> = Promise.resolve();
    await act(async () => { more = result.current.loadMoreLogs(); });
    await act(async () => { await result.current.fetchUserData(); });
    await act(async () => { nextPage.resolve(page(['l2'], null)); await more; });

    // The page after l1 is not the page after l0: laid, l1 would be skipped.
    expect({ shown: result.current.mainLogs, more: result.current.hasMoreMainLogs }).toEqual({ shown: [row('l0')], more: true });
  });

  it('the member\'s archive: a page let go lowers no flag a newer search of the archive raised', async () => {
    const nextPage = held<unknown>();
    const search = held<unknown>();
    mockService.fetchOtherUserLogs.mockReset()
      .mockResolvedValueOnce(page(['l1'], 'after-l1'))
      .mockImplementationOnce(() => nextPage.promise)
      .mockImplementationOnce(() => search.promise);
    const hook = await renderHook(() => useProfileData({ username: 'vesper', isSelf: false, isFollowing: false, activeTab: 'archive' }));
    await waitFor(() => expect(hook.result.current.archiveLogs).toEqual([row('l1')]));

    let more: Promise<unknown> = Promise.resolve();
    let searched: Promise<void> = Promise.resolve();
    await act(async () => { more = hook.result.current.loadMoreLogs(); });
    await act(async () => { searched = hook.result.current.refreshTabWithFilters('archive', { status: 'all', search: 'noir' }); });
    await act(async () => { nextPage.resolve(page(['l2'], null)); await more; });
    expect(hook.result.current.isLoadingMore.logs_archive).toBe(true);

    await act(async () => { search.resolve(page(['noir'], null)); await searched; });
    expect({ shown: hook.result.current.archiveLogs, more: hook.result.current.isLoadingMore.logs_archive }).toEqual({ shown: [row('noir')], more: false });
  });

  it('a search overtaken by a newer one lowers no flag the newer one raised', async () => {
    const older = held<unknown>();
    const newer = held<unknown>();
    mockService.fetchOtherUserWatchlist.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);
    const { result } = await open();

    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    await act(async () => { first = result.current.refreshTabWithFilters('watchlist', { search: 'noir', sort: 'default', decade: null }); });
    await act(async () => { second = result.current.refreshTabWithFilters('watchlist', { search: 'kane', sort: 'default', decade: null }); });
    await act(async () => { older.resolve(page(['noir'], null)); await first; });
    expect(result.current.isLoadingMore.watchlist).toBe(true);

    await act(async () => { newer.resolve(page(['kane'], null)); await second; });
    expect({ shown: result.current.watchlist, more: result.current.isLoadingMore.watchlist }).toEqual({ shown: [row('kane')], more: false });
  });
});

describe('the member\'s file', () => {
  it('read again while the last read is out: the later read is laid, whichever lands last', async () => {
    const older = held<unknown>();
    mockService.fetchOtherUserLogs.mockReset()
      .mockResolvedValueOnce(page(['l1'], null))
      .mockImplementationOnce(() => older.promise)
      .mockResolvedValueOnce(page(['new'], null));
    const { result } = await open();

    let first: Promise<unknown> = Promise.resolve();
    await act(async () => { first = result.current.fetchUserData(); });
    await act(async () => { await result.current.fetchUserData(); });
    await act(async () => { older.resolve(page(['old'], null)); await first; });

    expect(result.current.mainLogs).toEqual([row('new')]);
  });

  it('a member left while their read is out lowers no spinner over the next member\'s read', async () => {
    const vesper = held<unknown>();
    const ana = held<unknown>();
    mockService.fetchProfile.mockReset().mockImplementationOnce(() => vesper.promise).mockImplementationOnce(() => ana.promise);
    const { result, rerender } = await renderHook(
      ({ name }: { name: string }) => useProfileData({ username: name, isSelf: false, isFollowing: false, activeTab: null }),
      { initialProps: { name: 'vesper' } },
    );
    await act(async () => { await rerender({ name: 'ana' }); });
    await act(async () => { vesper.resolve(MEMBER); });
    expect(result.current.loading).toBe(true);

    await act(async () => { ana.resolve({ ...MEMBER, id: 'u7', username: 'ana' }); });
    await waitFor(() => expect({ who: result.current.targetUser?.id, loading: result.current.loading }).toEqual({ who: 'u7', loading: false }));
  });

  it('the summary asked again lands on no newer read of the file, nor under a later retry', async () => {
    const { result } = await open();
    const asked = held<unknown>();

    // Overtaken by the member read again.
    mockService.fetchAnalyticsSummary.mockImplementationOnce(() => asked.promise).mockResolvedValueOnce({ total_logs: 2 });
    let retried: Promise<void> = Promise.resolve();
    await act(async () => { retried = result.current.retrySummary(); });
    await act(async () => { await result.current.fetchUserData(); });
    await act(async () => { asked.resolve({ total_logs: 1 }); await retried; });
    expect(result.current.analyticsShape).toEqual({ total_logs: 2 });

    // Overtaken by a later retry.
    const again = held<unknown>();
    mockService.fetchAnalyticsSummary.mockImplementationOnce(() => again.promise).mockResolvedValueOnce({ total_logs: 4 });
    await act(async () => { retried = result.current.retrySummary(); });
    await act(async () => { await result.current.retrySummary(); });
    await act(async () => { again.resolve({ total_logs: 3 }); await retried; });
    expect(result.current.analyticsShape).toEqual({ total_logs: 4 });
  });
});

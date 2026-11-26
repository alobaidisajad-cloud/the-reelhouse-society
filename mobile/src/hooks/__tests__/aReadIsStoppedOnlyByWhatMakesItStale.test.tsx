/**
 * aReadIsStoppedOnlyByWhatMakesItStale.test.tsx — the reads of a member's file,
 * and what may cancel each.
 *
 * Every read on the file shared one cancel switch, and every pull, return to
 * your own file and filtered read threw it. A room's read cancelled that way
 * left its room marked loaded with nothing in it: a Projector opened a moment
 * before a pull stood empty until the next. Each read is now cancelled only by
 * what makes it stale: the member's row by the next read of it, a room's reads
 * by that room's next filtered read, and all of them by leaving the member.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useProfileData } from '../useProfileData';

/** A read that answers when told to — or, like a real one, throws AbortError when its signal is aborted. */
function held<T>() {
  const calls: { signal?: AbortSignal; answer: (v: T) => void }[] = [];
  const fn = jest.fn((...args: unknown[]) => new Promise<T>((resolve, reject) => {
    const signal = args.find((a): a is AbortSignal => a instanceof AbortSignal);
    signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
    calls.push({ signal, answer: resolve });
  }));
  return { fn, calls };
}

const mockService: Record<string, jest.Mock> = {
  fetchProfile: jest.fn(),
  fetchCounts: jest.fn(async () => ({ logs: 3, ledger: 0, watchlist: 9, vault: 0, lists: 0, followers: 1, following: 1 })),
  fetchAnalyticsSummary: jest.fn(async () => null),
  fetchOtherUserLogs: jest.fn(async () => ({ items: [], nextCursor: null })),
};
jest.mock('@/src/services/ProfileDataService', () => ({
  ProfileDataService: new Proxy({}, { get: (_t, k: string) => mockService[k] ?? jest.fn(async () => null) }),
}));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

const MEMBER = { id: 'u9', username: 'vesper', tier: 'archivist', role: 'archivist', is_founding: false, is_social_private: false };

async function openFile() {
  const r = await renderHook(() => useProfileData({ username: 'vesper', isSelf: false, isFollowing: false, activeTab: null as never }));
  await waitFor(() => expect(r.result.current.targetUser?.id).toBe('u9'));
  return r.result;
}

beforeEach(() => {
  mockService.fetchProfile.mockResolvedValue(MEMBER);
});

it('a pull does not cancel a room being read: the Projector still arrives', async () => {
  const analytics = held<unknown>();
  mockService.fetchProfileAnalytics = analytics.fn;
  const result = await openFile();

  let room: Promise<void> | undefined;
  await act(async () => { room = result.current.loadTabData('projector'); });
  await act(async () => { await result.current.fetchUserData(); });
  expect(analytics.calls[0].signal?.aborted).toBe(false);

  await act(async () => { analytics.calls[0].answer({ total_films: 12 }); await room; });
  expect(result.current.serverAnalytics).toEqual({ total_films: 12 });
  expect(result.current.tabFailed.projector).toBeFalsy();
});

it('a search in one room does not cancel another room being read', async () => {
  const watchlist = held<{ items: unknown[]; nextCursor: null }>();
  mockService.fetchOtherUserWatchlist = watchlist.fn;
  const result = await openFile();

  let room: Promise<void> | undefined;
  await act(async () => { room = result.current.loadTabData('watchlist'); });
  await act(async () => { await result.current.refreshTabWithFilters('archive', { status: 'all', search: 'noir', titleOnly: true }); });
  expect(watchlist.calls[0].signal?.aborted).toBe(false);

  await act(async () => { watchlist.calls[0].answer({ items: [{ id: 1, title: 'Laura' }], nextCursor: null }); await room; });
  expect(result.current.watchlist).toEqual([{ id: 1, title: 'Laura' }]);
});

it('a room opened with no filter is read once, not again by an empty search', async () => {
  mockService.fetchOtherUserWatchlist = jest.fn(async () => ({ items: [{ id: 1, title: 'Laura' }], nextCursor: null }));
  const result = await openFile();

  await act(async () => { await result.current.loadTabData('watchlist'); });
  // What the screen sends when a room opens: its filters, all at rest.
  await act(async () => { await result.current.refreshTabWithFilters('watchlist', { search: '', sort: 'default', decade: null }); });
  expect(mockService.fetchOtherUserWatchlist).toHaveBeenCalledTimes(1);
  expect(result.current.watchlist).toEqual([{ id: 1, title: 'Laura' }]);
});

it('but a cleared search is read again, unfiltered', async () => {
  mockService.fetchOtherUserWatchlist = jest.fn(async (_u: string, _l: number, _c: unknown, _s: unknown, f?: { search?: string }) => (
    { items: f?.search ? [{ id: 2, title: 'Night and the City' }] : [{ id: 1, title: 'Laura' }, { id: 2, title: 'Night and the City' }], nextCursor: null }
  ));
  const result = await openFile();

  await act(async () => { await result.current.loadTabData('watchlist'); });
  await act(async () => { await result.current.refreshTabWithFilters('watchlist', { search: 'night', sort: 'default', decade: null }); });
  expect(result.current.watchlist).toHaveLength(1);
  await act(async () => { await result.current.refreshTabWithFilters('watchlist', { search: '', sort: 'default', decade: null }); });
  expect(result.current.watchlist).toHaveLength(2);
});

it('a new search still cancels the more-rows read of the last one, so its rows never join the new', async () => {
  const pages = held<{ items: unknown[]; nextCursor: string | null }>();
  mockService.fetchOtherUserWatchlist = pages.fn;
  const result = await openFile();

  let read: Promise<void> | undefined;
  await act(async () => { read = result.current.refreshTabWithFilters('watchlist', { search: 'noir', sort: 'default', decade: null }); });
  await act(async () => { pages.calls[0].answer({ items: [{ id: 1, title: 'Laura' }], nextCursor: 'c1' }); await read; });

  let more: Promise<unknown> | undefined;
  await act(async () => { more = result.current.loadMoreWatchlist(); });
  await act(async () => { read = result.current.refreshTabWithFilters('watchlist', { search: 'city', sort: 'default', decade: null }); });
  expect(pages.calls[1].signal?.aborted).toBe(true);
  await act(async () => { pages.calls[2].answer({ items: [{ id: 2, title: 'Night and the City' }], nextCursor: null }); await read; await more; });
  expect(result.current.watchlist).toEqual([{ id: 2, title: 'Night and the City' }]);
});

/** A read whose answer is already on its way: its cancel comes too late to stop it. */
function unstoppable<T>() {
  const calls: { answer: (v: T) => void }[] = [];
  const fn = jest.fn(() => new Promise<T>((resolve) => { calls.push({ answer: resolve }); }));
  return { fn, calls };
}

describe('an answer already on its way when a newer read began is not laid', () => {
  it('a room\'s first read, answering after a search in it, is not laid over the search', async () => {
    const reads = unstoppable<{ items: unknown[]; nextCursor: null }>();
    mockService.fetchOtherUserWatchlist = reads.fn;
    const result = await openFile();
    let room: Promise<void> | undefined;
    let search: Promise<void> | undefined;
    await act(async () => { room = result.current.loadTabData('watchlist'); });
    await act(async () => { search = result.current.refreshTabWithFilters('watchlist', { search: 'city', sort: 'default', decade: null }); });
    await act(async () => { reads.calls[1]!.answer({ items: [{ id: 2, title: 'Night and the City' }], nextCursor: null }); await search; });
    await act(async () => { reads.calls[0]!.answer({ items: [{ id: 1, title: 'Laura' }], nextCursor: null }); await room; });
    expect(result.current.watchlist).toEqual([{ id: 2, title: 'Night and the City' }]);
  });

  it('a next page of the last search is not joined to the new one, nor does it end the new one\'s wait', async () => {
    const pages = unstoppable<{ items: unknown[]; nextCursor: string | null }>();
    mockService.fetchOtherUserWatchlist = pages.fn;
    const result = await openFile();
    let read: Promise<void> | undefined;
    await act(async () => { read = result.current.refreshTabWithFilters('watchlist', { search: 'noir', sort: 'default', decade: null }); });
    await act(async () => { pages.calls[0]!.answer({ items: [{ id: 1, title: 'Laura' }], nextCursor: 'c1' }); await read; });
    let more: Promise<unknown> | undefined;
    await act(async () => { more = result.current.loadMoreWatchlist(); });
    await act(async () => { read = result.current.refreshTabWithFilters('watchlist', { search: 'city', sort: 'default', decade: null }); });
    await act(async () => { pages.calls[1]!.answer({ items: [{ id: 9, title: 'Gilda' }], nextCursor: null }); await more; });
    expect([result.current.watchlist, result.current.isLoadingMore.watchlist]).toEqual([[{ id: 1, title: 'Laura' }], true]);
    await act(async () => { pages.calls[2]!.answer({ items: [{ id: 2, title: 'Night and the City' }], nextCursor: null }); await read; });
    expect([result.current.watchlist, result.current.isLoadingMore.watchlist]).toEqual([[{ id: 2, title: 'Night and the City' }], false]);
  });

  it('a search\'s failure, answering after a newer search began, is not said over it', async () => {
    const calls: { fail: () => void; answer: (v: unknown) => void }[] = [];
    mockService.fetchOtherUserWatchlist = jest.fn(() => new Promise((resolve, reject) => { calls.push({ fail: () => reject(new Error('timeout')), answer: resolve }); }));
    const result = await openFile();
    let first: Promise<void> | undefined;
    let second: Promise<void> | undefined;
    await act(async () => { first = result.current.refreshTabWithFilters('watchlist', { search: 'noir', sort: 'default', decade: null }); });
    await act(async () => { second = result.current.refreshTabWithFilters('watchlist', { search: 'city', sort: 'default', decade: null }); });
    await act(async () => { calls[1]!.answer({ items: [{ id: 2, title: 'Night and the City' }], nextCursor: null }); await second; });
    await act(async () => { calls[0]!.fail(); await first; });
    expect(result.current.tabFailed.watchlist).toBeFalsy();
  });

  it('the file\'s spinner stands for the next member while the last one\'s read lets go', async () => {
    const files = held<typeof MEMBER>();
    mockService.fetchProfile = files.fn;
    const r = await renderHook((p: { username: string }) => useProfileData({ username: p.username, isSelf: false, isFollowing: false, activeTab: null as never }), { initialProps: { username: 'vesper' } });
    await act(async () => { await r.rerender({ username: 'gilda' }); });
    expect(files.calls[0]!.signal?.aborted).toBe(true);
    await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
    expect(r.result.current.loading).toBe(true);
    await act(async () => { files.calls[1]!.answer({ ...MEMBER, id: 'u10', username: 'gilda' }); });
    await waitFor(() => expect(r.result.current.loading).toBe(false));
  });
});

it('and leaving the member cancels every read still out', async () => {
  const analytics = held<unknown>();
  mockService.fetchProfileAnalytics = analytics.fn;
  const r = await renderHook(() => useProfileData({ username: 'vesper', isSelf: false, isFollowing: false, activeTab: null as never }));
  await waitFor(() => expect(r.result.current.targetUser?.id).toBe('u9'));
  await act(async () => { void r.result.current.loadTabData('projector'); });
  await act(async () => { r.unmount(); });
  expect(analytics.calls[0].signal?.aborted).toBe(true);
});

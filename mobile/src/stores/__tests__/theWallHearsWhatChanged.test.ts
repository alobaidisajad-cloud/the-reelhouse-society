/**
 * theWallHearsWhatChanged.test.ts — what this phone does to a piece that may
 * hang in the Lobby, the Lobby hears.
 * ─────────────────────────────────────────────────────────────────────────────
 * The wall is kept (5 minutes fresh, kept on the phone, its tab never closed),
 * so a member who blocked the author of the featured log came back to find the
 * log still hanging — under a toast that said "Their content is now hidden".
 * The same for their own log deleted, their filing withdrawn, their stack made
 * private. Each such write, once the house has it (online, or when the queue
 * replays it), asks for the wall again: wallMayHaveChanged().
 */
jest.mock('@/src/lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'eq', 'neq', 'in', 'is', 'or', 'not', 'order', 'limit', 'range', 'gte', 'lte', 'lt', 'gt',
    'single', 'maybeSingle', 'insert', 'update', 'upsert', 'delete', 'abortSignal']) chain[k] = () => chain;
  // supabase-js answers a failed request with { error }, never a throw
  chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(mockOffline
      ? { data: null, error: { message: 'TypeError: Network request failed' } }
      : { data: [{ id: 'row' }], error: null, count: 0 }).then(res, rej);
  return {
    supabase: {
      from: () => chain,
      rpc: () => (mockOffline
        ? Promise.resolve({ data: null, error: { message: 'TypeError: Network request failed' } })
        : Promise.resolve({ data: null, error: null })),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: jest.fn(),
    },
  };
});
let mockOffline = false;
jest.mock('@/src/stores/auth', () => {
  const s = { user: { id: 'u1', username: 'kane' }, isAuthenticated: true };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as any).getState = () => s;
  (useAuthStore as any).subscribe = () => () => {};
  return { useAuthStore };
});
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [],
}));
jest.mock('@/src/utils/reelToast', () => {
  const t = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));

// eslint-disable-next-line import/first
import { queryClient } from '@/src/lib/queryClient';
// eslint-disable-next-line import/first
import { WALL_KEY } from '@/src/components/lobby/wallRead';
// eslint-disable-next-line import/first
import { useBlockStore } from '@/src/stores/blockStore';
// eslint-disable-next-line import/first
import { useFilmStore } from '@/src/stores/films';
// eslint-disable-next-line import/first
import { useDispatch } from '@/src/stores/dispatch';
// eslint-disable-next-line import/first
import { executeMutation } from '@/src/utils/mutationExecutor';

const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
/** How many times the wall was asked for again. */
const wallAsked = () => invalidate.mock.calls.filter(([f]) => JSON.stringify((f as { queryKey?: unknown })?.queryKey) === JSON.stringify(WALL_KEY)).length;

const LOG = { id: 'l1', filmId: 655, title: 'Paris, Texas', review: 'Long.', rating: 4, viewingHistory: [], createdAt: '2026-09-30T00:00:00Z' };
const STACK = { id: 's1', title: 'Silents', description: '', isPrivate: false, isRanked: false, createdAt: '2026-09-30T00:00:00Z',
  films: [{ id: 11, title: 'Sunrise', poster: null }, { id: 22, title: 'Greed', poster: null }] };
const FILING = {
  id: 'f1', kind: 'take', authorId: 'u1', author: { name: 'kane', memberNo: 1, tier: 'free' },
  film: null, subjectId: null, subjectKind: null, title: null, body: 'A take.', fullContent: null,
  source: null, sourceUrl: null, options: null, closesAt: null, frozenTotals: null, answerId: null,
  seriesId: null, seriesTitle: null, partNumber: null, spoilerLabel: null, withheldAt: null, endedAt: null, endedBy: null,
  certifyCount: 0, commentCount: 0, createdAt: '2026-09-30T00:00:00Z', editedAt: null,
};

beforeEach(() => {
  mockOffline = false;
  invalidate.mockClear();
  useBlockStore.setState({ blocked: [], muted: [], _blockedIndex: new Set(), _mutedIndex: new Set() } as never);
  useFilmStore.setState({ logs: [LOG], _loggedIndex: {}, lists: [STACK], _updateLogMutex: false } as never);
  useDispatch.setState({ filings: [FILING], opened: {} } as never);
});

describe('a member blocked, muted or let back: the wall is asked again', () => {
  it.each([
    ['blocking', async () => { await useBlockStore.getState().blockUser('them'); }],
    ['unblocking', async () => { await useBlockStore.getState().blockUser('them'); invalidate.mockClear(); await useBlockStore.getState().unblockUser('them'); }],
    ['muting', async () => { await useBlockStore.getState().muteUser('them'); }],
    ['unmuting', async () => { await useBlockStore.getState().muteUser('them'); invalidate.mockClear(); await useBlockStore.getState().unmuteUser('them'); }],
  ])('%s', async (_what, act) => {
    await act();
    expect(wallAsked()).toBe(1);
  });
});

describe('a piece of theirs changed or gone: the wall is asked again', () => {
  it('a log deleted', async () => {
    await useFilmStore.getState().removeLog('l1');
    expect(wallAsked()).toBe(1);
  });

  it('a log amended (its words, rating or spoiler mark are what hangs)', async () => {
    await useFilmStore.getState().updateLog('l1', { review: 'Shorter.' } as never);
    expect(wallAsked()).toBe(1);
  });

  it('a stack amended, made private, emptied below four, or deleted', async () => {
    await useFilmStore.getState().updateList('s1', { isPrivate: true } as never);
    expect(wallAsked()).toBe(1);
    await useFilmStore.getState().removeFilmFromList('s1', 11);
    expect(wallAsked()).toBe(2);
    await useFilmStore.getState().deleteList('s1');
    expect(wallAsked()).toBe(3);
  });

  it('a filing amended (a spoiler mark is an amendment), or withdrawn', async () => {
    await useDispatch.getState().amend('f1', { spoilerLabel: 'The ending.' } as never);
    expect(wallAsked()).toBe(1);
    await useDispatch.getState().end('f1');
    expect(wallAsked()).toBe(2);
  });

  it('but not before the house has it: an edit queued offline asks when it replays', async () => {
    mockOffline = true;
    await useFilmStore.getState().updateLog('l1', { review: 'Offline.' } as never);
    expect(jest.requireMock('@/src/utils/offlineQueue').enqueueMutation).toHaveBeenCalledWith(expect.objectContaining({ type: 'update_log' }));
    expect(wallAsked()).toBe(0);
  });
});

describe('the queue, replaying them', () => {
  const replay = (type: string, payload: Record<string, unknown>) =>
    executeMutation({ id: 'q1', type, payload, timestamp: 0, retries: 0 } as never, {});

  it.each([
    ['remove_log', { log_id: 'l1', user_id: 'u1' }],
    ['update_log', { id: 'l1', updates: { review: 'Later.' } }],
    ['delete_list', { list_id: 's1' }],
    ['update_list', { list_id: 's1', updates: { is_private: true } }],
    ['remove_film_from_list', { list_id: 's1', film_id: 11 }],
    ['update_filing', { id: 'f1', user_id: 'u1', kind: 'take', updates: { spoiler_label: 'The ending.' } }],
    ['end_filing', { id: 'f1' }],
  ])('%s', async (type, payload) => {
    await replay(type, payload);
    expect(wallAsked()).toBe(1);
  });

  it('and only those: a film added to a stack does not take a piece down', async () => {
    await replay('add_film_to_list', { list_id: 's1', film_id: 33, film_title: 'Nosferatu', poster_path: null });
    expect(wallAsked()).toBe(0);
  });
});

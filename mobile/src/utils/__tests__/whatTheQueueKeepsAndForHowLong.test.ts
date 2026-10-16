/**
 * whatTheQueueKeepsAndForHowLong.test.ts — utils/offlineQueue.ts, what stays on the phone after a
 * send or a sign-out: a failed write is kept in the dead letter for less than a week, so one a week
 * old or older goes when the next failure is added; a write a day old leaves the queue unsent; a
 * write behind one the server failed for a moment keeps its own count of attempts; and at sign-out
 * another member's writes stay for them wherever they are — the dead letter, a queue key the sweep
 * has never heard of, and the queue itself, whose are kept for them as a send keeps them.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { clearOfflineQueue, flushOfflineQueue, getOfflineQueue, type QueuedMutation } from '../offlineQueue';
import { DEAD_LETTER_KEY, heldKey, QUEUE_KEY } from '../queueOwnership';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-16T12:00:00.000Z');

const mockHouse = supabaseFake({
  answer: { profiles: () => [{ id: ME, is_banned: false, suspended_until: null }] },
});
jest.mock('@/src/lib/supabase', () => ({
  get supabase() { return { ...mockHouse.client, auth: { getSession: async () => ({ data: { session: { user: { id: ME } } } }) } }; },
}));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: ME } }) } }));
jest.mock('@/src/utils/logger', () => ({ logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('../e2eTrace', () => ({ e2eTrace: jest.fn() }));
jest.mock('@/src/lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('@/src/stores/markCounts', () => ({ settleDelivered: jest.fn() }));
jest.mock('../reelToast', () => {
  const fn = jest.fn();
  (fn as unknown as { error: jest.Mock }).error = jest.fn();
  return { __esModule: true, default: fn };
});
jest.mock('expo-crypto', () => { let n = 0; return { randomUUID: () => `id-${++n}` }; });
jest.mock('@/src/stores/mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    storage: {
      set: jest.fn((k: string, v: string) => store.set(k, v)),
      getString: jest.fn((k: string) => store.get(k)),
      delete: jest.fn((k: string) => store.delete(k)),
      getAllKeys: jest.fn(() => [...store.keys()]),
    },
  };
});
jest.mock('../mutationExecutor', () => ({
  ...jest.requireActual('../mutationExecutor'),
  executeMutation: jest.fn(),
}));

const toast = (jest.requireMock('../reelToast') as { default: jest.Mock & { error: jest.Mock } }).default;
const { storage } = jest.requireMock('@/src/stores/mmkv-storage') as { storage: { set: jest.Mock; getString: jest.Mock; getAllKeys: jest.Mock; delete: jest.Mock } };
const { executeMutation } = jest.requireMock('../mutationExecutor') as { executeMutation: jest.Mock };

/** A write, as the store holds it. */
const stored = (m: Partial<QueuedMutation> & { id: string }): QueuedMutation =>
  ({ type: 'follow_user', payload: { user_id: OTHER }, timestamp: NOW - 1000, owner: ME, ...m }) as QueuedMutation;
const put = (key: string, list: QueuedMutation[]) => storage.set(key, JSON.stringify(list));
const read = (key: string): QueuedMutation[] => JSON.parse(storage.getString(key) ?? '[]');

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.setSystemTime(NOW);
  for (const k of [...storage.getAllKeys()]) storage.delete(k);
  jest.clearAllMocks();
  executeMutation.mockResolvedValue({});
});
afterEach(() => jest.useRealTimers());

describe('the dead letter', () => {
  it('keeps a failed write for less than a week: one a week old or older goes when the next failure is added', async () => {
    put(DEAD_LETTER_KEY, [
      stored({ id: 'eight-days', timestamp: NOW - 8 * DAY }),
      stored({ id: 'a-week', timestamp: NOW - 7 * DAY }),
      stored({ id: 'under-a-week', timestamp: NOW - 7 * DAY + 1 }),
    ]);
    put(QUEUE_KEY, [stored({ id: 'w' })]);
    executeMutation.mockRejectedValueOnce({ code: '42501', message: 'refused' });

    await flushOfflineQueue();

    expect(read(DEAD_LETTER_KEY).map((m) => m.id)).toEqual(['under-a-week', 'w']);
  });

  it('at sign-out, takes the member\'s own and keeps another member\'s wherever they are: the dead letter, a key it never heard of, the queue', () => {
    const shelf = `${QUEUE_KEY}_some_future_shelf`;
    put(shelf, [stored({ id: 'mine-on-a-shelf', type: 'add_log' }), stored({ id: 'theirs-on-a-shelf', type: 'add_log', owner: OTHER })]);
    put(DEAD_LETTER_KEY, [stored({ id: 'mine', type: 'add_critique' }), stored({ id: 'theirs', type: 'add_critique', owner: OTHER })]);
    put(QUEUE_KEY, [stored({ id: 'mine-queued', type: 'add_log' }), stored({ id: 'theirs-queued', type: 'add_log', owner: OTHER })]);

    clearOfflineQueue(ME);

    expect(read(DEAD_LETTER_KEY).map((m) => m.id)).toEqual(['theirs']);
    expect(read(shelf).map((m) => m.id)).toEqual(['theirs-on-a-shelf']);
    expect(read(heldKey(OTHER)).map((m) => m.id)).toEqual(['theirs-queued']);
    expect(getOfflineQueue()).toEqual([]);
  });

  it('at sign-out, a key that holds only the member\'s own goes whole', () => {
    const shelf = `${QUEUE_KEY}_some_future_shelf`;
    put(shelf, [stored({ id: 'mine-on-a-shelf', type: 'add_log' })]);

    clearOfflineQueue(ME);

    expect(storage.getString(shelf)).toBeUndefined();
    expect(storage.getString(heldKey(OTHER))).toBeUndefined();
  });
});

describe('the queue after a send', () => {
  it('a write a day old leaves the queue, unsent, and the member is told', async () => {
    put(QUEUE_KEY, [stored({ id: 'a-day', timestamp: NOW - DAY })]);

    await flushOfflineQueue();

    expect(toast.error).toHaveBeenCalledWith('A change made offline was over a day old, and not sent.');
    expect(executeMutation).not.toHaveBeenCalled();
    expect(getOfflineQueue()).toEqual([]);
  });

  it('a write behind one the server failed for a moment keeps its own count of attempts', async () => {
    put(QUEUE_KEY, [stored({ id: 'w' }), stored({ id: 'behind', _retryCount: 3 })]);
    executeMutation.mockRejectedValueOnce(Object.assign(new Error('Internal Server Error'), { status: 500 }));

    await flushOfflineQueue();

    expect(getOfflineQueue().map((m) => [m.id, m._retryCount])).toEqual([['w', 1], ['behind', 3]]);
  });
});

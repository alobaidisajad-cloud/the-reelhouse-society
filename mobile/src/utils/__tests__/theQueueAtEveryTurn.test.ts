/**
 * theQueueAtEveryTurn.test.ts — utils/offlineQueue.ts, the real queue, at every turn of a send:
 * queued as the member signed in, a full queue dropping its oldest, a send under the member's own
 * session alone, a suspension holding the writes and a ban ending them, a day-old write dropped,
 * every kind of failure (no network, a broken statement, a duplicate, a moment's failure and its
 * fifth, a refusal), the dead letter's week and its fifty, the following feeds refreshed after a
 * follow, a send asked for during a send, and what the member and the log are told at each.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import {
  clearOfflineQueue, enqueueMutation, flushOfflineQueue, getOfflineQueue, unsentFor, type QueuedMutation,
} from '../offlineQueue';
import { DEAD_LETTER_KEY, QUEUE_KEY, heldKey } from '../queueOwnership';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-16T12:00:00.000Z');

let mockProfile: { is_banned: boolean; suspended_until: string | null } | 'unreached' | 'broken' = { is_banned: false, suspended_until: null };
const mockHouse = supabaseFake({
  answer: {
    profiles: () => {
      // As postgrest-js answers each: a fetch that failed, and a failure the server sent.
      if (mockProfile === 'unreached') return { code: '', message: 'TypeError: Network request failed' };
      if (mockProfile === 'broken') return { code: 'XX000', message: 'the reply could not be read' };
      return [{ id: ME, ...mockProfile }];
    },
  },
});
let mockSession: { user: { id: string } } | null = { user: { id: ME } };
jest.mock('@/src/lib/supabase', () => ({
  get supabase() { return { ...mockHouse.client, auth: { getSession: async () => ({ data: { session: mockSession } }) } }; },
}));
let mockSignedIn: string | null = ME;
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: mockSignedIn ? { id: mockSignedIn } : null }) } }));
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

const { logger } = jest.requireMock('@/src/utils/logger') as { logger: { debug: jest.Mock; warn: jest.Mock; error: jest.Mock; info: jest.Mock } };
const { captureError } = jest.requireMock('@/src/lib/sentry') as { captureError: jest.Mock };
const { e2eTrace } = jest.requireMock('../e2eTrace') as { e2eTrace: jest.Mock };
const { queryClient } = jest.requireMock('@/src/lib/queryClient') as { queryClient: { invalidateQueries: jest.Mock } };
const { settleDelivered } = jest.requireMock('@/src/stores/markCounts') as { settleDelivered: jest.Mock };
const toast = (jest.requireMock('../reelToast') as { default: jest.Mock & { error: jest.Mock } }).default;
const { storage } = jest.requireMock('@/src/stores/mmkv-storage') as { storage: { set: jest.Mock; getString: jest.Mock; getAllKeys: jest.Mock; delete: jest.Mock } };
const { executeMutation } = jest.requireMock('../mutationExecutor') as { executeMutation: jest.Mock };

const follow = (user_id = OTHER) => ({ type: 'follow_user', payload: { user_id } } as never);
const endorse = (target_log_id = 'log-1') => ({ type: 'endorse_log', payload: { user_id: ME, type: 'log', target_log_id } } as never);
/** A queued write, written straight to the store. */
const stored = (m: Partial<QueuedMutation> & { type: QueuedMutation['type'] }): QueuedMutation =>
  ({ id: `s-${Math.random()}`, payload: { user_id: OTHER }, timestamp: NOW - 1000, owner: ME, ...m }) as QueuedMutation;
const put = (key: string, list: QueuedMutation[]) => storage.set(key, JSON.stringify(list));
const read = (key: string): QueuedMutation[] => JSON.parse(storage.getString(key) ?? '[]');
const warned = () => logger.warn.mock.calls.map((c) => c.map(String).join(' '));

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.setSystemTime(NOW);
  mockSession = { user: { id: ME } };
  mockSignedIn = ME;
  mockProfile = { is_banned: false, suspended_until: null };
  for (const k of [...storage.getAllKeys()]) storage.delete(k);
  jest.clearAllMocks();
  executeMutation.mockResolvedValue({});
});
afterEach(() => jest.useRealTimers());

describe('queuing', () => {
  it('queues nothing with nobody signed in, and says why', () => {
    mockSignedIn = null;
    enqueueMutation(follow());
    expect(getOfflineQueue()).toEqual([]);
    expect(warned()).toEqual(['[OfflineSync] follow_user not queued: nobody is signed in.']);
  });

  it('queues as the member signed in, and says so', () => {
    enqueueMutation(follow());
    expect(getOfflineQueue()).toEqual([{ type: 'follow_user', payload: { user_id: OTHER }, id: expect.any(String), timestamp: NOW, owner: ME }]);
    expect(logger.debug).toHaveBeenCalledWith('[OfflineSync] Queued follow_user for background sync.');
  });

  it('when full, drops the oldest to make room, names what it dropped, and tells the member', () => {
    const full = [stored({ id: 'a', type: 'endorse_log' }), stored({ id: 'b', type: 'follow_user' }), stored({ id: 'c', type: 'endorse_log' }),
      ...Array.from({ length: 99 }, (_, i) => stored({ id: `k${i}`, type: 'mark_watched' }))];
    put(QUEUE_KEY, full);
    enqueueMutation(follow());
    const q = getOfflineQueue();
    expect(q).toHaveLength(100);
    expect(q[0]?.id).toBe('k0');
    expect(q[99]?.type).toBe('follow_user');
    expect(warned()).toEqual(['[OfflineSync] Queue cap reached (100). Dropped 3 oldest: [endorse_log, follow_user]']);
    expect(toast.error).toHaveBeenCalledWith('Offline queue full — oldest action dropped.');
  });

  it('at ninety-nine, drops nothing', () => {
    put(QUEUE_KEY, Array.from({ length: 99 }, (_, i) => stored({ id: `k${i}`, type: 'mark_watched' })));
    enqueueMutation(follow());
    expect(getOfflineQueue()).toHaveLength(100);
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('a send, before anything goes', () => {
  it('reads nothing with nothing queued', async () => {
    await flushOfflineQueue();
    expect(mockHouse.asked).toEqual([]);
    expect(e2eTrace).toHaveBeenCalledWith('queue.flush', { queued: 0 });
  });

  it('sends nothing with no session, and keeps every write', async () => {
    enqueueMutation(follow());
    mockSession = null;
    await flushOfflineQueue();
    expect(executeMutation).not.toHaveBeenCalled();
    expect(getOfflineQueue()).toHaveLength(1);
    expect(logger.debug).toHaveBeenCalledWith('[OfflineSync] No active session — aborting flush.');
  });

  it('keeps another member\'s writes for them, unsent, and sends the member\'s own', async () => {
    put(QUEUE_KEY, [stored({ id: 'mine', type: 'follow_user' }), stored({ id: 'theirs', type: 'add_critique', owner: OTHER })]);
    await flushOfflineQueue();
    expect(executeMutation.mock.calls.map(([m]) => m.id)).toEqual(['mine']);
    expect(read(heldKey(OTHER)).map((m) => m.id)).toEqual(['theirs']);
    expect(getOfflineQueue()).toEqual([]);
    expect(warned()).toContain('[OfflineSync] 1 write(s) of another member kept for them, unsent.');
  });

  it('holds a suspended member\'s writes until the suspension ends, and sends them once it has', async () => {
    enqueueMutation(follow());
    mockProfile = { is_banned: false, suspended_until: new Date(NOW + 1000).toISOString() };
    await flushOfflineQueue();
    expect(executeMutation).not.toHaveBeenCalled();
    expect(getOfflineQueue()).toHaveLength(1);
    expect(warned()).toEqual(['[OfflineSync] Member is suspended — holding the queue until it ends.']);
    mockProfile = { is_banned: false, suspended_until: new Date(NOW).toISOString() };
    await flushOfflineQueue();
    expect(executeMutation).toHaveBeenCalledTimes(1);
  });

  it('ends a banned member\'s writes in the dead letter, keeps another\'s, and empties the queue', async () => {
    put(QUEUE_KEY, [stored({ id: 'mine', type: 'follow_user' }), stored({ id: 'theirs', type: 'add_critique', owner: OTHER })]);
    mockProfile = { is_banned: true, suspended_until: new Date(NOW + DAY).toISOString() };
    await flushOfflineQueue();
    expect(executeMutation).not.toHaveBeenCalled();
    expect(read(DEAD_LETTER_KEY)).toEqual([expect.objectContaining({
      id: 'mine', payload: { user_id: OTHER, _failReason: 'user_banned_at_flush', _failedAt: new Date(NOW).toISOString() },
    })]);
    expect(read(heldKey(OTHER)).map((m) => m.id)).toEqual(['theirs']);
    expect(getOfflineQueue()).toEqual([]);
    expect(warned()).toContain('[OfflineSync] User is banned — purging write queue to dead-letter.');
  });

  it('goes on past a ban check the network did not answer, quietly, and stops at the first write the same way', async () => {
    enqueueMutation(follow());
    mockProfile = 'unreached';
    executeMutation.mockRejectedValue(new TypeError('Network request failed'));
    await flushOfflineQueue();
    expect(executeMutation).toHaveBeenCalledTimes(1);
    expect(warned()).toEqual(['[OfflineSync] Network failure on follow_user. Halting queue to preserve causality.']);
  });

  it('goes on past a ban check that failed otherwise, and says so', async () => {
    enqueueMutation(follow());
    mockProfile = 'broken';
    await flushOfflineQueue();
    expect(executeMutation).toHaveBeenCalledTimes(1);
    expect(warned()).toEqual(['[OfflineSync] Could not read the member\'s standing: the reply could not be read']);
  });

  it('drops a write a day old or older, unsent, and tells the member how many', async () => {
    put(QUEUE_KEY, [stored({ id: 'old', type: 'follow_user', timestamp: NOW - DAY }), stored({ id: 'young', type: 'follow_user', timestamp: NOW - DAY + 1 })]);
    await flushOfflineQueue();
    expect(executeMutation.mock.calls.map(([m]) => m.id)).toEqual(['young']);
    expect(warned()).toContain('[OfflineSync] Pruned 1 stale mutations (>24h old)');
    expect(toast.error).toHaveBeenCalledWith('A change made offline was over a day old, and not sent.');
    put(QUEUE_KEY, [stored({ type: 'follow_user', timestamp: NOW - 2 * DAY }), stored({ type: 'follow_user', timestamp: NOW - 3 * DAY })]);
    await flushOfflineQueue();
    expect(toast.error).toHaveBeenLastCalledWith('2 changes made offline were over a day old, and not sent.');
    expect(getOfflineQueue()).toEqual([]);
  });
});

describe('each write, as it goes', () => {
  it('sends each in order, says the archive is updated, and settles each one sent', async () => {
    enqueueMutation(endorse('log-1'));
    enqueueMutation(endorse('log-2'));
    await flushOfflineQueue();
    expect(executeMutation.mock.calls.map(([m]) => m.payload.target_log_id)).toEqual(['log-1', 'log-2']);
    expect(settleDelivered).toHaveBeenCalledTimes(2);
    expect(toast).toHaveBeenCalledWith('Archive updated with offline actions.');
    expect(getOfflineQueue()).toEqual([]);
    expect(e2eTrace).toHaveBeenLastCalledWith('queue.flush.done', { sent: 2, failed: 0, left: 0 });
    expect(logger.debug).toHaveBeenCalledWith('[OfflineSync] Flushing 2 queued mutations...');
  });

  it('refreshes the following feeds after a follow, and only after one', async () => {
    enqueueMutation(endorse());
    await flushOfflineQueue();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    for (const type of ['follow_user', 'follow_request_user', 'unfollow_user']) {
      queryClient.invalidateQueries.mockClear();
      enqueueMutation({ type, payload: { user_id: OTHER } } as never);
      await flushOfflineQueue();
      expect([type, queryClient.invalidateQueries.mock.calls]).toEqual([type, [[{ queryKey: ['feed', 'following'] }], [{ queryKey: ['feed', 'stacks', 'following'] }]]]);
    }
  });

  it('says so when the refresh after a follow fails, and the send still ends', async () => {
    queryClient.invalidateQueries.mockImplementationOnce(() => { throw new Error('gone'); });
    enqueueMutation(follow());
    await flushOfflineQueue();
    expect(warned()).toEqual(['[OfflineSync] post-flush feed invalidation failed: Error: gone']);
    expect(getOfflineQueue()).toEqual([]);
  });

  it('dead-letters a write that fails its schema, unsent, and tells the member', async () => {
    enqueueMutation({ type: 'endorse_log', payload: { user_id: ME } } as never);
    await flushOfflineQueue();
    expect(executeMutation).not.toHaveBeenCalled();
    const [dead] = read(DEAD_LETTER_KEY);
    expect(String(dead?.payload._failReason)).toMatch(/^schema: /);
    expect(warned()[0]).toMatch(/^\[OfflineSync\] Schema violation in endorse_log: /);
    expect(toast.error).toHaveBeenCalledWith('A change made offline could not be sent.');
  });

  it('gives a write made on the server its real id in every write still queued after it', async () => {
    enqueueMutation({ type: 'create_list', payload: { id: 'temp-1', user_id: ME, title: 'T' } } as never);
    enqueueMutation({ type: 'add_film_to_list', payload: { list_id: 'temp-1', film_id: 7 } } as never);
    executeMutation.mockResolvedValueOnce({ fakeId: 'temp-1', newId: 'real-1' }).mockRejectedValueOnce(new TypeError('Network request failed'));
    await flushOfflineQueue();
    expect(getOfflineQueue().map((m) => m.payload)).toEqual([{ list_id: 'real-1', film_id: 7 }]);
  });

  it('maps nothing when the server gave no real id', async () => {
    enqueueMutation({ type: 'create_list', payload: { id: 'temp-1', user_id: ME, title: 'T' } } as never);
    enqueueMutation({ type: 'add_film_to_list', payload: { list_id: 'temp-1', film_id: 7 } } as never);
    executeMutation.mockResolvedValueOnce({ fakeId: 'temp-1' }).mockRejectedValueOnce(new TypeError('Network request failed'));
    await flushOfflineQueue();
    expect(getOfflineQueue().map((m) => m.payload)).toEqual([{ list_id: 'temp-1', film_id: 7 }]);
  });
});

describe('each failure', () => {
  const failing = async (error: unknown, retryCount?: number) => {
    put(QUEUE_KEY, [stored({ id: 'w', type: 'follow_user', _retryCount: retryCount }), stored({ id: 'next', type: 'follow_user' })]);
    executeMutation.mockRejectedValueOnce(error);
    await flushOfflineQueue();
  };

  it('stops at no network and keeps that write and every one after it, in order', async () => {
    await failing(new TypeError('Network request failed'));
    expect(getOfflineQueue().map((m) => m.id)).toEqual(['w', 'next']);
    expect(e2eTrace).toHaveBeenCalledWith('queue.flush.halted', { type: 'follow_user', why: 'Network request failed' });
    expect(toast).not.toHaveBeenCalled();
  });

  it('dead-letters a broken statement, reports it, and goes on', async () => {
    await failing(Object.assign(new Error('column "nope" does not exist'), { code: '42703' }));
    expect(read(DEAD_LETTER_KEY).map((m) => [m.id, m.payload._failReason])).toEqual([['w', 'schema: column "nope" does not exist']]);
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), { scope: 'offlineQueue.schemaError', mutationType: 'follow_user', pgCode: '42703' });
    expect(warned()).toEqual(['[OfflineSync] Permanent schema error on follow_user (code=42703). Dead-lettering.']);
    expect(executeMutation).toHaveBeenCalledTimes(2);
    expect(getOfflineQueue()).toEqual([]);
  });

  it('counts a write already on the server as delivered: by its code, its status, or PostgreSQL\'s words', async () => {
    for (const error of [{ code: '23505', message: 'x' }, { status: 409, message: 'x' }, { message: 'duplicate key value violates unique constraint "u"' }]) {
      await failing(error);
      expect([error, read(DEAD_LETTER_KEY), getOfflineQueue()]).toEqual([error, [], []]);
    }
  });

  it('keeps a write the server failed for a moment, counts the attempt, and stops there', async () => {
    await failing(Object.assign(new Error('Internal Server Error'), { status: 500 }));
    expect(getOfflineQueue().map((m) => [m.id, m._retryCount])).toEqual([['w', 1], ['next', undefined]]);
    expect(warned()).toEqual(['[OfflineSync] Transient failure on follow_user (status=500, code=undefined), attempt 1/5. Halting to retry on next flush.']);
  });

  it('gives up on the fifth such failure, dead-letters it, and sends what follows', async () => {
    await failing(Object.assign(new Error('Internal Server Error'), { status: 500 }), 4);
    expect(read(DEAD_LETTER_KEY).map((m) => [m.id, m.payload._failReason])).toEqual([['w', 'transient-exhausted: Internal Server Error']]);
    expect(warned()).toEqual(['[OfflineSync] Transient failure on follow_user exhausted 5 retries (status=500, code=undefined). Dead-lettering.']);
    expect(getOfflineQueue()).toEqual([]);
  });

  it('dead-letters a refusal with its words, whatever shape the failure took, and goes on', async () => {
    await failing({ code: '42501', message: 'new row violates row-level security policy' });
    expect(read(DEAD_LETTER_KEY).map((m) => m.payload._failReason)).toEqual(['new row violates row-level security policy']);
    await failing('a plain refusal');
    expect(read(DEAD_LETTER_KEY).map((m) => m.payload._failReason)).toEqual(['new row violates row-level security policy', 'a plain refusal']);
    expect(toast.error).toHaveBeenLastCalledWith('A change made offline could not be sent.');
  });
});

describe('the dead letter', () => {
  it('keeps a failed write a week, and the last fifty', async () => {
    put(DEAD_LETTER_KEY, [stored({ id: 'eight-days', type: 'follow_user', timestamp: NOW - 8 * DAY }),
      ...Array.from({ length: 50 }, (_, i) => stored({ id: `d${i}`, type: 'follow_user', timestamp: NOW - 2 * DAY }))]);
    await failing2();
    const dead = read(DEAD_LETTER_KEY).map((m) => m.id);
    expect(dead).toHaveLength(50);
    expect(dead).not.toContain('eight-days');
    expect(dead[0]).toBe('d1');
    expect(dead[49]).toBe('w');
  });

  async function failing2() {
    put(QUEUE_KEY, [stored({ id: 'w', type: 'follow_user' })]);
    executeMutation.mockRejectedValueOnce({ code: '42501', message: 'refused' });
    await flushOfflineQueue();
  }
});

describe('the member\'s own', () => {
  it('counts what signing out would erase: their queued and kept writes, and their failed words', () => {
    put(QUEUE_KEY, [stored({ type: 'follow_user' }), stored({ type: 'follow_user', owner: OTHER })]);
    put(heldKey(ME), [stored({ type: 'follow_user' })]);
    put(DEAD_LETTER_KEY, [stored({ type: 'add_critique' }), stored({ type: 'follow_user' }), stored({ type: 'add_critique', owner: OTHER })]);
    expect(unsentFor(ME)).toEqual({ unsent: 2, failedWords: 1 });
    expect(unsentFor(OTHER)).toEqual({ unsent: 1, failedWords: 1 });
  });

  it('at sign-out, sweeps theirs and no one\'s, and keeps what is another member\'s', () => {
    put(QUEUE_KEY, [stored({ type: 'follow_user' })]);
    put(heldKey(OTHER), [stored({ type: 'follow_user', owner: OTHER })]);
    put(DEAD_LETTER_KEY, [stored({ id: 'mine', type: 'add_critique' }), stored({ id: 'theirs', type: 'add_critique', owner: OTHER })]);
    clearOfflineQueue(ME);
    expect(getOfflineQueue()).toEqual([]);
    expect(read(heldKey(OTHER))).toHaveLength(1);
    expect(read(DEAD_LETTER_KEY).map((m) => m.id)).toEqual(['theirs']);
  });

  it('at sign-out, says why when the phone\'s store could not be swept', () => {
    storage.getAllKeys.mockImplementationOnce(() => { throw new Error('locked'); });
    clearOfflineQueue(ME);
    expect(warned()).toEqual(['[OfflineSync] could not clear the queue on logout: Error: locked']);
  });
});

it('runs once more when a send is asked for during one, so the ask is not lost', async () => {
  enqueueMutation(follow());
  let release: () => void = () => {};
  executeMutation.mockImplementationOnce(() => new Promise((r) => { release = () => r({}); }));
  const first = flushOfflineQueue();
  await Promise.resolve();
  await Promise.resolve();
  await flushOfflineQueue();
  expect(e2eTrace).toHaveBeenCalledWith('queue.flush.again');
  enqueueMutation(follow(ME));
  release();
  await first;
  for (let i = 0; i < 20 && executeMutation.mock.calls.length < 2; i += 1) await Promise.resolve();
  expect(executeMutation).toHaveBeenCalledTimes(2);
});

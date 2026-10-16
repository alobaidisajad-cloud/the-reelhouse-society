/**
 * aQueueSendsOnlyItsOwnMembersWrites.test.ts — utils/offlineQueue.ts sends, ends and counts only
 * the signed-in member's own writes. A write of another member that reaches the queue while the
 * send waits on the server's answer about this member is never sent under this member's session,
 * never put in this member's dead letter, and never kept as this member's: it waits for its own
 * member. A banned member with nothing of their own queued leaves the dead letter as it was, and a
 * send with nothing of the member's own left goes no further. What signing out would erase is
 * counted for the one member asked about alone.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { flushOfflineQueue, getOfflineQueue, unsentFor, type QueuedMutation } from '../offlineQueue';
import { DEAD_LETTER_KEY, QUEUE_KEY, heldKey } from '../queueOwnership';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-10-16T12:00:00.000Z');

let mockProfile: { is_banned: boolean; suspended_until: string | null } = { is_banned: false, suspended_until: null };
/** What happens on the phone while the server is asked about the member. */
let mockWhileAsked: (() => void) | null = null;
const mockHouse = supabaseFake({
  answer: {
    profiles: () => {
      mockWhileAsked?.();
      return [{ id: ME, ...mockProfile }];
    },
  },
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

const { logger } = jest.requireMock('@/src/utils/logger') as { logger: { debug: jest.Mock; warn: jest.Mock; error: jest.Mock; info: jest.Mock } };
const { e2eTrace } = jest.requireMock('../e2eTrace') as { e2eTrace: jest.Mock };
const { storage } = jest.requireMock('@/src/stores/mmkv-storage') as { storage: { set: jest.Mock; getString: jest.Mock; getAllKeys: jest.Mock; delete: jest.Mock } };
const { executeMutation } = jest.requireMock('../mutationExecutor') as { executeMutation: jest.Mock };

/** A queued write, as the store holds it. */
const stored = (m: Partial<QueuedMutation> & { id: string; type: QueuedMutation['type'] }): QueuedMutation =>
  ({ payload: { user_id: OTHER }, timestamp: NOW - 1000, owner: ME, ...m }) as QueuedMutation;
const put = (key: string, list: QueuedMutation[]) => storage.set(key, JSON.stringify(list));
const read = (key: string): QueuedMutation[] => JSON.parse(storage.getString(key) ?? '[]');
const ids = (key: string) => read(key).map((m) => m.id);
/** Another member's writing, arriving in the live queue while the server is asked. */
const theirsArrives = (m: QueuedMutation) => () => put(QUEUE_KEY, [...read(QUEUE_KEY), m]);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.setSystemTime(NOW);
  mockProfile = { is_banned: false, suspended_until: null };
  mockWhileAsked = null;
  for (const k of [...storage.getAllKeys()]) storage.delete(k);
  jest.clearAllMocks();
  executeMutation.mockResolvedValue({});
});
afterEach(() => jest.useRealTimers());

describe('a banned member\'s send', () => {
  it('ends the member\'s own writes in the dead letter, and keeps for its member a write of theirs that arrived while the server was asked', async () => {
    put(QUEUE_KEY, [stored({ id: 'mine', type: 'add_log', payload: { user_id: ME, film_id: 1 } })]);
    mockWhileAsked = theirsArrives(stored({ id: 'theirs', type: 'add_log', owner: OTHER, payload: { user_id: OTHER, film_id: 2 } }));
    mockProfile = { is_banned: true, suspended_until: null };

    await flushOfflineQueue();

    expect(ids(DEAD_LETTER_KEY)).toEqual(['mine']);
    expect(ids(heldKey(OTHER))).toEqual(['theirs']);
    expect(storage.getString(heldKey(ME))).toBeUndefined();
    expect(getOfflineQueue()).toEqual([]);
    expect(executeMutation).not.toHaveBeenCalled();
  });

  it('with nothing of the member\'s own queued, keeps another member\'s write for them and leaves the dead letter as it was', async () => {
    put(QUEUE_KEY, [stored({ id: 'theirs', type: 'add_log', owner: OTHER, payload: { user_id: OTHER, film_id: 2 } })]);
    mockProfile = { is_banned: true, suspended_until: null };

    await flushOfflineQueue();

    expect(ids(heldKey(OTHER))).toEqual(['theirs']);
    expect(logger.warn).toHaveBeenCalledWith('[OfflineSync] User is banned — purging write queue to dead-letter.');
    expect(storage.getString(DEAD_LETTER_KEY)).toBeUndefined();
  });
});

describe('a member in good standing', () => {
  it('sends only their own: a write of another member that arrived while the server was asked stays in the queue, unsent', async () => {
    put(QUEUE_KEY, [stored({ id: 'mine', type: 'follow_user' })]);
    mockWhileAsked = theirsArrives(stored({ id: 'theirs', type: 'follow_user', owner: OTHER, payload: { user_id: ME } }));

    await flushOfflineQueue();

    expect(executeMutation.mock.calls.map(([m]: [QueuedMutation]) => m.id)).toEqual(['mine']);
    expect(getOfflineQueue().map((m) => [m.id, m.owner])).toEqual([['theirs', OTHER]]);
    expect(storage.getString(DEAD_LETTER_KEY)).toBeUndefined();
  });

  it('with only another member\'s writes queued, keeps them for that member and goes no further', async () => {
    put(QUEUE_KEY, [stored({ id: 'theirs', type: 'add_log', owner: OTHER, payload: { user_id: OTHER, film_id: 2 } })]);
    const askedBefore = mockHouse.asked.length;

    await flushOfflineQueue();

    expect(ids(heldKey(OTHER))).toEqual(['theirs']);
    expect(mockHouse.asked.slice(askedBefore).map((a) => a.table)).toEqual(['profiles']);
    expect(e2eTrace.mock.calls.map(([name]: [string]) => name)).toEqual(['queue.flush']);
    expect(logger.debug).not.toHaveBeenCalledWith('[OfflineSync] Flushing 0 queued mutations...');
    expect(executeMutation).not.toHaveBeenCalled();
  });
});

describe('what signing out would erase', () => {
  it('counts the one member\'s unsent writes and failed words, and no one else\'s', () => {
    put(QUEUE_KEY, [
      stored({ id: 'q1', type: 'follow_user' }),
      stored({ id: 'q2', type: 'add_log' }),
      stored({ id: 'q3', type: 'follow_user', owner: OTHER }),
    ]);
    put(heldKey(ME), [stored({ id: 'h1', type: 'add_log' })]);
    put(DEAD_LETTER_KEY, [
      stored({ id: 'd1', type: 'add_critique' }),
      stored({ id: 'd2', type: 'add_filing' }),
      stored({ id: 'd3', type: 'follow_user' }),
      stored({ id: 'd4', type: 'add_critique', owner: OTHER }),
    ]);

    expect(unsentFor(ME)).toEqual({ unsent: 3, failedWords: 2 });
    expect(unsentFor(OTHER)).toEqual({ unsent: 1, failedWords: 1 });
  });
});

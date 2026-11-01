/**
 * whatTheQueueKeepsAndForHowLong.test.ts — utils/offlineQueue.ts, what stays on the phone after a
 * send or a sign-out: a failed write is kept in the dead letter for less than a week, so one a week
 * old or older goes when the next failure is added; a write a day old by the house clock leaves the
 * queue unsent, and one queued minutes before a wrong phone clock was set right does not; a
 * write behind one the server failed for a moment keeps its own count of attempts; and at sign-out
 * another member's writes stay for them wherever they are — the dead letter, a queue key the sweep
 * has never heard of, and the queue itself, whose are kept for them as a send keeps them.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { clearOfflineQueue, enqueueMutation, flushOfflineQueue, getOfflineQueue, type QueuedMutation } from '../offlineQueue';
import { __forgetTheHouse, heardTheHouse } from '@/src/lib/houseClock';
import { DEAD_LETTER_KEY, heldKey, QUEUE_KEY } from '../queueOwnership';
import { readDraft, writeDraft } from '../memberDrafts';

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
let mockEncrypted = true;
jest.mock('@/src/stores/mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    isStorageEncrypted: () => mockEncrypted,
    withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
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
afterEach(() => { jest.useRealTimers(); __forgetTheHouse(); });

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
  // A toggle queued on a phone a day behind read as a day old the moment the phone was set right.
  it('ages a write by the house clock: one queued minutes ago on a phone a day behind is sent once the phone is set right', async () => {
    jest.setSystemTime(NOW - DAY);
    heardTheHouse(new Date(NOW).toUTCString(), NOW - DAY - 100, NOW - DAY + 100);
    expect(enqueueMutation({ type: 'follow_user', payload: { user_id: OTHER } } as Omit<QueuedMutation, 'id' | 'timestamp' | 'owner'>)).toBe(true);

    jest.setSystemTime(NOW + 5 * 60_000);
    heardTheHouse(new Date(NOW + 5 * 60_000).toUTCString(), NOW + 5 * 60_000 - 100, NOW + 5 * 60_000 + 100);
    await flushOfflineQueue();

    expect(executeMutation).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    expect(getOfflineQueue()).toEqual([]);
  });

  it('a write a day old leaves the queue, unsent, and the member is told', async () => {
    put(QUEUE_KEY, [stored({ id: 'a-day', timestamp: NOW - DAY })]);

    await flushOfflineQueue();

    expect(toast.error).toHaveBeenCalledWith('A change made offline was over a day old, and not sent.');
    expect(executeMutation).not.toHaveBeenCalled();
    expect(getOfflineQueue()).toEqual([]);
  });

  // Every write a day old was dropped, a member's log and critique among them (WORKLIST P4.32).
  it('sends a record and a take whatever their age, gives a day-old critique back to its box, and lets a toggle lapse', async () => {
    put(QUEUE_KEY, [
      stored({ id: 'log', type: 'add_log', payload: { user_id: ME, film_id: 129 }, timestamp: NOW - 3 * DAY }),
      stored({ id: 'critique', type: 'add_critique', payload: { _tempId: 't', user_id: ME, post_id: 'p', body: 'Kept.' }, timestamp: NOW - 2 * DAY }),
      stored({ id: 'take', type: 'add_filing', payload: { _tempId: 'f', user_id: ME, kind: 'take', body: 'A sentence.' }, timestamp: NOW - 2 * DAY }),
      stored({ id: 'follow', timestamp: NOW - DAY }),
    ]);

    await flushOfflineQueue();

    expect(executeMutation.mock.calls.map(([m]) => (m as QueuedMutation).id)).toEqual(['log', 'take']);
    expect(readDraft<{ body: string }>(ME, 'critique', 'p')?.data.body).toBe('Kept.');
    expect(toast).toHaveBeenCalledWith('A piece of writing made offline was over a day old: it is back where it was written, unsent.');
    expect(toast.error).toHaveBeenCalledWith('A change made offline was over a day old, and not sent.');
    expect(getOfflineQueue()).toEqual([]);
  });

  it('puts day-old words after what the member has written in the box since, never over it', async () => {
    writeDraft(ME, 'critique', { body: 'Newer.' }, 'log:L');
    put(QUEUE_KEY, [stored({ id: 'note', type: 'add_log_comment', payload: { log_id: 'L', user_id: ME, body: 'Older.' }, timestamp: NOW - 2 * DAY })]);

    await flushOfflineQueue();

    expect(readDraft<{ body: string }>(ME, 'critique', 'log:L')?.data.body).toBe('Newer.\n\nOlder.');
    expect(executeMutation).not.toHaveBeenCalled();
  });

  it('sends day-old words a phone cannot keep a draft for, rather than drop them', async () => {
    put(QUEUE_KEY, [stored({ id: 'message', type: 'send_lounge_message', payload: { lounge_id: 'R', user_id: ME, content: 'Still here.' }, timestamp: NOW - 2 * DAY })]);
    // The draft alone refused (a keystore gone mid-run): the queue itself still reads its own list.
    const refused = jest.spyOn(jest.requireActual<typeof import('../memberDrafts')>('../memberDrafts'), 'writeDraft').mockReturnValue(false);

    await flushOfflineQueue();
    refused.mockRestore();

    expect(executeMutation.mock.calls.map(([m]) => (m as QueuedMutation).id)).toEqual(['message']);
  });

  it('a write behind one the server failed for a moment keeps its own count of attempts', async () => {
    put(QUEUE_KEY, [stored({ id: 'w' }), stored({ id: 'behind', _retryCount: 3 })]);
    executeMutation.mockRejectedValueOnce(Object.assign(new Error('Internal Server Error'), { status: 500 }));

    await flushOfflineQueue();

    expect(getOfflineQueue().map((m) => [m.id, m._retryCount])).toEqual([['w', 1], ['behind', 3]]);
  });
});

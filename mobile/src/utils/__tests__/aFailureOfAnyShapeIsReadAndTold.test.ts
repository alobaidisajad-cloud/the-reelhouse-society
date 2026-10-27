/**
 * aFailureOfAnyShapeIsReadAndTold.test.ts — utils/offlineQueue.ts reads a failed write's error in
 * whatever shape it was thrown: a code is a broken statement only when it begins with 42 (and is
 * not the row rules' 42501); a thrown null is a refusal like any other, dead-lettered with the
 * send going on; an object with no message is told by its own words. In development the failure,
 * and a duplicate let go, are written to the console with the write's type, and outside
 * development they are not. A network failure's words reach the trace cut to eighty characters.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { classifyQueueError, flushOfflineQueue, getOfflineQueue, type QueuedMutation } from '../offlineQueue';
import { DEAD_LETTER_KEY, QUEUE_KEY } from '../queueOwnership';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
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
    isStorageEncrypted: () => true,
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

const { e2eTrace } = jest.requireMock('../e2eTrace') as { e2eTrace: jest.Mock };
const { storage } = jest.requireMock('@/src/stores/mmkv-storage') as { storage: { set: jest.Mock; getString: jest.Mock; getAllKeys: jest.Mock; delete: jest.Mock } };
const { executeMutation } = jest.requireMock('../mutationExecutor') as { executeMutation: jest.Mock };

const mine = (id: string): QueuedMutation =>
  ({ id, type: 'follow_user', payload: { user_id: OTHER }, timestamp: NOW - 1000, owner: ME }) as QueuedMutation;
const deadReasons = (): unknown[] =>
  (JSON.parse(storage.getString(DEAD_LETTER_KEY) ?? '[]') as QueuedMutation[]).map((m) => [m.id, m.payload._failReason]);
/** The first write fails with this; the one after it is sent. */
const failing = async (error: unknown) => {
  storage.set(QUEUE_KEY, JSON.stringify([mine('w'), mine('next')]));
  executeMutation.mockRejectedValueOnce(error);
  await flushOfflineQueue();
};
/** Runs as a release build would: `__DEV__` is read when the line runs. */
const outsideDevelopment = async (fn: () => Promise<void>) => {
  const g = global as unknown as { __DEV__: boolean };
  const before = g.__DEV__;
  g.__DEV__ = false;
  try { await fn(); } finally { g.__DEV__ = before; }
};

let consoleError: jest.SpyInstance;
let consoleWarn: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.setSystemTime(NOW);
  for (const k of [...storage.getAllKeys()]) storage.delete(k);
  jest.clearAllMocks();
  executeMutation.mockResolvedValue({});
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  consoleError.mockRestore();
  consoleWarn.mockRestore();
  jest.useRealTimers();
});

describe('a broken statement is a code that begins with 42', () => {
  it('only when it begins with 42, and never the row rules\' 42501', () => {
    expect(['42703', '42P10', '42501', '0420X', '2F042', 'XX420'].map((code) => [code, classifyQueueError(code, 'x', undefined)])).toEqual([
      ['42703', 'schema'], ['42P10', 'schema'], ['42501', 'other'], ['0420X', 'other'], ['2F042', 'other'], ['XX420', 'other'],
    ]);
  });
});

describe('a failure of an odd shape', () => {
  it('a thrown null is dead-lettered as "null", and the send goes on to the next write', async () => {
    await expect(failing(null)).resolves.toBeUndefined();
    expect(deadReasons()).toEqual([['w', 'null']]);
    expect(executeMutation.mock.calls.map(([m]: [QueuedMutation]) => m.id)).toEqual(['w', 'next']);
    expect(getOfflineQueue()).toEqual([]);
  });

  it('an object with no message is told by its own words', async () => {
    await failing({ code: 'P0001', toString: () => 'refused in its own words' });
    expect(deadReasons()).toEqual([['w', 'refused in its own words']]);
    expect(getOfflineQueue()).toEqual([]);
  });

  it('a network failure\'s words reach the trace cut to eighty characters', async () => {
    const words = `Network request failed: ${'the line went quiet and stayed so, '.repeat(4)}`;
    await failing(new TypeError(words));
    expect(e2eTrace).toHaveBeenCalledWith('queue.flush.halted', { type: 'follow_user', why: words.slice(0, 80) });
    expect(words.length).toBeGreaterThan(80);
    expect(getOfflineQueue().map((m) => m.id)).toEqual(['w', 'next']);
  });
});

describe('the console, in development and out of it', () => {
  it('in development, writes a failure to the console with the write\'s type', async () => {
    const error = { code: 'P0001', message: 'refused' };
    await failing(error);
    expect(consoleError).toHaveBeenCalledWith('[OfflineSync] Failed to execute follow_user:', error);
    expect(deadReasons()).toEqual([['w', 'refused']]);
  });

  it('outside development, writes no failure to the console', async () => {
    await outsideDevelopment(() => failing({ code: 'P0001', message: 'refused' }));
    expect(deadReasons()).toEqual([['w', 'refused']]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('in development, says a duplicate was let go, with the write\'s type', async () => {
    await failing({ code: '23505', message: 'x' });
    expect(consoleWarn).toHaveBeenCalledWith('[OfflineSync] Discarding duplicate mutation: follow_user');
    expect(getOfflineQueue()).toEqual([]);
  });

  it('outside development, says nothing of a duplicate', async () => {
    await outsideDevelopment(() => failing({ code: '23505', message: 'x' }));
    expect(getOfflineQueue()).toEqual([]);
    expect(storage.getString(DEAD_LETTER_KEY)).toBeUndefined();
    expect(consoleWarn).not.toHaveBeenCalled();
  });
});

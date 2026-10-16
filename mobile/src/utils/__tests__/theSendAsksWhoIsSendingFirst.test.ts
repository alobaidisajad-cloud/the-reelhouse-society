/**
 * theSendAsksWhoIsSendingFirst.test.ts — before utils/offlineQueue.ts sends anything it asks who
 * is sending: a stored session that names no member sends nothing and ends quietly; the server is
 * asked for the member's ban and suspension alone, by the member's own id, as one row; and a
 * member whose profile row the server does not return is neither banned nor suspended, so the
 * queue is sent, and the standing that went unread is said.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { flushOfflineQueue, getOfflineQueue, type QueuedMutation } from '../offlineQueue';
import { QUEUE_KEY } from '../queueOwnership';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-10-16T12:00:00.000Z');

/** The member's profile row as the server holds it; null when it returns none. */
let mockProfile: { is_banned: boolean; suspended_until: string | null } | null = { is_banned: false, suspended_until: null };
const mockHouse = supabaseFake({
  answer: { profiles: () => (mockProfile ? [{ id: ME, ...mockProfile }] : []) },
});
let mockSession: unknown = { user: { id: ME } };
jest.mock('@/src/lib/supabase', () => ({
  get supabase() { return { ...mockHouse.client, auth: { getSession: async () => ({ data: { session: mockSession } }) } }; },
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
const { storage } = jest.requireMock('@/src/stores/mmkv-storage') as { storage: { set: jest.Mock; getString: jest.Mock; getAllKeys: jest.Mock; delete: jest.Mock } };
const { executeMutation } = jest.requireMock('../mutationExecutor') as { executeMutation: jest.Mock };

const mine = (id: string): QueuedMutation =>
  ({ id, type: 'follow_user', payload: { user_id: OTHER }, timestamp: NOW - 1000, owner: ME }) as QueuedMutation;
const warned = () => logger.warn.mock.calls.map((c) => c.map(String).join(' '));

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.setSystemTime(NOW);
  mockSession = { user: { id: ME } };
  mockProfile = { is_banned: false, suspended_until: null };
  for (const k of [...storage.getAllKeys()]) storage.delete(k);
  storage.set(QUEUE_KEY, JSON.stringify([mine('w')]));
  jest.clearAllMocks();
  executeMutation.mockResolvedValue({});
});
afterEach(() => jest.useRealTimers());

it('sends nothing under a stored session that names no member, keeps every write, and ends quietly', async () => {
  mockSession = { access_token: 't', user: null };

  await expect(flushOfflineQueue()).resolves.toBeUndefined();

  expect(logger.debug).toHaveBeenCalledWith('[OfflineSync] No active session — aborting flush.');
  expect(getOfflineQueue().map((m) => m.id)).toEqual(['w']);
  expect(executeMutation).not.toHaveBeenCalled();
});

it('asks the server for the member\'s ban and suspension alone, by their own id, as one row', async () => {
  const askedBefore = mockHouse.asked.length;

  await flushOfflineQueue();

  expect(mockHouse.asked.slice(askedBefore).map((a) => [a.table, a.op, a.columns, a.filters, a.one])).toEqual([
    ['profiles', 'select', ['is_banned', 'suspended_until'], [['eq', 'id', ME]], 'single'],
  ]);
  expect(executeMutation).toHaveBeenCalledTimes(1);
});

it('sends the queue of a member whose profile row the server does not return, and says the standing went unread', async () => {
  mockProfile = null;

  await flushOfflineQueue();

  expect(executeMutation.mock.calls.map(([m]: [QueuedMutation]) => m.id)).toEqual(['w']);
  expect(getOfflineQueue()).toEqual([]);
  expect(warned()).toEqual(['[OfflineSync] Could not read the member\'s standing: JSON object requested, multiple (or no) rows returned']);
});

/**
 * theQueueAtLaunch.test.ts — utils/offlineQueue.ts as a launch finds it, each case a fresh load of
 * the module: the screens' copy of the queue holds what the phone kept from before, and the first
 * send of the launch runs once, not twice.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import type { QueuedMutation } from '../offlineQueue';

const ME = '11111111-1111-4111-8111-111111111111';
const QUEUE_KEY = 'reelhouse-offline-mutations';

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

type Launch = {
  queue: typeof import('../offlineQueue');
  screens: typeof import('@/src/stores/offlineQueueStore');
  trace: jest.Mock;
};

/** A fresh launch: the phone's store holds `kept` before the queue's module first loads. */
const launch = (kept: QueuedMutation[]): Launch => {
  let loaded: Launch | null = null;
  jest.isolateModules(() => {
    const { storage } = jest.requireMock('@/src/stores/mmkv-storage') as { storage: { set: (k: string, v: string) => void } };
    if (kept.length > 0) storage.set(QUEUE_KEY, JSON.stringify(kept));
    const queue = jest.requireActual('../offlineQueue') as Launch['queue'];
    loaded = {
      queue,
      screens: jest.requireActual('@/src/stores/offlineQueueStore') as Launch['screens'],
      trace: (jest.requireMock('../e2eTrace') as { e2eTrace: jest.Mock }).e2eTrace,
    };
  });
  if (!loaded) throw new Error('the module did not load');
  return loaded;
};

it('the screens\' copy of the queue holds, from the start, what the phone kept from before', () => {
  const kept = [{ id: 'k1', type: 'add_log', payload: { user_id: ME, film_id: 1 }, timestamp: 1, owner: ME }] as QueuedMutation[];
  const { queue, screens } = launch(kept);
  expect(screens.useOfflineQueueStore.getState().queued).toEqual(kept);
  expect(queue.getOfflineQueue()).toEqual(kept);
});

it('the first send of a launch runs once', async () => {
  const { queue, trace } = launch([]);
  await queue.flushOfflineQueue();
  expect(trace.mock.calls).toEqual([['queue.flush', { queued: 0 }]]);
  expect(queue.getOfflineQueue()).toEqual([]);
});

/**
 * TWO HEARTS A MOMENT APART BOTH LAND (review round 13, interactionSlice).
 *
 * The house refused a member's second certification within a second of their first, and the phone
 * sprang the heart back with "Failed to certify entry." and a defect report. The house now paces
 * only what a script does, and says how long to wait (RH429): the phone waits a short wait and the
 * heart lands with nothing said; a long one keeps the heart and queues the certification to go once
 * the wait is over, never said as failed, never reported. And a certification that lands online lets
 * go a withdrawal of it still waiting in the queue from before, which sent after it would take the
 * certification back. Against the house as strict as it is (test-utils/supabaseFake).
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { captureError } from '@/src/lib/sentry';
import reelToast from '@/src/utils/reelToast';
import { useAuthStore } from '@/src/stores/auth';
import { useLogStore } from '@/src/stores/films';
import { storage } from '@/src/stores/mmkv-storage';
import { getOfflineQueue, type QueuedMutation } from '@/src/utils/offlineQueue';
import { QUEUE_KEY } from '@/src/utils/queueOwnership';

const ME = '33333333-3333-4333-8333-333333333333';
const LOG_1 = '44444444-4444-4444-8444-444444444441';
const LOG_2 = '44444444-4444-4444-8444-444444444442';
const LIST_1 = '55555555-5555-4555-8555-555555555551';

/** The house's answer to each certification asked, in turn: a row, or its pace. */
let mockPace: (ask: Ask) => { code: string; message: string } | null = () => null;
let mockInserts = 0;
const mockHouse = supabaseFake({
  session: null,
  answer: {
    interactions: (ask) => {
      if (ask.op !== 'insert') return [];
      mockInserts += 1;
      return mockPace(ask) ?? [];
    },
  },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('@/src/utils/reelToast', () => {
  const fn = jest.fn();
  Object.assign(fn, { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});

const paced = (seconds: number, scope: 'member' | 'target') =>
  ({ code: 'RH429', message: 'RATE_LIMITED', hint: String(seconds), details: scope }) as unknown as { code: string; message: string };
const errors = () => (reelToast as unknown as { error: jest.Mock }).error.mock.calls.map(([m]) => m);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  mockPace = () => null;
  mockInserts = 0;
  storage.delete(QUEUE_KEY);
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'cinephile', role: 'cinephile' } as never, isAuthenticated: true } as never);
  useLogStore.setState({ interactions: [], _endorsedIndex: {}, _listEndorsedIndex: {} } as never);
});
afterEach(() => {
  jest.useRealTimers();
  storage.delete(QUEUE_KEY);
  useLogStore.setState({ interactions: [], _endorsedIndex: {}, _listEndorsedIndex: {} } as never);
});

describe('a second heart a moment after the first', () => {
  it('waits out the house\'s short pace and lands, with nothing said and nothing reported', async () => {
    await useLogStore.getState().toggleEndorse(LOG_1);
    // The house asks the second to wait a second, once.
    let refusedOnce = false;
    mockPace = () => (refusedOnce ? null : ((refusedOnce = true), paced(1, 'member')));
    const second = useLogStore.getState().toggleEndorse(LOG_2);
    await jest.advanceTimersByTimeAsync(1000);
    await second;
    expect(mockInserts).toBe(3);
    expect(Object.keys(useLogStore.getState()._endorsedIndex).sort()).toEqual([LOG_1, LOG_2]);
    expect(errors()).toEqual([]);
    expect(captureError).not.toHaveBeenCalled();
    expect(getOfflineQueue()).toEqual([]);
  });

  it('asked to wait long, keeps the heart and queues the certification to go later, never said as failed', async () => {
    mockPace = () => paced(3600, 'target');
    await useLogStore.getState().toggleEndorse(LOG_2);
    expect(useLogStore.getState()._endorsedIndex[LOG_2]).toBeDefined();
    expect(getOfflineQueue().map((m) => [m.type, m.payload.target_log_id])).toEqual([['endorse_log', LOG_2]]);
    expect(errors()).toEqual([]);
    expect(captureError).not.toHaveBeenCalled();
  });

  it('a stack asked to wait long too', async () => {
    mockPace = () => paced(120, 'member');
    await useLogStore.getState().toggleListEndorse(LIST_1);
    expect(useLogStore.getState()._listEndorsedIndex[LIST_1]).toBeDefined();
    expect(getOfflineQueue().map((m) => [m.type, m.payload.target_list_id])).toEqual([['endorse_list', LIST_1]]);
    expect(errors()).toEqual([]);
    expect(captureError).not.toHaveBeenCalled();
  });
});

describe('a certification that lands online', () => {
  it('lets go a withdrawal of it still queued from before, so the queue never takes it back', async () => {
    const older: QueuedMutation = {
      id: 'older', type: 'remove_endorsement', timestamp: 1, owner: ME,
      payload: { user_id: ME, type: 'endorse_log', target_log_id: LOG_1 },
    };
    storage.set(QUEUE_KEY, JSON.stringify([older]));
    await useLogStore.getState().toggleEndorse(LOG_1);
    expect(mockInserts).toBe(1);
    expect(getOfflineQueue()).toEqual([]);
  });
});

/**
 * AN EDIT KEEPS WHAT CHANGED SINCE (SYN-28, WORKLIST P4.32).
 *
 * A stack edit is sent whole: its details and exactly its films. Queued on a phone and sent days
 * later, it replaced a stack another device had changed since, and a film added there was gone.
 * Now the edit carries the stack's time as the phone read it (read_at); save_stack refuses an
 * edit of a stack changed since (20261101_01, PT412), and the queue gives it back to the member.
 * Two edits of one stack queued offline both land: the second takes the first's answer.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { enqueueMutation, flushOfflineQueue, getOfflineQueue, readAtOf, type QueuedMutation } from '../offlineQueue';
import { whyRefused } from '../queueOwnership';

const ME = '11111111-1111-4111-8111-111111111111';
const STACK = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-11-01T12:00:00.000Z');
const THREE_DAYS_AGO = '2026-10-29T12:00:00.000000+00:00';

/** The stack as the house holds it: its time, and its films. */
let mockStack: { updatedAt: string; films: number[]; tick: number };
const asked: Record<string, unknown>[] = [];

/** save_stack as 20261101_01 makes it: an edit older than the stack is refused, and a saved one moves its time. */
const mockHouse = supabaseFake({
  answer: { profiles: () => [{ id: ME, is_banned: false, suspended_until: null }] },
  rpc: {
    save_stack: (args: Record<string, unknown>) => {
      asked.push(args);
      if (typeof args.p_read_at === 'string' && mockStack.updatedAt > args.p_read_at) {
        return { error: { code: 'PT412', message: 'This stack was changed after this phone read it.', details: null, hint: null } };
      }
      if (Array.isArray(args.p_films)) mockStack.films = (args.p_films as { film_id: number }[]).map((f) => f.film_id);
      mockStack.tick += 1;
      mockStack.updatedAt = `2026-11-01T12:00:0${mockStack.tick}.000000+00:00`;
      return { id: STACK, user_id: ME, title: 'A stack', updated_at: mockStack.updatedAt };
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

const { storage } = jest.requireMock('@/src/stores/mmkv-storage') as { storage: { getAllKeys: jest.Mock; delete: jest.Mock } };

/** An edit of the stack, read when its time was `readAt`: exactly these films. */
const edit = (films: number[], readAt: string) => enqueueMutation({
  type: 'update_list',
  payload: { list_id: STACK, user_id: ME, updates: {}, films: films.map((id) => ({ id, title: `Film ${id}` })), read_at: readAt },
} as Omit<QueuedMutation, 'id' | 'timestamp' | 'owner'>);

beforeEach(() => {
  // The date stood still; the executor's own yield (a 0 ms timeout) left to run.
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask', 'setTimeout', 'clearTimeout'] });
  jest.setSystemTime(NOW);
  for (const k of [...storage.getAllKeys()]) storage.delete(k);
  asked.length = 0;
  mockStack = { updatedAt: THREE_DAYS_AGO, films: [1], tick: 0 };
});
afterEach(() => jest.useRealTimers());

it('gives back an edit queued three days ago when another writer has added a film since, and the film stays', async () => {
  jest.setSystemTime(NOW - 3 * 86_400_000);
  edit([1], THREE_DAYS_AGO);
  jest.setSystemTime(NOW);
  // Another device adds a film; the stack's time moves (the list_items triggers).
  mockStack = { updatedAt: '2026-10-31T09:00:00.000000+00:00', films: [1, 2], tick: 0 };

  await flushOfflineQueue();

  expect(mockStack.films).toEqual([1, 2]);
  expect(asked.map((a) => a.p_read_at)).toEqual([THREE_DAYS_AGO]);
  const [held] = getOfflineQueue();
  expect([held?._held, whyRefused(held?._refusal)]).toEqual(['refused', 'This stack was changed after this phone read it.']);
});

it('lands two edits of one stack queued offline: the second takes the first\'s answer', async () => {
  edit([1, 2], THREE_DAYS_AGO);
  edit([1, 2, 3], THREE_DAYS_AGO);

  await flushOfflineQueue();

  expect(asked.map((a) => a.p_read_at)).toEqual([THREE_DAYS_AGO, '2026-11-01T12:00:01.000000+00:00']);
  expect(mockStack.films).toEqual([1, 2, 3]);
  expect(getOfflineQueue()).toEqual([]);
});

it('keeps the newer time on an edit left waiting when the send stops after the first', async () => {
  edit([1, 2], THREE_DAYS_AGO);
  edit([1, 2, 3], THREE_DAYS_AGO);
  let calls = 0;
  const real = mockHouse.client.rpc;
  const spy = jest.spyOn(mockHouse.client, 'rpc').mockImplementation(((fn: string, args: Record<string, unknown>) => {
    calls += 1;
    if (calls === 2) return Promise.reject(new TypeError('Network request failed'));
    return real(fn, args);
  }) as typeof real);

  await flushOfflineQueue();
  spy.mockRestore();

  expect(getOfflineQueue().map((m) => m.payload.read_at)).toEqual(['2026-11-01T12:00:01.000000+00:00']);
});

it('sends no time when the edit carries none, as an older build\'s does', async () => {
  enqueueMutation({ type: 'update_list', payload: { list_id: STACK, user_id: ME, updates: { title: 'Renamed' } } } as Omit<QueuedMutation, 'id' | 'timestamp' | 'owner'>);
  await flushOfflineQueue();
  expect(asked).toHaveLength(1);
  expect(asked[0]?.p_read_at).toBeUndefined();
  expect(JSON.parse(JSON.stringify(asked[0]))).not.toHaveProperty('p_read_at');
});

it('names a stack edit\'s row by its stack, and no other write\'s', () => {
  expect(readAtOf({ type: 'update_list', payload: { list_id: 'S', read_at: 'T' } })).toBe('list:S');
  expect(readAtOf({ type: 'update_list', payload: { list_id: 'S' } })).toBeNull();
  expect(readAtOf({ type: 'add_log', payload: { id: 'L', read_at: 'T' } })).toBeNull();
});

/**
 * theQueueStaysOffAnOpenDisk.test.ts — while the store is not encrypted, the offline queue is
 * held in memory alone (P4.14).
 *
 * With a keystore that failed or never answered, the launch runs on the placeholder store, which
 * is not encrypted. The queue carries the member's words (a critique, a salon message), and it
 * was written there in plain text. Now it, its dead letter and the writes kept for a member stay
 * in memory: sent while the app is open, lost if it closes first, as the member is told; nothing
 * of it reaches the disk.
 */
import { enqueueMutation, flushOfflineQueue, getOfflineQueue } from '../offlineQueue';
import { DEAD_LETTER_KEY, keepForOwners, readList, writeList } from '../queueOwnership';
import { storage } from '@/src/stores/mmkv-storage';
import { supabase } from '@/src/lib/supabase';
import { executeMutation } from '../mutationExecutor';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
let mockEncrypted = false;

jest.mock('@/src/stores/mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    storage: {
      set: jest.fn((k: string, v: string) => store.set(k, v)),
      getString: jest.fn((k: string) => store.get(k)),
      delete: jest.fn((k: string) => store.delete(k)),
      getAllKeys: jest.fn(() => [...store.keys()]),
    },
    isStorageEncrypted: () => mockEncrypted,
    withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  };
});
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' } }) } }));
jest.mock('../mutationExecutor', () => ({ ...jest.requireActual('../mutationExecutor'), executeMutation: jest.fn(async () => ({})) }));

const critique = { type: 'add_critique' as const, payload: { _tempId: 't1', post_id: 'p1', user_id: ME, body: 'Written with the store shut.' } };
const queueWrites = () => (storage.set as jest.Mock).mock.calls.filter(([k]) => String(k).startsWith('reelhouse-offline-mutations'));

beforeEach(() => {
  mockEncrypted = false;
  jest.clearAllMocks();
});

it('a critique queued offline is held, and never written to the disk', () => {
  enqueueMutation(critique);
  expect(getOfflineQueue().map((m) => m.payload.body)).toEqual(['Written with the store shut.']);
  expect(queueWrites()).toEqual([]);
});

it('and is sent when the network returns, in the same run', async () => {
  jest.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: { user: { id: ME } } }, error: null } as never);
  await flushOfflineQueue();
  expect((executeMutation as jest.Mock).mock.calls.map(([m]) => m.type)).toEqual(['add_critique']);
  expect([getOfflineQueue(), queueWrites()]).toEqual([[], []]);
});

it('its dead letter and the writes kept for another member are held too', () => {
  writeList(DEAD_LETTER_KEY, [{ id: 'd', type: 'add_log', payload: {}, timestamp: 1, owner: ME }]);
  keepForOwners([{ id: 'h', type: 'add_critique', payload: {}, timestamp: 1, owner: OTHER }]);
  expect([readList(DEAD_LETTER_KEY).length, queueWrites()]).toEqual([1, []]);
});

it('says NO once the store is encrypted: the queue is on the disk', () => {
  mockEncrypted = true;
  enqueueMutation(critique);
  expect(queueWrites().length).toBeGreaterThan(0);
});

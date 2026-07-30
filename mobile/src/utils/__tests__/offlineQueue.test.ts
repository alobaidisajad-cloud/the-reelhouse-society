/**
 * offlineQueue.test.ts — exercises the REAL queue.
 *
 * The previous version mocked Supabase and then asserted on objects it had
 * built itself, never importing the queue. This is the buffer that holds a
 * member's writes when the network drops — if it loses or reorders them, work
 * they believe is saved is gone — so it deserves tests that touch it.
 */
import {
  enqueueMutation,
  getOfflineQueue,
  getQueueLength,
  clearOfflineQueue,
} from '../offlineQueue';

jest.mock('@/src/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/src/utils/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock('../reelToast', () => {
  const fn = jest.fn();
  (fn as unknown as { error: jest.Mock }).error = jest.fn();
  (fn as unknown as { success: jest.Mock }).success = jest.fn();
  return { __esModule: true, default: fn };
});
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: jest.fn(() => `uuid-${++n}`) };
});
jest.mock('@/src/stores/mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    storage: {
      set: jest.fn((k: string, v: string) => store.set(k, v)),
      getString: jest.fn((k: string) => store.get(k)),
      delete: jest.fn((k: string) => store.delete(k)),
    },
  };
});

const mutation = (type: string) => ({ type, payload: { n: type } } as never);

beforeEach(() => clearOfflineQueue());

describe('offlineQueue — holding a write until the network returns', () => {
  it('starts empty', () => {
    expect(getQueueLength()).toBe(0);
    expect(getOfflineQueue()).toEqual([]);
  });

  it('keeps a queued mutation, with its payload intact', () => {
    enqueueMutation(mutation('add_log'));
    const [q] = getOfflineQueue();
    expect(q.type).toBe('add_log');
    expect(q.payload).toEqual({ n: 'add_log' });
  });

  it('stamps an id and a timestamp the caller does not supply', () => {
    // The flush loop dedupes on id and ages entries out by timestamp, so a
    // mutation without either would be flushed repeatedly or never expire.
    enqueueMutation(mutation('add_log'));
    const [q] = getOfflineQueue();
    expect(q.id).toBeTruthy();
    expect(typeof q.timestamp).toBe('number');
  });

  it('PRESERVES ORDER — causal consistency depends on it', () => {
    // A child mutation can depend on its parent's real id. Reordering here
    // would flush the child first and orphan it.
    ['a', 'b', 'c', 'd'].forEach(t => enqueueMutation(mutation(t)));
    expect(getOfflineQueue().map(m => m.type)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('survives a round trip through storage', () => {
    enqueueMutation(mutation('send_lounge_message'));
    // A second read re-parses from MMKV rather than returning a cached array.
    expect(getOfflineQueue()).toHaveLength(1);
    expect(getOfflineQueue()[0].type).toBe('send_lounge_message');
  });

  it('gives every mutation a distinct id', () => {
    ['a', 'b', 'c'].forEach(t => enqueueMutation(mutation(t)));
    const ids = getOfflineQueue().map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('clearOfflineQueue empties it', () => {
    enqueueMutation(mutation('a'));
    clearOfflineQueue();
    expect(getQueueLength()).toBe(0);
  });

  it('getQueueLength agrees with the queue itself', () => {
    ['a', 'b'].forEach(t => enqueueMutation(mutation(t)));
    expect(getQueueLength()).toBe(getOfflineQueue().length);
  });

  it('a corrupt store degrades to empty instead of throwing', () => {
    // MMKV contents are not a trusted input. Throwing here would break every
    // write path that enqueues, not just the read.
    const { storage } = require('@/src/stores/mmkv-storage');
    (storage.getString as jest.Mock).mockReturnValueOnce('{ not json');
    expect(() => getOfflineQueue()).not.toThrow();
  });
});

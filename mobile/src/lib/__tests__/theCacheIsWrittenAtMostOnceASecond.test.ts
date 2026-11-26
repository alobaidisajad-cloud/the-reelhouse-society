/**
 * The query cache, written to the phone at most once a second (round 13).
 *
 * React Query hands its persister the whole cache on every change: a read started, answered,
 * set or invalidated. Each was written at once: the whole cache serialised, its bytes counted
 * character by character and stored, many times while one screen loaded. Now the newest is held
 * and written once a second, at once when the app leaves the front, and never after the cache
 * was taken away.
 */
import { AppState } from 'react-native';
import { persistQueryClientSubscribe } from '@tanstack/react-query-persist-client';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { setSensitive, storage } from '@/src/stores/mmkv-storage';

jest.mock('@/src/stores/mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    storage: {
      set: jest.fn((k: string, v: string) => store.set(k, v)),
      getString: jest.fn((k: string) => store.get(k)),
      delete: jest.fn((k: string) => store.delete(k)),
      __store: store,
    },
    setSensitive: jest.fn((k: string, v: string) => store.set(k, v)),
    isStorageEncrypted: () => true,
    withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  };
});

/** What the app says to the cache's file when it leaves the front, heard before the file loads. */
const heard: ((state: string) => void)[] = [];
jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
  if (type === 'change') heard.push(listener as (state: string) => void);
  return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
});
// Loaded after the spy: its listener is laid when the file loads.
const { mmkvPersister, pastTheCeiling, writeHeldCache } = require('@/src/lib/queryClient') as typeof import('@/src/lib/queryClient');
// The member store, which a write reads lazily (memberNow), loaded here as the app has it loaded long
// before its first write: loaded inside the first test, its 1.4 s (alone) ran that test out of its
// limit on a loaded machine.
require('@/src/stores/auth');

const disk = (storage as unknown as { __store: Map<string, string> }).__store;
const written = () => JSON.parse(disk.get('REELHOUSE_QUERY_CACHE') ?? 'null') as
  { clientState: { queries: { queryKey: unknown[]; state: { data: unknown } }[] } } | null;

beforeEach(() => {
  jest.useFakeTimers();
  disk.clear();
  (setSensitive as jest.Mock).mockClear();
});
afterEach(() => {
  writeHeldCache();
  jest.useRealTimers();
});

it('a film opened, its read changing the cache again and again, is written once in that second, as it last stood', async () => {
  const client = testQueryClient();
  const stop = persistQueryClientSubscribe({ queryClient: client, persister: mmkvPersister, buster: 'b' });
  for (let page = 1; page <= 12; page++) client.setQueryData(['film', 550], { page });
  expect(setSensitive).not.toHaveBeenCalled();

  await jest.advanceTimersByTimeAsync(999);
  expect(setSensitive).not.toHaveBeenCalled();
  // Its second over, the write waits for the thread to be idle, at most two seconds more.
  await jest.advanceTimersByTimeAsync(1 + 2000);
  expect(setSensitive).toHaveBeenCalledTimes(1);
  const kept = written()?.clientState.queries[0];
  expect(kept).toBeDefined();
  expect(kept!.state.data).toEqual({ page: 12 });

  // A change in the next second is written in its turn.
  client.setQueryData(['film', 550], { page: 13 });
  await jest.advanceTimersByTimeAsync(1000 + 2000);
  expect(setSensitive).toHaveBeenCalledTimes(2);
  stop();
});

it('its turn come, the write waits for the JS thread to be idle (a fling is never held up by it), two seconds at most', async () => {
  const idle = jest.spyOn(globalThis, 'requestIdleCallback');
  try {
    await mmkvPersister.persistClient({ timestamp: 1, buster: 'b', clientState: { mutations: [], queries: [] } } as never);
    await jest.advanceTimersByTimeAsync(1000);
    expect(setSensitive).not.toHaveBeenCalled();
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
    await jest.advanceTimersByTimeAsync(2000);
    expect(setSensitive).toHaveBeenCalledTimes(1);
  } finally {
    idle.mockRestore();
  }
});

it('a cache held for one member is never written once another has signed in', async () => {
  const { useAuthStore } = require('@/src/stores/auth') as typeof import('@/src/stores/auth');
  useAuthStore.setState({ user: { id: 'member-a' } } as never);
  try {
    await mmkvPersister.persistClient({ timestamp: 1, buster: 'b', clientState: { mutations: [], queries: [] } } as never);
    useAuthStore.setState({ user: { id: 'member-b' } } as never);
    await jest.advanceTimersByTimeAsync(3000);
    expect(setSensitive).not.toHaveBeenCalled();
    // Held for the member signed in, it is written.
    await mmkvPersister.persistClient({ timestamp: 2, buster: 'b', clientState: { mutations: [], queries: [] } } as never);
    await jest.advanceTimersByTimeAsync(3000);
    expect(setSensitive).toHaveBeenCalledTimes(1);
  } finally {
    useAuthStore.setState({ user: null } as never);
  }
});

it('the app leaving the front writes what is held at once, where the phone may end it unseen', async () => {
  const client = testQueryClient();
  const stop = persistQueryClientSubscribe({ queryClient: client, persister: mmkvPersister, buster: 'b' });
  client.setQueryData(['lobby'], { wall: 'today' });
  expect(heard.length).toBeGreaterThan(0);
  heard.forEach((listener) => listener('background'));
  expect(setSensitive).toHaveBeenCalledTimes(1);
  expect(written()?.clientState.queries.map((q) => q.queryKey)).toEqual([['lobby']]);

  // Nothing is left waiting to write it again.
  await jest.advanceTimersByTimeAsync(1000);
  expect(setSensitive).toHaveBeenCalledTimes(1);
  stop();
});

it('a cache taken away is never put back by a write still waiting its turn', async () => {
  await mmkvPersister.persistClient({ timestamp: 1, buster: 'b', clientState: { mutations: [], queries: [] } } as never);
  await mmkvPersister.removeClient();
  await jest.advanceTimersByTimeAsync(1000);
  expect(setSensitive).not.toHaveBeenCalled();
  expect(disk.has('REELHOUSE_QUERY_CACHE')).toBe(false);
});

describe('the ceiling, decided by the length where the length decides it', () => {
  const MAX = 2 * 1024 * 1024;
  it('a string a third of the ceiling or shorter is under it, and one longer than the ceiling over it, its characters never counted', () => {
    const counted = jest.spyOn(String.prototype, 'charCodeAt');
    try {
      expect(pastTheCeiling('x'.repeat(Math.floor(MAX / 3)))).toBe(false);
      expect(pastTheCeiling('x'.repeat(MAX + 1))).toBe(true);
      expect(counted).not.toHaveBeenCalled();
    } finally {
      counted.mockRestore();
    }
  });

  it('between the two, the bytes are counted: CJK text past the ceiling is over it, plain text under it is not', () => {
    const between = Math.floor(MAX / 2);
    expect(pastTheCeiling('x'.repeat(between))).toBe(false);
    expect(pastTheCeiling('観'.repeat(between))).toBe(true);
  });
});

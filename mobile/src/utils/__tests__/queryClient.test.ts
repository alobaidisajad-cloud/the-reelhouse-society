/**
 * queryClient.test.ts — the app's own query client and its REAL MMKV persister:
 * how long a read stays fresh and is kept, how a failed read waits before it is
 * tried again, and the persister's safety rules, which stop a cold start
 * stalling on a huge or stale cache, bound to the code that runs at launch.
 */
import { AppState } from 'react-native';
import { focusManager, onlineManager, QueryObserver } from '@tanstack/react-query';
import { mmkvPersister, queryClient } from '@/src/lib/queryClient';
import { QUERY_POLICY, shouldRetry } from '@/src/lib/queryPolicy';
import { TmdbUnreachable } from '@/src/lib/tmdbErrors';
import { storage, setSensitive } from '@/src/stores/mmkv-storage';

type Connection = (state: { isConnected: boolean | null }) => void;
/** Kept on the mock itself: the import that registers it runs before this file's own lines. */
jest.mock('@react-native-community/netinfo', () => {
  const heard: { listener: Connection | null } = { listener: null };
  return {
    __esModule: true,
    default: {
      heard,
      addEventListener: (listener: Connection) => { heard.listener = listener; return () => {}; },
    },
  };
});
/** What queryClient.ts hands NetInfo: the phone's own word on the connection. */
const mockNetInfoListener: Connection = (state) =>
  jest.requireMock('@react-native-community/netinfo').default.heard.listener?.(state);

jest.mock('@/src/stores/mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    storage: {
      set: jest.fn((k: string, v: string) => store.set(k, v)),
      getString: jest.fn((k: string) => store.get(k)),
      delete: jest.fn((k: string) => store.delete(k)),
      __store: store,
    },
    // The persisted query cache holds fetched member data, so it writes through
    // setSensitive now — which refuses while storage is unencrypted. This suite
    // tests the size ceiling and round-trip, so it stands in for the encrypted
    // case; the refusal has its own test in encryptionAtRest.guard.test.ts.
    setSensitive: jest.fn((k: string, v: string) => store.set(k, v)),
    isStorageEncrypted: () => true,
    withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  };
});

const client = (over: Record<string, unknown> = {}) => ({
  timestamp: Date.now(),
  buster: '',
  clientState: { mutations: [], queries: [] },
  ...over,
}) as never;

beforeEach(() => jest.clearAllMocks());
// The app's own client keeps a query thirty minutes after its last observer
// goes: the queries these tests made leave with them.
afterEach(() => queryClient.clear());

describe('mmkvPersister — cache size ceiling', () => {
  it('persists an ordinary cache', async () => {
    await mmkvPersister.persistClient(client());
    // The persister writes through setSensitive now — the query cache holds
    // fetched member data. Same intent: it persisted.
    expect(setSensitive).toHaveBeenCalled();
  });

  it('REFUSES a cache over the 2 MB ceiling, and clears the old one', async () => {
    // Parsing a huge blob on the JS thread stalls the cold start — the exact
    // thing this cap exists to prevent. Dropping the cache is the right trade:
    // a slow launch is worse than a cold one.
    const huge = { timestamp: Date.now(), buster: '', clientState: { mutations: [], queries: [{ big: 'x'.repeat(3 * 1024 * 1024) }] } };
    await mmkvPersister.persistClient(huge as never);
    expect(setSensitive).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalled();
  });

  it('a whale\'s 3 MB cache over a saved one leaves nothing, whole or partial, and the next start reads afresh (P4.9)', async () => {
    const disk = (storage as unknown as { __store: Map<string, string> }).__store;
    await mmkvPersister.persistClient(client());
    expect(disk.has('REELHOUSE_QUERY_CACHE')).toBe(true);
    const whale = { timestamp: Date.now(), buster: '', clientState: { mutations: [], queries: [{ big: 'x'.repeat(3 * 1024 * 1024) }] } };
    await mmkvPersister.persistClient(whale as never);
    expect(disk.has('REELHOUSE_QUERY_CACHE')).toBe(false);
    await expect(mmkvPersister.restoreClient()).resolves.toBeUndefined();
  });

  /** A cache whose serialised form is `fill` plus a fixed frame; and that frame's UTF-8 size. */
  const filled = (fill: string) => client({ clientState: { mutations: [], queries: [{ big: fill }] } });
  const MAX = 2 * 1024 * 1024;
  const frame = Buffer.byteLength(JSON.stringify(filled('')), 'utf8');

  it('measures the bytes it would store: a cache of exactly 2 MB is kept, one byte more is not', async () => {
    await mmkvPersister.persistClient(filled('x'.repeat(MAX - frame)));
    expect(setSensitive).toHaveBeenCalledTimes(1);

    (setSensitive as jest.Mock).mockClear();
    await mmkvPersister.persistClient(filled('x'.repeat(MAX - frame + 1)));
    expect(setSensitive).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalled();
  });

  it('measures BYTES, not string length — CJK text cannot slip past the ceiling', async () => {
    // Each 観 is one UTF-16 unit and three UTF-8 bytes: this cache is just over
    // 2 MB stored, while its .length is barely a third of that.
    const fill = '観'.repeat(Math.ceil((MAX - frame + 1) / 3));
    expect(Buffer.byteLength(JSON.stringify(filled(fill)), 'utf8')).toBeGreaterThan(MAX);
    expect(JSON.stringify(filled(fill)).length * 2).toBeLessThan(MAX);
    await mmkvPersister.persistClient(filled(fill));
    expect(setSensitive).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalled();
  });

  it('counts a character outside the BMP as the four bytes it is, not six', async () => {
    // 🎬 is a surrogate pair: two UTF-16 units, four bytes. As many as fit are kept;
    // one more is refused.
    const fits = Math.floor((MAX - frame) / 4);
    await mmkvPersister.persistClient(filled('🎬'.repeat(fits)));
    expect(setSensitive).toHaveBeenCalledTimes(1);

    (setSensitive as jest.Mock).mockClear();
    await mmkvPersister.persistClient(filled('🎬'.repeat(fits + 1)));
    expect(setSensitive).not.toHaveBeenCalled();
  });
});

describe('mmkvPersister — restore', () => {
  it('returns undefined when nothing is cached', async () => {
    (storage.getString as jest.Mock).mockReturnValueOnce(undefined);
    await expect(mmkvPersister.restoreClient()).resolves.toBeUndefined();
  });

  it('a CORRUPT cache degrades to undefined rather than throwing', async () => {
    // This runs during app start. Throwing here would break launch itself.
    (storage.getString as jest.Mock).mockReturnValueOnce('{ not json');
    await expect(mmkvPersister.restoreClient()).resolves.toBeUndefined();
  });

  it('round-trips a real cache', async () => {
    const c = client({ clientState: { mutations: [], queries: [{ queryKey: ['film', 1], state: { data: 'Ozu' } }] } });
    await mmkvPersister.persistClient(c);
    const back = await mmkvPersister.restoreClient();
    expect(back).toEqual(c);
  });

  it('removeClient clears the cache', async () => {
    await mmkvPersister.removeClient();
    expect(storage.delete).toHaveBeenCalled();
  });

  it('writes for the speed lab each write\'s bytes and each read\'s characters, and the ms each held the thread', async () => {
    const e2e = jest.requireActual('@/src/utils/e2eTrace');
    const traced = jest.spyOn(e2e, 'e2eTrace').mockImplementation(() => {});
    const c = client({ clientState: { mutations: [], queries: [{ queryKey: ['film', 1], state: { data: 'Ozu' } }] } });
    await mmkvPersister.persistClient(c);
    await mmkvPersister.restoreClient();
    const length = JSON.stringify(c).length;
    expect(traced.mock.calls.filter(([e]) => String(e).startsWith('cache.'))).toEqual([
      ['cache.persist', { bytes: length, ms: expect.any(Number) }],
      ['cache.restore', { chars: length, ms: expect.any(Number) }],
    ]);
    traced.mockRestore();
  });
});

describe('the connection, as React Query hears it', () => {
  // The listener queryClient.ts gave NetInfo, taken before any mock is cleared.
  const connection = mockNetInfoListener;
  const settle = () => new Promise((res) => setTimeout(res, 0));

  it('hears the phone go offline and come back (a browser event never comes)', () => {
    expect(typeof jest.requireMock('@react-native-community/netinfo').default.heard.listener).toBe('function');
    connection({ isConnected: false });
    expect(onlineManager.isOnline()).toBe(false);
    connection({ isConnected: true });
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('takes an unknown connection (the first reading) as online', () => {
    connection({ isConnected: false });
    connection({ isConnected: null });
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('refetches what a screen shows when the connection returns', async () => {
    // As the app's PersistQueryClientProvider does: a mounted client listens.
    queryClient.mount();
    const read = jest.fn().mockResolvedValue('the page');
    const observer = new QueryObserver(queryClient, { queryKey: ['reconnect-test'], queryFn: read });
    const stop = observer.subscribe(() => {});
    await settle();
    expect(read).toHaveBeenCalledTimes(1);

    connection({ isConnected: false });
    connection({ isConnected: true });
    await settle();
    expect(read).toHaveBeenCalledTimes(2);
    stop();
    queryClient.unmount();
  });

  it('a read made with no connection FAILS (said), never pauses (read as "nothing there")', async () => {
    queryClient.mount();
    connection({ isConnected: false });
    const read = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    const observer = new QueryObserver(queryClient, { queryKey: ['offline-test'], queryFn: read });
    const stop = observer.subscribe(() => {});
    await settle();
    await settle();
    const r = observer.getCurrentResult();
    expect(read).toHaveBeenCalledTimes(1);   // asked, and not tried again: no connection to try with
    expect(r.fetchStatus).toBe('idle');
    expect(r.isError).toBe(true);

    // And the failed page mends itself when the connection returns.
    read.mockResolvedValue('the page');
    connection({ isConnected: true });
    await settle();
    await settle();
    expect(observer.getCurrentResult().data).toBe('the page');
    stop();
    queryClient.unmount();
  });

  it('a read that failed online, the connection gone before its one more try, still tries, fails and says so — never pauses', async () => {
    jest.useFakeTimers();
    try {
      queryClient.mount();
      const read = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
      const observer = new QueryObserver(queryClient, { queryKey: ['dropped-test'], queryFn: read });
      const stop = observer.subscribe(() => {});
      await jest.advanceTimersByTimeAsync(0);
      expect(read).toHaveBeenCalledTimes(1);
      connection({ isConnected: false });
      await jest.advanceTimersByTimeAsync(8000);
      const r = observer.getCurrentResult();
      expect([read.mock.calls.length, r.fetchStatus, r.isError]).toEqual([2, 'idle', true]);
      stop();
      queryClient.unmount();
    } finally {
      connection({ isConnected: true });
      jest.useRealTimers();
    }
  });

  it('an action taken with no connection fails, rather than waiting unseen', () => {
    expect(queryClient.getDefaultOptions().mutations?.networkMode).toBe('always');
  });
});

describe('queryClient — launch defaults', () => {
  it('is built from the one policy, which the clients tests build read too', () => {
    expect(queryClient.getDefaultOptions()).toEqual(QUERY_POLICY);
  });

  it('keeps a read fresh five minutes, and an unused one half an hour', () => {
    expect(QUERY_POLICY.queries.staleTime).toBe(300_000);
    expect(QUERY_POLICY.queries.gcTime).toBe(1_800_000);
  });

  it('waits a second before its one more try, and twice as long each time after, never more than eight', () => {
    expect([0, 1, 2, 3, 4, 10].map((attempt) => QUERY_POLICY.queries.retryDelay(attempt))).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });

  it('refetches on reconnect, and never reorders a feed on return to the app', () => {
    const d = queryClient.getDefaultOptions().queries;
    expect(d?.refetchOnReconnect).toBe('always');
    expect(d?.refetchOnWindowFocus).toBe(false);
  });

  it('retries once, and never what another try cannot mend', () => {
    mockNetInfoListener({ isConnected: true });
    const boom = new Error('server hiccup');
    expect(shouldRetry(0, boom)).toBe(true);
    expect(shouldRetry(1, boom)).toBe(false);
    // Already tried three times inside fetchTMDB.
    expect(shouldRetry(0, new TmdbUnreachable('/trending/movie/week', 'status 503'))).toBe(false);
    mockNetInfoListener({ isConnected: false });
    expect(shouldRetry(0, boom)).toBe(false);
    mockNetInfoListener({ isConnected: true });
  });

  it('keeps data fresh for a usable window without hammering the API', () => {
    const d = queryClient.getDefaultOptions().queries;
    expect(d?.staleTime).toBeGreaterThan(0);
    expect(d?.gcTime).toBeGreaterThan(d?.staleTime as number);
  });
});

describe('the app coming back to the front, as React Query hears it', () => {
  it('hears the app leave and return, so a read that asks to be current on return is read again', () => {
    // A phone has no window to focus: without the app's own word, React Query never heard a
    // return, and no read could ask to be fetched again on one.
    const heard: ((next: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      heard.push(listener as (next: string) => void);
      return { remove: () => { heard.splice(heard.indexOf(listener as (next: string) => void), 1); } } as ReturnType<typeof AppState.addEventListener>;
    });
    try {
      // The client's own setup, run again as React Query runs it: the last listener gone, a new one.
      focusManager.subscribe(() => {})();
      const off = focusManager.subscribe(() => {});
      expect(heard).toHaveLength(1);
      heard.forEach((l) => l('background'));
      expect(focusManager.isFocused()).toBe(false);
      heard.forEach((l) => l('active'));
      expect(focusManager.isFocused()).toBe(true);
      off();
    } finally {
      jest.restoreAllMocks();
    }
  });
});

// P4.11: a cache is painted only by the build and the update that wrote it.
describe('a saved cache, across builds and updates', () => {
  const { persistQueryClientRestore, persistQueryClientSave } = jest.requireActual('@tanstack/react-query-persist-client') as typeof import('@tanstack/react-query-persist-client');
  const { testQueryClient } = jest.requireActual('@/test-utils/testQueryClient') as typeof import('@/test-utils/testQueryClient');

  it('one saved by another build or update is never painted, and one saved by this one is', async () => {
    const writer = testQueryClient();
    writer.setQueryData(['film', 1], { title: 'Sunrise' });
    await persistQueryClientSave({ queryClient: writer, persister: mmkvPersister, buster: 'ios:41:update-a' });

    const after = testQueryClient();
    await persistQueryClientRestore({ queryClient: after, persister: mmkvPersister, buster: 'ios:42:update-b' });
    expect(after.getQueryData(['film', 1])).toBeUndefined();

    await persistQueryClientSave({ queryClient: writer, persister: mmkvPersister, buster: 'ios:41:update-a' });
    const same = testQueryClient();
    await persistQueryClientRestore({ queryClient: same, persister: mmkvPersister, buster: 'ios:41:update-a' });
    expect(same.getQueryData(['film', 1])).toEqual({ title: 'Sunrise' });
  });

  it('the cache\'s mark is the platform, its store build and the running update, never the app version alone', () => {
    const { CACHE_BUSTER } = jest.requireActual('@/src/lib/cacheBuster') as typeof import('@/src/lib/cacheBuster');
    const parts = CACHE_BUSTER.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe(require('react-native').Platform.OS);
    expect(parts[2]).not.toBe('');
  });
});

it('is restored at launch with that mark: the root hands it to the cache\'s provider (P4.11)', () => {
  const { readCode } = jest.requireActual('@/test-utils/readCode') as typeof import('@/test-utils/readCode');
  expect(readCode('app/_layout.tsx')).toMatch(/persistOptions=\{\{[^}]*buster: CACHE_BUSTER[^}]*\}\}/);
});

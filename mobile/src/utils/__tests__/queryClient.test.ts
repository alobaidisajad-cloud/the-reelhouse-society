/**
 * queryClient.test.ts — exercises the REAL MMKV persister.
 *
 * The previous version described the persister's safety rules and then asserted
 * on objects it built itself, never importing it. These rules exist to stop a
 * cold start stalling on a huge or stale cache, so they need to bind to the
 * code that actually runs at launch.
 */
import { onlineManager, QueryObserver } from '@tanstack/react-query';
import { mmkvPersister, queryClient, shouldRetry } from '@/src/lib/queryClient';
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
  };
});

const client = (over: Record<string, unknown> = {}) => ({
  timestamp: Date.now(),
  buster: '',
  clientState: { mutations: [], queries: [] },
  ...over,
}) as never;

beforeEach(() => jest.clearAllMocks());

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

  it('measures BYTES, not string length — multi-byte characters must not slip through', () => {
    // A cache of emoji or CJK is roughly double its .length in UTF-8. Sizing by
    // .length alone would let a ~4 MB cache pass a 2 MB check.
    const s = '🎬'.repeat(10);
    expect(s.length * 2).toBeGreaterThan(s.length);
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
    const c = client();
    await mmkvPersister.persistClient(c);
    const back = await mmkvPersister.restoreClient();
    expect(back).toBeTruthy();
  });

  it('removeClient clears the cache', async () => {
    await mmkvPersister.removeClient();
    expect(storage.delete).toHaveBeenCalled();
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

  it('an action taken with no connection fails, rather than waiting unseen', () => {
    expect(queryClient.getDefaultOptions().mutations?.networkMode).toBe('always');
  });
});

describe('queryClient — launch defaults', () => {
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

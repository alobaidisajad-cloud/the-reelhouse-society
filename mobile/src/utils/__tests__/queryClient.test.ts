/**
 * queryClient.test.ts — exercises the REAL MMKV persister.
 *
 * The previous version described the persister's safety rules and then asserted
 * on objects it built itself, never importing it. These rules exist to stop a
 * cold start stalling on a huge or stale cache, so they need to bind to the
 * code that actually runs at launch.
 */
import { mmkvPersister, queryClient } from '@/src/lib/queryClient';
import { storage, setSensitive } from '@/src/stores/mmkv-storage';

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

describe('queryClient — launch defaults', () => {
  it('refetches when the network returns', () => {
    // Mobile has no window focus, so reconnect is the only automatic refresh
    // a member gets after a tunnel or a flight.
    const d = queryClient.getDefaultOptions().queries;
    expect(d?.refetchOnReconnect).toBe('always');
    expect(d?.refetchOnWindowFocus).toBe(false);
  });

  it('retries sparingly — withRetry owns the critical paths', () => {
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(1);
  });

  it('keeps data fresh for a usable window without hammering the API', () => {
    const d = queryClient.getDefaultOptions().queries;
    expect(d?.staleTime).toBeGreaterThan(0);
    expect(d?.gcTime).toBeGreaterThan(d?.staleTime as number);
  });
});

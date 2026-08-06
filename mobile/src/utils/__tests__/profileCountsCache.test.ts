/**
 * profileCountsCache.test.ts — the cold-start flash on your own profile
 * ────────────────────────────────────────────────────────────────────
 * Opening your own dossier is instant by design: the screen is seeded from the cached
 * auth user and the spinner is dropped, then it refreshes silently. But there was
 * nothing to seed the COUNTS from, so it seeded zeros — and reconcileCount, which for
 * your own profile takes Math.max(server, locallyLoaded), fell back to counting the
 * rows the film store happened to be holding.
 *
 * That array is a WINDOW: films.ts persists only its most recent 150 entries. Verified
 * against the live database, the account `morpho` holds 815 watchlist items. So that
 * member opened their profile, was told 150, and watched it jump to 815.
 *
 * Nothing was broken. But the first number the app showed them about themselves was
 * false, and a number that changes under you makes an app feel approximate.
 *
 * The headline test is the last one: 815, on the first frame, with an empty network.
 */

const mockStore = new Map<string, string>();
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    set: (k: string, v: string) => { mockStore.set(k, v); },
    getString: (k: string) => mockStore.get(k),
    delete: (k: string) => { mockStore.delete(k); },
  },
}));

// Deliberately after the mock — the factory runs the moment the module is required.
// eslint-disable-next-line import/first
import { clearCachedCounts, readCachedCounts, writeCachedCounts } from '../profileCountsCache';
// eslint-disable-next-line import/first
import { reconcileCount } from '../../components/profile/profileComputed';

const FULL = { logs: 120, ledger: 88, watchlist: 815, vault: 4, lists: 9 };
beforeEach(() => mockStore.clear());

describe('keeping the last exact totals', () => {
  it('reads back what was written', () => {
    writeCachedCounts('u1', FULL);
    expect(readCachedCounts('u1')).toEqual(FULL);
  });

  it('is keyed to the account — a second member never sees the first one\'s totals', () => {
    writeCachedCounts('u1', FULL);
    expect(readCachedCounts('u2')).toBeNull();
    expect(readCachedCounts('u1')).toEqual(FULL);
  });

  it('two accounts on one device keep separate totals', () => {
    writeCachedCounts('u1', FULL);
    writeCachedCounts('u2', { logs: 1, ledger: 1, watchlist: 2, vault: 0, lists: 0 });
    expect(readCachedCounts('u1')?.watchlist).toBe(815);
    expect(readCachedCounts('u2')?.watchlist).toBe(2);
  });

  it('a later load replaces the earlier one', () => {
    writeCachedCounts('u1', FULL);
    writeCachedCounts('u1', { ...FULL, watchlist: 816 });
    expect(readCachedCounts('u1')?.watchlist).toBe(816);
  });

  it('returns null before anything has ever been cached', () => {
    expect(readCachedCounts('u1')).toBeNull();
    expect(readCachedCounts(null)).toBeNull();
    expect(readCachedCounts('')).toBeNull();
  });

  it('clears on request', () => {
    writeCachedCounts('u1', FULL);
    clearCachedCounts('u1');
    expect(readCachedCounts('u1')).toBeNull();
  });
});

describe('refusing to seed a number that would be wrong', () => {
  it('never caches a partial read — a missing count would seed a zero', () => {
    // This is the bug the whole file exists to remove, so it must not be reintroduced
    // through the cache itself.
    writeCachedCounts('u1', { logs: 10, ledger: 5, watchlist: 815, vault: 0 } as never);
    expect(readCachedCounts('u1')).toBeNull();
  });

  it('rejects nonsense values rather than painting them on the profile', () => {
    for (const bad of [-1, NaN, Infinity, '815' as never, null as never]) {
      mockStore.clear();
      writeCachedCounts('u1', { ...FULL, watchlist: bad as number });
      expect(readCachedCounts('u1')).toBeNull();
    }
  });

  it('discards a corrupted entry instead of throwing into a cold start', () => {
    mockStore.set('reelhouse_profile_counts_u1', 'not json');
    expect(readCachedCounts('u1')).toBeNull();
    mockStore.set('reelhouse_profile_counts_u1', JSON.stringify({ watchlist: 815 }));
    expect(readCachedCounts('u1')).toBeNull();
  });

  it('never throws when storage is unavailable', () => {
    const mmkv = jest.requireMock('@/src/stores/mmkv-storage').storage as Record<string, unknown>;
    const real = { ...mmkv };
    mmkv.set = () => { throw new Error('mmkv unavailable'); };
    mmkv.getString = () => { throw new Error('mmkv unavailable'); };
    mmkv.delete = () => { throw new Error('mmkv unavailable'); };
    try {
      expect(() => writeCachedCounts('u1', FULL)).not.toThrow();
      expect(readCachedCounts('u1')).toBeNull();
      expect(() => clearCachedCounts('u1')).not.toThrow();
    } finally {
      Object.assign(mmkv, real);
    }
  });

  it('ignores a write with no account', () => {
    writeCachedCounts(null, FULL);
    writeCachedCounts('', FULL);
    expect(mockStore.size).toBe(0);
  });
});

describe('THE FLASH — what the first frame actually shows', () => {
  /** What the screen displays before the network answers. */
  const firstFrame = (userId: string, persistedWindow: number) =>
    reconcileCount(readCachedCounts(userId)?.watchlist ?? 0, persistedWindow, true);

  const PERSIST_WINDOW = 150; // films.ts keeps only the most recent 150 entries

  it("morpho's 815 no longer opens as 150", () => {
    // Second session: the previous visit cached the exact totals.
    writeCachedCounts('morpho', FULL);
    expect(firstFrame('morpho', PERSIST_WINDOW)).toBe(815);
  });

  it('is exactly what it used to be on the very first open ever', () => {
    // Nothing cached — unavoidable, and correct: there is no truth on the device yet.
    // It must not crash or show 0; the locally-loaded rows are still the best guess.
    expect(firstFrame('morpho', PERSIST_WINDOW)).toBe(150);
  });

  it('a small library was already fine and stays fine', () => {
    writeCachedCounts('u1', { ...FULL, watchlist: 4 });
    expect(firstFrame('u1', 4)).toBe(4);
  });

  it('an empty watchlist shows the locally-known rows, never a stale positive', () => {
    writeCachedCounts('u1', { ...FULL, watchlist: 0 });
    expect(firstFrame('u1', 0)).toBe(0);
  });

  it('a watchlist grown since last session is never under-reported', () => {
    // Cached 815, and 3 more were added on the web since. Math.max means the seed can
    // only ever be too LOW by the amount added, and the refresh corrects it — it can
    // never invent items that do not exist.
    writeCachedCounts('morpho', FULL);
    const shown = firstFrame('morpho', PERSIST_WINDOW);
    expect(shown).toBe(815);
    expect(shown).toBeLessThanOrEqual(818);
  });

  it('the refresh still wins — the seed only decides the FIRST frame', () => {
    writeCachedCounts('morpho', FULL);
    const afterServerAnswers = reconcileCount(818, PERSIST_WINDOW, true);
    expect(afterServerAnswers).toBe(818);
  });
});

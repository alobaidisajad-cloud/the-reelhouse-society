/**
 * films.test.ts — exercises the REAL composed store and its real helpers.
 *
 * The previous version mocked Supabase and then asserted on object literals it
 * built itself: it "verified" rating boundaries, rewatch detection, watchlist
 * dedup and stats by re-implementing each rule inline. Every one of those could
 * have broken in the store and this suite would have stayed green.
 *
 * Complements __tests__/stores/filmStore.test.ts, which covers the CQRS index
 * invariants; this covers the derived state and the pure log helpers.
 */
import { useFilmStore } from '../films';
import { resolveFormat, sortLogs } from '../domain/logSlice/helpers/logOperations';

jest.mock('react-native', () => ({
  InteractionManager: { runAfterInteractions: jest.fn((cb) => cb()) },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })), currentState: 'active' },
  Platform: { OS: 'ios', select: jest.fn((o: Record<string, unknown>) => o.ios) },
  NativeModules: {},
  Alert: { alert: jest.fn() },
  Linking: { openURL: jest.fn() },
}));
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: jest.fn(), set: jest.fn(), delete: jest.fn(),
    contains: jest.fn(() => false), getAllKeys: jest.fn(() => []),
  })),
}));
jest.mock('../mmkv-storage', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn(), contains: jest.fn(() => false), getAllKeys: jest.fn(() => []), clearAll: jest.fn() },
  zustandMMKVStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
  createAsyncMMKVStorage: jest.fn(() => ({ getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() })),
  getSecureStorage: jest.fn().mockResolvedValue({ getString: jest.fn(), set: jest.fn(), delete: jest.fn(), contains: jest.fn(() => false) }),
}));
jest.mock('@/src/lib/supabase', () => ({
  supabase: { from: jest.fn(() => ({ select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis() })), auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) } },
}));
jest.mock('../auth', () => ({
  useAuthStore: { getState: jest.fn(() => ({ user: { id: 'u1', username: 'cinephile', role: 'member' } })) },
}));
jest.mock('@/src/utils/reelToast', () => {
  const fn = jest.fn();
  (fn as unknown as { error: jest.Mock }).error = jest.fn();
  (fn as unknown as { success: jest.Mock }).success = jest.fn();
  return { __esModule: true, default: fn };
});
jest.mock('@/src/utils/offlineQueue', () => ({ enqueueMutation: jest.fn(), getOfflineQueue: jest.fn(() => []) }));
jest.mock('@/src/utils/networkError', () => ({ isNetworkError: jest.fn(() => false) }));
jest.mock('@/src/utils/imagePrefetcher', () => ({ ImagePrefetcher: { preloadFilmBatch: jest.fn() } }));
jest.mock('@/src/lib/tmdb', () => ({ tmdb: { trending: jest.fn().mockResolvedValue({ results: [] }) } }));
jest.mock('@/src/utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), alert: jest.fn() } }));
jest.mock('@/src/lib/sentry', () => ({ addBreadcrumb: jest.fn(), captureError: jest.fn(), Sentry: { captureException: jest.fn() } }));
jest.mock('@/src/lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn(), setQueryData: jest.fn(), getQueryData: jest.fn() } }));
jest.mock('@/src/utils/sanitizeInput', () => ({ sanitizeInput: jest.fn((v: string) => v) }));
jest.mock('@/src/utils/requestReview', () => ({ maybeRequestReview: jest.fn() }));
jest.mock('@/src/utils/TactileEngine', () => ({ __esModule: true, default: { light: jest.fn(), medium: jest.fn(), heavy: jest.fn(), success: jest.fn() } }));
jest.mock('expo-crypto', () => { let n = 0; return { randomUUID: jest.fn(() => `uuid-${++n}`) }; });
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));

// DomainLog is camelCase (film.types.ts) — the DB's snake_case is mapped away
// before it reaches the store. Using the wrong shape here is how the first
// version of this test silently tied every comparison.
const log = (over: Record<string, unknown> = {}) => ({
  id: `l${Math.random()}`, filmId: 1, title: 'A', rating: 4, status: 'watched',
  watchedDate: '2024-01-01', createdAt: '2024-01-01T12:00:00Z', ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  useFilmStore.setState({ logs: [], watchlist: [], _loggedIndex: {}, _watchlistIndex: {} } as never);
});

describe('getCinephileStats — the standing shown on a profile', () => {
  const statsFor = (count: number) => {
    useFilmStore.setState({ logs: Array.from({ length: count }, (_, i) => log({ film_id: i })) } as never);
    return useFilmStore.getState().getCinephileStats();
  };

  it('names each rank at its exact threshold', () => {
    expect(statsFor(0).level).toBe('UNSEATED');
    expect(statsFor(1).level).toBe('FIRST REEL');
    expect(statsFor(10).level).toBe('THE REGULAR');
    expect(statsFor(25).level).toBe('MIDNIGHT DEVOTEE');
    expect(statsFor(100).level).toBe('THE ORACLE');
  });

  it('does not promote one film early', () => {
    // Off-by-one here would show a member a rank they have not reached.
    expect(statsFor(9).level).toBe('FIRST REEL');
    expect(statsFor(24).level).toBe('THE REGULAR');
    expect(statsFor(99).level).toBe('MIDNIGHT DEVOTEE');
  });

  it('counts the real log array', () => {
    expect(statsFor(7).count).toBe(7);
  });

  it('progress stays within 0-100 at every count', () => {
    for (const n of [0, 1, 9, 10, 24, 25, 99, 100, 500]) {
      const p = statsFor(n).progress;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });

  it('the top rank is fully achieved, not still climbing', () => {
    expect(statsFor(100).progress).toBe(100);
    expect(statsFor(5000).progress).toBe(100);
  });

  it('an override count wins over the array — used for optimistic display', () => {
    useFilmStore.setState({ logs: [] } as never);
    expect(useFilmStore.getState().getCinephileStats(42).level).toBe('MIDNIGHT DEVOTEE');
  });
});

describe('log helpers — the real exported ones', () => {
  it('resolveFormat maps each physical medium', () => {
    expect(resolveFormat('DVD')).toBe('dvd');
    expect(resolveFormat('Blu-Ray')).toBe('bluray');
    expect(resolveFormat('4K UHD')).toBe('4k');
    expect(resolveFormat('VHS')).toBe('vhs');
    expect(resolveFormat('Film Print')).toBe('filmprint');
  });

  it('resolveFormat falls back to digital for anything unrecognised', () => {
    // Never undefined: the column is written on every log.
    expect(resolveFormat(null)).toBe('digital');
    expect(resolveFormat(undefined)).toBe('digital');
    expect(resolveFormat('None')).toBe('digital');
    expect(resolveFormat('Betamax')).toBe('digital');
  });

  it('sortLogs puts the most recently watched first', () => {
    const sorted = sortLogs([
      log({ id: 'old', watchedDate: '2020-01-01' }),
      log({ id: 'new', watchedDate: '2024-06-01' }),
      log({ id: 'mid', watchedDate: '2022-01-01' }),
    ] as never);
    expect(sorted.map((l: { id: string }) => l.id)).toEqual(['new', 'mid', 'old']);
  });

  it('sortLogs falls back to createdAt when a film has no watch date', () => {
    // A log filed without a date must still land somewhere sensible rather
    // than sinking to the bottom of the diary.
    const sorted = sortLogs([
      log({ id: 'dated', watchedDate: '2020-01-01' }),
      log({ id: 'undated', watchedDate: null, createdAt: '2024-06-01T00:00:00Z' }),
    ] as never);
    expect(sorted[0].id).toBe('undated');
  });

  it('sortLogs does not crash on a log with neither date', () => {
    const sorted = sortLogs([
      log({ id: 'nothing', watchedDate: null, createdAt: undefined }),
      log({ id: 'dated', watchedDate: '2024-01-01' }),
    ] as never);
    expect(sorted.map((l: { id: string }) => l.id)).toEqual(['dated', 'nothing']);
  });
});

// 'store state integrity' REMOVED — both tests could not fail.
//
// The first wrote the watchlist AND its index in one setState and then asserted they
// agreed; the store's index-maintenance code never ran. The second set both to empty
// and asserted an empty object has no key 999.
//
// The fixture was also fictional: it used `film_id`, which is not a field on
// WatchlistItem (the real one is `id` — film.types.ts:69). `as never` on the setState
// is what let a shape the app never produces through, and the `as { film_id: number }`
// cast inside the loop is what TypeScript finally rejected.
//
// The real invariant is covered through the real actions in watchlistSlice.test.ts:
// the index after fetch, after add, and cleared after remove.

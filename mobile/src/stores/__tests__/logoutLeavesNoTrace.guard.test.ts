/**
 * logoutLeavesNoTrace.guard.test.ts — batch 23
 * ────────────────────────────────────────────
 * Batch 23's condition is "a logout leaves no trace of the previous member,
 * proven by driving a real logout." Nothing drove one: the only test that
 * touches this store mocks `registerStoreReset` away, so the reset handler had
 * never executed once. That is why it named 10 of 28 fields and nobody noticed.
 *
 * This file deliberately does NOT mock `resetAllStores`.
 */
import * as fs from 'fs';
import * as path from 'path';
import { useFilmStore } from '../films';
import { resetAllStores } from '../resetAllStores';
import { logSliceInitialState } from '../domain/logSlice';
import { watchlistSliceInitialState } from '../domain/watchlistSlice';
import { listSliceInitialState } from '../domain/listSlice';
import { interactionSliceInitialState } from '../domain/interactionSlice';
import { archiveSliceInitialState } from '../domain/archiveSlice';
import { runWithMutex, clearAllMutexes, _mutexCountForTests } from '../domain/helpers/promiseMutex';

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
const deleted: string[] = [];
jest.mock('../mmkv-storage', () => ({
  storage: {
    getString: jest.fn(), set: jest.fn(),
    delete: jest.fn((k: string) => { deleted.push(k); }),
    contains: jest.fn(() => false), getAllKeys: jest.fn(() => []), clearAll: jest.fn(),
  },
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
jest.mock('@/src/utils/reelToast', () => { const t: unknown = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }); return { __esModule: true, default: t }; });
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
jest.mock('expo-image', () => ({ Image: { prefetch: jest.fn() } }));

/** Every data field this store owns, from the slices themselves. */
const pristine = () => ({
  ...logSliceInitialState(),
  ...watchlistSliceInitialState(),
  ...listSliceInitialState(),
  ...interactionSliceInitialState(),
  ...archiveSliceInitialState(),
});

/** A value that differs from the pristine one, whatever its type. */
const dirty = (v: unknown): unknown => {
  if (Array.isArray(v)) return [{ id: 999, title: 'PREVIOUS MEMBER' }];
  if (typeof v === 'boolean') return !v;
  if (typeof v === 'number') return 42;
  if (v === null) return 'cursor-from-previous-member';
  if (typeof v === 'object') return { 999: { id: 999 } };
  return 'PREVIOUS MEMBER';
};

describe('#64 · a logout leaves no trace of the previous member', () => {
  beforeEach(() => { deleted.length = 0; clearAllMutexes(); });

  it('EVERY field returns to its pristine value — enumerated from the slices', async () => {
    const clean = pristine();
    const keys = Object.keys(clean) as (keyof ReturnType<typeof pristine>)[];

    // 27 fields, and the old reset named 10. (It was 28 before #62 moved
    // `_watchlistPromises` out of store state into the shared mutex helper.)
    // Enumerated rather than listed, so a field added to any slice is covered
    // here the day it is added.
    expect(keys.length).toBe(27);

    const soiled: Record<string, unknown> = {};
    for (const k of keys) soiled[k] = dirty(clean[k]);
    useFilmStore.setState(soiled as never);

    // Prove the soiling actually took, or this test proves nothing.
    for (const k of keys) {
      expect((useFilmStore.getState() as never as Record<string, unknown>)[k]).not.toEqual(clean[k]);
    }

    await resetAllStores('u1');

    const after = useFilmStore.getState() as never as Record<string, unknown>;
    const survivors = keys.filter((k) => !isEqual(after[k], clean[k]));
    expect(survivors).toEqual([]);
  });

  it('hands back FRESH objects — two resets never share an array', async () => {
    // The factories are functions for this reason: sortLogs sorts in place, so a
    // shared constant would let one session mutate the copy the next reset
    // depends on. Same value, different identity.
    await resetAllStores('u1');
    const first = useFilmStore.getState().logs;
    await resetAllStores('u1');
    const second = useFilmStore.getState().logs;
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it('deletes the persisted copy rather than trusting a deferred overwrite', async () => {
    // This store's disk writes are deferred up to 1.5s, so overwriting with
    // blanks does not close the window — the previous member's last 150 logs,
    // private notes included, would survive the app closing.
    //
    // Drives the reset itself: `beforeEach` empties the recorder, so asserting
    // on a deletion made by an earlier test would have proved nothing.
    await resetAllStores('u1');
    expect(deleted).toContain('reelhouse-films');
  });

  it('empties the queued-write map, so the next member does not queue behind the last', async () => {
    let release: (() => void) | undefined;
    void runWithMutex('watchlist:550', () => new Promise<void>((r) => { release = r; }));
    expect(_mutexCountForTests()).toBe(1);
    await resetAllStores('u1');
    expect(_mutexCountForTests()).toBe(0);
    release?.();
  });
});

describe('#64 · every per-member cache on disk is erased', () => {
  it('no per-member key is written without a matching delete — swept, not listed', () => {
    // Three cache families were written and never deleted: the member's profile
    // totals, who they follow, and their pending follow requests. One of them
    // even had a purpose-built eraser that 24 writers never called.
    //
    // Swept from source so the NEXT cache cannot be forgotten either.
    const ROOT = path.join(__dirname, '..', '..', '..');
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (['node_modules', '__tests__', '.expo', 'android', 'ios'].includes(e.name)) continue;
          walk(full, out);
        } else if (/\.tsx?$/.test(e.name)) out.push(full);
      }
      return out;
    };

    const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'app'))];
    const all = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

    // A per-member key is a template literal carrying an interpolation.
    const written = new Set<string>();
    for (const m of all.matchAll(/storage\.set\(\s*`([^`]*\$\{[^`]*)`/g)) {
      written.add(m[1].replace(/\$\{[^}]*\}/g, '<id>'));
    }
    const erased = new Set<string>();
    for (const m of all.matchAll(/storage\.delete\(\s*`([^`]*\$\{[^`]*)`/g)) {
      erased.add(m[1].replace(/\$\{[^}]*\}/g, '<id>'));
    }

    expect(written.size).toBeGreaterThan(0);
    const orphans = [...written].filter((k) => !erased.has(k));
    expect(orphans).toEqual([]);
  });
});

/** Deep equality without pulling in a dependency. */
function isEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

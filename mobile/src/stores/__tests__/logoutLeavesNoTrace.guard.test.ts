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
// Imported for their SIDE EFFECT: each registers its own logout handler on load.
// That is also the real constraint — a store that has never been imported has
// never written anything either, so the two stay consistent, but the dependency
// is worth stating. AppBootstrapper forces a static import of the social store
// for exactly this reason.
import '@/src/utils/profileCountsCache';

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
  // removeItem records into the same log as delete: the reset clears the
  // persisted blob through the persist API, which routes to removeItem — and
  // removeItem is what also drops the DEFERRED write. A raw delete would leave
  // that write queued to rewrite the blob moments later.
  createAsyncMMKVStorage: jest.fn(() => ({
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn((k: string) => { deleted.push(k); }),
  })),
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

  it('#62 · the map deletes its own entries as tasks settle', async () => {
    // The whole point of #62: the watchlist map grew an entry per film and never
    // lost one. Tested by DRIVING it — a source check would pass on a
    // `.delete()` that never runs.
    expect(_mutexCountForTests()).toBe(0);
    await runWithMutex('watchlist:1', async () => {});
    await runWithMutex('watchlist:2', async () => {});
    // Settling is scheduled on a microtask, so let the queue drain.
    await Promise.resolve();
    await Promise.resolve();
    expect(_mutexCountForTests()).toBe(0);
  });

  it('#62 · a failing task still releases its slot', async () => {
    await runWithMutex('watchlist:3', async () => { throw new Error('boom'); }).catch(() => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(_mutexCountForTests()).toBe(0);
  });

  it('erases the per-member caches by DRIVING the reset, not by reading source', async () => {
    // The profile-counts eraser existed, was exported and was unit-tested — and
    // had zero callers. A source sweep sees the delete inside it either way, so
    // only running the reset proves it is wired.
    deleted.length = 0;
    await resetAllStores('u1');
    expect(deleted).toContain('reelhouse_profile_counts_u1');
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

describe('#64 · BOTH ways a session ends must erase', () => {
  const auth = fs.readFileSync(path.join(__dirname, '..', 'auth.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('the stale-session path erases, not just the logout button', () => {
    // It used to clear the auth flag and return. Worse, that DISABLED the
    // cleanup that would have caught it: the SIGNED_OUT listener only calls
    // logout() `if (isAuthenticated)`, which that line had just made false.
    // Anchored on CODE. My first version sliced from a phrase that lives only in
    // a comment — which this file strips — so the block examined was empty. The
    // positive assertion caught it, which a `not.toMatch` would not have.
    const at = auth.indexOf('const staleUserId = get().user?.id ?? null;');
    expect(at).toBeGreaterThan(-1);
    const branch = auth.slice(at, auth.indexOf('return;', at));
    expect(branch.length).toBeGreaterThan(200);
    expect(branch).toMatch(/resetAllStores\(staleUserId\)/);
    expect(branch).toMatch(/storage\.delete\('last_user_id'\)/);
  });

  it('but does nothing when there was nobody signed in', () => {
    // This branch also runs on an ordinary cold start for a signed-out visitor —
    // anonymous browsing is supported — and wiping the query cache every launch
    // for them would throw away a warm feed to clean up nothing.
    expect(auth).toMatch(/const hadStaleSession = staleUserId !== null \|\| get\(\)\.isAuthenticated;/);
    expect(auth).toMatch(/if \(hadStaleSession\) \{/);
  });

  it('logout passes the departing member to the handlers', () => {
    // Handlers cannot look it up: logout clears the auth store FIRST so sign-out
    // is visually instant.
    expect(auth).toMatch(/await resetAllStores\(previousUserId\)/);
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

  it('and a key BUILT BY A FUNCTION is swept too', () => {
    /**
     * The sweep above matches `storage.set(\`…${id}\`)` — a template at the call
     * site. It cannot see a key that comes from a builder:
     *
     *     export const draftKey = (userId: string) => `…_${userId}`;
     *     storage.set(draftKey(userId), …);
     *
     * The Dispatch's draft is the first key in this app written that way, and it
     * went straight past the guard. Every per-member key from here on will be
     * written that way too, because a key with a rule attached belongs in one
     * module rather than at four call sites.
     *
     * So: any arrow that BUILDS a key from an interpolation must have a
     * `storage.delete` naming it, in its own file. The module owns the key, so
     * the module owes the erase.
     */
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

    /**
     * Keys that outlive a logout ON PURPOSE. Named, with the reason, so the
     * absence of an erase is a decision rather than an oversight.
     */
    const OUTLIVES_LOGOUT: Record<string, string> = {
      flagKey: 'src/hooks/useInitiation.ts — "you have seen the ceremony", per member. '
        + 'Erasing it on logout would replay the whole initiation for a member who '
        + 'simply signed out and back in. It is a boolean about a person, not their content.',
    };

    const orphans: string[] = [];
    let builders = 0;

    for (const file of [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'app'))]) {
      const src = fs.readFileSync(file, 'utf8');
      // `const somethingKey = (…) => `…${…}`;`
      for (const m of src.matchAll(/(?:export\s+)?const\s+(\w*[Kk]ey)\s*=\s*\([^)]*\)\s*(?::[^=]+)?=>\s*`[^`]*\$\{/g)) {
        const name = m[1];
        /**
         * It is only a STORAGE key if it is used as one. Without this the sweep
         * reported `getFilmKey` in the darkroom — `${media_type}-${id}`, a React
         * list key that never goes near the disk — which is a guard crying wolf
         * about a line that has nothing to do with logging out.
         */
        const isStorageKey = new RegExp(
          `storage\\.(set|getString|getBoolean|getNumber|contains)\\(\\s*${name}\\(`,
        ).test(src);
        if (!isStorageKey) continue;

        builders += 1;
        if (OUTLIVES_LOGOUT[name]) continue;

        const erasedHere = new RegExp(`storage\\.delete\\(\\s*${name}\\(`).test(src);
        if (!erasedHere) {
          orphans.push(path.relative(ROOT, file).replace(/\\/g, '/') + '  ::  ' + name);
        }
      }
    }

    // Vacuous-guard insurance: if the pattern stopped matching anything, this
    // would pass having swept nothing at all.
    expect(builders).toBeGreaterThan(0);
    expect(orphans).toEqual([]);
  });

  it('the Dispatch draft is erased BY THE LOGOUT, not only by its own module', () => {
    // A module that CAN erase a key is not a logout that DOES. One member's
    // unpublished essay used to survive a sign-out and sit in the writing room
    // for the next person on that phone.
    const authSrc = fs.readFileSync(path.join(__dirname, '..', 'auth.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(authSrc).toMatch(/clearAllDrafts\(previousUserId\)/);

    /**
     * And the two that are not drafts. Their own modules have exported an eraser
     * since they were written and logout called neither, so a departed member's
     * old usernames and the handle they had asked for stayed on the phone.
     *
     * They were never READABLE by the next member — both hold the id in the
     * payload and every read checks it — which is exactly why they needed a
     * different fix from the drafts rather than being swept up with them.
     */
    expect(authSrc).toMatch(/clearHandleHistory\(\)/);
    expect(authSrc).toMatch(/clearRequestedHandle\(\)/);
  });

  it('and DELETING an account takes the whole install with it', () => {
    /**
     * A third way a session ends, and the one where leaving anything behind is
     * least defensible: somebody asked to be erased.
     *
     * It already does the strongest possible thing — `storage.clearAll()` after
     * the logout, so every key this install ever wrote goes, including drafts
     * and any key invented later. Pinned because it is the kind of line that
     * looks removable to somebody tidying up, and because "logout already
     * cleared it" is only true of the keys logout knows about.
     */
    const settings = fs.readFileSync(
      path.join(__dirname, '..', '..', 'features', 'settings', 'SettingsScreen.tsx'), 'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    const deletion = settings.slice(settings.indexOf('completeAccountDeletion'));
    expect(deletion).toMatch(/storage\.clearAll\(\)/);
    // After the logout, not instead of it: the server-side request and the
    // store teardown both have to happen first.
    expect(deletion.indexOf('logout()')).toBeLessThan(deletion.indexOf('storage.clearAll()'));
  });
});

/** Deep equality without pulling in a dependency. */
function isEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

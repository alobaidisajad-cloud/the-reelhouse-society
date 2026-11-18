/**
 * aSignOutTakesTheCacheWithIt.test.ts — a sign-out takes the query cache on disk away, and a write
 * of it still waiting its turn with it (round 13).
 *
 * The cache is written once a second at most: the newest is held, written at the end of its
 * second. A sign-out deleted the cache's key directly, and a write held then (a read still out
 * answering with the member's token, between the sign-out's clear and its network steps) landed a
 * second later, after the key was gone: the next person to open the app saw the member's wall and
 * Reel. Now every sign-out goes through forgetCache, which takes the held write with it.
 * Driven through the real auth store and the real query client, the house stood in by
 * supabaseFake, the phone's disk by a map.
 */
import { useAuthStore } from '../auth';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { mmkvPersister, writeHeldCache } from '@/src/lib/queryClient';
import { PUSH_TOKEN_KEY } from '@/src/lib/pushNotifications';

const ANA = '11111111-1111-4111-8111-111111111111';
const CACHE = 'REELHOUSE_QUERY_CACHE';

/** A read of Ana's that answers while she signs out, as the house is told to forget her phone. */
const anasLateRead = () => mmkvPersister.persistClient({
  buster: 'b', timestamp: 1,
  clientState: { mutations: [], queries: [{ queryKey: ['feed', 'following', ANA], queryHash: 'late', state: { data: 'Ana\'s Reel' } }] },
} as never);

const mockHouse = supabaseFake({
  session: null,
  rpc: { forget_push_token: () => { void anasLateRead(); return true; } },
});
Object.assign(mockHouse.client.auth, { signOut: jest.fn(async () => ({ error: null })), stopAutoRefresh: jest.fn() });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const mockDisk = new Map<string, string>();
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    getString: (k: string) => mockDisk.get(k),
    getBoolean: () => undefined,
    set: (k: string, v: string) => { mockDisk.set(k, String(v)); },
    delete: (k: string) => { mockDisk.delete(k); },
    getAllKeys: () => [...mockDisk.keys()],
    contains: (k: string) => mockDisk.has(k),
    clearAll: () => mockDisk.clear(),
  },
  setSensitive: (k: string, v: string) => { mockDisk.set(k, v); },
  isStorageEncrypted: () => true,
  storageReady: () => Promise.resolve(),
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  zustandMMKVStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  createAsyncMMKVStorage: () => ({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined }),
}));
jest.mock('@/src/utils/reelToast', () => {
  const t = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/src/lib/revenueCat', () => ({ identifyUser: jest.fn(), logoutRevenueCat: jest.fn() }));
jest.mock('@/src/lib/sentry', () => ({ setSentryUser: jest.fn(), addBreadcrumb: jest.fn(), captureError: jest.fn(), captureWarning: jest.fn(), captureAuthRefusal: jest.fn() }));
jest.mock('@/src/stores/notificationStore', () => ({ teardownNotificationRealtime: jest.fn() }));
jest.mock('@/src/stores/domain/socialSlice', () => ({ hydrateFollowing: jest.fn() }));
jest.mock('@/src/utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

beforeEach(() => {
  mockDisk.clear();
  mockDisk.set(PUSH_TOKEN_KEY, 'ExponentPushToken[ana]');
  useAuthStore.setState({ user: { id: ANA, username: 'ana', email: 'ana@example.com' }, isAuthenticated: true, loading: false } as never);
});
afterEach(() => writeHeldCache());

it("a read of the member's that answers while they sign out is never written after: the next start opens on nothing of theirs", async () => {
  // The cache written before, as the phone kept it.
  mockDisk.set(CACHE, '{"before":true}');
  await useAuthStore.getState().logout();
  expect(mockDisk.has(CACHE)).toBe(false);
  // The held write's turn comes: nothing of Ana's is put back.
  writeHeldCache();
  expect(mockDisk.has(CACHE)).toBe(false);
});

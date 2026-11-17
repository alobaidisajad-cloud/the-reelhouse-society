/**
 * aClosedAccountIsSignedOutHere.test.ts — review round 11 (restoreSession, rereadProfile)
 * ─────────────────────────────────────────────────────────────────────────────
 * A member deletes their account on one phone. Their other phone still holds a session the
 * phone itself trusts until its token is next refreshed (up to an hour): its launch read no
 * profile row, took that for a passing failure, and kept the member drawn as signed in, their
 * own file "Member Not Found" and every write refused. Now a valid session that finds no row asks
 * the house whether the account is still there; told it is gone, the phone signs out and says so.
 * A read that merely failed, or a house that cannot be reached, keeps the member as before.
 */
import { useAuthStore, ACCOUNT_CLOSED_SAID } from '../auth';
import { supabaseFake } from '@/test-utils/supabaseFake';
import reelToast from '@/src/utils/reelToast';

const ANA = '11111111-1111-4111-8111-111111111111';

/** What the house holds for the member's profile: no row, a row, or a failed read. */
let mockProfiles: Record<string, unknown>[] | { code: string; message: string } = [];
/** What the auth server answers when asked who the session belongs to. */
let mockWho: { data: { user: { id: string } | null }; error: Record<string, unknown> | null } = { data: { user: null }, error: null };
const mockGetUser = jest.fn(async () => mockWho);
const mockSignOut = jest.fn(async () => ({ error: null }));
const mockHouse = supabaseFake({
  answer: { profiles: () => mockProfiles as never },
  session: { userId: ANA },
});
// The auth server's two answers this needs, beside the fake's own session.
Object.assign(mockHouse.client.auth, { getUser: mockGetUser, signOut: mockSignOut, stopAutoRefresh: jest.fn() });
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
jest.mock('@/src/lib/pushNotifications', () => ({ removePushToken: jest.fn(() => Promise.resolve(true)) }));
jest.mock('@/src/lib/sentry', () => ({ setSentryUser: jest.fn(), addBreadcrumb: jest.fn(), captureError: jest.fn(), captureWarning: jest.fn(), captureAuthRefusal: jest.fn() }));
jest.mock('@/src/lib/queryClient', () => ({ queryClient: { clear: jest.fn(), invalidateQueries: jest.fn() } }));
jest.mock('@/src/stores/notificationStore', () => ({ teardownNotificationRealtime: jest.fn() }));
jest.mock('@/src/stores/domain/socialSlice', () => ({ hydrateFollowing: jest.fn() }));
jest.mock('@/src/utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const CACHED = { id: ANA, username: 'ana', email: 'ana@example.com', created_at: '2026-01-01T00:00:00Z' };
const GONE = { code: 'user_not_found', status: 403, name: 'AuthApiError', message: 'User from sub claim in JWT does not exist' };
const toast = reelToast as unknown as { error: jest.Mock };

beforeEach(() => {
  mockDisk.clear();
  mockDisk.set('last_user_id', ANA);
  mockDisk.set(`ironvault_user_cache_${ANA}`, JSON.stringify(CACHED));
  mockProfiles = [];
  mockWho = { data: { user: null }, error: null };
  mockGetUser.mockClear();
  mockSignOut.mockClear();
  toast.error.mockClear();
  useAuthStore.setState({ user: null, isAuthenticated: false, loading: true } as never);
});

it('a launch that finds no row for a valid session, the account gone at the house: signed out here, and told why', async () => {
  mockWho = { data: { user: null }, error: GONE };
  await useAuthStore.getState().restoreSession();
  expect(mockGetUser).toHaveBeenCalled();
  expect(useAuthStore.getState().user).toBeNull();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
  expect(useAuthStore.getState().loading).toBe(false);
  expect(mockSignOut).toHaveBeenCalled();
  expect(mockDisk.has(`ironvault_user_cache_${ANA}`)).toBe(false);
  expect(toast.error).toHaveBeenCalledWith(ACCOUNT_CLOSED_SAID);
});

it('no row, but the house cannot be reached to ask: the member is kept, as before', async () => {
  mockWho = { data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 0, message: 'Network request failed' } };
  await useAuthStore.getState().restoreSession();
  expect(useAuthStore.getState().user?.id).toBe(ANA);
  expect(useAuthStore.getState().isAuthenticated).toBe(true);
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(toast.error).not.toHaveBeenCalled();
});

it('a profile read that failed is not a closed account: the house is not asked, the member kept', async () => {
  mockProfiles = { code: '08006', message: 'connection failure' };
  await useAuthStore.getState().restoreSession();
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(useAuthStore.getState().user?.id).toBe(ANA);
  expect(mockSignOut).not.toHaveBeenCalled();
});

it('the profile read again on a return to the app finds the account gone: signed out here, and told why', async () => {
  useAuthStore.setState({ user: CACHED, isAuthenticated: true, loading: false } as never);
  mockWho = { data: { user: null }, error: GONE };
  await expect(useAuthStore.getState().rereadProfile()).resolves.toBe(false);
  expect(useAuthStore.getState().user).toBeNull();
  expect(mockSignOut).toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(ACCOUNT_CLOSED_SAID);
});

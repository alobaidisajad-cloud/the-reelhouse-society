/**
 * aSessionEndedTakesItsTokenAndNotices.test.ts — review round 13 (logout, restoreSession)
 * ─────────────────────────────────────────────────────────────────────────────
 * Two things a session left on the phone after it ended:
 *   · its push token, when the session had ended without the phone's own sign-out (a refresh
 *     refused, "Sign out of every other device" on another phone, a launch that finds the session
 *     gone): the removal needed the session it no longer had, and the phone kept receiving the
 *     member's notices on its lock screen;
 *   · the notices already delivered, in the notification centre and on the lock screen, and the
 *     icon's badge, at every sign-out: the next person to wake the phone read them.
 * Driven through the real auth store and the real push module, the house stood in by supabaseFake
 * (the phone holds no session: it has ended), and the operating system's notices by jest.setup's.
 */
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../auth';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { PUSH_TOKEN_KEY } from '@/src/lib/pushNotifications';
import { __owedForTests } from '@/src/lib/endSession';

const ANA = '11111111-1111-4111-8111-111111111111';
const THIS_PHONE = 'ExponentPushToken[shared-ipad]';

/** Each forget the house was asked, and whether it answers (false: the house cannot be reached). */
let mockForgets: unknown[] = [];
let mockHouseUp = true;
const mockHouse = supabaseFake({
  session: null,
  rpc: {
    forget_push_token: (args: unknown) => {
      mockForgets.push(args);
      return mockHouseUp ? true : { error: { message: 'TypeError: Network request failed' } };
    },
  },
});
// The auth server's answers a sign-out needs, beside the fake's own (absent) session.
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
jest.mock('@/src/lib/queryClient', () => ({ queryClient: { clear: jest.fn(), invalidateQueries: jest.fn() }, forgetCache: jest.fn() }));
jest.mock('@/src/stores/notificationStore', () => ({ teardownNotificationRealtime: jest.fn() }));
jest.mock('@/src/stores/domain/socialSlice', () => ({ hydrateFollowing: jest.fn() }));
jest.mock('@/src/utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const ANA_USER = { id: ANA, username: 'ana', email: 'ana@example.com', created_at: '2026-01-01T00:00:00Z' };
const dismissed = Notifications.dismissAllNotificationsAsync as jest.Mock;
const badge = Notifications.setBadgeCountAsync as jest.Mock;

/** The phone's last steps run after the answer: waited for, a turn at a time. */
async function until(done: () => boolean) {
  for (let i = 0; i < 50 && !done(); i++) await new Promise((r) => setTimeout(r, 0));
  expect(done()).toBe(true);
}

beforeEach(() => {
  mockDisk.clear();
  mockDisk.set(PUSH_TOKEN_KEY, THIS_PHONE);
  mockForgets = [];
  mockHouseUp = true;
  dismissed.mockClear();
  badge.mockClear();
  useAuthStore.setState({ user: ANA_USER, isAuthenticated: true, loading: false } as never);
});

it('a session ended elsewhere forgets this phone\'s token by the token, with no session left', async () => {
  await useAuthStore.getState().logout({ endedElsewhere: true });
  expect(mockForgets).toEqual([{ p_token: THIS_PHONE, p_user: ANA }]);
  expect(mockDisk.has(PUSH_TOKEN_KEY)).toBe(false);
  expect(__owedForTests()).toBeNull();
});

it('and takes the notices it was shown off the phone, the badge with them', async () => {
  await useAuthStore.getState().logout({ endedElsewhere: true });
  expect(dismissed).toHaveBeenCalledTimes(1);
  expect(badge).toHaveBeenCalledWith(0);
});

it('the member\'s own sign-out takes the notices off the phone too', async () => {
  await useAuthStore.getState().logout();
  expect(dismissed).toHaveBeenCalledTimes(1);
  expect(badge).toHaveBeenCalledWith(0);
  expect(mockForgets).toEqual([{ p_token: THIS_PHONE, p_user: ANA }]);
});

it('a token the house could not be told of is owed with the member, for the network\'s return', async () => {
  mockHouseUp = false;
  await useAuthStore.getState().logout({ endedElsewhere: true });
  expect(__owedForTests()).toEqual({ refreshToken: null, userId: ANA, pushToken: THIS_PHONE });
  // The notices go all the same: they need no house.
  expect(dismissed).toHaveBeenCalledTimes(1);
});

it('a launch that finds the session gone forgets the token and takes the notices off the phone', async () => {
  mockDisk.set('last_user_id', ANA);
  mockDisk.set(`ironvault_user_cache_${ANA}`, JSON.stringify(ANA_USER));
  await useAuthStore.getState().restoreSession();
  expect(useAuthStore.getState().user).toBeNull();
  await until(() => dismissed.mock.calls.length === 1);
  expect(mockForgets).toEqual([{ p_token: THIS_PHONE, p_user: ANA }]);
  expect(badge).toHaveBeenCalledWith(0);
});

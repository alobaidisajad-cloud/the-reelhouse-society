/**
 * signingOutSilencesOnlyThisDevice.test.ts — the push token a sign-out removes.
 *
 * A member is heard on every device they sign in on (20260929_01). Sign-out
 * removed every token of this PLATFORM: signing out of the iPad would have
 * silenced the iPhone. It now removes this device's own token, remembered when
 * it was registered — and, for an install that registered before the token was
 * remembered, still every token of the platform: the previous member's notices
 * must never reach this device.
 */
import { registerForPushNotifications, removePushToken, PUSH_TOKEN_KEY, FOREGROUND_NOTICES } from '../pushNotifications';

const mockStore = new Map<string, string>();
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    set: (k: string, v: string) => { mockStore.set(k, v); },
    getString: (k: string) => mockStore.get(k),
    delete: (k: string) => { mockStore.delete(k); },
  },
}));
/** Each delete: the filters it carried, and what it answered. */
let mockDeletes: [string, unknown][][] = [];
let mockAnswer: { data: unknown; error: unknown } = { data: [], error: null };
jest.mock('expo-device', () => ({ isDevice: true }));
let mockRegisterError: unknown = null;
jest.mock('../supabase', () => ({
  supabase: {
    rpc: async () => ({ data: null, error: mockRegisterError }),
    auth: { getSession: async () => ({ data: { session: { user: { id: 'member-1' } } } }) },
    from: () => ({
      delete: () => {
        const filters: [string, unknown][] = [];
        mockDeletes.push(filters);
        const q: Record<string, unknown> = {
          eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
          select: () => Promise.resolve(mockAnswer),
        };
        return q;
      },
    }),
  },
}));
jest.mock('../../utils/logger', () => ({ logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn() } }));

beforeEach(() => {
  mockStore.clear();
  mockDeletes = [];
  mockAnswer = { data: [], error: null };
});

it('removes this device\'s own token, and nothing of the member\'s other devices', async () => {
  mockStore.set(PUSH_TOKEN_KEY, 'ExponentPushToken[this-ipad]');
  await expect(removePushToken('member-1')).resolves.toBe(true);
  expect(mockDeletes).toEqual([[['user_id', 'member-1'], ['token', 'ExponentPushToken[this-ipad]']]]);
  // Forgotten once gone: the next member on this device registers their own.
  expect(mockStore.has(PUSH_TOKEN_KEY)).toBe(false);
});

it('an install that never remembered its token still clears the platform — privacy first', async () => {
  await expect(removePushToken('member-1')).resolves.toBe(true);
  expect(mockDeletes[0]).toEqual([['user_id', 'member-1'], ['platform', 'ios']]);
});

it('a refused removal is reported, and the token is kept to try again', async () => {
  mockStore.set(PUSH_TOKEN_KEY, 'ExponentPushToken[this-ipad]');
  mockAnswer = { data: null, error: { message: 'permission denied' } };
  await expect(removePushToken('member-1')).resolves.toBe(false);
  expect(mockStore.get(PUSH_TOKEN_KEY)).toBe('ExponentPushToken[this-ipad]');
});

describe('registering remembers which token is this device', () => {
  beforeEach(() => { mockRegisterError = null; });

  it('remembers the token the house accepted', async () => {
    await expect(registerForPushNotifications('member-1')).resolves.toBe('test-push-token');
    expect(mockStore.get(PUSH_TOKEN_KEY)).toBe('test-push-token');
  });

  it('and not one the house refused', async () => {
    mockRegisterError = { message: 'Not authenticated' };
    await registerForPushNotifications('member-1');
    expect(mockStore.has(PUSH_TOKEN_KEY)).toBe(false);
  });

  it('shows a notice as a banner and in the list — never the deprecated alert', async () => {
    expect(await FOREGROUND_NOTICES.handleNotification()).toEqual({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true });
  });

  it('is set as the app loads, with no token registered', () => {
    // It was set only after a token registered: a notice arriving before then,
    // or on a phone whose registration failed, was not shown while the app was open.
    const { setNotificationHandler } = jest.requireMock('expo-notifications');
    setNotificationHandler.mockClear();
    jest.isolateModules(() => { require('../pushNotifications'); });
    expect(setNotificationHandler).toHaveBeenCalledTimes(1);
  });
});

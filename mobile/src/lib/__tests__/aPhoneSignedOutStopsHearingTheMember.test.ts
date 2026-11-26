/**
 * aPhoneSignedOutStopsHearingTheMember.test.ts — review round 13
 * ─────────────────────────────────────────────────────────────────────────────
 * A member pressed "Sign out of every other device" on their new phone; the old one, sold or
 * handed on, went on showing their notices on its lock screen ("@x left a critique on your log of
 * ..."), whether it was ever opened again or not. Nothing took the old phone's push token: the
 * phone's own removal ran under the row's policy and needed a session it no longer had, and the
 * "others" sign-out touched no token at all.
 *
 * Here the real client talks to a network this test plays: a phone whose session has already ended
 * forgets its token by the token itself; signing out every other device takes the other phones'
 * tokens and keeps this one's; a token that could not be forgotten (the house away) is owed and
 * forgotten when the network returns, with no session left to refresh; and a token registered again
 * here is no longer owed, so the forget never takes the new registration with it, unless the member
 * signed out while the house took it: then it is forgotten again, and the phone keeps no record of it.
 */
import { supabase } from '@/src/lib/supabase';
import * as Notifications from 'expo-notifications';
import { endOtherSessions, endSessionHere, settleOwedSignOut, owePushToken, __owedForTests, __othersOwedForTests } from '@/src/lib/endSession';
import { PUSH_REGISTERED_AT_KEY, PUSH_TOKEN_KEY, REREGISTER_AFTER_MS, registerForPushNotifications, registrationIsDue, removePushToken } from '@/src/lib/pushNotifications';
import { houseNow } from '@/src/lib/houseClock';
import { useAuthStore } from '@/src/stores/auth';

// The real client, over the network this test plays.
jest.unmock('@supabase/supabase-js');
jest.mock('expo-device', () => ({ isDevice: true }));

const mockDisk = new Map<string, string>();
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    getString: (k: string) => mockDisk.get(k),
    set: (k: string, v: string) => { mockDisk.set(k, String(v)); },
    delete: (k: string) => { mockDisk.delete(k); },
    getAllKeys: () => [...mockDisk.keys()],
    contains: (k: string) => mockDisk.has(k),
  },
  setSensitive: (k: string, v: string) => { mockDisk.set(k, v); },
  isStorageEncrypted: () => true,
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  storageReady: () => Promise.resolve(),
}));

const KEY = (supabase.auth as unknown as { storageKey: string }).storageKey;
const ME = '11111111-1111-4111-8111-111111111111';
const OLD_PHONE = 'ExponentPushToken[the-old-phone]';
const session = (refresh: string) => JSON.stringify({
  access_token: 'a.b.c', refresh_token: refresh, token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: ME, aud: 'authenticated', role: 'authenticated' },
});

/** Every request the client made: its method, path and query, and the body it carried. */
let asked: { at: string; body: unknown }[] = [];
/** The network: down, or answering as the house would. */
let networkUp = true;
/** The house refuses forget_other_devices (a moment's failure after the sign-out landed). */
let othersRefused = false;
/** Run as the house takes a registration, before its answer reaches the phone. */
let whileRegistering: (() => void) | null = null;
/** Run as the house is asked to forget the other phones' tokens. */
let whileForgettingOthers: (() => void) | null = null;

beforeEach(() => {
  mockDisk.clear();
  asked = [];
  networkUp = true;
  othersRefused = false;
  whileRegistering = null;
  whileForgettingOthers = null;
  // The member signed in on the phone, as every registration is made for.
  useAuthStore.setState({ user: { id: ME } } as never);
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    let body: unknown = null;
    try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = String(init?.body); }
    asked.push({ at: `${init?.method ?? 'GET'} ${url.pathname}${url.search.includes('scope=others') ? '?others' : ''}`, body });
    if (!networkUp) throw new TypeError('Network request failed');
    if (url.pathname.endsWith('/rpc/forget_other_devices')) {
      whileForgettingOthers?.();
      if (othersRefused) return new Response(JSON.stringify({ code: '57014', message: 'canceling statement due to statement timeout' }), { status: 500, headers: { 'content-type': 'application/json' } });
      return new Response('2', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/rpc/forget_push_token')) {
      return new Response('true', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/rpc/register_push_token')) whileRegistering?.();
    return new Response(null, { status: 204 });
  });
});
afterEach(async () => {
  jest.restoreAllMocks();
  // A session laid on the phone starts the client's refresh: stopped, so no timer outlives the file.
  await supabase.auth.stopAutoRefresh();
});

const rpcAsked = (fn: string) => asked.filter((a) => a.at === `POST /rest/v1/rpc/${fn}`).map((a) => a.body);

it('a phone whose session already ended forgets its token by the token, named with its member', async () => {
  // The session ended elsewhere: the phone holds none, only the token it registered.
  mockDisk.set(PUSH_TOKEN_KEY, OLD_PHONE);
  expect((await supabase.auth.getSession()).data.session).toBeNull();

  expect(await removePushToken(ME)).toBe(true);
  expect(rpcAsked('forget_push_token')).toEqual([{ p_token: OLD_PHONE, p_user: ME }]);
  // Forgotten here too: the next member on this phone registers their own.
  expect(mockDisk.has(PUSH_TOKEN_KEY)).toBe(false);
});

it('"Sign out of every other device" takes the other phones\' tokens, and keeps this one\'s', async () => {
  mockDisk.set(KEY, session('first'));
  mockDisk.set(PUSH_TOKEN_KEY, 'ExponentPushToken[this-phone]');

  expect(await endOtherSessions()).toBe(true);
  expect(asked.map((a) => a.at)).toEqual(['POST /auth/v1/logout?others', 'POST /rest/v1/rpc/forget_other_devices']);
  expect(rpcAsked('forget_other_devices')).toEqual([{ p_keep_token: 'ExponentPushToken[this-phone]' }]);
  // This phone is still signed in, and still registered.
  expect(mockDisk.has(KEY)).toBe(true);
  expect(mockDisk.get(PUSH_TOKEN_KEY)).toBe('ExponentPushToken[this-phone]');
});

it('the others are not touched when the sign-out itself was refused', async () => {
  networkUp = false;
  mockDisk.set(KEY, session('first'));
  mockDisk.set(PUSH_TOKEN_KEY, 'ExponentPushToken[this-phone]');
  expect(await endOtherSessions()).toBe(false);
  expect(rpcAsked('forget_other_devices')).toEqual([]);
});

it('a token the house could not be told of is owed, with no session to refresh, and forgotten when the network returns', async () => {
  networkUp = false;
  mockDisk.set(PUSH_TOKEN_KEY, OLD_PHONE);
  expect(await removePushToken(ME)).toBe(false);
  // The session had already ended elsewhere: no refresh token, only the token is owed.
  await endSessionHere({ pushStillHeld: true, memberId: ME });
  expect(__owedForTests()).toEqual({ refreshToken: null, userId: ME, pushToken: OLD_PHONE });

  // Still away: kept for next time.
  await settleOwedSignOut();
  expect(__owedForTests()).not.toBeNull();

  networkUp = true;
  asked = [];
  await settleOwedSignOut();
  expect(asked.map((a) => a.at)).toEqual(['POST /rest/v1/rpc/forget_push_token']);
  expect(rpcAsked('forget_push_token')).toEqual([{ p_token: OLD_PHONE, p_user: ME }]);
  expect(__owedForTests()).toBeNull();
});

it('a token registered again on this phone is no longer owed: the forget would take the new registration', async () => {
  mockDisk.set(PUSH_TOKEN_KEY, 'test-push-token');
  owePushToken(ME);
  expect(__owedForTests()).toEqual({ refreshToken: null, userId: ME, pushToken: 'test-push-token' });

  // The member signs in again here, and the phone registers the same token (jest.setup's Expo stand-in).
  mockDisk.set(KEY, session('again'));
  await expect(registerForPushNotifications(ME)).resolves.toBe('test-push-token');
  expect(__owedForTests()).toBeNull();
  asked = [];
  await settleOwedSignOut();
  expect(rpcAsked('forget_push_token')).toEqual([]);
});

it('a registration answered after the member signed out is forgotten again, kept by nothing, and an owed forget stays owed', async () => {
  mockDisk.set(PUSH_TOKEN_KEY, 'test-push-token');
  owePushToken(ME);
  mockDisk.delete(PUSH_TOKEN_KEY);
  mockDisk.set(KEY, session('again'));
  // The member signs out while the house takes the registration made for them.
  whileRegistering = () => useAuthStore.setState({ user: null } as never);
  await registerForPushNotifications(ME);
  expect(rpcAsked('forget_push_token')).toEqual([{ p_token: 'test-push-token', p_user: ME }]);
  expect([mockDisk.has(PUSH_TOKEN_KEY), mockDisk.has(PUSH_REGISTERED_AT_KEY)]).toEqual([false, false]);
  expect(__owedForTests()).toEqual({ refreshToken: null, userId: ME, pushToken: 'test-push-token' });
});

it('a forget of the other phones’ tokens that failed is owed, and asked again, under this phone’s session', async () => {
  mockDisk.set(KEY, session('first'));
  mockDisk.set(PUSH_TOKEN_KEY, 'ExponentPushToken[this-phone]');
  othersRefused = true;
  // The sessions ended: said as done; the tokens are owed.
  expect(await endOtherSessions()).toBe(true);
  expect(__othersOwedForTests()).toBe(ME);

  othersRefused = false;
  asked = [];
  await settleOwedSignOut();
  expect(rpcAsked('forget_other_devices')).toEqual([{ p_keep_token: 'ExponentPushToken[this-phone]' }]);
  expect(__othersOwedForTests()).toBeNull();
});

it('a forget of the other phones’ tokens refused after another member signed in is owed in no one’s name', async () => {
  mockDisk.set(KEY, session('first'));
  othersRefused = true;
  whileForgettingOthers = () => useAuthStore.setState({ user: { id: '22222222-2222-4222-8222-222222222222' } } as never);
  expect(await endOtherSessions()).toBe(true);
  expect(__othersOwedForTests()).toBeNull();
});

it('a forget owed by a member no longer signed in here is let go, never asked under another’s session', async () => {
  mockDisk.set('others_forget_owed', '22222222-2222-4222-8222-222222222222');
  mockDisk.set(KEY, session('first'));
  await settleOwedSignOut();
  expect(rpcAsked('forget_other_devices')).toEqual([]);
  expect(__othersOwedForTests()).toBeNull();
});

describe('a phone in use registers its token at least daily, tying it to its session', () => {
  it('is due with no token, or a registration over a day old; not within the day', () => {
    expect(registrationIsDue()).toBe(true);
    mockDisk.set(PUSH_TOKEN_KEY, 'ExponentPushToken[this-phone]');
    mockDisk.set(PUSH_REGISTERED_AT_KEY, String(houseNow() - 60_000));
    expect(registrationIsDue()).toBe(false);
    mockDisk.set(PUSH_REGISTERED_AT_KEY, String(houseNow() - REREGISTER_AFTER_MS - 60_000));
    expect(registrationIsDue()).toBe(true);
    // A token from before the stamp was kept: due, so it is registered (and tied) at the next return.
    mockDisk.delete(PUSH_REGISTERED_AT_KEY);
    expect(registrationIsDue()).toBe(true);
  });

  it('a registration stamps the day, and a forget takes the stamp with the token', async () => {
    mockDisk.set(KEY, session('first'));
    await registerForPushNotifications(ME);
    expect(registrationIsDue()).toBe(false);
    expect(await removePushToken(ME)).toBe(true);
    expect([mockDisk.has(PUSH_TOKEN_KEY), mockDisk.has(PUSH_REGISTERED_AT_KEY)]).toEqual([false, false]);
  });
});

it('a phone that never allowed notices has nothing to forget: no request, and no failure to report', async () => {
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
  expect(await removePushToken(ME)).toBe(true);
  expect(asked).toEqual([]);
});

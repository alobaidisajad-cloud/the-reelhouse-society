/**
 * A sign-out with no network still signs the member out (P4.1).
 *
 * supabase-js answers a sign-out the server never heard with `{ error }` and keeps the stored
 * session, and the app's next launch signed the member back in. Here the real client signs out
 * over a network that is down: the session is gone from the phone all the same, and what the
 * server still holds is owed. When the network returns, the owed sign-out is sent once: the old
 * session refreshed by a client of its own, its push token's row deleted, the session ended.
 */
jest.unmock('@supabase/supabase-js');

import { supabase } from '@/src/lib/supabase';
import { endSessionHere, settleOwedSignOut, __owedForTests } from '@/src/lib/endSession';
import { PUSH_TOKEN_KEY } from '@/src/lib/pushNotifications';

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
  storageReady: () => Promise.resolve(),
}));

const KEY = (supabase.auth as unknown as { storageKey: string }).storageKey;
const ME = '11111111-1111-4111-8111-111111111111';
const session = (refresh: string) => JSON.stringify({
  access_token: 'a.b.c', refresh_token: refresh, token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: ME, aud: 'authenticated', role: 'authenticated' },
});

/** Every request the clients made, by method and path. */
let asked: string[] = [];
/** The network: down, or answering as the house would. */
let networkUp = false;

beforeEach(() => {
  mockDisk.clear();
  asked = [];
  networkUp = false;
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    asked.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search.includes('grant_type=refresh_token') ? '?refresh' : ''}`);
    if (!networkUp) throw new TypeError('Network request failed');
    if (url.pathname.endsWith('/token')) {
      return new Response(session('rotated'), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(null, { status: 204 });
  });
});
afterEach(() => jest.restoreAllMocks());

it('ends the session on the phone when the server cannot be reached', async () => {
  mockDisk.set(KEY, session('first'));
  expect((await supabase.auth.getSession()).data.session?.refresh_token).toBe('first');

  expect(await endSessionHere()).toBe(false);

  // Gone from the phone: the next launch's read finds nobody to sign in.
  expect(mockDisk.has(KEY)).toBe(false);
  expect((await supabase.auth.getSession()).data.session).toBeNull();
  expect(__owedForTests()).toEqual({ refreshToken: 'first', userId: ME, pushToken: null });
});

it('owes the push token too when its row could not be deleted', async () => {
  mockDisk.set(KEY, session('first'));
  mockDisk.set(PUSH_TOKEN_KEY, 'ExponentPushToken[phone]');
  await endSessionHere({ pushStillHeld: true });
  expect(__owedForTests()).toEqual({ refreshToken: 'first', userId: ME, pushToken: 'ExponentPushToken[phone]' });
});

it('settles what is owed once the network returns: refreshed apart, token row deleted, session ended', async () => {
  mockDisk.set(KEY, session('first'));
  mockDisk.set(PUSH_TOKEN_KEY, 'ExponentPushToken[phone]');
  await endSessionHere({ pushStillHeld: true });

  // Still away: kept for next time.
  asked = [];
  await settleOwedSignOut();
  expect(__owedForTests()).not.toBeNull();

  networkUp = true;
  asked = [];
  await settleOwedSignOut();
  expect(asked).toEqual(['POST /auth/v1/token?refresh', 'DELETE /rest/v1/push_tokens', 'POST /auth/v1/logout']);
  expect(__owedForTests()).toBeNull();
  // …and this phone's own session was never touched by it.
  expect(mockDisk.has(KEY)).toBe(false);

  asked = [];
  await settleOwedSignOut();
  expect(asked).toEqual([]);
});

it('a reached sign-out owes nothing', async () => {
  networkUp = true;
  mockDisk.set(KEY, session('first'));
  expect(await endSessionHere()).toBe(true);
  expect(mockDisk.has(KEY)).toBe(false);
  expect(__owedForTests()).toBeNull();
});

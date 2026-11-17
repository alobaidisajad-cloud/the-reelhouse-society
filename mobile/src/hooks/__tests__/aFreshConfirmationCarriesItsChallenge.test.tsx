/**
 * aFreshConfirmationCarriesItsChallenge.test.tsx — review round 11 (resend, auth-callback)
 * ─────────────────────────────────────────────────────────────────────────────
 * A new member who asked for a fresh confirmation mail tapped its link and was told "VERIFICATION
 * FAILED / Link Expired or Invalid", although the address had been confirmed; the REQUEST NEW
 * VERIFICATION it offered then said "sent" for a mail the house never sends to a confirmed
 * address. The resend went out with no PKCE challenge (supabase-js 2.102), so the house sent that
 * mail in the implicit flow, its session in the link's fragment, which this app never reads.
 *
 * Driven through the real auth client (auth-js, the version the app ships), with only the house's
 * network stood in for: the resend carries a challenge, the phone keeps its verifier, and the code
 * the link brings back is traded with that verifier for a session. And the pages a failed link or
 * a fresh confirmation lands on never claim the address is unconfirmed (the house never says
 * whether it is): they lead with signing in.
 */
import React from 'react';
import { createHash } from 'crypto';
import { act, render, renderHook } from '@testing-library/react-native';
import { useAuthFlow } from '../useAuthFlow';
import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';
import AuthCallbackScreen from '@/app/auth-callback';
import { PasswordRecoveryModal } from '@/src/components/auth/PasswordRecoveryModal';

jest.mock('@/src/utils/reelToast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }),
}));
const mockStore = new Map<string, string>();
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    set: (k: string, v: string) => { mockStore.set(k, v); },
    getString: (k: string) => mockStore.get(k),
    delete: (k: string) => { mockStore.delete(k); },
    getAllKeys: () => [...mockStore.keys()],
  },
  setSensitive: jest.fn(),
  isStorageEncrypted: () => true,
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  initEncryptedStorage: jest.fn().mockResolvedValue(undefined),
  zustandMMKVStorage: { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() },
  zustandMMKVStorageSensitive: { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() },
  createAsyncMMKVStorage: () => ({ getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() }),
}));

/** The house's auth server, as the network brings it: each request kept, each answered. */
const NEWCOMER = { id: 'a1b2c3d4-0000-4000-8000-000000000001', aud: 'authenticated', email: 'n@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-11-17T10:00:00Z' };
const asked: { url: string; body: Record<string, unknown> | null }[] = [];
const houseFetch = async (url: string, init: { body?: string }) => {
  asked.push({ url, body: init.body ? JSON.parse(init.body) as Record<string, unknown> : null });
  const payload = url.includes('/token?grant_type=pkce')
    ? { access_token: 'at', refresh_token: 'rt', expires_in: 3600, token_type: 'bearer', user: NEWCOMER }
    : {};
  return { ok: true, status: 200, json: async () => payload, headers: { get: () => null } };
};
/** The phone's own keeping of the auth client's keys (the verifier among them). */
const kept = new Map<string, string>();
const { GoTrueClient } = jest.requireActual('@supabase/auth-js') as typeof import('@supabase/auth-js');
const realAuth = new GoTrueClient({
  url: 'https://house.test/auth/v1',
  headers: {},
  storageKey: 'sb-house-auth-token',
  storage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v); }, removeItem: (k: string) => { kept.delete(k); } },
  flowType: 'pkce',
  autoRefreshToken: false,
  persistSession: true,
  detectSessionInUrl: false,
  fetch: houseFetch as unknown as typeof fetch,
});

const auth = supabase.auth as unknown as Record<string, unknown>;
const params = () => (jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock }).useLocalSearchParams;
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
/** A challenge, as the house compares it with the verifier the phone sends back. */
const challengeOf = (verifier: string, method: unknown) =>
  (method === 'plain' ? verifier : createHash('sha256').update(verifier).digest('base64url'));

beforeEach(() => {
  asked.length = 0;
  kept.clear();
  auth.resend = (c: Parameters<typeof realAuth.resend>[0]) => realAuth.resend(c);
  auth.exchangeCodeForSession = (code: string) => realAuth.exchangeCodeForSession(code);
});

it('a fresh confirmation carries its challenge, and the link it sends is traded on this phone for a session', async () => {
  params().mockReturnValue({ action: 'resend_signup' });
  const { result } = await renderHook(() => useAuthFlow());
  await act(async () => { result.current.setForgotEmail('n@example.com'); });
  await act(async () => { await result.current.handleEmailLink(); });
  expect(result.current.forgotSent).toBe(true);

  const resend = asked.find((a) => a.url.includes('/resend'));
  expect(resend).toBeDefined();
  const challenge = resend!.body?.code_challenge;
  expect(typeof challenge).toBe('string');
  expect((challenge as string).length).toBeGreaterThan(20);
  expect(['s256', 'plain']).toContain(resend!.body?.code_challenge_method);
  // The link comes back to the app's own door.
  expect(resend!.url).toContain('redirect_to=');

  // The link, opened on this phone: its code is traded with the verifier kept when it was asked for.
  const adopt = jest.fn();
  useAuthStore.setState({ adoptSession: adopt } as never);
  params().mockReturnValue({ code: 'the-code', type: 'signup' });
  const r = render(<AuthCallbackScreen />);
  await settle();
  const trade = asked.find((a) => a.url.includes('/token?grant_type=pkce'));
  expect(trade).toBeDefined();
  expect(trade!.body?.auth_code).toBe('the-code');
  expect(challengeOf(String(trade!.body?.code_verifier), resend!.body?.code_challenge_method)).toBe(challenge);
  expect(adopt).toHaveBeenCalledWith(expect.objectContaining({ id: NEWCOMER.id }));
  r.unmount();
});

it('a sign-up link that did not open leads with signing in, and never calls the address unconfirmed', async () => {
  params().mockReturnValue({ type: 'signup', error: 'access_denied', error_code: 'otp_expired', error_description: 'Email link is invalid or has expired' });
  const r = render(<AuthCallbackScreen />);
  await settle();
  expect(r.getByText(/may already be confirmed/)).toBeTruthy();
  expect(r.queryByText('VERIFICATION FAILED')).toBeNull();
  expect(r.queryByText(/expired or was already used/)).toBeNull();
  // SIGN IN first, a new link second.
  const words = r.getAllByText(/^(SIGN IN|REQUEST NEW VERIFICATION|RETURN TO THE LOBBY)$/).map((t) => t.props.children);
  expect(words).toEqual(['SIGN IN', 'REQUEST NEW VERIFICATION', 'RETURN TO THE LOBBY']);
  r.unmount();
});

it('a fresh confirmation "sent" says the address may already be confirmed, and offers signing in', async () => {
  const r = render(
    <PasswordRecoveryModal visible purpose="confirm" forgotSent forgotEmail="n@example.com" forgotLoading={false}
      onClose={() => {}} onEmailChange={() => {}} onSubmit={() => {}} onBackToSignIn={() => {}} />,
  );
  expect(r.getByText(/may already be confirmed/)).toBeTruthy();
  expect(r.getByText('Try Signing In')).toBeTruthy();
  expect(r.getByText('✦  SIGN IN')).toBeTruthy();
  expect(r.queryByText(/We sent a fresh confirmation link/)).toBeNull();
  r.unmount();
});

it('a password reset "sent" is told as before', async () => {
  const r = render(
    <PasswordRecoveryModal visible purpose="reset" forgotSent forgotEmail="n@example.com" forgotLoading={false}
      onClose={() => {}} onEmailChange={() => {}} onSubmit={() => {}} onBackToSignIn={() => {}} />,
  );
  expect(r.getByText('Check Your Inbox')).toBeTruthy();
  expect(r.getByText(/We sent a password reset link to/)).toBeTruthy();
  expect(r.getByText('✦  BACK TO SIGN IN')).toBeTruthy();
  r.unmount();
});

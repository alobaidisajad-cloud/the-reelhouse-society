/**
 * Signing in, signing up and the email links tell the member what happened,
 * in the house's words, and every door into a session does the same things.
 */
import React from 'react';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { mapAuthError, useAuthFlow } from '../useAuthFlow';
import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';
import AuthCallbackScreen from '@/app/auth-callback';
import LoginScreen from '@/app/(modals)/login';
import { TERMS_URL, PRIVACY_URL } from '@/src/constants/support';

const mockOpenHousePage = jest.fn(async (_url: string) => {});
jest.mock('@/src/utils/housePages', () => ({ openHousePage: (u: string) => mockOpenHousePage(u) }));

// Made inside the factory: the imports above load it before this file's consts exist.
jest.mock('@/src/utils/reelToast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }),
}));
const mockToast = jest.requireMock('@/src/utils/reelToast').default as jest.Mock & { error: jest.Mock; success: jest.Mock };
const mockIdentify = jest.fn(async () => {});
jest.mock('@/src/lib/revenueCat', () => ({
  identifyUser: (...a: unknown[]) => mockIdentify(...(a as [])),
  logoutRevenueCat: jest.fn(),
}));
const mockHydrateFollowing = jest.fn();
jest.mock('@/src/stores/domain/socialSlice', () => ({ hydrateFollowing: () => mockHydrateFollowing() }));
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
  initEncryptedStorage: jest.fn().mockResolvedValue(undefined),
  zustandMMKVStorage: { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() },
  zustandMMKVStorageSensitive: { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() },
  createAsyncMMKVStorage: () => ({ getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() }),
}));

const auth = supabase.auth as unknown as Record<string, jest.Mock>;
const RATE = 'For security purposes, you can only request this after 42 seconds.';

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  useAuthStore.setState({ user: null, isAuthenticated: false, loading: false } as never);
});

describe('the house says what went wrong', () => {
  it('in its own words, for the refusals Supabase actually sends', () => {
    expect(mapAuthError('Email not confirmed').message).toMatch(/not confirmed yet/);
    expect(mapAuthError(RATE).message).toMatch(/needs a moment/);
    expect(mapAuthError('Email link is invalid or has expired').message).toMatch(/expired or was already used/);
  });
});

describe('asking for the confirmation email again', () => {
  it('says so when Supabase refuses, and never claims it was sent', async () => {
    // supabase-js ANSWERS a refusal; it does not throw one.
    auth.resend = jest.fn().mockResolvedValue({ data: null, error: { message: RATE } });
    const { result } = await renderHook(() => useAuthFlow());
    await act(async () => { await result.current.handleResend(); });
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/needs a moment/));
  });

  it('says it was sent when it was', async () => {
    auth.resend = jest.fn().mockResolvedValue({ data: {}, error: null });
    const { result } = await renderHook(() => useAuthFlow());
    await act(async () => { await result.current.handleResend(); });
    expect(mockToast.success).toHaveBeenCalled();
  });
});

describe('a handle being checked', () => {
  it('is looked up as it would be claimed, not as typed', async () => {
    jest.useFakeTimers();
    const asked: unknown[] = [];
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (_c: string, v: unknown) => { asked.push(v); return chain; };
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    jest.spyOn(supabase, 'from').mockReturnValue(chain as never);
    const { result } = await renderHook(() => useAuthFlow());
    await act(async () => { result.current.checkUsernameAvailability('John.Doe'); });
    await act(async () => { jest.advanceTimersByTime(600); });
    expect(asked).toEqual(['johndoe']);
    jest.useRealTimers();
  });
});

describe('a link that fails says why, in the house\'s words', () => {
  const params = () => (jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock }).useLocalSearchParams;
  const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

  it('an expired link, by the reason Supabase sends back with it', async () => {
    params().mockReturnValue({ type: 'signup', error: 'access_denied', error_code: 'otp_expired', error_description: 'Email link is invalid or has expired' });
    const r = render(<AuthCallbackScreen />);
    await settle();
    expect(r.getByText(/expired or was already used/)).toBeTruthy();
    r.unmount();
  });

  it('a link opened on another phone: never the library\'s own words', async () => {
    params().mockReturnValue({ code: 'abc', type: 'signup' });
    auth.exchangeCodeForSession = jest.fn().mockResolvedValue({
      data: { session: null },
      error: new Error('PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device'),
    });
    const r = render(<AuthCallbackScreen />);
    await settle();
    expect(r.getByText(/belongs to the phone that asked for it/)).toBeTruthy();
    expect(r.queryByText(/PKCE/)).toBeNull();
    r.unmount();
  });

  it('offers SIGN IN once, never the same door twice', async () => {
    params().mockReturnValue({});
    const r = render(<AuthCallbackScreen />);
    await settle();
    expect(r.getByText('SIGN IN')).toBeTruthy();
    expect(r.queryByText('RETURN TO LOGIN')).toBeNull();
    r.unmount();
  });
});

describe('a fresh confirmation', () => {
  it('asks only for the address, and sends a confirmation, not a reset', async () => {
    (jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock }).useLocalSearchParams.mockReturnValue({ action: 'resend_signup' });
    auth.resend = jest.fn().mockResolvedValue({ data: {}, error: null });
    auth.resetPasswordForEmail = jest.fn().mockResolvedValue({ data: {}, error: null });
    const { result } = await renderHook(() => useAuthFlow());
    expect(result.current.isLogin).toBe(true);
    expect(result.current.forgotModalVisible).toBe(true);
    expect(result.current.linkPurpose).toBe('confirm');
    await act(async () => { result.current.setForgotEmail(' m@example.com '); });
    await act(async () => { await result.current.handleEmailLink(); });
    expect(auth.resend).toHaveBeenCalledWith(expect.objectContaining({ type: 'signup', email: 'm@example.com' }));
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(result.current.forgotSent).toBe(true);
  });

  it('every sign-up email names itself, so a failed one offers a fresh one', async () => {
    const linking = jest.requireMock('expo-linking') as { createURL: jest.Mock };
    auth.signUp = jest.fn().mockResolvedValue({ data: { user: { id: 'n1' }, session: null }, error: null });
    await useAuthStore.getState().signup('n@example.com', 'Secret#123', 'newcomer');
    expect(linking.createURL).toHaveBeenCalledWith('auth-callback', { queryParams: { type: 'signup' } });
    expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ emailRedirectTo: linking.createURL.mock.results.at(-1)?.value }),
    }));
  });
});

describe('the sign-in screen', () => {
  it('opens the Terms of Use and the Privacy Policy a member is taken to agree to', async () => {
    (jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock }).useLocalSearchParams.mockReturnValue({});
    const r = render(<LoginScreen />);
    await act(async () => { await fireEvent.press(r.getByLabelText('Terms of Use')); });
    await act(async () => { await fireEvent.press(r.getByLabelText('Privacy Policy')); });
    expect(mockOpenHousePage).toHaveBeenCalledWith(TERMS_URL);
    expect(mockOpenHousePage).toHaveBeenCalledWith(PRIVACY_URL);
    r.unmount();
  });

  it('a handle typed with its @ is not taken for an address to reset', async () => {
    (jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock }).useLocalSearchParams.mockReturnValue({});
    const r = render(<LoginScreen />);
    await act(async () => { await fireEvent.changeText(r.getByTestId('email-input'), '@noir_fan'); });
    await act(async () => { await fireEvent.press(r.getByLabelText('Forgot your credentials')); });
    expect(r.getByTestId('recovery-email-input').props.value).toBe('');
    r.unmount();
  });
});

describe('every door into a session', () => {
  it('the form, a link and a confirmed sign-up all sign in the same way', () => {
    // The profile read behind it, answered.
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.single = () => Promise.resolve({ data: { id: 'm1', username: 'member' }, error: null });
    jest.spyOn(supabase, 'from').mockReturnValue(chain as never);
    const user = { id: 'm1', email: 'm@example.com' } as never;
    useAuthStore.getState().adoptSession(user);
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(true);
    expect(mockStore.get('last_user_id')).toBe('m1');   // remembered for the next launch
    expect(mockIdentify).toHaveBeenCalledWith('m1');     // the store knows who is buying
    expect(mockHydrateFollowing).toHaveBeenCalled();     // whom they follow, behind
  });

  it('"I have confirmed" signs in through the form\'s own sign-in', async () => {
    const login = jest.fn(async () => {});
    useAuthStore.setState({ login } as never);
    const { result } = await renderHook(() => useAuthFlow());
    await act(async () => { result.current.setEmailOrUsername('m@example.com'); result.current.setPassword('Secret#123'); });
    await act(async () => { await result.current.handleManualConfirmationCheck(); });
    expect(login).toHaveBeenCalledWith('m@example.com', 'Secret#123');
  });

  it('an email link signs in through the same door', async () => {
    const adopt = jest.fn();
    useAuthStore.setState({ adoptSession: adopt } as never);
    const session = { user: { id: 'm2' }, access_token: 't' };
    auth.exchangeCodeForSession = jest.fn().mockResolvedValue({ data: { session }, error: null });
    const { useLocalSearchParams } = jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock };
    useLocalSearchParams.mockReturnValue({ code: 'abc', type: 'signup' });
    const r = render(<AuthCallbackScreen />);
    await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    expect(adopt).toHaveBeenCalledWith(session.user);
    r.unmount();   // and never leaves a walk onward running behind it (see below)
  });

  it('leaving before the walk onward cancels it — the member is not pulled back', async () => {
    // The screen waits a moment on "confirmed", then goes on to the Lobby. That
    // timer outlived the screen: a member who went back first was pulled
    // forward anyway (and the tests' timer fired inside the next test file).
    jest.useFakeTimers();
    // Where nav sends the member: expo-router's own router (src/utils/typedRouter.ts).
    const replace = (jest.requireMock('expo-router') as { router: { replace: jest.Mock } }).router.replace;
    replace.mockClear();
    const { useRouter, useLocalSearchParams } = jest.requireMock('expo-router') as Record<string, jest.Mock>;
    useRouter.mockReturnValue({ push: jest.fn(), replace, back: jest.fn(), dismissAll: jest.fn() });
    useLocalSearchParams.mockReturnValue({ code: 'abc', type: 'signup' });
    useAuthStore.setState({ adoptSession: jest.fn() } as never);
    auth.exchangeCodeForSession = jest.fn().mockResolvedValue({ data: { session: { user: { id: 'm3' } } }, error: null });
    const r = render(<AuthCallbackScreen />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    r.unmount();
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(replace).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  /**
   * A link with no code and no token verified nothing. Anyone can open one
   * (`reelhouse://auth-callback`, from any page). Taken as a recovery, it armed
   * the flag that signs a member out on the next launch, and sent them to set a
   * new password they never asked to change.
   */
  it.each([
    ['a bare link', {}],
    ['a link that only claims to be a recovery', { type: 'recovery' }],
  ])('%s, opened while signed in, arms nothing and sends nowhere', async (_name, params) => {
    jest.useFakeTimers();
    // Where nav sends the member: expo-router's own router (src/utils/typedRouter.ts).
    const replace = (jest.requireMock('expo-router') as { router: { replace: jest.Mock } }).router.replace;
    replace.mockClear();
    const { useRouter, useLocalSearchParams } = jest.requireMock('expo-router') as Record<string, jest.Mock>;
    useRouter.mockReturnValue({ push: jest.fn(), replace, back: jest.fn(), dismissAll: jest.fn() });
    useLocalSearchParams.mockReturnValue(params);
    auth.getSession = jest.fn().mockResolvedValue({ data: { session: { user: { id: 'm4' } } }, error: null });
    const r = render(<AuthCallbackScreen />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(mockStore.get('recovery_pending')).toBeUndefined();
    expect(replace).not.toHaveBeenCalledWith('/reset-password');
    expect(r.getByText('VERIFICATION FAILED')).toBeTruthy();
    r.unmount();
    jest.useRealTimers();
  });

  it('and staying, it walks on to the Lobby', async () => {
    jest.useFakeTimers();
    // Where nav sends the member: expo-router's own router (src/utils/typedRouter.ts).
    const replace = (jest.requireMock('expo-router') as { router: { replace: jest.Mock } }).router.replace;
    replace.mockClear();
    const { useRouter, useLocalSearchParams } = jest.requireMock('expo-router') as Record<string, jest.Mock>;
    useRouter.mockReturnValue({ push: jest.fn(), replace, back: jest.fn(), dismissAll: jest.fn() });
    useLocalSearchParams.mockReturnValue({ code: 'abc', type: 'signup' });
    useAuthStore.setState({ adoptSession: jest.fn() } as never);
    auth.exchangeCodeForSession = jest.fn().mockResolvedValue({ data: { session: { user: { id: 'm3' } } }, error: null });
    const r = render(<AuthCallbackScreen />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(replace).toHaveBeenCalledWith('/(tabs)');
    r.unmount();
    jest.useRealTimers();
  });
});

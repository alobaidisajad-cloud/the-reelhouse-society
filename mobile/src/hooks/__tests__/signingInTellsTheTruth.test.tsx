/**
 * Signing in, signing up and the email links tell the member what happened,
 * in the house's words, and every door into a session does the same things.
 */
import React from 'react';
import { act, render, renderHook } from '@testing-library/react-native';
import { mapAuthError, useAuthFlow } from '../useAuthFlow';
import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';
import AuthCallbackScreen from '@/app/auth-callback';

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
    render(<AuthCallbackScreen />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(adopt).toHaveBeenCalledWith(session.user);
  });
});

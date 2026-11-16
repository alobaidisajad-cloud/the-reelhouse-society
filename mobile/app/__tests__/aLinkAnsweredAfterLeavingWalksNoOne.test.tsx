/**
 * aLinkAnsweredAfterLeavingWalksNoOne.test.tsx — review round 6
 * ─────────────────────────────────────────────────────────────────────────────
 * An email's link opens a screen that asks the house about it, and walks the member on once it is
 * answered. Leaving cancelled only a walk already set: a member who went back while the link was
 * still being asked about was pulled off the screen they had gone to once the answer came, every
 * screen above the tabs closed. Now the answer still lands (the session it confirms is kept), but
 * walks no one anywhere.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import AuthCallbackScreen from '../auth-callback';
import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';

const auth = supabase.auth as unknown as Record<string, jest.Mock>;
const AS_BUILT = useAuthStore.getState();

afterEach(() => {
  jest.useRealTimers();
  useAuthStore.setState({ ...AS_BUILT, user: null, isAuthenticated: false, loading: false } as never, true);
});

it('a member who leaves before the link is answered is walked nowhere once it is', async () => {
  jest.useFakeTimers();
  const router = (jest.requireMock('expo-router') as { router: { replace: jest.Mock; dismissTo: jest.Mock; dismissAll: jest.Mock } }).router;
  router.replace.mockClear();
  router.dismissTo.mockClear();
  router.dismissAll.mockClear();
  const dismissAll = jest.fn();
  const { useRouter, useLocalSearchParams } = jest.requireMock('expo-router') as { useRouter: jest.Mock; useLocalSearchParams: jest.Mock };
  useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissAll });
  useLocalSearchParams.mockReturnValue({ code: 'abc', type: 'signup' });
  const adopt = jest.fn();
  useAuthStore.setState({ adoptSession: adopt } as never);

  let answer!: (v: unknown) => void;
  auth.exchangeCodeForSession = jest.fn(() => new Promise((resolve) => { answer = resolve; }));
  const r = render(<AuthCallbackScreen />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(auth.exchangeCodeForSession).toHaveBeenCalled();

  // The member goes back while the house is still asked.
  r.unmount();
  const session = { user: { id: 'm5' }, access_token: 't' };
  await act(async () => { answer({ data: { session }, error: null }); await Promise.resolve(); await Promise.resolve(); });
  await act(async () => { jest.advanceTimersByTime(5000); });

  // The session the link confirmed is kept.
  expect(adopt).toHaveBeenCalledWith(session.user);
  // And no one is walked anywhere.
  expect(dismissAll).not.toHaveBeenCalled();
  expect(router.dismissAll).not.toHaveBeenCalled();
  expect(router.dismissTo).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});

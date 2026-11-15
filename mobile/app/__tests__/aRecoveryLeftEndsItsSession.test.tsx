/**
 * aRecoveryLeftEndsItsSession.test.tsx — a password reset left unfinished, by any way out.
 *
 * Only the screen's own BACK TO LOBBY ended the recovery's session. Left by Android's back or the
 * iOS swipe, the recovery flag stayed, and a later launch signed the member out, whatever they had
 * signed in with since (review round 1, 2026-11-14). Every leave ends it now; a reset made, none.
 */
import React from 'react';
import { render, act } from '@testing-library/react-native';
import { supabase } from '@/src/lib/supabase';
import { storage } from '@/src/stores/mmkv-storage';
import ResetPasswordScreen from '../reset-password';

let mockLeave: (() => void) | null = null;
jest.mock('expo-router/react-navigation', () => ({
  ...require('@/test-utils/navigationMock').navigationMock(),
  useNavigation: () => ({
    addListener: (event: string, fn: () => void) => {
      if (event === 'beforeRemove') mockLeave = fn;
      return () => { if (mockLeave === fn) mockLeave = null; };
    },
  }),
}));
jest.mock('@/src/lib/endSession', () => ({ endSessionHere: jest.fn(async () => true) }));
const { endSessionHere } = jest.requireMock('@/src/lib/endSession') as { endSessionHere: jest.Mock };

const mount = async () => {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: 'me' } } }, error: null });
  const r = render(<ResetPasswordScreen />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return r;
};

beforeEach(() => { mockLeave = null; endSessionHere.mockClear(); });
afterEach(() => { storage.delete('recovery_pending'); });

it('left by back or a swipe with the recovery unfinished, ends its session and its flag', async () => {
  storage.set('recovery_pending', 'true');
  await mount();
  expect(mockLeave).not.toBeNull();
  await act(async () => { mockLeave?.(); });
  expect(storage.getString('recovery_pending')).toBeUndefined();
  expect(endSessionHere).toHaveBeenCalledTimes(1);
});

it('left once the recovery is over, ends no session', async () => {
  await mount();
  storage.delete('recovery_pending');
  expect(mockLeave).not.toBeNull();
  await act(async () => { mockLeave?.(); });
  expect(endSessionHere).not.toHaveBeenCalled();
});

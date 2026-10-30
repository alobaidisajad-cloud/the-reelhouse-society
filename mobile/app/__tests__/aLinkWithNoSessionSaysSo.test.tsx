/**
 * aLinkWithNoSessionSaysSo.test.tsx — a reset link opened with no session.
 *
 * The screen says what happened (SESSION EXPIRED, No Active Session), offers a new link and the way
 * back to the Lobby, both 48 a finger. No test drew this state, so no capture measured it: on
 * 2026-10-30 both E2E platforms found its words pushed off the top after the touch batch (B1b).
 */
import React from 'react';
import { render, act } from '@testing-library/react-native';
import { supabase } from '@/src/lib/supabase';
import ResetPasswordScreen from '../reset-password';

const mount = async () => {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null }, error: null });
  const r = render(<ResetPasswordScreen />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return r;
};

it('says the session has expired, in its own words, with no password form', async () => {
  const r = await mount();
  expect(r.getByText('SESSION EXPIRED')).toBeTruthy();
  expect(r.getByText('No Active Session')).toBeTruthy();
  expect(r.queryByLabelText('New password')).toBeNull();
});

it('offers a new link and the way back to the Lobby', async () => {
  const r = await mount();
  expect(r.getByText('REQUEST NEW RESET LINK')).toBeTruthy();
  expect(r.getByText('RETURN TO LOBBY')).toBeTruthy();
});

/**
 * aRecoveryLeftEndsItsSession.test.tsx — a password reset left unfinished, by any way out.
 *
 * Only the screen's own BACK TO LOBBY ended the recovery's session. Left by Android's back or the
 * iOS swipe, the recovery flag stayed, and a later launch signed the member out, whatever they had
 * signed in with since (review round 1, 2026-11-14). Every leave ends it now; a reset made, none.
 */
import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import { supabase } from '@/src/lib/supabase';
import { storage } from '@/src/stores/mmkv-storage';
import { nav } from '@/src/utils/typedRouter';
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

/**
 * Review round 8: a new password set, its session read answering after the member had left the
 * screen, set the promised three-second walk home after the screen's own cleanup had run. Nothing
 * cleared it, and three seconds later it took the member home from wherever they had gone.
 */
describe('the walk home three seconds after a new password', () => {
  /** The session read after the password is set, held until the test lets it answer. */
  const holdTheSessionRead = () => {
    let answer: () => void = () => {};
    (supabase.auth.getSession as jest.Mock).mockImplementationOnce(() => new Promise((res) => {
      answer = () => res({ data: { session: null }, error: null });
    }));
    return async () => { await act(async () => { answer(); }); };
  };
  const setThePassword = async (r: Awaited<ReturnType<typeof mount>>) => {
    await act(async () => { await fireEvent.changeText(r.getByLabelText('New password'), 'New#Pass123'); });
    await act(async () => { await fireEvent.changeText(r.getByLabelText('Confirm new password'), 'New#Pass123'); });
    await act(async () => { await fireEvent.press(r.getByLabelText('Reset password: submit the new one')); });
  };
  const threeSeconds = () => act(async () => { jest.advanceTimersByTime(3100); });

  let home: jest.SpyInstance;
  beforeEach(() => { home = jest.spyOn(nav, 'dismissTo').mockImplementation(() => {}); });
  afterEach(() => { home.mockRestore(); jest.useRealTimers(); });

  it('walks the member home while they are on the screen, and nobody once they have left it', async () => {
    const stays = await mount();
    jest.useFakeTimers();
    const answerHere = holdTheSessionRead();
    await setThePassword(stays);
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'New#Pass123' });
    await answerHere();
    await threeSeconds();
    expect(home).toHaveBeenCalledTimes(1);
    expect(home).toHaveBeenCalledWith('/(tabs)');
    stays.unmount();
    jest.useRealTimers();

    home.mockClear();
    const leaves = await mount();
    jest.useFakeTimers();
    const answerGone = holdTheSessionRead();
    await setThePassword(leaves);
    leaves.unmount();
    await answerGone();
    await threeSeconds();
    expect(home).not.toHaveBeenCalled();
  });
});

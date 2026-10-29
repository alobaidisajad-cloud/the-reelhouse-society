/**
 * aNewPasswordSaysWhichField.test.tsx — setting a new password from a reset link.
 *
 * A refusal ("Passwords do not match.") was a toast at the top of the screen,
 * gone in seconds, about no field in particular. Now it sits under the field it
 * is about, the field says it, and the member is sent there; put right, it goes.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';
import { supabase } from '@/src/lib/supabase';
import ResetPasswordScreen from '../reset-password';

jest.mock('@/src/utils/reelToast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }),
}));
const mockToast = jest.requireMock('@/src/utils/reelToast').default as { error: jest.Mock };

const mount = async () => {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: 'me' } } }, error: null });
  const r = render(<ResetPasswordScreen />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return r;
};

it('two passwords that differ: said under the confirmation, with it, and focused; mended, gone', async () => {
  jest.mocked(AccessibilityInfo.sendAccessibilityEvent).mockClear();
  const r = await mount();
  await act(async () => { await fireEvent.changeText(r.getByLabelText('New password'), 'New#Pass123'); });
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Confirm new password'), 'New#Pass124'); });
  await act(async () => { await fireEvent(r.getByLabelText('Confirm new password'), 'submitEditing'); });
  expect(r.getByLabelText('Confirm new password').props.accessibilityHint).toBe('Passwords do not match.');
  expect(r.getByText('Passwords do not match.')).toBeTruthy();
  expect(r.queryByText('PASSWORDS DO NOT MATCH')).toBeNull();
  expect(r.getByLabelText('New password').props.accessibilityHint).toBeUndefined();
  expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledWith(expect.anything(), 'focus');
  expect(mockToast.error).not.toHaveBeenCalled();
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Confirm new password'), 'New#Pass123'); });
  expect(r.queryByText('Passwords do not match.')).toBeNull();
});

it('a weak password: said under the new password, and focused there', async () => {
  const r = await mount();
  await act(async () => { await fireEvent.changeText(r.getByLabelText('New password'), 'short'); });
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Confirm new password'), 'short'); });
  await act(async () => { await fireEvent(r.getByLabelText('Confirm new password'), 'submitEditing'); });
  expect(r.getByLabelText('New password').props.accessibilityHint).toBe('Password does not meet security requirements.');
  expect(r.getByLabelText('Confirm new password').props.accessibilityHint).toBeUndefined();
});

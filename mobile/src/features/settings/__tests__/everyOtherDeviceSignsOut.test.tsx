/**
 * Settings signs every other device out, asked first, and says what happened (P4.1).
 */
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PasswordChangePanel } from '../SettingsSections';
import { endOtherSessions } from '@/src/lib/endSession';
import reelToast from '@/src/utils/reelToast';

jest.mock('@/src/lib/endSession', () => ({ endOtherSessions: jest.fn() }));
jest.mock('@/src/utils/reelToast', () => {
  const t = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: t };
});

const ended = endOtherSessions as jest.Mock;
type Button = { text: string; style?: string; onPress?: () => void };

beforeEach(() => {
  ended.mockReset();
  (reelToast.success as jest.Mock).mockClear();
  (reelToast.error as jest.Mock).mockClear();
});
afterEach(() => jest.restoreAllMocks());

/** Presses the action, and answers its dialog with the button named. */
async function choose(answer: 'Cancel' | 'Sign out') {
  const asked = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const r = await render(<PasswordChangePanel />);
  await fireEvent.press(r.getByLabelText('Sign out of other devices: every one but this phone'));
  expect(asked).toHaveBeenCalledTimes(1);
  const [title, , buttons] = asked.mock.calls[0] as [string, string, Button[]];
  expect(title).toBe('Sign out of every other device?');
  buttons.find((b) => b.text === answer)?.onPress?.();
  return r;
}

it('asks first, and a Cancel signs nobody out', async () => {
  await choose('Cancel');
  expect(ended).not.toHaveBeenCalled();
});

it('signs every other device out, and says so', async () => {
  ended.mockResolvedValue(true);
  await choose('Sign out');
  await waitFor(() => expect(reelToast.success).toHaveBeenCalledWith('Every other device is signed out.'));
  expect(ended).toHaveBeenCalledTimes(1);
});

it('says plainly when the house could not be reached', async () => {
  ended.mockResolvedValue(false);
  await choose('Sign out');
  await waitFor(() => expect(reelToast.error).toHaveBeenCalledWith('The house could not be reached. Nothing was signed out.'));
  expect(reelToast.success).not.toHaveBeenCalled();
});

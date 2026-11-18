/**
 * A link sent is heard — review round 12.
 *
 * SEND RESET LINK (or SEND CONFIRMATION LINK) answered by swapping the whole form for the sent
 * words: the button a screen-reader member had pressed vanished under their focus, nothing was
 * announced, and the success was never heard. The sent title is now a heading, and the focus is
 * moved onto it when the link is sent — and only then.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { PasswordRecoveryModal } from '../PasswordRecoveryModal';

const SHEET = {
  visible: true, purpose: 'reset' as const, forgotEmail: 'kane@example.com', forgotLoading: false,
  onClose: jest.fn(), onEmailChange: jest.fn(), onSubmit: jest.fn(), onBackToSignIn: jest.fn(),
};

it('moves a screen reader onto "Check Your Inbox" when the link is sent, and not before', async () => {
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<PasswordRecoveryModal {...SHEET} forgotSent={false} />); });
  expect(focus).not.toHaveBeenCalled();
  await act(async () => { r.rerender(<PasswordRecoveryModal {...SHEET} forgotSent />); });
  const title = r.getByText('Check Your Inbox');
  expect(title.props.accessibilityRole).toBe('header');
  expect(focus).toHaveBeenCalledTimes(1);
  expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
  focus.mockRestore();
});

/**
 * A password too long for the lock is said as it appears — review round 12.
 *
 * "Too long for the lock: 72 characters at most." carried only a live region, which iOS ignores:
 * a VoiceOver member typing past the lock was never told. It is spoken on both phones (SaidText).
 */
import React from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { PASSWORD_TOO_LONG, PasswordStrengthMeter } from '../PasswordStrengthMeter';

const original = Platform.OS;
const onPlatform = (os: string) => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
afterAll(() => onPlatform(original));

it('on an iPhone, typing past the lock is announced, and a password that fits says nothing of it', async () => {
  onPlatform('ios');
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<PasswordStrengthMeter password={'Aa1!'.repeat(18)} />); });
  expect(announce).not.toHaveBeenCalledWith(PASSWORD_TOO_LONG);
  await act(async () => { r.rerender(<PasswordStrengthMeter password={'Aa1!'.repeat(19)} />); });
  expect(announce).toHaveBeenCalledWith(PASSWORD_TOO_LONG);
  expect(r.getByText(PASSWORD_TOO_LONG).props.accessibilityLiveRegion).toBe('polite');
  announce.mockRestore();
});

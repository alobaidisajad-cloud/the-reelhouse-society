/**
 * A FAILED SAVE IS SPOKEN — review round 12.
 *
 * Edit Profile drew a failed save in a red banner at the head of the form ("Your other
 * amendments are saved, but the house kept your handle …", "Something below needs your
 * attention …") with no live region and no announcement: silent on both phones, while the
 * member's focus stayed on SAVE. It is now spoken as it appears (SaidText).
 */
import React from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { render, act } from '@testing-library/react-native';

import { EditProfileScreen } from '../EditProfileScreen';

const FAILED = 'Something below needs your attention before it can be saved.';
jest.mock('@/src/hooks/useEditProfile', () => ({
  useEditProfile: () => {
    const { useForm } = jest.requireActual('react-hook-form');
    const form = useForm({ defaultValues: { username: 'cinephile', display_name: '', bio: '', links: [] } });
    return {
      user: { id: 'u1', username: 'cinephile', created_at: '2026-01-01T00:00:00Z' },
      form, avatarPreview: null, setAvatarPreview: jest.fn(), avatarBase64: null, setAvatarBase64: jest.fn(),
      showCropModal: false, setShowCropModal: jest.fn(), handleRemoveAvatar: jest.fn(),
      fields: [], handleAddLink: jest.fn(), handleRemoveLink: jest.fn(),
      saving: false, sealed: false, submitError: 'Something below needs your attention before it can be saved.',
      handleSave: jest.fn(), handleBack: jest.fn(), isDirty: true,
    };
  },
}));
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, standing: 'held', open: jest.fn() }) }));
// The glow behind the form breathes only while the screen is focused.
jest.mock('expo-router/react-navigation', () => ({
  ...jest.requireActual('expo-router/react-navigation'),
  useIsFocused: () => true,
}));

const original = Platform.OS;
const onPlatform = (os: string) => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
afterAll(() => onPlatform(original));
beforeEach(() => { jest.mocked(AccessibilityInfo.announceForAccessibility).mockClear(); });

it('on an iPhone the failed save is announced as it appears', async () => {
  onPlatform('ios');
  await act(async () => { render(<EditProfileScreen />); });
  expect(jest.mocked(AccessibilityInfo.announceForAccessibility).mock.calls).toContainEqual([FAILED]);
});

it('on Android it is a live region, which speaks it', async () => {
  onPlatform('android');
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<EditProfileScreen />); });
  expect(r.getByText(FAILED).props.accessibilityLiveRegion).toBe('polite');
});

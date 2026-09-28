/**
 * THE DOSSIER'S SEAL IS SPOKEN — on both phones. EXECUTED, not read.
 *
 * Saving the profile ends on a seal, "Dossier amended". The seal is a live
 * region, and React Native's live regions are ANDROID ONLY: on iPhone the save
 * completed in silence for a VoiceOver member. The screen now announces it on
 * iOS itself. logScreenPolish.guard checked that by pattern-matching the
 * source; this mounts the screen in its sealed state on each platform and
 * listens.
 */
import React from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { render, act } from '@testing-library/react-native';

import { EditProfileScreen } from '../EditProfileScreen';

jest.mock('@/src/hooks/useEditProfile', () => ({
  useEditProfile: () => {
    const { useForm } = jest.requireActual('react-hook-form');
    const form = useForm({ defaultValues: { username: 'cinephile', display_name: '', bio: '', links: [] } });
    return {
      user: { id: 'u1', username: 'cinephile', created_at: '2026-01-01T00:00:00Z' },
      form, errors: {}, avatarPreview: null, setAvatarPreview: jest.fn(), avatarBase64: null, setAvatarBase64: jest.fn(),
      showCropModal: false, setShowCropModal: jest.fn(), handleRemoveAvatar: jest.fn(),
      fields: [], handleAddLink: jest.fn(), handleRemoveLink: jest.fn(),
      saving: false, sealed: true, submitError: null, handleSave: jest.fn(), handleBack: jest.fn(), isDirty: false,
    };
  },
}));
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, standing: 'held', open: jest.fn() }) }));
// The glow behind the form breathes only while the screen is focused.
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));

const SEAL = 'Dossier amended — the record now reflects your hand';
const original = Platform.OS;
const onPlatform = (os: string) => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
afterAll(() => onPlatform(original));
beforeEach(() => { jest.mocked(AccessibilityInfo.announceForAccessibility).mockClear(); });

it('on iOS, where a live region is silent, the screen announces the seal itself — once', async () => {
  onPlatform('ios');
  await act(async () => { render(<EditProfileScreen />); });
  expect(jest.mocked(AccessibilityInfo.announceForAccessibility).mock.calls).toEqual([[SEAL]]);
});

it('on Android the live region speaks it, so nothing announces it as well', async () => {
  onPlatform('android');
  await act(async () => { render(<EditProfileScreen />); });
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
});

/**
 * A portrait picked while Android ended the app comes back (P4.12).
 *
 * Android may end the app while the camera or Photos is open; the member's choice was lost and Edit
 * Profile opened as if nothing had been picked. The system keeps the picker's answer
 * (getPendingResultAsync): Edit Profile opens the crop sheet holding it, and the sheet prepares it
 * as if it had just been picked.
 */
import React from 'react';
import { Platform } from 'react-native';
import { render, renderHook, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator } from 'expo-image-manipulator';
import AvatarCropSheet from '@/src/components/profile/AvatarCropSheet';
import { useEditProfile } from '@/src/hooks/useEditProfile';

const mockState = {
  user: { id: 'u1', username: 'tomas', display_name: '', bio: '', social_links: [], created_at: '2026-01-01T00:00:00Z', preferences: {} },
  updateUser: jest.fn(),
};
jest.mock('@/src/stores/auth', () => {
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(mockState) : mockState);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => mockState;
  return { useAuthStore };
});
// Edit Profile is drawn here without a navigator; leaving it is proven in unsavedWorkAsksBeforeLeaving.
jest.mock('@/src/hooks/useAskBeforeLeaving', () => ({ useAskBeforeLeaving: () => {} }));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
jest.mock('expo-image-picker', () => ({ getPendingResultAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: jest.fn(() => ({ resize: () => ({ renderAsync: async () => ({ saveAsync: async () => ({ base64: 'KEPT' }) }) }) })),
  },
}));

const kept = ImagePicker.getPendingResultAsync as jest.Mock;
const was = Platform.OS;
afterEach(() => { Platform.OS = was; kept.mockReset(); });

it('on Android, Edit Profile opens the crop sheet holding the portrait the system kept', async () => {
  Platform.OS = 'android';
  kept.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///kept.jpg' }] });
  const { result } = await renderHook(() => useEditProfile());
  await waitFor(() => expect(result.current.showCropModal).toBe(true));
  expect(result.current.pendingPortrait).toBe('file:///kept.jpg');
});

it('a pick that was cancelled, or nothing kept, opens nothing; iOS never asks', async () => {
  Platform.OS = 'android';
  kept.mockResolvedValue({ canceled: true, assets: null });
  const cancelled = await renderHook(() => useEditProfile());
  await waitFor(() => expect(kept).toHaveBeenCalledTimes(1));
  expect(cancelled.result.current.showCropModal).toBe(false);

  Platform.OS = 'ios';
  kept.mockClear();
  await renderHook(() => useEditProfile());
  expect(kept).not.toHaveBeenCalled();
});

it('the sheet prepares the kept portrait as it opens, as if just picked', async () => {
  const done = jest.fn();
  await render(<AvatarCropSheet pending="file:///kept.jpg" onClose={jest.fn()} onSuccess={done} />);
  await waitFor(() => expect(done).toHaveBeenCalledWith('KEPT'));
  expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///kept.jpg');
});

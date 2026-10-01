/**
 * theEditDeskSaysWhatWentWrong.test.tsx — the Edit Profile desk, when
 * something does not go.
 *
 * SAVE refused by a field below the fold did nothing a member could see. The
 * backdrop switch, refused by the server, flipped back in silence. A refused
 * camera or photo permission was a dead end: once refused the phone never asks
 * again, and the alert offered no way to Settings.
 */
import React, { act } from 'react';
import { Alert, Linking } from 'react-native';
import { render, renderHook, fireEvent } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import AvatarCropSheet from '@/src/components/profile/AvatarCropSheet';
import { useEditProfile } from '@/src/hooks/useEditProfile';
import { EditProfileScreen } from '../EditProfileScreen';
import { supabase } from '@/src/lib/supabase';
import reelToast from '@/src/utils/reelToast';

const mockState: { user: Record<string, unknown>; updateUser: jest.Mock } = {
  user: { id: 'u1', username: 'tomas', display_name: '', bio: '', social_links: [], created_at: '2026-01-01T00:00:00Z', preferences: { backdrop: true } },
  updateUser: jest.fn(),
};
jest.mock('@/src/stores/auth', () => {
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(mockState) : mockState);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => mockState;
  (useAuthStore as unknown as { setState: () => void }).setState = () => {};
  return { useAuthStore };
});
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, standing: 'held', open: jest.fn() }) }));
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useIsFocused: () => true }));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: false })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: false })),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

it('SAVE refused by a field says so at the top', async () => {
  const { result } = await renderHook(() => useEditProfile());
  await act(async () => { result.current.form.setValue('links', [{ title: '', url: 'https://one.example' }]); });
  await act(async () => { await result.current.handleSave(); });
  expect(result.current.submitError).toBe('Something below needs your attention before it can be saved.');
});

it('the backdrop switch, refused, flips back and says so', async () => {
  (supabase.rpc as unknown) = jest.fn(async () => ({ error: { message: 'permission denied', code: '42501' } }));
  const r = render(<EditProfileScreen />);
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
  const sw = r.getByLabelText('Film backdrop on your profile');
  await act(async () => { fireEvent(sw, 'valueChange', false); });
  expect(reelToast.error).toHaveBeenCalledWith('The backdrop could not be changed. It is as it was.');
  expect(mockState.updateUser).toHaveBeenLastCalledWith({ preferences: { backdrop: true } });
});

it('a refused photo permission offers the way to grant it', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined as never);
  const r = render(<AvatarCropSheet onClose={jest.fn()} onSuccess={jest.fn()} />);
  await act(async () => { fireEvent.press(r.getByLabelText('Choose a photo from your library')); });
  expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  buttons.find((b) => b.text === 'Open Settings')!.onPress!();
  expect(open).toHaveBeenCalled();
});

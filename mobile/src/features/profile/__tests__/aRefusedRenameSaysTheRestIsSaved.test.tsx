/**
 * aRefusedRenameSaysTheRestIsSaved.test.tsx — round 11 (useEditProfile)
 * ─────────────────────────────────────────────────────────────────────────────
 * A member amends their bio and their handle; the handle is free when they press SAVE, and taken by
 * someone else a moment later, before the house's rename. The bio was saved, the handle was not,
 * and the desk said only that the profile "could not be saved": the member typed their bio again
 * over a bio already saved, and was told nothing of the handle. The desk now says the other
 * amendments are saved and the handle was not, and why; the phone holds the saved bio, the field
 * shows the handle the house holds, and no seal plays. A rename alone, refused, keeps what they
 * typed in the field to choose again, with the same words beside it.
 */
import { act } from 'react';
import { renderHook } from '@testing-library/react-native';
import { useEditProfile } from '@/src/hooks/useEditProfile';
import { HandleNotChanged } from '@/src/services/handleNotChanged';
import { nav } from '@/src/utils/typedRouter';

const STORED = { id: 'u1', username: 'vesper', display_name: 'Vesper', bio: 'Stored bio.', social_links: [] };
const mockState: { user: Record<string, unknown> } = { user: { ...STORED } };
jest.mock('@/src/stores/auth', () => {
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(mockState) : mockState);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => mockState;
  (useAuthStore as unknown as { setState: (fn: (s: typeof mockState) => Partial<typeof mockState>) => void }).setState = (fn) => { Object.assign(mockState, fn(mockState)); };
  return { useAuthStore };
});
jest.mock('@/src/utils/memberDrafts', () => ({ readDraft: () => null, writeDraft: () => true, clearDraft: () => {} }));
jest.mock('@/src/hooks/useAskBeforeLeaving', () => ({ useAskBeforeLeaving: () => {} }));
const mockUpdateProfile = jest.fn();
jest.mock('@/src/services/ProfileWriteService', () => ({
  ProfileService: {
    updateProfile: (...a: unknown[]) => mockUpdateProfile(...a),
    checkUsernameAvailable: jest.fn(async () => true),
    uploadAvatar: jest.fn(),
    purgeLegacyAvatars: jest.fn(async () => undefined),
  },
}));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

const TAKEN = { code: '23505', message: 'This username is already taken.' };

let back: jest.SpyInstance;
beforeEach(() => {
  mockState.user = { ...STORED };
  mockUpdateProfile.mockReset();
  back = jest.spyOn(nav, 'back').mockImplementation(() => {});
});
afterEach(() => { back.mockRestore(); });

/** The desk, with what the member amends, and SAVE pressed and answered. */
async function amend(fields: Record<string, string>) {
  const hook = await renderHook(() => useEditProfile());
  await act(async () => {
    for (const [k, v] of Object.entries(fields)) hook.result.current.form.setValue(k as never, v as never, { shouldDirty: true });
  });
  await act(async () => { await hook.result.current.handleSave(); });
  return hook;
}

it('a handle taken meanwhile, with a bio amended: the bio is kept and said saved, the handle is the house\'s, and why', async () => {
  mockUpdateProfile.mockRejectedValue(new HandleNotChanged(TAKEN, true, 'vesper'));
  const hook = await amend({ bio: 'A new bio', username: 'noir_fan' });
  expect(mockState.user.bio).toBe('A new bio');
  expect(mockState.user.username).toBe('vesper');
  expect(String(hook.result.current.submitError))
    .toBe('Your other amendments are saved, but your handle is still @vesper: @noir_fan is already taken.');
  expect(hook.result.current.form.getValues('username')).toBe('vesper');
  // The bio saved is the profile now: nothing unsaved, nothing for a Discard to undo.
  expect(hook.result.current.form.getValues('bio')).toBe('A new bio');
  expect(hook.result.current.isDirty).toBe(false);
  expect(hook.result.current.sealed).toBe(false);
  expect(back).not.toHaveBeenCalled();
  await hook.unmount();
});

it('a rename alone, refused: nothing is said saved, and the field keeps what was typed, with why', async () => {
  mockUpdateProfile.mockRejectedValue(new HandleNotChanged(TAKEN, false, 'vesper'));
  const hook = await amend({ username: 'noir_fan' });
  expect(mockState.user.username).toBe('vesper');
  expect(hook.result.current.form.getValues('username')).toBe('noir_fan');
  expect(hook.result.current.form.getFieldState('username').error?.message)
    .toBe('Your handle is still @vesper: @noir_fan is already taken.');
  expect(String(hook.result.current.submitError ?? '')).not.toMatch(/could not be saved/);
  expect(hook.result.current.sealed).toBe(false);
  await hook.unmount();
});

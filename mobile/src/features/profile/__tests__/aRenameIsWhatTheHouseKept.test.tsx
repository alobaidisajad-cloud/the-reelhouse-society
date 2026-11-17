/**
 * aRenameIsWhatTheHouseKept.test.tsx — review round 11 (useEditProfile)
 * ─────────────────────────────────────────────────────────────────────────────
 * A member whose handle predates today's letters ("john.doe") renamed it to the same letters
 * cleaned ("johndoe"). The house kept the old handle without a word, while the phone wrote the
 * new one into the store, played DOSSIER AMENDED, and the member's own Profile tab said "Member
 * Not Found". The phone now holds the handle the house answers with, never the one it asked for,
 * and a rename the house did not take is said, with no seal. And the handle held before is handed
 * to the write service, which records it for the open file's repair after a rename: read from a
 * profile cache, it was missing on a phone whose keystore had failed.
 */
import { act } from 'react';
import { renderHook } from '@testing-library/react-native';
import { useEditProfile } from '@/src/hooks/useEditProfile';
import { nav } from '@/src/utils/typedRouter';

const STORED = { id: 'u1', username: 'john.doe', display_name: 'John', bio: 'Stored bio.', social_links: [] };
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

let back: jest.SpyInstance;
beforeEach(() => {
  mockState.user = { ...STORED };
  mockUpdateProfile.mockReset();
  back = jest.spyOn(nav, 'back').mockImplementation(() => {});
});
afterEach(() => { back.mockRestore(); });

/** The desk, the handle typed as the field leaves it (its dot gone), and SAVE pressed and answered. */
async function rename(to: string) {
  const hook = await renderHook(() => useEditProfile());
  await act(async () => { hook.result.current.form.setValue('username', to, { shouldDirty: true }); });
  await act(async () => { await hook.result.current.handleSave(); });
  return hook;
}

it('a rename the house kept is the handle the phone holds, and the handle given up is handed over', async () => {
  mockUpdateProfile.mockResolvedValue({ username: 'johndoe' });
  const hook = await rename('johndoe');
  expect(mockUpdateProfile).toHaveBeenCalledWith('u1', expect.objectContaining({ username: 'johndoe' }), 'john.doe');
  expect(mockState.user.username).toBe('johndoe');
  expect(hook.result.current.sealed).toBe(true);
  await act(async () => { await new Promise((done) => setTimeout(done, 900)); });
  await hook.unmount();
});

it('a rename the house did not take: the phone holds the house\'s handle, says so, and plays no seal', async () => {
  // The house's answer: the old handle kept.
  mockUpdateProfile.mockResolvedValue({ username: 'john.doe' });
  const hook = await rename('johndoe');
  expect(mockState.user.username).toBe('john.doe');
  expect(mockState.user.bio).toBe('Stored bio.');
  expect(hook.result.current.sealed).toBe(false);
  expect(String(hook.result.current.submitError)).toMatch(/kept your handle as @john\.doe/);
  expect(hook.result.current.form.getValues('username')).toBe('john.doe');
  expect(back).not.toHaveBeenCalled();
  await hook.unmount();
});

it('a bio amended alone renames no one: the handle is the one the house answers with', async () => {
  mockUpdateProfile.mockResolvedValue({ username: 'john.doe' });
  const hook = await renderHook(() => useEditProfile());
  await act(async () => { hook.result.current.form.setValue('bio', 'A new bio', { shouldDirty: true }); });
  await act(async () => { await hook.result.current.handleSave(); });
  const sent = mockUpdateProfile.mock.calls[0];
  expect(sent).toBeDefined();
  expect(sent![1]).not.toHaveProperty('username');
  expect(mockState.user.username).toBe('john.doe');
  expect(mockState.user.bio).toBe('A new bio');
  expect(hook.result.current.sealed).toBe(true);
  await act(async () => { await new Promise((done) => setTimeout(done, 900)); });
  await hook.unmount();
});

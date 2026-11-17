/**
 * aFailedSaveLeavesNoOneBehind.test.tsx — review round 11 (useUpdateUser)
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings' SAVE writes the member's privacy optimistically, and puts it back if the house refuses.
 * The putting back laid the member's WHOLE earlier copy back into the store and wrote it to disk,
 * with no look at who was there now: a save that failed after a sign-out (or after the account's
 * deletion had wiped the phone) put the departed member back, their profile and address with them.
 * And a change made since the save, to this field or another, was undone along with it. Now a
 * member who has left is left alone, and only what this save set is undone.
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { useUpdateUser } from '../useUpdateUser';

const DEPARTED = { id: '55555555-5555-4555-8555-555555555555', username: 'departed', email: 'departed@example.com', bio: 'Stored bio.', is_social_private: false };
const mockState: { user: Record<string, unknown> | null } = { user: { ...DEPARTED } };
jest.mock('@/src/stores/auth', () => {
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(mockState) : mockState);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => mockState;
  (useAuthStore as unknown as { setState: (p: Partial<typeof mockState>) => void }).setState = (p) => { Object.assign(mockState, p); };
  return { useAuthStore };
});
const mockUpdateProfile = jest.fn();
jest.mock('@/src/services/ProfileWriteService', () => ({
  ProfileService: { updateProfile: (...a: unknown[]) => mockUpdateProfile(...a) },
}));
const mockSetSensitive = jest.fn();
jest.mock('@/src/stores/mmkv-storage', () => ({
  setSensitive: (k: string, v: string) => mockSetSensitive(k, v),
  storage: { getString: () => undefined, set: () => {}, delete: () => {} },
  isStorageEncrypted: () => true,
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
}));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
const mockToast = jest.requireMock('@/src/utils/reelToast').default as { error: jest.Mock };

/** The save, sent and held at the house until the test refuses it. */
async function saveHeld(updates: Record<string, unknown>) {
  let refuse: (e: Error) => void = () => {};
  mockUpdateProfile.mockImplementation(() => new Promise((_res, rej) => { refuse = rej; }));
  const client = testQueryClient({ mutations: { retry: false } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = await renderHook(() => useUpdateUser(), { wrapper });
  let sent: Promise<unknown> = Promise.resolve();
  await act(async () => { sent = hook.result.current.mutateAsync(updates as never).catch(() => undefined); });
  return { hook, refuse: async () => { await act(async () => { refuse(new Error('server refused')); await sent; }); } };
}

beforeEach(() => {
  mockState.user = { ...DEPARTED };
  mockUpdateProfile.mockReset();
  mockSetSensitive.mockReset();
  mockToast.error.mockClear();
});

it('a save refused after the member signed out puts no one back, and writes nothing to the phone', async () => {
  const save = await saveHeld({ isSocialPrivate: true });
  // SIGN OUT while it is on its way: the store and the phone's copy are cleared.
  mockState.user = null;
  mockSetSensitive.mockClear();
  await save.refuse();
  expect(mockState.user).toBeNull();
  expect(mockSetSensitive).not.toHaveBeenCalled();
  expect(mockToast.error).not.toHaveBeenCalled();
  await save.hook.unmount();
});

it('a save refused undoes only what it set: a change made since stands', async () => {
  const save = await saveHeld({ isSocialPrivate: true });
  expect(mockState.user?.is_social_private).toBe(true);
  // The bio changed meanwhile (another save, the profile read again).
  mockState.user = { ...mockState.user!, bio: 'Written since.' };
  await save.refuse();
  expect(mockState.user?.is_social_private).toBe(false);
  expect(mockState.user?.bio).toBe('Written since.');
  expect(mockToast.error).toHaveBeenCalled();
  await save.hook.unmount();
});

it('a field this save set, changed again since, keeps its newer value', async () => {
  const save = await saveHeld({ bio: 'From this save.' });
  mockState.user = { ...mockState.user!, bio: 'Newer still.' };
  await save.refuse();
  expect(mockState.user?.bio).toBe('Newer still.');
  await save.hook.unmount();
});

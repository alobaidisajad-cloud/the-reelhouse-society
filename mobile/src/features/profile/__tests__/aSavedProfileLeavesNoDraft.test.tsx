/**
 * aSavedProfileLeavesNoDraft.test.tsx — review round 6
 * ─────────────────────────────────────────────────────────────────────────────
 * Edit Profile keeps the member's amendments on the phone as they type, and lets them go once the
 * form is the profile again. Measured as typed, a link row left empty, or a link with a space after
 * it, was never the profile saved (a save drops the one and trims the other): a save left a draft
 * of nothing behind it, and the next opening said TAKEN UP WHERE YOU LEFT IT. An empty row added and
 * left was kept as a draft too. A link typed in full and left unsaved is still kept.
 */
import { act } from 'react';
import { renderHook } from '@testing-library/react-native';
import { PROFILE_DRAFT_REST_MS, useEditProfile } from '@/src/hooks/useEditProfile';

const STORED = { id: 'u1', username: 'tomas', display_name: 'Tomas', bio: 'Stored bio.', social_links: [] };
const mockState: { user: Record<string, unknown> } = { user: { ...STORED } };
jest.mock('@/src/stores/auth', () => {
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(mockState) : mockState);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => mockState;
  (useAuthStore as unknown as { setState: (fn: (s: typeof mockState) => Partial<typeof mockState>) => void }).setState = (fn) => { Object.assign(mockState, fn(mockState)); };
  return { useAuthStore };
});
const mockDrafts = new Map<string, { data: unknown; savedAt: string }>();
jest.mock('@/src/utils/memberDrafts', () => ({
  readDraft: (member: string, kind: string) => mockDrafts.get(`${member}:${kind}`) ?? null,
  writeDraft: (member: string, kind: string, data: unknown) => { mockDrafts.set(`${member}:${kind}`, { data, savedAt: '2026-11-16T09:00:00.000Z' }); return true; },
  clearDraft: (member: string, kind: string) => { mockDrafts.delete(`${member}:${kind}`); },
}));
jest.mock('@/src/hooks/useAskBeforeLeaving', () => ({ useAskBeforeLeaving: () => {} }));
jest.mock('@/src/services/ProfileWriteService', () => ({
  ProfileService: { updateProfile: jest.fn(async () => undefined), checkUsernameAvailable: jest.fn(async () => true), uploadAvatar: jest.fn(), purgeLegacyAvatars: jest.fn(async () => undefined) },
}));

const rest = () => act(async () => { await new Promise((done) => setTimeout(done, PROFILE_DRAFT_REST_MS + 60)); });
const held = () => mockDrafts.get('u1:profile');

beforeEach(() => {
  mockDrafts.clear();
  mockState.user = { ...STORED };
});

it('a save with an empty link row leaves no draft behind it', async () => {
  const { result } = await renderHook(() => useEditProfile());
  await act(async () => {
    result.current.form.setValue('bio', 'A finished bio', { shouldDirty: true });
    result.current.form.setValue('links', [{ title: '', url: '' }], { shouldDirty: true });
  });
  await rest();
  await act(async () => { await result.current.handleSave(); });
  await rest();
  expect(result.current.sealed).toBe(true);
  expect(held()).toBeUndefined();
});

it('a save of a link with a space after it leaves no draft behind it', async () => {
  const { result } = await renderHook(() => useEditProfile());
  await act(async () => {
    result.current.form.setValue('links', [{ title: 'Letterboxd ', url: 'https://letterboxd.com/tomas ' }], { shouldDirty: true });
  });
  await rest();
  await act(async () => { await result.current.handleSave(); });
  await rest();
  expect(result.current.sealed).toBe(true);
  expect(held()).toBeUndefined();
});

it('an empty link row added and left is no draft; the link typed into it is kept', async () => {
  const { result } = await renderHook(() => useEditProfile());
  await act(async () => { result.current.form.setValue('links', [{ title: '', url: '' }], { shouldDirty: true }); });
  await rest();
  expect(held()).toBeUndefined();

  await act(async () => { result.current.form.setValue('links', [{ title: 'Letterboxd', url: 'https://letterboxd.com/tomas' }], { shouldDirty: true }); });
  await rest();
  expect(held()?.data).toEqual({
    username: 'tomas', displayName: 'Tomas', bio: 'Stored bio.',
    links: [{ title: 'Letterboxd', url: 'https://letterboxd.com/tomas' }],
  });
});

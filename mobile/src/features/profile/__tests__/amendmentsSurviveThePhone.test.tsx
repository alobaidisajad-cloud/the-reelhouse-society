/**
 * amendmentsSurviveThePhone.test.tsx — Edit Profile keeps what the member typed (P4.14).
 *
 * The phone may end the app in the background, or rebuild its screen, with a bio half written:
 * the amendments are kept on the phone as the typing rests, and at once as the app leaves the
 * screen, and the room takes them up again (TAKEN UP WHERE YOU LEFT IT). The profile read again
 * on a return to the app is laid under them, never over them: a plain reset wiped the bio.
 */
import { act } from 'react';
import { AppState } from 'react-native';
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
  writeDraft: (member: string, kind: string, data: unknown) => { mockDrafts.set(`${member}:${kind}`, { data, savedAt: '2026-10-30T09:00:00.000Z' }); return true; },
  clearDraft: (member: string, kind: string) => { mockDrafts.delete(`${member}:${kind}`); },
}));
jest.mock('@/src/hooks/useAskBeforeLeaving', () => ({ useAskBeforeLeaving: () => {} }));
jest.mock('@/src/services/ProfileWriteService', () => ({
  ProfileService: { updateProfile: jest.fn(async () => undefined), checkUsernameAvailable: jest.fn(async () => true), uploadAvatar: jest.fn(), purgeLegacyAvatars: jest.fn(async () => undefined) },
}));

const rest = () => act(async () => { await new Promise((done) => setTimeout(done, PROFILE_DRAFT_REST_MS + 60)); });
const held = () => mockDrafts.get('u1:profile');
const leaving: ((next: string) => void)[] = [];

beforeEach(() => {
  mockDrafts.clear();
  mockState.user = { ...STORED };
  leaving.length = 0;
  const real = AppState.addEventListener.bind(AppState);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((type: string, fn: (next: string) => void) => {
    if (type === 'change') { leaving.push(fn); return { remove: () => { leaving.splice(leaving.indexOf(fn), 1); } }; }
    return real(type as never, fn as never);
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

it('keeps the amendments once the typing rests, and lets them go when the form is back as stored', async () => {
  const { result } = await renderHook(() => useEditProfile());
  await act(async () => { result.current.form.setValue('bio', 'Half a bio', { shouldDirty: true }); });
  expect(held()).toBeUndefined();
  await rest();
  expect(held()?.data).toEqual({ username: 'tomas', displayName: 'Tomas', bio: 'Half a bio', links: [] });
  await act(async () => { result.current.form.setValue('bio', 'Stored bio.', { shouldDirty: true }); });
  await rest();
  expect(held()).toBeUndefined();
});

it('keeps them at once when the app leaves the screen, before the typing has rested', async () => {
  const { result } = await renderHook(() => useEditProfile());
  await act(async () => { result.current.form.setValue('bio', 'Typed, then Home', { shouldDirty: true }); });
  await act(async () => { leaving.forEach((fn) => fn('background')); });
  expect((held()?.data as { bio?: string } | undefined)?.bio).toBe('Typed, then Home');
});

it('takes up a kept draft as it opens, says so, and the first keystroke accepts it', async () => {
  mockDrafts.set('u1:profile', { data: { username: 'tomas', displayName: 'Tomas', bio: 'Kept bio', links: [] }, savedAt: '2026-10-30T08:00:00.000Z' });
  const { result } = await renderHook(() => useEditProfile());
  expect([result.current.form.getValues('bio'), result.current.isDirty, result.current.takenUpAt])
    .toEqual(['Kept bio', true, '2026-10-30T08:00:00.000Z']);
  // A value set by the room is not a keystroke: the line stays.
  await act(async () => { result.current.form.setValue('displayName', 'T.', { shouldDirty: true }); });
  expect(result.current.takenUpAt).toBe('2026-10-30T08:00:00.000Z');
  // Typing in the field (its own change event): the member has taken the draft up as theirs.
  await act(async () => { await result.current.form.register('bio').onChange({ target: { name: 'bio', value: 'Kept bio, and more' }, type: 'change' }); });
  expect([result.current.form.getValues('bio'), result.current.takenUpAt]).toEqual(['Kept bio, and more', undefined]);
});

it('START CLEAN puts the form back as stored and lets the draft go', async () => {
  mockDrafts.set('u1:profile', { data: { username: 'tomas', displayName: 'Tomas', bio: 'Kept bio', links: [] }, savedAt: '2026-10-30T08:00:00.000Z' });
  const { result } = await renderHook(() => useEditProfile());
  await act(async () => { result.current.startClean(); });
  expect([result.current.form.getValues('bio'), result.current.takenUpAt, held()]).toEqual(['Stored bio.', undefined, undefined]);
});

it('a draft that matches what is stored is no draft to take up', async () => {
  mockDrafts.set('u1:profile', { data: { username: 'tomas', displayName: 'Tomas', bio: 'Stored bio.', links: [] }, savedAt: '2026-10-30T08:00:00.000Z' });
  const { result } = await renderHook(() => useEditProfile());
  expect([result.current.isDirty, result.current.takenUpAt]).toEqual([false, undefined]);
});

it('the profile read again keeps what the member typed, and brings in the rest', async () => {
  const { result, rerender } = await renderHook(() => useEditProfile());
  await act(async () => { result.current.form.setValue('bio', 'Mid-sentence', { shouldDirty: true }); });
  mockState.user = { ...STORED, display_name: 'Tomas (read again)' };
  await rerender({});
  expect([result.current.form.getValues('bio'), result.current.form.getValues('displayName')]).toEqual(['Mid-sentence', 'Tomas (read again)']);
});

it('a save that lands lets the draft go', async () => {
  const { result } = await renderHook(() => useEditProfile());
  await act(async () => { result.current.form.setValue('bio', 'A finished bio', { shouldDirty: true }); });
  await rest();
  expect(held()).toBeDefined();
  await act(async () => { await result.current.handleSave(); });
  await rest();
  expect([result.current.sealed, held()]).toEqual([true, undefined]);
});

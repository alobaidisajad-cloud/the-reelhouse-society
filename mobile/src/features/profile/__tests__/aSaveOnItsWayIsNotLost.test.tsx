/**
 * aSaveOnItsWayIsNotLost.test.tsx — review round 8 (useEditProfile)
 * ─────────────────────────────────────────────────────────────────────────────
 * A save on its way and the member leaving Edit Profile crossed three ways. Leaving asked
 * "Discard?" over a save that was already sent, and "Discard" discarded nothing: the save landed
 * after the member had chosen to throw it away. A save that landed after the desk was gone set its
 * beat and its walk back anyway, and walked the member off the page they had gone back to. And one
 * refused after the desk was gone said nothing at all, the form that would have said it no longer
 * there. Now a save on its way leaves freely, lands without walking anyone anywhere, and a refusal
 * after leaving is said by a toast.
 */
import { act } from 'react';
import { renderHook } from '@testing-library/react-native';
import { useEditProfile } from '@/src/hooks/useEditProfile';
import { nav } from '@/src/utils/typedRouter';

const STORED = { id: 'u1', username: 'tomas', display_name: 'Tomas', bio: 'Stored bio.', social_links: [] };
const mockState: { user: Record<string, unknown> } = { user: { ...STORED } };
jest.mock('@/src/stores/auth', () => {
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(mockState) : mockState);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => mockState;
  (useAuthStore as unknown as { setState: (fn: (s: typeof mockState) => Partial<typeof mockState>) => void }).setState = (fn) => { Object.assign(mockState, fn(mockState)); };
  return { useAuthStore };
});
jest.mock('@/src/utils/memberDrafts', () => ({ readDraft: () => null, writeDraft: () => true, clearDraft: () => {} }));
/** Whether each render asked to be asked before leaving: the last is what a way out meets now. */
const mockAsks: boolean[] = [];
jest.mock('@/src/hooks/useAskBeforeLeaving', () => ({ useAskBeforeLeaving: (ask: boolean) => { mockAsks.push(ask); } }));
const mockUpdateProfile = jest.fn();
const mockHandleFree = jest.fn();
jest.mock('@/src/services/ProfileWriteService', () => ({
  ProfileService: {
    updateProfile: (...a: unknown[]) => mockUpdateProfile(...a),
    checkUsernameAvailable: (...a: unknown[]) => mockHandleFree(...a),
    uploadAvatar: jest.fn(),
    purgeLegacyAvatars: jest.fn(async () => undefined),
  },
}));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
const mockToast = jest.requireMock('@/src/utils/reelToast').default as { error: jest.Mock };

/** A write of the house's, held on the wire until the test lets it answer. */
function hold<T>(write: jest.Mock) {
  let answer: (v: T) => void = () => {};
  let refuse: (e: Error) => void = () => {};
  write.mockImplementation(() => new Promise<T>((res, rej) => { answer = res; refuse = rej; }));
  return {
    answer: async (v: T) => { await act(async () => { answer(v); }); },
    refuse: async (e: Error) => { await act(async () => { refuse(e); }); },
  };
}
const lastAsk = () => {
  const last = mockAsks[mockAsks.length - 1];
  expect(last).toBeDefined();
  return last!;
};
/** Longer than the seal's beat (750 ms), on the clock the beat is set on. */
const outlastTheBeat = () => act(async () => { await new Promise((done) => setTimeout(done, 900)); });

let back: jest.SpyInstance;
beforeEach(() => {
  mockState.user = { ...STORED };
  mockAsks.length = 0;
  mockUpdateProfile.mockReset();
  mockUpdateProfile.mockResolvedValue(undefined);
  mockHandleFree.mockReset();
  mockHandleFree.mockResolvedValue(true);
  mockToast.error.mockClear();
  back = jest.spyOn(nav, 'back').mockImplementation(() => {});
});
afterEach(() => { back.mockRestore(); });

/** The desk, with a bio amended, and its SAVE pressed: the save is on its way, held at the house. */
async function saveOnItsWay(over: (desk: ReturnType<typeof useEditProfile>) => void = () => {}) {
  const hook = await renderHook(() => useEditProfile());
  await act(async () => {
    hook.result.current.form.setValue('bio', 'A finished bio', { shouldDirty: true });
    over(hook.result.current);
  });
  const askedBefore = lastAsk();
  let saving: Promise<void> | undefined;
  await act(async () => { saving = hook.result.current.handleSave(); });
  return { hook, askedBefore, done: () => act(async () => { await saving; }) };
}

it('a save on its way is not asked about on the way out: there is nothing left to discard', async () => {
  const save = hold<void>(mockUpdateProfile);
  const { hook, done } = await saveOnItsWay();
  expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
  expect(hook.result.current.saving).toBe(true);
  expect(lastAsk()).toBe(false);
  await save.answer(undefined);
  await done();
});

it('amendments left unsaved are still asked about, before SAVE and after a save the house refused', async () => {
  const save = hold<void>(mockUpdateProfile);
  const { hook, askedBefore, done } = await saveOnItsWay();
  expect(askedBefore).toBe(true);
  expect(lastAsk()).toBe(false);
  await save.refuse(new Error('network down'));
  await done();
  expect(hook.result.current.saving).toBe(false);
  expect(lastAsk()).toBe(true);
});

it('a save that lands after the member left walks nobody back', async () => {
  const save = hold<void>(mockUpdateProfile);
  const { hook, done } = await saveOnItsWay();
  await hook.unmount();
  await save.answer(undefined);
  await done();
  await outlastTheBeat();
  expect(back).not.toHaveBeenCalled();
  expect(mockToast.error).not.toHaveBeenCalled();
});

it('a save refused after the member left is said by a toast; refused while they are there, the desk says it', async () => {
  const there = hold<void>(mockUpdateProfile);
  const stays = await saveOnItsWay();
  await there.refuse(new Error('network down'));
  await stays.done();
  expect(stays.hook.result.current.submitError).toBeTruthy();
  expect(mockToast.error).not.toHaveBeenCalled();
  await stays.hook.unmount();

  const gone = hold<void>(mockUpdateProfile);
  const left = await saveOnItsWay();
  await left.hook.unmount();
  await gone.refuse(new Error('network down'));
  await left.done();
  expect(mockToast.error).toHaveBeenCalledWith('Your profile could not be saved. Try again.');
  expect(back).not.toHaveBeenCalled();
});

it('a new handle found taken after the member left is said by a toast, and nothing is saved', async () => {
  const check = hold<boolean>(mockHandleFree);
  const { hook, done } = await saveOnItsWay((desk) => {
    desk.form.setValue('username', 'tomas_noir', { shouldDirty: true });
  });
  expect(mockHandleFree).toHaveBeenCalledTimes(1);
  await hook.unmount();
  await check.answer(false);
  await done();
  expect(mockToast.error).toHaveBeenCalledWith('Your profile was not saved: that username is already taken.');
  expect(mockUpdateProfile).not.toHaveBeenCalled();
});

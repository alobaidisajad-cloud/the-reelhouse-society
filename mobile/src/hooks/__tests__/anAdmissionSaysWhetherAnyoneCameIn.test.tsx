/**
 * anAdmissionSaysWhetherAnyoneCameIn.test.tsx — review round 11
 * ─────────────────────────────────────────────────────────────────────────────
 * ADMIT on a follow request its sender withdrew meanwhile (or one a block took) read as an
 * admission: the success was felt on the press, the row went, and nothing was said, so the member
 * believed someone now followed them who did not. The house now answers whether anyone was
 * admitted: the success is felt only on a real admission, and a request no longer at the door is
 * said so.
 */
import { renderHook, act } from '@testing-library/react-native';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useFollowRequests } from '../useFollowRequests';
import { useSocialStore } from '@/src/stores/followStore';
import reelToast from '@/src/utils/reelToast';
import TactileEngine from '@/src/utils/TactileEngine';
import type { FollowRequest } from '@/src/services/FollowRequestService';

const ORSON = '22222222-2222-4222-8222-222222222222';

let mockHouse = supabaseFake();
/** The house's answer to ADMIT, held until the test lets it go. */
let mockWaiting: Promise<void> = Promise.resolve();
const mockDoor = {
  get client() {
    const c = mockHouse.client;
    return { ...c, rpc: (fn: string, args?: Record<string, unknown>) => mockWaiting.then(() => c.rpc(fn, args)) };
  },
};
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockDoor.client; } }));
jest.mock('@/src/stores/auth', () => {
  const s = { user: { id: '11111111-1111-4111-8111-111111111111', username: 'kane' }, isAuthenticated: true };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => s;
  (useAuthStore as unknown as { subscribe: () => () => void }).subscribe = () => () => {};
  return { useAuthStore };
});
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
jest.mock('@/src/utils/TactileEngine', () => ({
  __esModule: true,
  default: { warn: jest.fn(), selection: jest.fn(), success: jest.fn(), navigate: jest.fn(), mutate: jest.fn() },
}));

const request = (requesterId: string, username: string): FollowRequest =>
  ({ requesterId, username, avatarUrl: null, createdAt: '2026-11-16T10:00:00Z' });
const badge = () => useSocialStore.getState().pendingRequestCount;

/** The door answering ADMIT with what the house said: true admitted, false no one, null an older house. */
const doorAnswering = (admitted: boolean | null) => {
  mockHouse = supabaseFake({ rpc: { accept_follow_request: admitted } });
};

let letGo: () => void = () => {};
beforeEach(() => {
  jest.clearAllMocks();
  mockWaiting = new Promise<void>((res) => { letGo = res; });
  useSocialStore.getState().setPendingRequestCount(2);
});

it('a request withdrawn meanwhile admits no one: no success is felt, and the member is told it is no longer at the door', async () => {
  doorAnswering(false);
  const { result } = await renderHook(() => useFollowRequests(false));
  let away: Promise<void> = Promise.resolve();
  await act(async () => { away = result.current.accept(request(ORSON, 'orson')); });
  await act(async () => { letGo(); await away; });

  expect(TactileEngine.success).not.toHaveBeenCalled();
  expect(reelToast).toHaveBeenCalledWith("@orson's request is no longer at the door.");
  expect(reelToast.error).not.toHaveBeenCalled();
  // The request is truly gone: its row and its place on the badge stay gone.
  expect(result.current.items).toEqual([]);
  expect(badge()).toBe(1);
});

it('a request at the door is admitted: the success is felt when the house says so, not on the press', async () => {
  doorAnswering(true);
  const { result } = await renderHook(() => useFollowRequests(false));
  let away: Promise<void> = Promise.resolve();
  await act(async () => { away = result.current.accept(request(ORSON, 'orson')); });
  // Pressed, the house not yet answered: a selection, never the admission's success.
  expect(TactileEngine.selection).toHaveBeenCalled();
  expect(TactileEngine.success).not.toHaveBeenCalled();

  await act(async () => { letGo(); await away; });
  expect(TactileEngine.success).toHaveBeenCalledTimes(1);
  expect(reelToast).not.toHaveBeenCalled();
  expect(badge()).toBe(1);
});

it('an older house that answers nothing is read as before: an admission', async () => {
  doorAnswering(null);
  const { result } = await renderHook(() => useFollowRequests(false));
  let away: Promise<void> = Promise.resolve();
  await act(async () => { away = result.current.accept(request(ORSON, 'orson')); });
  await act(async () => { letGo(); await away; });
  expect(TactileEngine.success).toHaveBeenCalledTimes(1);
  expect(reelToast).not.toHaveBeenCalled();
});

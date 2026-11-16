/**
 * aRefusedAnswerIsSaidAfterTheDoorCloses.test.tsx — review round 7
 * ─────────────────────────────────────────────────────────────────────────────
 * ADMIT, DECLINE and DECLINE ALL take the request off the badge at once. Refused after the door
 * had closed, the refusal was said to no one and the badge stayed short: the member was told
 * nothing, and the petitioner was silently back at the next opening. A refusal is now said, and
 * the badge given back, though the door closed meanwhile; never to the next member on the phone.
 */
import { renderHook, act } from '@testing-library/react-native';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useFollowRequests } from '../useFollowRequests';
import { useSocialStore } from '@/src/stores/followStore';
import reelToast from '@/src/utils/reelToast';
import type { FollowRequest } from '@/src/services/FollowRequestService';

const ME = '11111111-1111-4111-8111-111111111111';
const ORSON = '22222222-2222-4222-8222-222222222222';
const AGNES = '33333333-3333-4333-8333-333333333333';

let mockHouse = supabaseFake();
/** The house's answers to the door's calls, held until the test lets them go. */
let mockWaiting: Promise<void> = Promise.resolve();
const mockDoor = {
  get client() {
    const c = mockHouse.client;
    return { ...c, rpc: (fn: string, args?: Record<string, unknown>) => mockWaiting.then(() => c.rpc(fn, args)) };
  },
};
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockDoor.client; } }));
const mockAuth: { user: { id: string; username: string } | null } = { user: null };
jest.mock('@/src/stores/auth', () => {
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(mockAuth) : mockAuth);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => mockAuth;
  (useAuthStore as unknown as { subscribe: () => () => void }).subscribe = () => () => {};
  return { useAuthStore };
});
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
jest.mock('@/src/utils/TactileEngine', () => ({
  __esModule: true,
  default: { warn: jest.fn(), selection: jest.fn(), success: jest.fn(), navigate: jest.fn(), mutate: jest.fn() },
}));

const refused = { error: { code: 'P0001', message: 'the request could not be answered' } };
const request = (requesterId: string, username: string): FollowRequest =>
  ({ requesterId, username, avatarUrl: null, createdAt: '2026-11-16T10:00:00Z' });
/** Two requests still at the door, as the house counts them. */
const atTheDoor = (id: string, from: string, at: string) => ({ id, user_id: from, target_user_id: ME, type: 'follow_request', created_at: at });
const badge = () => useSocialStore.getState().pendingRequestCount;

let letGo: () => void = () => {};
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.user = { id: ME, username: 'kane' };
  mockHouse = supabaseFake({
    rows: {
      interactions: [
        atTheDoor('44444444-4444-4444-8444-444444444441', ORSON, '2026-11-16T10:00:00Z'),
        atTheDoor('44444444-4444-4444-8444-444444444442', AGNES, '2026-11-16T10:00:01Z'),
      ],
    },
    rpc: { accept_follow_request: refused, decline_follow_request: refused, decline_all_follow_requests: refused },
  });
  mockWaiting = new Promise<void>((res) => { letGo = res; });
  useSocialStore.getState().setPendingRequestCount(2);
});

/** The door opened, an answer given, the door closed while the answer is away. */
async function answeredThenClosed(answer: (door: ReturnType<typeof useFollowRequests>) => Promise<void>) {
  const { result, unmount } = await renderHook(() => useFollowRequests(false));
  let away: Promise<void> = Promise.resolve();
  await act(async () => { away = answer(result.current); });
  await unmount();
  // Handed back inside an object: an async function handing back the promise itself would wait on it.
  return { away };
}

it('an admit refused after the door was closed is still said, and the badge given back', async () => {
  const { away } = await answeredThenClosed((door) => door.accept(request(ORSON, 'orson')));
  expect(badge()).toBe(1);
  letGo();
  await act(async () => { await away; });
  expect(reelToast.error).toHaveBeenCalledWith("Couldn't admit @orson. Try again.");
  expect(badge()).toBe(2);
});

it('a decline refused after the door was closed is still said, and the badge given back', async () => {
  const { away } = await answeredThenClosed((door) => door.decline(request(AGNES, 'agnes')));
  expect(badge()).toBe(1);
  letGo();
  await act(async () => { await away; });
  expect(reelToast.error).toHaveBeenCalledWith("Couldn't decline. Try again.");
  expect(badge()).toBe(2);
});

it('DECLINE ALL refused after the door was closed is still said, and the badge counted again', async () => {
  const { away } = await answeredThenClosed((door) => door.declineAll());
  expect(badge()).toBe(0);
  letGo();
  await act(async () => { await away; });
  expect(reelToast.error).toHaveBeenCalledWith("Couldn't clear the queue. Try again.");
  // Counted again from the house: the two still at the door.
  await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
  expect(badge()).toBe(2);
});

it('refused after the member signed out, nothing is said and no badge is given to the next on the phone', async () => {
  const { away: one } = await answeredThenClosed((door) => door.accept(request(ORSON, 'orson')));
  const { away: all } = await answeredThenClosed((door) => door.declineAll());
  mockAuth.user = null;
  useSocialStore.getState().setPendingRequestCount(0);
  letGo();
  await act(async () => { await Promise.all([one, all]); });
  await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
  expect(reelToast.error).not.toHaveBeenCalled();
  expect(badge()).toBe(0);
});

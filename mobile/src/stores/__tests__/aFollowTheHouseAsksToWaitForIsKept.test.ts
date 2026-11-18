/**
 * aFollowTheHouseAsksToWaitForIsKept.test.ts — review round 13 (socialSlice)
 * ─────────────────────────────────────────────────────────────────────────────
 * The house refused a member's follow within a second of their last follow or certification, and
 * the phone said "Could not follow @x. Please try again." and reported it as a defect. It now paces
 * only what a script does and says how long to wait (RH429): a short wait is waited and the follow
 * lands; a long one keeps FOLLOWING on the screen and the follow queued to go once the wait is
 * over, never said as failed, never reported. And an unfollow that lands online lets go a follow of
 * the same member still waiting in the queue from before: sent after it, the follow came back and
 * the other member was told.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { followUser, unfollowUser } from '../domain/socialSlice';
import { useSocialStore } from '../followStore';
import { useAuthStore } from '../auth';
import { storage } from '../mmkv-storage';
import reelToast from '../../utils/reelToast';
import { captureError } from '../../lib/sentry';
import { getOfflineQueue, type QueuedMutation } from '../../utils/offlineQueue';
import { QUEUE_KEY } from '../../utils/queueOwnership';

jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});
jest.mock('../../utils/TactileEngine', () => ({
  __esModule: true,
  default: { warn: jest.fn(), navigate: jest.fn(), success: jest.fn(), mutate: jest.fn() },
}));
jest.mock('../../lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));

const ME = { id: '11111111-1111-4111-8111-111111111111', username: 'first' };
const member = (n: number, username: string) => ({ id: `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`, username, is_social_private: false });
const MEMBERS = [member(1, 'agnes'), member(2, 'kane'), member(3, 'ozu')];

/** How the house answers each follow written, in turn: null lands it. */
let mockPace: () => { code: string; message: string } | null = () => null;
let mockInserts = 0;
const mockHouse = supabaseFake({
  session: null,
  rows: { profiles: MEMBERS },
  answer: {
    interactions: (ask: Ask) => {
      if (ask.op !== 'insert') return [];
      mockInserts += 1;
      return mockPace() ?? [];
    },
  },
});
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const paced = (seconds: number, scope: 'member' | 'target') =>
  ({ code: 'RH429', message: 'RATE_LIMITED', hint: String(seconds), details: scope }) as unknown as { code: string; message: string };
const toast = reelToast as unknown as jest.Mock & { error: jest.Mock; success: jest.Mock };
const shown = () => [...useSocialStore.getState().following, ...useSocialStore.getState().requested];

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  mockPace = () => null;
  mockInserts = 0;
  storage.delete(QUEUE_KEY);
  useAuthStore.setState({ user: ME, isAuthenticated: true } as never);
  useSocialStore.setState({ following: [], requested: [] } as never);
});
afterEach(() => {
  jest.useRealTimers();
  storage.delete(QUEUE_KEY);
});

it('a follow the house asks to wait a moment for waits it out and lands, with nothing said', async () => {
  let refusedOnce = false;
  mockPace = () => (refusedOnce ? null : ((refusedOnce = true), paced(1, 'member')));
  const following = followUser('agnes', { id: MEMBERS[0]!.id, isPrivate: false });
  await jest.advanceTimersByTimeAsync(1000);
  expect(await following).toBe(true);
  expect(mockInserts).toBe(2);
  expect(shown()).toContain('agnes');
  expect(toast.error).not.toHaveBeenCalled();
  expect(captureError).not.toHaveBeenCalled();
  expect(getOfflineQueue()).toEqual([]);
});

it('a follow the house asks to wait an hour for stays FOLLOWING and is queued to go later, never said as failed', async () => {
  mockPace = () => paced(3600, 'target');
  expect(await followUser('kane', { id: MEMBERS[1]!.id, isPrivate: false })).toBe(true);
  expect(shown()).toContain('kane');
  expect(getOfflineQueue().map((m) => [m.type, m.payload.target_username])).toEqual([['follow_user', 'kane']]);
  expect(toast.error).not.toHaveBeenCalled();
  expect(toast).not.toHaveBeenCalled();
  expect(captureError).not.toHaveBeenCalled();
});

it('an unfollow that lands online lets go the follow of that member still queued from before', async () => {
  const older: QueuedMutation = {
    id: 'older-follow', type: 'follow_user', timestamp: 1, owner: ME.id,
    payload: { user_id: ME.id, target_username: 'ozu', target_user_id: MEMBERS[2]!.id },
  };
  storage.set(QUEUE_KEY, JSON.stringify([older]));
  useSocialStore.setState({ following: ['ozu'] } as never);
  expect(await unfollowUser('ozu')).toBe(true);
  expect(getOfflineQueue()).toEqual([]);
  expect(shown()).not.toContain('ozu');
});

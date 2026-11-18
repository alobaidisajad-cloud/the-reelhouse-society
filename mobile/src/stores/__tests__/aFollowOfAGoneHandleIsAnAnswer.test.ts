/**
 * aFollowOfAGoneHandleIsAnAnswer.test.ts — review round 13 (followUser)
 * ─────────────────────────────────────────────────────────────────────────────
 * A member pressed FOLLOW on a handle the house no longer knows (its member renamed or closed the
 * account since the page was read). The phone threw an Error worded with that handle, caught it as
 * a defect and sent it to Sentry, whose scrub promises that no handle ever leaves the phone. A
 * member gone is an answer: the follow shown is taken back, the member is told no one goes by the
 * handle now, and nothing is reported.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { followUser, noMemberGoesBy } from '../domain/socialSlice';
import { useSocialStore } from '../followStore';
import { useAuthStore } from '../auth';
import reelToast from '../../utils/reelToast';
import { captureError } from '../../lib/sentry';

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
// The house knows one member; 'nitrate_ana' renamed herself since the page was read.
const mockHouse = supabaseFake({
  rows: { profiles: [{ id: '22222222-2222-4222-8222-000000000001', username: 'agnes', is_social_private: false }], interactions: [] },
});
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const toast = reelToast as unknown as jest.Mock & { error: jest.Mock };
const shown = () => [...useSocialStore.getState().following, ...useSocialStore.getState().requested];

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: ME, isAuthenticated: true } as never);
  useSocialStore.setState({ following: [], requested: [] } as never);
});

it('a follow of a handle no one holds now is said plainly, taken back, and never reported', async () => {
  expect(await followUser('nitrate_ana')).toBe(false);
  expect(toast.error.mock.calls).toEqual([[noMemberGoesBy('nitrate_ana')]]);
  expect(toast.error.mock.calls).toEqual([['No member goes by @nitrate_ana now.']]);
  expect(shown()).not.toContain('nitrate_ana');
  expect(captureError).not.toHaveBeenCalled();
});

it('a member the house does know is followed as before', async () => {
  expect(await followUser('agnes')).toBe(true);
  expect(shown()).toContain('agnes');
  expect(toast.error).not.toHaveBeenCalled();
});

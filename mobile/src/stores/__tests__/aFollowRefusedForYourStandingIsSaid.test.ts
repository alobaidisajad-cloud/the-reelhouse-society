/**
 * aFollowRefusedForYourStandingIsSaid.test.ts — review round 10 (C5)
 * ─────────────────────────────────────────────────────────────────────────────
 * The house refuses a follow from a member it has silenced or suspended (enforce_not_restricted,
 * SQLSTATE 42501), and says why in its own sentence. The phone said "Could not follow @x. Please
 * try again." over a refusal no try can change, and reported the house's own rule to Sentry as a
 * defect. Now the member is told in the house's words, and nothing is reported; a follow that fails
 * for any other reason still says try again, and a fault is still reported.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { followUser } from '../domain/socialSlice';
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
const member = (n: number, username: string) => ({ id: `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`, username, is_social_private: false });
const MEMBERS = [member(1, 'agnes'), member(2, 'kane'), member(3, 'ozu')];

/** How the house answers the follow's write: refused with these words, or failed with them. */
let mockWrite: { code: string; message: string } = { code: '42501', message: 'Your account has been silenced by The Society.' };
const mockHouse = supabaseFake({
  rows: { profiles: MEMBERS },
  answer: {
    // No follow yet; the follow itself is answered as the case says.
    interactions: (ask: Ask) => (ask.op === 'insert' ? mockWrite : []),
  },
});
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const toast = reelToast as unknown as jest.Mock & { error: jest.Mock; success: jest.Mock };
const shown = () => [...useSocialStore.getState().following, ...useSocialStore.getState().requested];

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: ME, isAuthenticated: true } as never);
});

it('a silenced member’s follow is refused in the house’s words, taken back, and never reported as a defect', async () => {
  mockWrite = { code: '42501', message: 'Your account has been silenced by The Society.' };
  expect(await followUser('agnes')).toBe(false);
  expect(toast.error.mock.calls).toEqual([['Your account has been silenced by The Society.']]);
  expect(shown()).not.toContain('agnes');
  expect(captureError).not.toHaveBeenCalled();
});

it('a suspended member is told until when, and not reported; a follow that failed for another reason still says try again, and is', async () => {
  mockWrite = { code: '42501', message: 'Your account is suspended until 1 December 2026.' };
  expect(await followUser('kane')).toBe(false);
  expect(toast.error.mock.calls).toEqual([['Your account is suspended until 1 December 2026.']]);
  expect(captureError).not.toHaveBeenCalled();

  toast.error.mockClear();
  mockWrite = { code: 'XX000', message: 'internal error' };
  expect(await followUser('ozu')).toBe(false);
  expect(toast.error.mock.calls).toEqual([['Could not follow @ozu. Please try again.']]);
  expect(captureError).toHaveBeenCalledTimes(1);
});

/**
 * aFollowTheHouseFiledAsARequestReadsRequested.test.ts — review round 11
 * ─────────────────────────────────────────────────────────────────────────────
 * A member who switched their file to private while another had it open: FOLLOW pressed there read
 * FOLLOWING, from the privacy the screen had read, while the house had filed only a request
 * (enforce_privacy_on_follow turns a follow of a private member into one). The follow now asks back
 * what was filed, and the screen follows the house's answer; a request already standing reads
 * REQUESTED too. An open member's follow reads FOLLOWING, as before.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { followUser } from '../domain/socialSlice';
import { useSocialStore } from '../followStore';
import { useAuthStore } from '../auth';

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
const id = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`;
/** The members who turned private since their files were read; the rest are open. */
const turnedPrivate = new Set([id(1), id(3)]);
/** A request already standing at a member's door before the press. */
const standing = new Map<string, string>([[id(3), 'follow_request']]);

const mockHouse = supabaseFake({
  answer: {
    interactions: (ask: Ask) => {
      const target = ask.op === 'insert'
        ? (ask.values?.[0]?.target_user_id as string)
        : (ask.filters.find(([op, col]) => op === 'eq' && col === 'target_user_id')?.[2] as string);
      if (ask.op === 'insert') {
        // As enforce_privacy_on_follow files it: a follow of a private member is a request.
        const row = ask.values?.[0];
        expect(row).toBeDefined();
        const type = row!.type === 'follow' && turnedPrivate.has(target) ? 'follow_request' : row!.type;
        return [{ ...row, type }];
      }
      const held = standing.get(target);
      return held ? [{ id: '33333333-3333-4333-8333-333333333333', type: held }] : [];
    },
  },
});
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const reads = () => ({ following: useSocialStore.getState().following, requested: useSocialStore.getState().requested });

beforeEach(() => {
  useAuthStore.setState({ user: ME, isAuthenticated: true } as never);
  useSocialStore.getState().setFollowing([]);
  useSocialStore.getState().setRequested([]);
});

it('FOLLOW on a member who turned private while their file was open reads REQUESTED, as the house filed it', async () => {
  // Their file read them open.
  expect(await followUser('agnes', { id: id(1), isPrivate: false })).toBe(true);
  expect(reads()).toEqual({ following: [], requested: ['agnes'] });
});

it('a request already standing at their door reads REQUESTED, though their file read them open', async () => {
  expect(await followUser('ozu', { id: id(3), isPrivate: false })).toBe(true);
  expect(reads()).toEqual({ following: [], requested: ['ozu'] });
});

it('FOLLOW on an open member reads FOLLOWING, as before', async () => {
  expect(await followUser('kane', { id: id(2), isPrivate: false })).toBe(true);
  expect(reads()).toEqual({ following: ['kane'], requested: [] });
});

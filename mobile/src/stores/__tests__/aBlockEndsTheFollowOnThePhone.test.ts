/**
 * aBlockEndsTheFollowOnThePhone.test.ts — review round 5
 * ─────────────────────────────────────────────────────────────────────────────
 * A block ends the follows and requests between the two in the house (sever_follows_on_block),
 * but the phone's follow list was read only at boot and sign-in: a member blocked from their file
 * still read FOLLOWING there, and after an unblock a private file opened unsealed with no films.
 * A block that lands reads the follow list again, a fresh read in place of any already running.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';

const ME = '11111111-1111-4111-8111-111111111111';
const KANE = '22222222-2222-4222-8222-222222222222';
const mockHydrate = jest.fn((_opts?: { again?: boolean }) => Promise.resolve());

let mockHouse = supabaseFake();
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../domain/socialSlice', () => ({ hydrateFollowing: (opts?: { again?: boolean }) => mockHydrate(opts) }));
jest.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' } }), subscribe: () => () => {} },
}));
jest.mock('../domain/helpers/sessionGuard', () => ({ stillSignedIn: () => true }));
jest.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('../../components/lobby/wallRead', () => ({ wallMayHaveChanged: jest.fn() }));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});
jest.mock('../../utils/TactileEngine', () => ({ __esModule: true, default: { warn: jest.fn() } }));
jest.mock('../../lib/sentry', () => ({ captureError: jest.fn() }));

// eslint-disable-next-line import/first
import { useBlockStore } from '../blockStore';

beforeEach(() => {
  mockHydrate.mockClear();
  mockHouse = supabaseFake({ rows: { user_blocks: [] } });
  useBlockStore.setState({ blocked: [], muted: [], _blockedIndex: new Set(), _mutedIndex: new Set() } as never);
});

it('a block that lands reads the follow list again, afresh', async () => {
  await useBlockStore.getState().blockUser(KANE);
  expect(mockHouse.rows('user_blocks')).toEqual([expect.objectContaining({ blocker_id: ME, blocked_id: KANE, type: 'block' })]);
  expect(mockHydrate).toHaveBeenCalledTimes(1);
  expect(mockHydrate).toHaveBeenCalledWith({ again: true });
});

it('a refused block reads nothing again: nothing changed in the house', async () => {
  mockHouse = supabaseFake({ rows: { user_blocks: [] }, fail: { user_blocks: { code: '42501', message: 'refused' } } });
  await useBlockStore.getState().blockUser(KANE);
  expect(mockHydrate).not.toHaveBeenCalled();
});

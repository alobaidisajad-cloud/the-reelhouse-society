/**
 * aRequestIsShownAsARequest.test.ts — review round 5
 * ─────────────────────────────────────────────────────────────────────────────
 * followUser showed its answer before asking the house, decided by its own handle cache alone:
 * with no entry for a private member it showed FOLLOWING, so their sealed file opened for a moment
 * and was read as an empty archive, which stayed stuck reading once they admitted the member.
 * The screen's own knowledge (the member's row on their file) is used, and with none, nothing
 * is shown until the house says which it is.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { heldClient } from '@/test-utils/heldClient';
import { followUser } from '../domain/socialSlice';
import { useSocialStore } from '../followStore';
import { useAuthStore } from '../auth';
import { resetAllStores } from '../resetAllStores';
import { storage } from '../mmkv-storage';

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
const KANE = '22222222-2222-4222-8222-222222222222';
const ORSON = '33333333-3333-4333-8333-333333333333';
const AGNES = '44444444-4444-4444-8444-444444444444';

let mockHouse = supabaseFake();
let mockHeld = heldClient(mockHouse.client);
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHeld.client; } }));

const shown = () => ({ following: useSocialStore.getState().following, requested: useSocialStore.getState().requested });

beforeEach(async () => {
  mockHouse = supabaseFake({
    rows: {
      profiles: [
        { id: KANE, username: 'kane', is_social_private: true },
        { id: ORSON, username: 'orson', is_social_private: true },
        { id: AGNES, username: 'agnes', is_social_private: false },
      ],
      interactions: [],
    },
  });
  mockHeld = heldClient(mockHouse.client);
  useAuthStore.setState({ user: null, isAuthenticated: false } as never);
  await resetAllStores(ME.id);
  storage.clearAll();
  useAuthStore.setState({ user: ME, isAuthenticated: true } as never);
  useSocialStore.getState().setFollowing([]);
  useSocialStore.getState().setRequested([]);
});

it('with nothing known, shows nothing until the house says the member is private, then a request', async () => {
  const filed = followUser('kane');
  await Promise.resolve();
  expect(shown()).toEqual({ following: [], requested: [] });
  await mockHeld.release('profiles');
  expect(shown()).toEqual({ following: [], requested: ['kane'] });
  await mockHeld.releaseAll();
  expect(await filed).toBe(true);
  expect(mockHouse.rows('interactions')).toEqual([expect.objectContaining({ user_id: ME.id, target_user_id: KANE, type: 'follow_request' })]);
});

it('a private member’s file says so: a request is shown at once, never a follow', async () => {
  const filed = followUser('orson', { id: ORSON, isPrivate: true });
  expect(shown()).toEqual({ following: [], requested: ['orson'] });
  await mockHeld.releaseAll();
  expect(await filed).toBe(true);
  expect(shown()).toEqual({ following: [], requested: ['orson'] });
  // Known, it was not looked up again.
  expect(mockHouse.asked.filter((a) => a.table === 'profiles')).toEqual([]);
});

it('an open member’s file shows the follow at once', async () => {
  const filed = followUser('agnes', { id: AGNES, isPrivate: false });
  expect(shown()).toEqual({ following: ['agnes'], requested: [] });
  await mockHeld.releaseAll();
  expect(await filed).toBe(true);
});

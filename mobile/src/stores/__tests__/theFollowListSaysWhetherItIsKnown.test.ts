/**
 * theFollowListSaysWhetherItIsKnown.test.ts — following nobody is a fact only of a list read (P0.112).
 *
 * The Reel's FOLLOWING filter said "Your orbit is quiet. Follow other members…" whenever the
 * follow list was empty: before it was read after a fresh sign-in, and when its read failed, to
 * members who follow people. The store now says whether its list is the member's: held (read
 * whole, or the phone's copy of a read), unread, or failed.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useSocialStore } from '../followStore';
import { hydrateFollowing } from '../domain/socialSlice';
import { resetAllStores } from '../resetAllStores';

const ANNA = '11111111-1111-4111-8111-111111111111';
const ORSON = '22222222-2222-4222-8222-222222222222';
let mockHouse = supabaseFake({ rows: {} });
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' } }) } }));
jest.mock('../../lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn(), clear: jest.fn() } }));
jest.mock('../../utils/offlineQueue', () => ({ getOfflineQueue: () => [], enqueueMutation: jest.fn(() => true) }));

const follows = (who: { id: string; username: string }[]) => supabaseFake({
  rows: {
    interactions: who.map((p, i) => ({
      id: `33333333-3333-4333-8333-33333333333${i}`, user_id: ANNA, target_user_id: p.id, type: 'follow', created_at: `2026-10-0${i + 1}T00:00:00Z`,
    })),
    profiles: who,
  },
});
const unreachable = () => supabaseFake({ fail: { interactions: { code: '', message: 'Network request failed' } } });
const known = () => useSocialStore.getState().followingKnown;

beforeEach(() => {
  useSocialStore.setState({ following: [], followingKnown: 'unread', _followingIndex: new Set() });
});

it('starts unread, and a read that answers makes the list the member\'s, even of nobody', async () => {
  expect(known()).toBe('unread');
  mockHouse = follows([]);
  await hydrateFollowing();
  expect({ known: known(), following: useSocialStore.getState().following }).toEqual({ known: 'held', following: [] });
});

it('a read that fails leaves a list never held unread no longer, but failed; a read after that holds it', async () => {
  mockHouse = unreachable();
  await hydrateFollowing();
  expect(known()).toBe('failed');
  mockHouse = follows([{ id: ORSON, username: 'orson' }]);
  await hydrateFollowing();
  expect({ known: known(), following: useSocialStore.getState().following }).toEqual({ known: 'held', following: ['orson'] });
});

it('a list held stays held when a later read fails', async () => {
  mockHouse = follows([{ id: ORSON, username: 'orson' }]);
  await hydrateFollowing();
  mockHouse = unreachable();
  await hydrateFollowing();
  expect({ known: known(), following: useSocialStore.getState().following }).toEqual({ known: 'held', following: ['orson'] });
});

it('signing out makes it unread again: the next member\'s list is not this one\'s', async () => {
  mockHouse = follows([]);
  await hydrateFollowing();
  await resetAllStores(ANNA);
  expect(known()).toBe('unread');
});

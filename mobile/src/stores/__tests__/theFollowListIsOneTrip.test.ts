/**
 * theFollowListIsOneTrip.test.ts — a member's follow list is read in one trip at launch.
 *
 * Every Follow button waits on the list, so its read is one call to get_my_follows, however many
 * the member follows: no table read beside it and no second trip after it.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useSocialStore } from '../followStore';
import { hydrateFollowing } from '../domain/socialSlice';

const many = Array.from({ length: 12_000 }, (_, i) => `member${i}`);
let mockHouse = supabaseFake({ rows: {} });
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' } }) } }));
jest.mock('../../lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn(), clear: jest.fn() } }));
jest.mock('../../utils/offlineQueue', () => ({ getOfflineQueue: () => [], enqueueMutation: jest.fn(() => true) }));

beforeEach(() => {
  useSocialStore.setState({ following: [], requested: [], followingKnown: 'unread', _followingIndex: new Set() });
});

it('reads the whole list, past ten thousand, in one call and nothing else', async () => {
  mockHouse = supabaseFake({ rpc: { get_my_follows: { following: many, requested: ['orson'] } } });
  const rpc = jest.spyOn(mockHouse.client, 'rpc');
  await hydrateFollowing();
  expect(rpc.mock.calls).toEqual([['get_my_follows']]);
  expect(mockHouse.asked).toEqual([]);
  expect(useSocialStore.getState()).toMatchObject({ following: many, requested: ['orson'], followingKnown: 'held' });
});

it('a failed trip is not tried again in a loop: one call, and the list stays unread no longer but failed', async () => {
  mockHouse = supabaseFake({ rpc: { get_my_follows: { error: { code: '', message: 'Network request failed' } } } });
  const rpc = jest.spyOn(mockHouse.client, 'rpc');
  await hydrateFollowing();
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(mockHouse.asked).toEqual([]);
  expect(useSocialStore.getState().followingKnown).toBe('failed');
});

/**
 * aFollowReadAgainTakesThePlaceOfTheOld.test.ts — review round 5
 * ─────────────────────────────────────────────────────────────────────────────
 * hydrateFollowing joins a read already running: a cold start asks twice and reads once. A block
 * changes the list in the house after such a read began, so it asks `again`: a fresh read takes
 * the running one's place, and the running one, answered late with the list from before the
 * block, commits nothing.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { heldClient } from '@/test-utils/heldClient';
import { hydrateFollowing } from '../domain/socialSlice';
import { useSocialStore } from '../followStore';
import { useAuthStore } from '../auth';

jest.mock('../../lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));

const ME = { id: '11111111-1111-4111-8111-111111111111', username: 'first' };
const AGNES = '22222222-2222-4222-8222-222222222222';
const KANE = '33333333-3333-4333-8333-333333333333';

let mockHouse = supabaseFake();
let mockHeld = heldClient(mockHouse.client);
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHeld.client; } }));

beforeEach(() => {
  mockHouse = supabaseFake({
    rows: {
      profiles: [{ id: AGNES, username: 'agnes' }, { id: KANE, username: 'kane' }],
      interactions: [
        { id: '44444444-4444-4444-8444-444444444441', user_id: ME.id, target_user_id: AGNES, type: 'follow', created_at: '2026-11-10T00:00:00Z' },
        { id: '44444444-4444-4444-8444-444444444442', user_id: ME.id, target_user_id: KANE, type: 'follow', created_at: '2026-11-11T00:00:00Z' },
      ],
    },
  });
  mockHeld = heldClient(mockHouse.client);
  useAuthStore.setState({ user: ME, isAuthenticated: true } as never);
  useSocialStore.getState().setFollowing([]);
});

it('a read asked again replaces the running one, whose late answer lands nowhere', async () => {
  const first = hydrateFollowing();
  await Promise.resolve();
  // Joined, as a cold start's second ask is: one read.
  void hydrateFollowing();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(mockHeld.count('interactions')).toBe(1);

  // The block lands in the house (sever_follows_on_block), after the first read was answered there.
  await mockHouse.client.from('interactions').delete().eq('target_user_id', KANE);
  const again = hydrateFollowing({ again: true });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(mockHeld.count('interactions')).toBe(2);

  // The fresh read answers first: the follow is gone.
  await mockHeld.release('interactions', 1);
  await again;
  expect(useSocialStore.getState().following).toEqual(['agnes']);
  // The old read answers late with the list from before the block: it changes nothing.
  await mockHeld.release('interactions', 0);
  await first;
  expect(useSocialStore.getState().following).toEqual(['agnes']);
});

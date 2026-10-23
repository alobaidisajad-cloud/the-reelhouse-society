/**
 * theBlocksAreReadAtSignIn.test.ts — the member's blocks, known before any is offered (P0.112).
 *
 * Only a cold start read the block list: a sign-in on a new phone read none, so for the whole
 * session a block looked like none, and the action sheet's MUTE turned a block into a mute. A
 * sign-in now reads them as a cold start does, and the store says whether its lists are known.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useAuthStore } from '../auth';
import { useBlockStore } from '../blockStore';
import { resetAllStores } from '../resetAllStores';

const ME = '11111111-1111-4111-8111-111111111111';
const BLOCKED = '22222222-2222-4222-8222-222222222222';
let mockHouse = supabaseFake({ rows: {} });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const house = (blocks: unknown) => supabaseFake({
  rows: { profiles: [{ id: ME, username: 'ana', is_social_private: false }], interactions: [], rank_history: [] },
  rpc: { get_user_blocks: blocks, my_entitlement_source: null },
});
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  useBlockStore.getState().clearOnLogout(null);
  useAuthStore.setState({ user: null, isAuthenticated: false });
});

it('a sign-in reads the member\'s blocks: known, and a block is a block', async () => {
  mockHouse = house([{ type: 'block', blocked_id: BLOCKED }]);
  expect(useBlockStore.getState().blocksKnown).toBe(false);
  useAuthStore.getState().adoptSession({ id: ME, email: 'ana@example.com' } as never);
  await settle();
  expect({ known: useBlockStore.getState().blocksKnown, blocked: useBlockStore.getState().isBlocked(BLOCKED) })
    .toEqual({ known: true, blocked: true });
});

it('a sign-in whose block read fails leaves them unknown, never "none"', async () => {
  mockHouse = house({ error: { code: '', message: 'Failed to fetch' } });
  useAuthStore.getState().adoptSession({ id: ME, email: 'ana@example.com' } as never);
  await settle();
  expect(useBlockStore.getState().blocksKnown).toBe(false);
});

it('signing out makes them unknown again: the next member\'s are not these', async () => {
  mockHouse = house([]);
  useAuthStore.getState().adoptSession({ id: ME, email: 'ana@example.com' } as never);
  await settle();
  expect(useBlockStore.getState().blocksKnown).toBe(true);
  await resetAllStores(ME);
  expect(useBlockStore.getState().blocksKnown).toBe(false);
});

/**
 * aBlockMadeWhileTheListsAreReadStays.test.ts — the block and mute lists read at sign-in never lay
 * an older answer over a block the member made meanwhile, nor over a newer read.
 * ─────────────────────────────────────────────────────────────────────────────
 * The read replaces the lists whole. Asked before the member blocked someone and answered after,
 * it laid the lists without them: the blocked member's words came back on every page, and the list
 * saved on the phone lost them. The read is now laid only while it is the lists' last turn; one an
 * act overtook is asked again, after the act.
 */
const ME = '33333333-3333-4333-8333-333333333333';
const THEM = '55555555-5555-4555-8555-555555555555';
const OTHER = '66666666-6666-4666-8666-666666666666';

/** The lists as the house holds them when a read is asked. */
let mockLists: unknown[] = [];
const fresh = () => supabaseFake({ rows: { user_blocks: [] }, rpc: { get_user_blocks: () => mockLists } });
let mockHeld = heldClient(fresh().client, { rpcs: ['get_user_blocks'] });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHeld.client; } }));
jest.mock('@/src/stores/mmkv-storage', () => ({
  isStorageEncrypted: () => true,
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  storage: { delete: jest.fn(), getString: jest.fn(), set: jest.fn() },
  setSensitive: jest.fn(),
}));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333' } }) } }));
jest.mock('@/src/stores/domain/socialSlice', () => ({ hydrateFollowing: jest.fn() }));
jest.mock('@/src/components/lobby/wallRead', () => ({ wallMayHaveChanged: jest.fn() }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

// eslint-disable-next-line import/first
import { heldClient } from '@/test-utils/heldClient';
// eslint-disable-next-line import/first
import { supabaseFake } from '@/test-utils/supabaseFake';
// eslint-disable-next-line import/first
import { useBlockStore } from '../blockStore';

const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const blocked = () => useBlockStore.getState().blocked;

beforeEach(() => {
  mockLists = [];
  mockHeld = heldClient(fresh().client, { rpcs: ['get_user_blocks'] });
  useBlockStore.setState({ blocked: [], muted: [], _blockedIndex: new Set(), _mutedIndex: new Set(), blocksKnown: false } as never);
});

it('a block made while the lists are read stays, and the lists are read again after it', async () => {
  const sync = useBlockStore.getState().syncFromServer(ME);
  const block = useBlockStore.getState().blockUser(THEM);
  await settle();
  // The house holds the block from here: a read asked now is worked out with it.
  mockLists = [{ type: 'block', blocked_id: THEM }];
  await mockHeld.release('get_user_blocks');
  expect(blocked()).toEqual([THEM]);
  await mockHeld.release('user_blocks');
  await block;
  // Asked again: once while the block was out (overtaken by its landing), then after it.
  await mockHeld.releaseAll();
  await sync;
  expect(blocked()).toEqual([THEM]);
  expect(useBlockStore.getState().blocksKnown).toBe(true);
});

it('of two reads, the later asked is laid, whichever lands last', async () => {
  const first = useBlockStore.getState().syncFromServer(ME);
  await settle();
  mockLists = [{ type: 'block', blocked_id: OTHER }];
  const second = useBlockStore.getState().syncFromServer(ME);
  await settle();
  await mockHeld.release('get_user_blocks', 1);
  await second;
  await mockHeld.release('get_user_blocks', 0);
  await first;
  expect(blocked()).toEqual([OTHER]);
  expect(mockHeld.count()).toBe(0);
});

/**
 * aBlockSyncAskedBeforeIsNotLaidOver.test.ts — the block list read from the house is laid only
 * when it is still the read asked.
 *
 * The list is read at sign-in and on each restore. A read asked before a block made here, or
 * before a newer read, answered last and was laid over what the member had just done: the member
 * they blocked was drawn again, and written back to the phone's copy.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';

const ME = '11111111-1111-4111-8111-111111111111';
const THEM = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

/** Each read of the list, held until the test answers it. */
const mockAnswers: ((rows: unknown[]) => void)[] = [];
const mockHouse = supabaseFake({ rows: { user_blocks: [] } });
Object.assign(mockHouse.client, {
  rpc: (name: string) => (name === 'get_user_blocks'
    ? new Promise((resolve) => { mockAnswers.push((rows) => resolve({ data: rows, error: null })); })
    : Promise.resolve({ data: null, error: null })),
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/stores/mmkv-storage', () => ({
  isStorageEncrypted: () => true,
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  storage: { delete: jest.fn(), getString: jest.fn(), set: jest.fn() },
  setSensitive: jest.fn(),
}));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' } }) } }));
jest.mock('@/src/stores/domain/socialSlice', () => ({ hydrateFollowing: jest.fn() }));
jest.mock('@/src/components/lobby/wallRead', () => ({ wallMayHaveChanged: jest.fn() }));
jest.mock('@/src/lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));

// eslint-disable-next-line import/first
import { useBlockStore } from '../blockStore';

const block = (id: string) => ({ blocked_id: id, type: 'block' });

beforeEach(() => {
  mockAnswers.length = 0;
  useBlockStore.setState({ blocked: [], muted: [], _blockedIndex: new Set(), _mutedIndex: new Set(), blocksKnown: false });
});

it('a read asked before a block made here does not draw the member blocked again', async () => {
  const sync = useBlockStore.getState().syncFromServer(ME);
  await useBlockStore.getState().blockUser(THEM);
  mockAnswers[0]!([]);
  await sync;
  expect(useBlockStore.getState().isBlocked(THEM)).toBe(true);
});

it('of two reads, the older answering last is not laid over the newer', async () => {
  const first = useBlockStore.getState().syncFromServer(ME);
  const second = useBlockStore.getState().syncFromServer(ME);
  mockAnswers[1]!([block(THEM), block(OTHER)]);
  await second;
  mockAnswers[0]!([block(OTHER)]);
  await first;
  expect(useBlockStore.getState().blocked).toEqual([THEM, OTHER]);
});

it('a read alone is laid as it answers', async () => {
  const sync = useBlockStore.getState().syncFromServer(ME);
  mockAnswers[0]!([block(THEM)]);
  await sync;
  expect([useBlockStore.getState().blocked, useBlockStore.getState().blocksKnown]).toEqual([[THEM], true]);
});

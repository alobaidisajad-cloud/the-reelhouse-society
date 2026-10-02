/**
 * aBlockListLeavesWithItsMember.test.ts — signing out erases the block list
 * saved on the phone.
 *
 * Logout clears the signed-in member first and runs every store's reset after.
 * The block store's eraser asked the auth store whose list to erase, found no
 * one, and erased nothing: a member's block and mute list stayed on the phone
 * after they signed out. The reset hands each store the leaving member's id.
 */
const mockDeleted: string[] = [];
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: { delete: (k: string) => mockDeleted.push(k), getString: jest.fn(), set: jest.fn() },
  setSensitive: jest.fn(),
}));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: null }) } }));

// eslint-disable-next-line import/first
import { useBlockStore } from '../blockStore';
// eslint-disable-next-line import/first
import { resetAllStores } from '../resetAllStores';

it('the reset erases the leaving member\'s saved list, though no one is signed in any more', async () => {
  useBlockStore.setState({ blocked: ['b1'], _blockedIndex: new Set(['b1']) });
  await resetAllStores('member-1');
  expect(mockDeleted).toContain('reelhouse_blocks_member-1');
  expect(useBlockStore.getState().blocked).toEqual([]);
});

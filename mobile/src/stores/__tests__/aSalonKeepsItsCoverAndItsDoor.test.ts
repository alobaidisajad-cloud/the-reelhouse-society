/**
 * aSalonKeepsItsCoverAndItsDoor.test.ts — two things the salon list and its acts owed.
 *
 * THE COVER. The corridor's reads never asked for `cover_image`, so no card
 * ever drew one, and a cover a host set showed until the next refresh (thirty
 * seconds at most) and then nowhere.
 *
 * THE DOOR. Joining, asking at a private door and founding a salon answered a
 * refusal for the rank with "check your connection": a lapsed member was told
 * to retry what no retry could give them. sendMessage already gave the door.
 */
import { useLoungeStore } from '../lounge';

const U1 = '33333333-3333-4333-8333-333333333333';
const L1 = '11111111-1111-4111-8111-111111111111';

const mockSelects: { table: string; columns: string }[] = [];
let mockRooms: unknown[] = [];
let mockRpcError: unknown = null;

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = (columns: string) => { mockSelects.push({ table, columns }); return self(); };
      for (const f of ['eq', 'in', 'order', 'limit'] as const) chain[f] = () => self();
      chain.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: table === 'lounges' ? mockRooms : [], error: null }).then(res);
      return chain;
    },
    rpc: async (fn: string) => (fn === 'get_lounge_unread_counts' || fn === 'get_salon_member_faces'
      ? { data: [], error: null }
      : { data: mockRpcError ? null : L1, error: mockRpcError }),
  },
}));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: U1, username: 'ana' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});
jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [],
}));

const toast = () => jest.requireMock('../../utils/reelToast').default;
const RANK = { message: 'The Lounge is an Archivist feature', code: '42501', details: '', hint: '' };

beforeEach(() => {
  mockSelects.length = 0;
  mockRooms = [];
  mockRpcError = null;
  toast().error.mockClear();
  toast().info.mockClear();
});

describe('the cover', () => {
  it('is asked for by every read of the salons, and kept on the room', async () => {
    mockRooms = [{
      id: L1, name: 'The Nitrate Circle', description: '', is_private: false,
      creator_id: U1, created_at: '2026-09-01T00:00:00Z', member_count: 3, cover_image: '/still.jpg',
    }];
    await useLoungeStore.getState().fetchLounges();
    const reads = mockSelects.filter((q) => q.table === 'lounges');
    expect(reads.length).toBeGreaterThan(0);
    for (const q of reads) expect(q.columns).toMatch(/\bcover_image\b/);
    expect(useLoungeStore.getState().lounges[0].cover_image).toBe('/still.jpg');
  });
});

describe('a refusal for the rank is the door, never "check your connection"', () => {
  it('taking a seat', async () => {
    mockRpcError = RANK;
    expect(await useLoungeStore.getState().joinPublicLounge(L1)).toBe(false);
    expect(toast().info).toHaveBeenCalledWith('The Lounge is an Archivist feature', expect.anything());
    expect(toast().error).not.toHaveBeenCalled();
  });

  it('asking at a private door', async () => {
    mockRpcError = RANK;
    expect(await useLoungeStore.getState().requestMembership(L1)).toBe('error');
    expect(toast().info).toHaveBeenCalled();
    expect(toast().error).not.toHaveBeenCalled();
  });

  it('founding a salon', async () => {
    mockRpcError = RANK;
    expect(await useLoungeStore.getState().createLounge('The Nitrate Circle', '', false)).toBeNull();
    expect(toast().info).toHaveBeenCalled();
    expect(toast().error).not.toHaveBeenCalled();
  });

  it('and a failure that is not about the rank is still said as one', async () => {
    mockRpcError = { message: 'TypeError: Network request failed', code: '', details: '', hint: '' };
    expect(await useLoungeStore.getState().joinPublicLounge(L1)).toBe(false);
    expect(toast().error).toHaveBeenCalledWith('Could not take a seat. Check your connection and try again.');
  });
});

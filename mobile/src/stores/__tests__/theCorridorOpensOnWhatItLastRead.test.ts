/**
 * theCorridorOpensOnWhatItLastRead.test.ts — the Lounge opens on the corridor it last read (WORKLIST P4.53).
 *
 * The Lounge's store kept nothing on the phone, so every launch drew the corridor's skeletons until
 * five reads in two waves had answered. The corridor as it was drawn is kept now, for the member
 * who read it, a day at most (utils/keptPages): a launch draws it at once and reads it again
 * beneath. A row kept by an older build is held to a room's shape as it is read back. Against the
 * house as strict as it is (test-utils/supabaseFake).
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLoungeStore } from '../lounge';
import { resetAllStores } from '../resetAllStores';
import { keepPage, keptPage } from '@/src/utils/keptPages';

const ME = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const HOST = '55555555-5555-4555-8555-555555555555';
const idOf = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;

/** A salon as the house holds it. */
const room = (n: number) => ({
  id: idOf(n), name: `Salon ${n}`, description: 'Talk', is_private: false, creator_id: HOST,
  created_at: `2026-11-0${n}T12:00:00Z`, member_count: 3, cover_image: null,
});

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: ME } }) } }));
jest.mock('@/src/stores/mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    isStorageEncrypted: () => true,
    withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
    setSensitive: jest.fn((k: string, v: string) => store.set(k, v)),
    storage: {
      set: jest.fn((k: string, v: string) => store.set(k, v)),
      getString: jest.fn((k: string) => store.get(k)),
      delete: jest.fn((k: string) => store.delete(k)),
      getAllKeys: jest.fn(() => [...store.keys()]),
      __store: store,
    },
  };
});
const disk = (jest.requireMock('@/src/stores/mmkv-storage') as { storage: { __store: Map<string, string> } }).storage.__store;

/** The house holding these salons, none of them the member's. */
const holding = (...rooms: ReturnType<typeof room>[]) => {
  mockHouse = supabaseFake({
    rows: { lounges: rooms, lounge_members: [] },
    rpc: { get_salon_last_words: [], get_lounge_unread_counts: [], get_salon_member_faces: [] },
  });
};
const unreachable = () => {
  mockHouse = supabaseFake({ rows: { lounges: [], lounge_members: [] }, fail: { lounge_members: { message: 'Failed to fetch', code: '' } } });
};
const drawn = () => useLoungeStore.getState().lounges.map((l) => l.id);

beforeEach(async () => {
  disk.clear();
  await resetAllStores();
});

it('draws the corridor it kept for this member at once, reads it again beneath, and keeps what it read', async () => {
  keepPage('lounges', ME, [room(1)]);
  holding(room(2), room(3));
  const read = useLoungeStore.getState().fetchLounges();
  expect(drawn()).toEqual([idOf(1)]);
  expect(useLoungeStore.getState().loungesRead).toBe(false);
  await read;
  expect(drawn()).toEqual([idOf(3), idOf(2)]);
  expect(useLoungeStore.getState().loungesRead).toBe(true);
  expect((keptPage('lounges', ME) as { id: string }[]).map((r) => r.id)).toEqual([idOf(3), idOf(2)]);
});

it("never draws another member's kept corridor", async () => {
  keepPage('lounges', OTHER, [room(1)]);
  holding(room(2));
  const read = useLoungeStore.getState().fetchLounges();
  expect(drawn()).toEqual([]);
  await read;
  expect(drawn()).toEqual([idOf(2)]);
});

it('keeps the kept corridor drawn when the house cannot be reached', async () => {
  keepPage('lounges', ME, [room(1)]);
  unreachable();
  await useLoungeStore.getState().fetchLounges();
  expect(drawn()).toEqual([idOf(1)]);
  expect(useLoungeStore.getState().loungesFailed).toBe(true);
});

it('draws the kept corridor only before the first read: a read since is never put back', async () => {
  keepPage('lounges', ME, [room(1)]);
  useLoungeStore.setState({ loungesRead: true });
  unreachable();
  await useLoungeStore.getState().fetchLounges();
  expect(drawn()).toEqual([]);
});

it('holds a kept row to the shape of a room: one without an id or a name is left out, each field kept only as its type', async () => {
  keepPage('lounges', ME, [
    { ...room(1), member_count: 'many', is_private: 'yes', membership_status: 'owner', memberFaces: [{ username: 'ana', avatar_url: 4 }, { avatar_url: null }], mine: true, unread_count: 2 },
    { ...room(2), id: undefined },
    { ...room(3), name: 7 },
    null,
  ]);
  unreachable();
  await useLoungeStore.getState().fetchLounges();
  expect(useLoungeStore.getState().lounges).toEqual([{
    id: idOf(1), name: 'Salon 1', description: 'Talk', is_private: false, creator_id: HOST, created_at: '2026-11-01T12:00:00Z',
    cover_image: null, member_count: 0, mine: true, unread_count: 2, last_message_at: undefined, membership_status: undefined,
    pending_count: 0, memberFaces: [{ username: 'ana', avatar_url: null }],
  }]);
});

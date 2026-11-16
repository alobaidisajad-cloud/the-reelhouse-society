/**
 * theDoorCountsNoOneHidden.test.ts — review round 6
 * ─────────────────────────────────────────────────────────────────────────────
 * The corridor's card for a salon the member hosts counts who waits at its door. It counted a
 * member the host had blocked or muted, whom the room's own door no longer shows: a badge of
 * three over a door with one at it. Each request is named by its member now, and one the host has
 * hidden is not counted; a request read without a name (a house from before) is counted as it was.
 * Against the house as strict as it is (test-utils/supabaseFake).
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLoungeStore } from '../lounge';
import { useBlockStore } from '../blockStore';
import { resetAllStores } from '../resetAllStores';

const ME = '33333333-3333-4333-8333-333333333333';
const WAITING = '44444444-4444-4444-8444-444444444441';
const BLOCKED = '44444444-4444-4444-8444-444444444442';
const MUTED = '44444444-4444-4444-8444-444444444443';
const SALON = '00000000-0000-4000-9000-000000000001';

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333' } }) } }));

/** The house, with the member hosting one salon, these requests at its door. */
const hosting = (pending: { lounge_id: string; user_id?: string }[]) => {
  mockHouse = supabaseFake({
    rpc: {
      get_lounge_list: {
        memberships: [{ lounge_id: SALON, status: 'owner' }], newest: [], joined: [],
        hosted: [{ id: SALON, name: 'The Back Row', description: '', is_private: true, creator_id: ME, created_at: '2026-11-01T12:00:00Z', member_count: 2, cover_image: null }],
        unread: [], pending, faces: [], last_words: [],
      },
    },
  });
};
const atTheDoor = () => {
  const salon = useLoungeStore.getState().lounges.find((l) => l.id === SALON);
  expect(salon).toBeDefined();
  return salon!.pending_count;
};

beforeEach(async () => {
  await resetAllStores();
  useBlockStore.setState({ blocked: [BLOCKED], _blockedIndex: new Set([BLOCKED]), muted: [MUTED], _mutedIndex: new Set([MUTED]) });
});
afterAll(() => { useBlockStore.setState({ blocked: [], _blockedIndex: new Set(), muted: [], _mutedIndex: new Set() }); });

it('the card counts only who the host has not blocked or muted at the door', async () => {
  hosting([
    { lounge_id: SALON, user_id: WAITING },
    { lounge_id: SALON, user_id: BLOCKED },
    { lounge_id: SALON, user_id: MUTED },
  ]);
  await useLoungeStore.getState().fetchLounges();
  expect(atTheDoor()).toBe(1);
});

it('a door of only members the host has hidden shows no count at all', async () => {
  hosting([
    { lounge_id: SALON, user_id: BLOCKED },
    { lounge_id: SALON, user_id: MUTED },
  ]);
  await useLoungeStore.getState().fetchLounges();
  expect(atTheDoor()).toBe(0);
});

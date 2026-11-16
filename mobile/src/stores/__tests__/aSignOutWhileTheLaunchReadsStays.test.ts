/**
 * aSignOutWhileTheLaunchReadsStays.test.ts — review round 6
 * ─────────────────────────────────────────────────────────────────────────────
 * A launch draws the member it cached at once, and reads their profile beneath (restoreSession).
 * A sign-out made while that read was out was undone by its answer: the member who had left was
 * set back on screen, written back to the phone as the last one signed in, on a session that had
 * ended. Another member signed in meanwhile was replaced by the one the launch was reading.
 * Against the house as strict as it is, its profile read held until the test lets it go.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { heldClient } from '@/test-utils/heldClient';
import { useAuthStore } from '../auth';
import { storage } from '../mmkv-storage';

const ANA = '11111111-1111-4111-8111-111111111111';
const BEN = '33333333-3333-4333-8333-333333333333';

let mockHouse = supabaseFake({ rows: {} });
let mockHeld = heldClient(mockHouse.client);
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHeld.client; } }));

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const who = () => useAuthStore.getState().user?.id ?? null;

beforeEach(() => {
  mockHouse = supabaseFake({
    rows: {
      profiles: [
        { id: ANA, username: 'ana', is_social_private: false, preferences: {} },
        { id: BEN, username: 'ben', is_social_private: false, preferences: {} },
      ],
      interactions: [], rank_history: [],
    },
    rpc: { get_user_blocks: [], my_entitlement_source: null },
    session: { userId: ANA },
  });
  mockHeld = heldClient(mockHouse.client);
  useAuthStore.setState({ user: null, isAuthenticated: false });
  // Ana is the member the phone last held: the launch draws her at once.
  storage.set('last_user_id', ANA);
  storage.set(`ironvault_user_cache_${ANA}`, JSON.stringify({ id: ANA, username: 'ana', following: [] }));
});

it('a member who signs out while the launch reads their profile stays signed out', async () => {
  const restoring = useAuthStore.getState().restoreSession();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(who()).toBe(ANA);
  expect(mockHeld.count('profiles')).toBe(1);

  // She signs out: the screen holds no one, and the phone no longer names her.
  useAuthStore.setState({ user: null, isAuthenticated: false });
  storage.delete(`ironvault_user_cache_${ANA}`);
  storage.delete('last_user_id');

  // Her profile answers after.
  await mockHeld.release('profiles');
  await restoring;
  await settle();

  expect(who()).toBeNull();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
  expect(useAuthStore.getState().loading).toBe(false);
  expect(storage.getString('last_user_id')).toBeUndefined();
  expect(storage.getString(`ironvault_user_cache_${ANA}`)).toBeUndefined();
});

it('another member signed in while the launch reads stays the one on screen', async () => {
  const restoring = useAuthStore.getState().restoreSession();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(mockHeld.count('profiles')).toBe(1);

  useAuthStore.setState({ user: { id: BEN, username: 'ben' } as never, isAuthenticated: true });
  storage.set('last_user_id', BEN);

  await mockHeld.release('profiles');
  await restoring;
  await settle();

  expect(who()).toBe(BEN);
  expect(storage.getString('last_user_id')).toBe(BEN);
});

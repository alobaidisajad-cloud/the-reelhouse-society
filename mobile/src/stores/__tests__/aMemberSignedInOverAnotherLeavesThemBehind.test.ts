/**
 * aMemberSignedInOverAnotherLeavesThemBehind.test.ts — a sign-in over another member, never signed
 * out, takes what was theirs off the screen first.
 *
 * A confirmation link for another account, the sign-in form, a reset finished for another account:
 * the next member came in over the one on screen, whose stores, notices and cached reads stayed,
 * the notice channel still theirs. And a launch whose session was another member's than the cached
 * one opened on the cached member's things. The member left behind keeps their unsent work.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useAuthStore } from '../auth';
import { useBlockStore } from '../blockStore';
import { storage } from '../mmkv-storage';

const ANA = '11111111-1111-4111-8111-111111111111';
const BEN = '33333333-3333-4333-8333-333333333333';
const BLOCKED_BY_BEN = '44444444-4444-4444-8444-444444444444';

let mockHouse = supabaseFake({ rows: {} });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const mockReset = jest.fn();
jest.mock('../resetAllStores', () => {
  const actual = jest.requireActual('../resetAllStores');
  return { ...actual, resetAllStores: (...a: unknown[]) => { mockReset(...a); return actual.resetAllStores(...a); } };
});
const mockTeardown = jest.fn();
jest.mock('../notificationStore', () => {
  const actual = jest.requireActual('../notificationStore');
  return { ...actual, teardownNotificationRealtime: () => { mockTeardown(); return actual.teardownNotificationRealtime(); } };
});

const house = (session: { userId: string } | null) => supabaseFake({
  rows: {
    profiles: [
      { id: ANA, username: 'ana', is_social_private: false, preferences: {} },
      { id: BEN, username: 'ben', is_social_private: false, preferences: {} },
    ],
    interactions: [], rank_history: [],
  },
  rpc: { get_user_blocks: [{ type: 'block', blocked_id: BLOCKED_BY_BEN }], my_entitlement_source: null },
  session,
});
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const who = () => useAuthStore.getState().user?.id ?? null;

beforeEach(() => {
  mockReset.mockClear();
  mockTeardown.mockClear();
  useBlockStore.getState().clearOnLogout(null);
  useAuthStore.setState({ user: null, isAuthenticated: false });
  storage.delete('last_user_id');
});

describe('a sign-in over another member', () => {
  it('leaves the one on screen behind first, then signs the next in', async () => {
    mockHouse = house(null);
    useAuthStore.getState().adoptSession({ id: ANA, email: 'ana@example.com' } as never);
    await settle();
    expect(who()).toBe(ANA);

    useAuthStore.getState().adoptSession({ id: BEN, email: 'ben@example.com' } as never);
    // The screen holds no one while the first member's things are taken off it.
    expect(who()).toBeNull();
    await settle();

    expect(mockReset).toHaveBeenCalledWith(ANA);
    expect(mockTeardown).toHaveBeenCalled();
    expect(storage.getString(`ironvault_user_cache_${ANA}`)).toBeUndefined();
    expect(who()).toBe(BEN);
  });

  it('the same member again is no switch: nothing is taken', async () => {
    mockHouse = house(null);
    useAuthStore.getState().adoptSession({ id: ANA, email: 'ana@example.com' } as never);
    await settle();
    useAuthStore.getState().adoptSession({ id: ANA, email: 'ana@example.com' } as never);
    await settle();
    expect(mockReset).not.toHaveBeenCalled();
    expect(who()).toBe(ANA);
  });

  it('a sign-in undone while the first was being left does not come back', async () => {
    mockHouse = house(null);
    useAuthStore.getState().adoptSession({ id: ANA, email: 'ana@example.com' } as never);
    await settle();
    useAuthStore.getState().adoptSession({ id: BEN, email: 'ben@example.com' } as never);
    useAuthStore.setState({ user: { id: ANA } as never });   // someone else came in meanwhile
    await settle();
    expect(who()).toBe(ANA);
  });
});

describe('a launch whose session is another member’s than the one cached', () => {
  it('takes the cached member off the screen and opens on the session’s member, blocks read', async () => {
    storage.set('last_user_id', ANA);
    storage.set(`ironvault_user_cache_${ANA}`, JSON.stringify({ id: ANA, username: 'ana', following: ['x'] }));
    mockHouse = house({ userId: BEN });

    await useAuthStore.getState().restoreSession();
    await settle();

    expect(mockReset).toHaveBeenCalledWith(ANA);
    expect(who()).toBe(BEN);
    expect(useAuthStore.getState().user?.following ?? []).not.toContain('x');
    expect(useBlockStore.getState().isBlocked(BLOCKED_BY_BEN)).toBe(true);
  });

  it('the same member as cached is not left behind', async () => {
    storage.set('last_user_id', BEN);
    storage.set(`ironvault_user_cache_${BEN}`, JSON.stringify({ id: BEN, username: 'ben', following: [] }));
    mockHouse = house({ userId: BEN });
    await useAuthStore.getState().restoreSession();
    await settle();
    expect(mockReset).not.toHaveBeenCalled();
    expect(who()).toBe(BEN);
  });
});

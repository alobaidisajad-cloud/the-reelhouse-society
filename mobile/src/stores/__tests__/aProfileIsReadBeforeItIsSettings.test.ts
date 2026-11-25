/**
 * aProfileIsReadBeforeItIsSettings.test.ts — whether the member's profile is held (P0.112).
 *
 * A login's first moments, and a session whose profile read gave up, carry the auth user alone.
 * Settings drew its form from that: a private profile read as public, and a save wrote it so.
 * profileRead tells the two apart, and rereadProfile asks again and lays the answer on the member.
 */
import { heldClient } from '@/test-utils/heldClient';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { refreshStanding } from '@/src/utils/standing';
import { profileRead } from '@/src/utils/profileRead';
import { useAuthStore } from '../auth';

const ME = '11111111-1111-4111-8111-111111111111';
let mockHouse = supabaseFake({ rows: {} });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const PROFILE = { id: ME, username: 'ana', is_social_private: true, preferences: { privacy_endorsements: 'followers' }, member_no: 17 };

describe('profileRead', () => {
  it('is false of the auth user alone and of nobody; true of a read profile, an older row\'s null included', () => {
    expect([
      profileRead(null),
      profileRead({ id: ME, email: 'ana@example.com', app_metadata: {}, user_metadata: { username: 'ana' } }),
      profileRead({ id: ME, is_social_private: true }),
      profileRead({ id: ME, is_social_private: null }),
    ]).toEqual([false, false, true, true]);
  });
});

describe('rereadProfile', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: ME, email: 'ana@example.com' } as never, isAuthenticated: true });
  });

  it('lays the profile read on the member: their private setting is now theirs', async () => {
    mockHouse = supabaseFake({ rows: { profiles: [PROFILE] } });
    expect(await useAuthStore.getState().rereadProfile()).toBe(true);
    const user = useAuthStore.getState().user as unknown as Record<string, unknown>;
    expect({ held: profileRead(user), private: user.is_social_private, email: user.email })
      .toEqual({ held: true, private: true, email: 'ana@example.com' });
  });

  it('a read that fails says so, and leaves the member as they were', async () => {
    mockHouse = supabaseFake({ fail: { profiles: { code: '', message: 'Failed to fetch' } } });
    expect(await useAuthStore.getState().rereadProfile()).toBe(false);
    expect(profileRead(useAuthStore.getState().user)).toBe(false);
  });

  it('an answer for a member who has since gone lands nowhere', async () => {
    // Another member signs in while the first one's profile is on its way.
    const OTHER = '22222222-2222-4222-8222-222222222222';
    mockHouse = supabaseFake({ answer: { profiles: () => {
      useAuthStore.setState({ user: { id: OTHER, email: 'bo@example.com' } as never });
      return [PROFILE];
    } } });
    await useAuthStore.getState().rereadProfile();
    expect(useAuthStore.getState().user).toEqual({ id: OTHER, email: 'bo@example.com' });
  });
});

describe('a profile read again while one is out', () => {
  /** Until the read just asked has been worked out by the house (the house as it stood when asked). */
  const asked = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  beforeEach(() => {
    useAuthStore.setState({ user: { id: ME, email: 'ana@example.com' } as never, isAuthenticated: true });
  });

  it('lays the later asked, whichever lands last', async () => {
    const house = supabaseFake({ rows: { profiles: [{ ...PROFILE }] } });
    const held = heldClient(house.client);
    mockHouse = { client: held.client } as never;
    const first = useAuthStore.getState().rereadProfile();
    await asked();
    (house.rows('profiles')[0] as Record<string, unknown>).is_social_private = false;
    const second = useAuthStore.getState().rereadProfile();
    await asked();
    await held.release('profiles', 1);
    await second;
    await held.release('profiles', 0);
    await first;
    expect((useAuthStore.getState().user as unknown as Record<string, unknown>).is_social_private).toBe(false);
  });

  it('a read of the member\'s standing asked before a whole read lands nowhere after it', async () => {
    const house = supabaseFake({ rows: { profiles: [{ ...PROFILE, is_banned: true }] } });
    const held = heldClient(house.client);
    mockHouse = { client: held.client } as never;
    const standing = refreshStanding();
    await asked();
    (house.rows('profiles')[0] as Record<string, unknown>).is_banned = false;
    const whole = useAuthStore.getState().rereadProfile();
    await asked();
    await held.release('profiles', 1);
    await whole;
    await held.release('profiles', 0);
    await standing;
    expect((useAuthStore.getState().user as unknown as Record<string, unknown>).is_banned).toBe(false);
  });

  it('the rank history asked at a sign-in and asked again lays the later asked, whichever lands last', async () => {
    // The house's answer as it stands when asked: a rank granted by the shop, then by the store.
    const sources = ['paytabs', 'apple'];
    const house = supabaseFake({ rows: { profiles: [{ ...PROFILE }] }, rpc: { my_entitlement_source: () => sources.shift() ?? null, get_user_blocks: [], get_my_follows: [] } });
    const held = heldClient(house.client, { rpcs: ['my_entitlement_source'] });
    mockHouse = { client: held.client } as never;
    const signIn = () => useAuthStore.getState().adoptSession({ id: ME, email: 'ana@example.com' } as never, { ...PROFILE });
    signIn();
    await asked();
    signIn();
    await asked();
    await held.release('my_entitlement_source', 1);
    await asked();
    await held.release('my_entitlement_source', 0);
    await asked();
    expect(useAuthStore.getState().user?.entitlement_source).toBe('apple');
  });
});

/**
 * aProfileIsReadBeforeItIsSettings.test.ts — whether the member's profile is held (P0.112).
 *
 * A login's first moments, and a session whose profile read gave up, carry the auth user alone.
 * Settings drew its form from that: a private profile read as public, and a save wrote it so.
 * profileRead tells the two apart, and rereadProfile asks again and lays the answer on the member.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
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
    mockHouse = supabaseFake({ answer: { profiles: () => { useAuthStore.setState({ user: null }); return [PROFILE]; } } });
    await useAuthStore.getState().rereadProfile();
    expect(useAuthStore.getState().user).toBeNull();
  });
});

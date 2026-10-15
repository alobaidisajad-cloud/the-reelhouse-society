/**
 * aFollowLandsOnlyForItsMember.test.ts — a follow or unfollow answered after
 * its member left.
 *
 * followUser and unfollowUser take the member's id, wait on the network, then
 * correct the screen, undo it, or queue the act, and save the list under that
 * id. A sign-out, or a switch to another account, while the answer is on its
 * way put the old member's follow into the new member's store, rewrote the
 * saved list the sign-out had just erased, and queued the act as the next
 * member.
 *
 * Driven through the real auth, follow and queue stores; only the network is
 * stood in for, each answer held until the test lets it go.
 */
import { followUser, unfollowUser } from '../domain/socialSlice';
import { useSocialStore } from '../followStore';
import { useAuthStore } from '../auth';
import { resetAllStores } from '../resetAllStores';
import { storage } from '../mmkv-storage';
import { getOfflineQueue } from '../../utils/offlineQueue';
import reelToast from '../../utils/reelToast';

jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});
jest.mock('../../utils/TactileEngine', () => ({
  __esModule: true,
  default: { warn: jest.fn(), navigate: jest.fn(), success: jest.fn(), mutate: jest.fn() },
}));
jest.mock('../../lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));

type Answer = { data: unknown; error: unknown };

/** Each network answer waits here until the test lets it go. */
const mockWaiting: { table: string; let: (a: Answer) => void }[] = [];
const mockHeld = (table: string) => new Promise<Answer>((resolve) => {
  mockWaiting.push({ table, let: resolve });
});

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      let deleting = false;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        delete: () => { deleting = true; return chain; },
        in: () => (deleting ? mockHeld(table) : chain),
        maybeSingle: () => mockHeld(table),
        insert: () => mockHeld(table),
      };
      return chain;
    },
  },
}));

const A = { id: '11111111-1111-4111-8111-111111111111', username: 'first' };
const B = { id: '22222222-2222-4222-8222-222222222222', username: 'second' };
const OFFLINE = { message: 'TypeError: Network request failed' };
const REFUSED = { message: 'permission denied for table interactions', code: '42501' };

/** Until the code is waiting on this table: its next request has been sent. */
async function waitingOn(table: string): Promise<number> {
  for (let i = 0; i < 20 && !mockWaiting.some((w) => w.table === table); i++) await Promise.resolve();
  const at = mockWaiting.findIndex((w) => w.table === table);
  if (at < 0) throw new Error(`nothing is waiting on ${table}`);
  return at;
}

/** The next answer the code is waiting on, from this table. */
async function answer(table: string, a: Answer): Promise<void> {
  mockWaiting.splice(await waitingOn(table), 1)[0].let(a);
}

function signIn(member: typeof A, following: string[]): void {
  useAuthStore.setState({ user: member, isAuthenticated: true } as never);
  useSocialStore.getState().setFollowing(following);
  useSocialStore.getState().setRequested([]);
  useSocialStore.getState().persistFollowing(member.id);
}

/** As logout does it: the member off the screen first, then every store's own reset. */
async function signOut(): Promise<void> {
  const leaving = useAuthStore.getState().user?.id ?? null;
  useAuthStore.setState({ user: null, isAuthenticated: false } as never);
  await resetAllStores(leaving);
}

const saved = (member: typeof A) => storage.getString(`reelhouse_following_${member.id}`);
const savedRequests = (member: typeof A) => storage.getString(`reelhouse_requested_${member.id}`);

beforeEach(async () => {
  mockWaiting.length = 0;
  await signOut();
  storage.clearAll();
  jest.clearAllMocks();
});

describe('a follow answered after its member signed out', () => {
  it('writes and saves nothing when the profile turns out private', async () => {
    signIn(A, []);
    const following = followUser('kane');
    await signOut();

    await answer('profiles', { data: { id: 'kane-id', is_social_private: true }, error: null });
    await following;

    expect(useSocialStore.getState().following).toEqual([]);
    expect(useSocialStore.getState().requested).toEqual([]);
    expect(saved(A)).toBeUndefined();
    expect(savedRequests(A)).toBeUndefined();
  });

  it('queues nothing and says nothing when the network fails too', async () => {
    signIn(A, []);
    const following = followUser('welles');
    await signOut();

    await answer('profiles', { data: null, error: OFFLINE });
    expect(await following).toBe(false);

    expect(getOfflineQueue()).toEqual([]);
    expect(reelToast).not.toHaveBeenCalled();
    expect(saved(A)).toBeUndefined();
  });

  it('undoes nothing and saves nothing when the follow is refused', async () => {
    signIn(A, []);
    const following = followUser('dreyer');
    await answer('profiles', { data: { id: 'dreyer-id', is_social_private: false }, error: null });
    await answer('interactions', { data: null, error: null });
    await waitingOn('interactions');
    await signOut();

    await answer('interactions', { data: null, error: REFUSED });
    expect(await following).toBe(false);

    expect(saved(A)).toBeUndefined();
    expect(reelToast.error).not.toHaveBeenCalled();
  });

  it('still follows, and saves, for a member who stayed', async () => {
    // The check must not cost the ordinary case its follow.
    signIn(A, []);
    const following = followUser('hitchcock');
    await answer('profiles', { data: { id: 'hitch-id', is_social_private: true }, error: null });
    await answer('interactions', { data: null, error: null });
    await answer('interactions', { data: null, error: null });
    expect(await following).toBe(true);

    expect(useSocialStore.getState().requested).toEqual(['hitchcock']);
    expect(JSON.parse(savedRequests(A) ?? '[]')).toEqual(['hitchcock']);
  });
});

describe('an unfollow answered after a switch to another account', () => {
  async function switchAccounts(): Promise<void> {
    await signOut();
    signIn(B, ['nosferatu']);
  }

  /** The handle is found while they are here; they switch while the unfollow is sent. */
  async function switchMidDelete(target: string): Promise<{ unfollowing: Promise<boolean> }> {
    signIn(A, [target]);
    const unfollowing = unfollowUser(target);
    await answer('profiles', { data: { id: `${target}-id`, is_social_private: false }, error: null });
    await waitingOn('interactions');
    await switchAccounts();
    return { unfollowing };
  }

  function expectTheNewMemberUntouched() {
    expect(useSocialStore.getState().following).toEqual(['nosferatu']);
    expect(useSocialStore.getState().requested).toEqual([]);
    expect(JSON.parse(saved(B) ?? '[]')).toEqual(['nosferatu']);
    expect(saved(A)).toBeUndefined();
    expect(getOfflineQueue()).toEqual([]);
  }

  it('does not put the old list back into the new member\'s store when refused', async () => {
    const { unfollowing } = await switchMidDelete('kubrick');
    await answer('interactions', { data: null, error: REFUSED });
    expect(await unfollowing).toBe(false);

    expectTheNewMemberUntouched();
    expect(reelToast.error).not.toHaveBeenCalled();
  });

  it('does not queue the unfollow as the new member when the network fails', async () => {
    const { unfollowing } = await switchMidDelete('lang');
    await answer('interactions', { data: null, error: OFFLINE });
    expect(await unfollowing).toBe(false);

    expectTheNewMemberUntouched();
    expect(reelToast).not.toHaveBeenCalled();
  });

  it('does not queue it when the handle does not resolve', async () => {
    signIn(A, ['murnau']);
    const unfollowing = unfollowUser('murnau');
    await switchAccounts();
    await answer('profiles', { data: null, error: null });
    expect(await unfollowing).toBe(false);

    expectTheNewMemberUntouched();
  });

  it('still rolls back for a member who stayed', async () => {
    signIn(A, ['ozu']);
    const unfollowing = unfollowUser('ozu');
    await answer('profiles', { data: { id: 'ozu-id', is_social_private: false }, error: null });
    await answer('interactions', { data: null, error: REFUSED });
    expect(await unfollowing).toBe(false);

    expect(useSocialStore.getState().following).toEqual(['ozu']);
    expect(JSON.parse(saved(A) ?? '[]')).toEqual(['ozu']);
  });
});

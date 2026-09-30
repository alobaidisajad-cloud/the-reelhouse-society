/**
 * aFollowMadeOfflineIsKept.test.ts — following a member with no connection.
 *
 * followUser queues a follow it could not send ("Follow saved offline"). But
 * the first thing it does is look the member up, and that lookup read a failed
 * answer as "no such member": followUser threw "not found", which is not a
 * network error, so the offline branch was never reached. The member was told
 * "Could not follow", the follow was undone, and a false defect was reported.
 * It worked only when the member's id happened to be cached.
 */
import { followUser } from '../domain/socialSlice';
import { useSocialStore } from '../followStore';
import { captureError } from '../../lib/sentry';

const mockEnqueue = jest.fn();

jest.mock('../auth', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({ user: { id: 'user-1', username: 'me' } })),
    subscribe: jest.fn(() => jest.fn()),
  },
}));
jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: (m: unknown) => mockEnqueue(m),
}));
jest.mock('../../utils/reelToast', () => {
  const fn: any = jest.fn();
  fn.error = jest.fn();
  return { __esModule: true, default: fn };
});
jest.mock('../../utils/TactileEngine', () => ({
  __esModule: true,
  default: { warn: jest.fn(), navigate: jest.fn(), success: jest.fn(), mutate: jest.fn() },
}));
jest.mock('../../lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));

/** What the member lookup answers, per test: supabase-js RESOLVES a failure. */
let mockLookup: { data: unknown; error: unknown } = { data: null, error: null };
let mockInserted = 0;

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        single: async () => (table === 'profiles' ? mockLookup : { data: null, error: null }),
        maybeSingle: async () => (table === 'profiles' ? mockLookup : { data: null, error: null }),
        insert: async () => { mockInserted++; return { error: null }; },
      };
      return chain;
    },
  },
}));

const OFFLINE = { message: 'TypeError: Network request failed' };

beforeEach(() => {
  jest.clearAllMocks();
  mockInserted = 0;
  useSocialStore.getState().setFollowing([]);
  useSocialStore.getState().setRequested([]);
});

describe('following a member with no connection', () => {
  it('is kept on screen and queued — not undone as "not found"', async () => {
    mockLookup = { data: null, error: OFFLINE };
    const ok = await followUser('nosferatu_fan');
    expect(ok).toBe(true);
    expect(useSocialStore.getState().isFollowing('nosferatu_fan')).toBe(true);
    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({
      type: 'follow_user',
      payload: expect.objectContaining({ user_id: 'user-1', target_username: 'nosferatu_fan' }),
    }));
    // An offline follow is not a defect.
    expect(captureError).not.toHaveBeenCalled();
  });

  it('a member who really does not exist is still refused, and undone', async () => {
    mockLookup = { data: null, error: null };
    const ok = await followUser('nobody_here');
    expect(ok).toBe(false);
    expect(useSocialStore.getState().isFollowing('nobody_here')).toBe(false);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('online, it is sent', async () => {
    mockLookup = { data: { id: 'target-9', is_social_private: false }, error: null };
    const ok = await followUser('kane');
    expect(ok).toBe(true);
    expect(mockInserted).toBe(1);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

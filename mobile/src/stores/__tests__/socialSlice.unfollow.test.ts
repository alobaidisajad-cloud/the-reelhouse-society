/**
 * socialSlice.unfollow.test.ts — #78, cancelling a follow request did nothing
 * ─────────────────────────────────────────────────────────────────────────
 * Filed as an offline-only edge case. It is not. Reading `unfollowUser` end to end,
 * `removeRequested` was never called in ANY path — not online, not offline, not in the
 * rollback — while `useProfileController` routes *cancel request* straight through it
 * (`isFollowing || isRequested → unfollowUser`).
 *
 * So you tap to cancel a pending request and the button still reads REQUESTED for the
 * rest of the session. Online. It corrects only on the next launch's hydrate.
 *
 * Dormant today — none of the 32 live members are private, so nothing can be in the
 * requested state — which is exactly why it would surface the first day someone turns
 * privacy on. These tests drive the REAL function so the fix cannot rot.
 */

import { unfollowUser } from '../domain/socialSlice';
import { useSocialStore } from '../followStore';

const mockEnqueue = jest.fn();
const mockDeleteFilters: Record<string, unknown>[] = [];

jest.mock('../auth', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({ user: { id: 'user-1', username: 'me' } })),
    subscribe: jest.fn(() => jest.fn()),
  },
}));

jest.mock('../mmkv-storage', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
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

/** Controls what the profile lookup returns, per test. */
const mockProfileResult: { data: { id: string; is_social_private: boolean } | null } = {
  data: { id: 'target-1', is_social_private: true },
};
/** Controls what the interactions DELETE returns, per test. */
let mockDeleteResult: { error: unknown } = { error: null };

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'profiles') {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          single: async () => mockProfileResult,
          maybeSingle: async () => mockProfileResult,
        };
        return chain;
      }
      // interactions
      const filters: Record<string, unknown> = {};
      const chain: any = {
        delete: () => { filters._op = 'delete'; return chain; },
        select: () => chain,
        insert: async () => ({ error: null }),
        eq: (col: string, val: unknown) => { filters[col] = val; return chain; },
        in: (col: string, vals: unknown[]) => {
          filters[`${col}__in`] = vals;
          mockDeleteFilters.push({ ...filters });
          return Promise.resolve(mockDeleteResult);
        },
        maybeSingle: async () => ({ data: null }),
      };
      return chain;
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockDeleteFilters.length = 0;
  mockDeleteResult = { error: null };
  mockProfileResult.data = { id: 'target-1', is_social_private: true };
  useSocialStore.getState().setFollowing([]);
  useSocialStore.getState().setRequested([]);
});

describe('cancelling a pending follow request', () => {
  it('clears the REQUESTED state — the whole of #78', () => {
    // Without removeRequested the button reads REQUESTED for the rest of the session.
    useSocialStore.getState().setRequested(['ghost_a']);
    expect(useSocialStore.getState().isRequested('ghost_a')).toBe(true);

    return unfollowUser('ghost_a').then((ok) => {
      expect(ok).toBe(true);
      expect(useSocialStore.getState().isRequested('ghost_a')).toBe(false);
    });
  });

  it('deletes BOTH row types, so the request does not stand at the target door', async () => {
    useSocialStore.getState().setRequested(['ghost_b']);
    await unfollowUser('ghost_b');

    const del = mockDeleteFilters.find((f) => f._op === 'delete');
    expect(del).toBeDefined();
    expect(del!['type__in']).toEqual(['follow', 'follow_request']);
    expect(del!['user_id']).toBe('user-1');
    expect(del!['target_user_id']).toBe('target-1');
  });

  it('also clears a plain follow — the ordinary path is unaffected', async () => {
    useSocialStore.getState().setFollowing(['ghost_c']);
    await unfollowUser('ghost_c');
    expect(useSocialStore.getState().isFollowing('ghost_c')).toBe(false);
  });
});

describe('rollback restores BOTH lists', () => {
  it('a failed cancel puts the request back, not just the follow', async () => {
    // Restoring only `following` left a cancelled request looking cancelled while the
    // row still stood — the UI and the database disagreeing in the worst direction.
    useSocialStore.getState().setFollowing(['keep_me']);
    useSocialStore.getState().setRequested(['ghost_d']);
    mockDeleteResult = { error: new Error('permission denied') };

    const ok = await unfollowUser('ghost_d');

    expect(ok).toBe(false);
    expect(useSocialStore.getState().isRequested('ghost_d')).toBe(true);
    expect(useSocialStore.getState().isFollowing('keep_me')).toBe(true);
  });
});

describe('the offline path', () => {
  it('queues the unfollow and keeps the optimistic removal', async () => {
    useSocialStore.getState().setRequested(['ghost_e']);
    mockDeleteResult = { error: new Error('Network request failed') };

    const ok = await unfollowUser('ghost_e');

    expect(ok).toBe(true);
    expect(useSocialStore.getState().isRequested('ghost_e')).toBe(false);
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'unfollow_user' }),
    );
  });
});

describe('the offline handler mirrors the online one', () => {
  /**
   * The queued `unfollow_user` deleted only `type = 'follow'`. So cancelling a request
   * while offline removed it locally and left the row standing at the target's door,
   * where it reappeared in the requester's UI after the next hydrate.
   *
   * A source assertion rather than a driven test: mutationExecutor's handlers are a
   * flat map executed by the queue, and standing up the queue to prove one `.in()`
   * would mock more than it proves. The online equivalent above IS driven.
   */
  it('deletes follow AND follow_request', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'utils', 'mutationExecutor.ts'), 'utf8',
    );
    const handler = src.slice(src.indexOf('unfollow_user: async'), src.indexOf('// ── Lounge ──'));
    expect(handler).toMatch(/\.in\('type', \['follow', 'follow_request'\]\)/);
    expect(handler).not.toMatch(/\.eq\('type', 'follow'\)/);
  });
});

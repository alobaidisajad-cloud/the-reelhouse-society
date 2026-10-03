/**
 * feedFlow.test.ts — Integration: Auth Session → Feed Query → Validated Items
 * ─────────────────────────────────────────────────────────────────────────────
 * Exercises the real auth store + FeedService with mocked Supabase to verify:
 *   1. Session restoration populates auth state → feed query returns Zod-validated items
 *   2. Consecutive cursor pages have zero overlapping IDs (keyset pagination invariant)
 *   3. Every feed is read through the house's own function, and every refusal is raised
 */

import { useAuthStore } from '@/src/stores/auth';
import { createMockUser, resetStores } from './helpers';

// ── Mock Supabase at module boundary ────────────────────────────────────────

const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockAuth = {
  getSession: jest.fn(),
  onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
  startAutoRefresh: jest.fn(),
  stopAutoRefresh: jest.fn(),
};

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: mockAuth,
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

jest.mock('@/src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});

jest.mock('@/src/utils/validateWithTelemetry', () => ({
  reportValidationTelemetry: jest.fn(),
}));

jest.mock('@/src/utils/withAbortSignal', () => ({
  withAbortSignal: (query: unknown) => query,
}));

// ── Test Data ───────────────────────────────────────────────────────────────

// ── Tests ───────────────────────────────────────────────────────────────────

/**
 * The RPC row is the deployed function's first 21 flat columns, checked against
 * pg_get_function_result for get_community_feed_auth_cursor. It has no nested
 * `profiles` — username, avatar_url and role come back flat. The two counts
 * 20260926_01 added at the end are left off here on purpose, so this is also
 * the row an older deploy sends; the counts' own tests below add them.
 */
function makeRpcRow(id: string, createdAt: string) {
  return {
    id,
    film_id: 550,
    film_title: 'Fight Club',
    poster_path: '/poster.jpg',
    rating: 4.5,
    review: 'A masterpiece.',
    drop_cap: false,
    status: 'watched',
    abandoned_reason: null,
    created_at: createdAt,
    year: 1999,
    user_id: 'user-abc',
    username: 'cinephile42',
    avatar_url: null,
    role: 'cinephile',
    editorial_header: null,
    pull_quote: null,
    watched_with: null,
    is_autopsied: false,
    autopsy: null,
    is_spoiler: false,
  };
}


describe('Feed Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStores();
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it('auth session restoration → feed query → returns validated items', async () => {
    // 1. Simulate session restoration: set auth state directly
    // (restoreSession depends on internal supabase import — we test the
    //  state flow, not the internal auth.ts plumbing which is unit-tested separately)
    const mockUser = createMockUser();
    useAuthStore.setState({
      user: mockUser as any,
      isAuthenticated: true,
      loading: false,
    });

    // 2. Verify: Auth state is populated
    const authState = useAuthStore.getState();
    expect(authState.isAuthenticated).toBe(true);
    expect(authState.user).not.toBeNull();
    expect(authState.user!.username).toBe('testuser');

    // 3. The function answers
    mockRpc.mockResolvedValue({
      data: [
        makeRpcRow('log-1', '2024-06-01T10:00:00Z'),
        makeRpcRow('log-2', '2024-06-01T09:00:00Z'),
        makeRpcRow('log-3', '2024-06-01T08:00:00Z'),
      ],
      error: null,
    });

    // 4. Execute: Fetch feed using real FeedService
    const { FeedService } = require('@/src/services/FeedService');
    const items = await FeedService.getCommunityFeed({});

    // 5. Verify: Items are Zod-validated (have proper types)
    expect(items).toHaveLength(3);
    expect(items[0].id).toBe('log-1');
    expect(items[0].username).toBe('cinephile42');
    expect(typeof items[0].film_id).toBe('number');
    expect(typeof items[0].rating).toBe('number');
  });

  it('the second page is asked for from where the first one ended', async () => {
    // Real uuids: the function's p_cursor_id is a uuid, and anything else is dropped.
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const page1Rows = [
      makeRpcRow(id(10), '2024-06-10T10:00:00Z'),
      makeRpcRow(id(9), '2024-06-09T10:00:00Z'),
      makeRpcRow(id(8), '2024-06-08T10:00:00Z'),
    ];
    // Page 2 — different IDs, older timestamps
    const page2Rows = [
      makeRpcRow(id(7), '2024-06-07T10:00:00Z'),
      makeRpcRow(id(6), '2024-06-06T10:00:00Z'),
      makeRpcRow(id(5), '2024-06-05T10:00:00Z'),
    ];
    mockRpc
      .mockResolvedValueOnce({ data: page1Rows, error: null })
      .mockResolvedValueOnce({ data: page2Rows, error: null });

    const { FeedService } = require('@/src/services/FeedService');

    // Fetch page 1
    const page1Items = await FeedService.getCommunityFeed({});
    expect(page1Items).toHaveLength(3);

    // Extract cursor from last item (compound cursor: created_at|id)
    const lastItem = page1Items[page1Items.length - 1];
    const cursor = `${lastItem.created_at}|${lastItem.id}`;

    // Fetch page 2 using cursor
    const page2Items = await FeedService.getCommunityFeed({ pageParam: cursor });
    expect(page2Items).toHaveLength(3);

    // The pages differ only because the server was ASKED from the cursor: the
    // first read from nothing, the second from the first page's last row.
    expect(mockRpc.mock.calls.map(([name, args]) => [name, args.p_cursor_created_at, args.p_cursor_id])).toEqual([
      ['get_community_feed_auth_cursor', null, null],
      ['get_community_feed_auth_cursor', lastItem.created_at, id(8)],
    ]);
  });

  // The function filters blocked and muted authors server-side, so a page's
  // length is what the client draws, and pagination never stops short.
  describe('the block-aware function, the only path', () => {
    it('parses the deployed function’s flat row shape into feed items', async () => {
      mockRpc.mockResolvedValue({
        data: [
          makeRpcRow('log-1', '2024-06-01T10:00:00Z'),
          makeRpcRow('log-2', '2024-06-01T09:00:00Z'),
        ],
        error: null,
      });

      const { FeedService } = require('@/src/services/FeedService');
      const items = await FeedService.getCommunityFeed({});

      // The direct query must never be reached when the RPC answers.
      expect(mockFrom).not.toHaveBeenCalled();
      expect(items).toHaveLength(2);
      expect(items[0].id).toBe('log-1');
      // Flat username, not the nested `profiles` the direct query returns.
      expect(items[0].username).toBe('cinephile42');
      expect(typeof items[0].film_id).toBe('number');
    });

    it('passes the cursor through as the function’s two separate arguments', async () => {
      // The cursor is one string, the RPC takes two: a wrong split repeats a page.
      mockRpc.mockResolvedValue({ data: [], error: null });

      const { FeedService } = require('@/src/services/FeedService');
      await FeedService.getCommunityFeed({
        pageParam: '2024-06-01T08:00:00Z|3f1a6c7e-9b2d-4e55-8a10-2c4d6e8f0a11',
      });

      expect(mockRpc).toHaveBeenCalledWith(
        'get_community_feed_auth_cursor',
        expect.objectContaining({
          p_cursor_created_at: '2024-06-01T08:00:00Z',
          p_cursor_id: '3f1a6c7e-9b2d-4e55-8a10-2c4d6e8f0a11',
        }),
      );
    });

    it('drops a cursor id that is not a UUID instead of sending it', async () => {
      // p_cursor_id is a uuid: anything else would 400 the page, so the feed restarts instead.
      mockRpc.mockResolvedValue({ data: [], error: null });

      const { FeedService } = require('@/src/services/FeedService');
      await FeedService.getCommunityFeed({ pageParam: '2024-06-01T08:00:00Z|log-3' });

      expect(mockRpc).toHaveBeenCalledWith(
        'get_community_feed_auth_cursor',
        expect.objectContaining({ p_cursor_id: null }),
      );
    });

    it('an empty answer is an empty page', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });

      const { FeedService } = require('@/src/services/FeedService');
      expect(await FeedService.getCommunityFeed({})).toEqual([]);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('RAISES a refusal: an unread feed is never drawn as an empty one', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'permission denied for function get_community_feed_auth_cursor', code: '42501' },
      });

      const { FeedService } = require('@/src/services/FeedService');
      await expect(FeedService.getCommunityFeed({})).rejects.toThrow();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    // A missing function was once quietly replaced by a direct query that could
    // not filter blocks server-side: a member would have seen whom they blocked.
    it('a MISSING function is raised too, never replaced by an unfiltered query', async () => {
      const missing = { data: null, error: { message: 'function does not exist', code: '42883' } };
      mockRpc.mockResolvedValue(missing);
      const { FeedService } = require('@/src/services/FeedService');
      await expect(FeedService.getCommunityFeed({})).rejects.toThrow();
      await expect(FeedService.getFollowingFeed({})).rejects.toThrow();
      await expect(FeedService.getStacksFeed('all', '', {}, 0)).rejects.toThrow();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('the followed stacks of a member who follows no one are not asked for', async () => {
      const { FeedService } = require('@/src/services/FeedService');
      expect(await FeedService.getStacksFeed('following', '', {}, 0)).toEqual([]);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('the followed stacks of a member who follows some are asked of the server', async () => {
      const { FeedService } = require('@/src/services/FeedService');
      await FeedService.getStacksFeed('following', '', {}, 3);
      expect(mockRpc).toHaveBeenCalledWith('get_filtered_stacks_auth_cursor_v2', expect.objectContaining({ p_filter_following: true }));
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // THE COUNTS EVERY CARD DRAWS
  // 20260926_01 added certify_count and critique_count to both feed functions.
  // They must reach the card, AND the shared store every bar reads.
  // ══════════════════════════════════════════════════════════════════════════
  describe('the counts every card draws', () => {
    const { resetMarkCounts, selectMarkCount, useMarkCounts } = jest.requireActual('@/src/stores/markCounts');
    const told = (id: string) => [
      selectMarkCount(useMarkCounts.getState(), 'certify', id),
      selectMarkCount(useMarkCounts.getState(), 'critique', id),
    ];
    beforeEach(() => resetMarkCounts());

    it('carries the function’s two counts, and tells the store', async () => {
      mockRpc.mockResolvedValue({
        data: [{ ...makeRpcRow('log-1', '2024-06-01T10:00:00Z'), certify_count: 12, critique_count: 3 }],
        error: null,
      });
      const { FeedService } = require('@/src/services/FeedService');
      const [item] = await FeedService.getCommunityFeed({});
      expect([item.certify_count, item.critique_count]).toEqual([12, 3]);
      expect(told('log-1')).toEqual([12, 3]);
    });

    it('a function without the columns (an older deploy) says nothing, never zero', async () => {
      mockRpc.mockResolvedValue({ data: [makeRpcRow('log-1', '2024-06-01T10:00:00Z')], error: null });
      const { FeedService } = require('@/src/services/FeedService');
      const [item] = await FeedService.getCommunityFeed({});
      expect([item.certify_count, item.critique_count]).toEqual([null, null]);
      expect(told('log-1')).toEqual([null, null]);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // THE HEART IS THE SERVER'S ANSWER (20260926_03, learnEndorsements)
  // ══════════════════════════════════════════════════════════════════════════
  describe('the heart every card draws', () => {
    const { useFilmStore } = jest.requireActual('@/src/stores/films');
    const hearted = (id: string) => !!useFilmStore.getState()._endorsedIndex[id];
    const { resetMarkCounts } = jest.requireActual('@/src/stores/markCounts');
    const ME = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    beforeEach(() => {
      resetMarkCounts();
      useFilmStore.setState({ _endorsedIndex: {}, interactions: [] });
      useAuthStore.setState({ user: { ...createMockUser(), id: ME } } as never);
    });

    it('fills from the feed row — however long ago the member certified it', async () => {
      mockRpc.mockResolvedValue({
        data: [
          { ...makeRpcRow('log-old', '2024-06-01T10:00:00Z'), certify_count: 3, critique_count: 0, certified: true },
          { ...makeRpcRow('log-new', '2024-06-01T09:00:00Z'), certify_count: 1, critique_count: 0, certified: false },
        ],
        error: null,
      });
      const { FeedService } = require('@/src/services/FeedService');
      await FeedService.getCommunityFeed({});
      expect([hearted('log-old'), hearted('log-new')]).toEqual([true, false]);
    });

  });
});

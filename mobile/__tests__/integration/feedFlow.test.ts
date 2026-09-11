/**
 * feedFlow.test.ts — Integration: Auth Session → Feed Query → Validated Items
 * ─────────────────────────────────────────────────────────────────────────────
 * Exercises the real auth store + FeedService with mocked Supabase to verify:
 *   1. Session restoration populates auth state → feed query returns Zod-validated items
 *   2. Consecutive cursor pages have zero overlapping IDs (keyset pagination invariant)
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

function makeFeedRow(id: string, createdAt: string) {
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
    editorial_header: null,
    pull_quote: null,
    watched_with: null,
    is_autopsied: false,
    autopsy: null,
    profiles: { username: 'cinephile42', avatar_url: null, role: 'cinephile' },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

/**
 * The RPC row is what the DEPLOYED function returns: 21 flat columns, checked
 * against pg_get_function_result for get_community_feed_auth_cursor. It has no
 * nested `profiles` — username, avatar_url and role come back flat.
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

/** PostgREST's answer when a function is not deployed. */
const RPC_NOT_DEPLOYED = {
  data: null,
  error: { message: 'function public.get_community_feed_auth_cursor does not exist', code: '42883' },
};

describe('Feed Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStores();
    // ── SAY WHICH STRATEGY IS UNDER TEST ────────────────────────────────────
    // mockRpc was a bare jest.fn(), so it answered `undefined` and
    // `rpcResult.error` threw a TypeError inside getCommunityFeed's try. The
    // catch swallowed it and every test here silently landed on the direct-query
    // fallback — while believing it had exercised the service as a whole.
    // Now the fallback is REQUESTED, and the RPC path has its own test below.
    mockRpc.mockResolvedValue(RPC_NOT_DEPLOYED);
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

    // 3. Mock feed query
    const feedRows = [
      makeFeedRow('log-1', '2024-06-01T10:00:00Z'),
      makeFeedRow('log-2', '2024-06-01T09:00:00Z'),
      makeFeedRow('log-3', '2024-06-01T08:00:00Z'),
    ];

    const feedChain: Record<string, jest.Mock> = {};
    feedChain.select = jest.fn().mockReturnValue(feedChain);
    feedChain.not = jest.fn().mockReturnValue(feedChain);
    feedChain.neq = jest.fn().mockReturnValue(feedChain);
    feedChain.order = jest.fn().mockReturnValue(feedChain);
    feedChain.limit = jest.fn().mockReturnValue(feedChain);
    feedChain.or = jest.fn().mockReturnValue(feedChain);
    feedChain.lt = jest.fn().mockReturnValue(feedChain);
    feedChain.then = jest.fn((cb) => Promise.resolve(cb({ data: feedRows, error: null })));

    mockFrom.mockImplementation(() => feedChain);

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

  it('consecutive cursor pages have zero overlapping IDs', async () => {
    // Page 1
    const page1Rows = [
      makeFeedRow('log-10', '2024-06-10T10:00:00Z'),
      makeFeedRow('log-9', '2024-06-09T10:00:00Z'),
      makeFeedRow('log-8', '2024-06-08T10:00:00Z'),
    ];

    // Page 2 — different IDs, older timestamps
    const page2Rows = [
      makeFeedRow('log-7', '2024-06-07T10:00:00Z'),
      makeFeedRow('log-6', '2024-06-06T10:00:00Z'),
      makeFeedRow('log-5', '2024-06-05T10:00:00Z'),
    ];

    let callCount = 0;
    const feedChain: Record<string, jest.Mock> = {};
    feedChain.select = jest.fn().mockReturnValue(feedChain);
    feedChain.not = jest.fn().mockReturnValue(feedChain);
    feedChain.neq = jest.fn().mockReturnValue(feedChain);
    feedChain.order = jest.fn().mockReturnValue(feedChain);
    feedChain.limit = jest.fn().mockReturnValue(feedChain);
    feedChain.or = jest.fn().mockReturnValue(feedChain);
    feedChain.lt = jest.fn().mockReturnValue(feedChain);
    feedChain.then = jest.fn((cb) => {
      callCount++;
      const data = callCount === 1 ? page1Rows : page2Rows;
      return Promise.resolve(cb({ data, error: null }));
    });

    mockFrom.mockImplementation(() => feedChain);

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

    // Verify: zero overlapping IDs between pages
    const page1Ids = new Set(page1Items.map((i: { id: string }) => i.id));
    const page2Ids = new Set(page2Items.map((i: { id: string }) => i.id));
    const overlap = [...page2Ids].filter(id => page1Ids.has(id));

    expect(overlap).toHaveLength(0);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // THE PATH PRODUCTION ACTUALLY TAKES
  //
  // get_community_feed_auth_cursor IS deployed — verified against pg_proc, with
  // EXECUTE granted to authenticated. So every real community feed comes back
  // through the RPC, and the direct query above is the branch that never runs.
  // It had all the coverage; the live one had none.
  //
  // The RPC also matters for a reason the fallback cannot reproduce: it filters
  // blocked and muted authors SERVER-SIDE, so the page length used for
  // pagination matches what the client renders. The fallback filters in
  // useFeeds.ts afterwards, which is why its pages can come up short.
  // ══════════════════════════════════════════════════════════════════════════
  describe('the block-aware RPC — the strategy the live app uses', () => {
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
      // The RPC takes created_at and id apart; the client's cursor is one
      // string. Splitting it wrongly is how a page silently repeats itself.
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
      // p_cursor_id is `uuid` on the deployed function. Handing it anything
      // else is a 400 for the whole page, so parseCursor nulls it — which
      // restarts the feed rather than breaking it. Written down because a
      // fixture with a short id is how this was nearly "fixed" the wrong way.
      mockRpc.mockResolvedValue({ data: [], error: null });

      const { FeedService } = require('@/src/services/FeedService');
      await FeedService.getCommunityFeed({ pageParam: '2024-06-01T08:00:00Z|log-3' });

      expect(mockRpc).toHaveBeenCalledWith(
        'get_community_feed_auth_cursor',
        expect.objectContaining({ p_cursor_id: null }),
      );
    });

    it('returns an empty page rather than falling back when the RPC has nothing', async () => {
      // An empty feed and a missing function are different things. Treating
      // "no rows" as a failure would run the whole unfiltered query again.
      mockRpc.mockResolvedValue({ data: [], error: null });

      const { FeedService } = require('@/src/services/FeedService');
      expect(await FeedService.getCommunityFeed({})).toEqual([]);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('RAISES a real error instead of quietly serving the unfiltered fallback', async () => {
      // Only a MISSING function may fall back. Any other error means the
      // block filter could not be applied, and silently serving the
      // unfiltered query would show a member the authors they blocked.
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'permission denied for function get_community_feed_auth_cursor', code: '42501' },
      });

      const { FeedService } = require('@/src/services/FeedService');
      await expect(FeedService.getCommunityFeed({})).rejects.toThrow();
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });
});

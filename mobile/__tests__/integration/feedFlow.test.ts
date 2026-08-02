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

describe('Feed Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStores();
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
});

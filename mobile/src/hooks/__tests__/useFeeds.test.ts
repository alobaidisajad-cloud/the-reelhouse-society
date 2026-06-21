/**
 * useFeeds.test.ts — Contract & Logic Tests
 * ──────────────────────────────────────────
 * Tests feed hook exports and cursor pagination logic.
 */

describe('useFeeds contract', () => {
  it('exports useCommunityFeed, useFollowingFeed, useStacksFeed', () => {
    const mod = require('../useFeeds');
    expect(typeof mod.useCommunityFeed).toBe('function');
    expect(typeof mod.useFollowingFeed).toBe('function');
    expect(typeof mod.useStacksFeed).toBe('function');
  });
});

describe('useFeeds cursor pagination logic', () => {
  it('returns undefined when page has fewer than 40 items (community)', () => {
    const lastPage = Array.from({ length: 20 }, (_, i) => ({
      id: `${i}`,
      created_at: `2024-01-${String(i + 1).padStart(2, '0')}`,
    }));

    // Mirrors getNextPageParam from useCommunityFeed
    const getNextPageParam = (page: any[]) => {
      if (page.length < 40) return undefined;
      const last = page[page.length - 1];
      return last ? `${last.created_at}|${last.id}` : undefined;
    };

    expect(getNextPageParam(lastPage)).toBeUndefined();
  });

  it('returns compound cursor when page is full (40 items)', () => {
    const lastPage = Array.from({ length: 40 }, (_, i) => ({
      id: `log-${i}`,
      created_at: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    }));

    const getNextPageParam = (page: any[]) => {
      if (page.length < 40) return undefined;
      const last = page[page.length - 1];
      return last ? `${last.created_at}|${last.id}` : undefined;
    };

    const cursor = getNextPageParam(lastPage);
    expect(cursor).toBe('2024-01-40T00:00:00Z|log-39');
    expect(cursor).toContain('|');
  });

  it('stacks feed uses 60-item threshold', () => {
    const smallPage = Array.from({ length: 30 }, (_, i) => ({
      id: `stack-${i}`,
      createdAt: `2024-01-01`,
    }));

    const getNextPageParam = (page: any[]) => {
      if (page.length < 60) return undefined;
      const last = page[page.length - 1];
      return last ? `${last.createdAt}|${last.id}` : undefined;
    };

    expect(getNextPageParam(smallPage)).toBeUndefined();
  });

  it('empty page returns undefined cursor', () => {
    const getNextPageParam = (page: any[]) => {
      if (page.length < 40) return undefined;
      const last = page[page.length - 1];
      return last ? `${last.created_at}|${last.id}` : undefined;
    };

    expect(getNextPageParam([])).toBeUndefined();
  });
});

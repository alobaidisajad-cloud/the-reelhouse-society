/**
 * useFeeds.test.ts — the Reel's three feeds, driven through the real hooks.
 * ─────────────────────────────────────────────────────────────────────────────
 * A full page asks for the next one from its last row, and a short page is the
 * last. The cursor is `created_at|id` for logs and `createdAt|id` for stacks: a
 * timestamp alone repeats or skips two rows filed in the same instant.
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCommunityFeed, useFollowingFeed, useStacksFeed } from '../useFeeds';
import { FEED_PAGE, STACKS_PAGE } from '@/src/services/FeedService';

const mockCommunity = jest.fn();
const mockFollowing = jest.fn();
const mockStacks = jest.fn();

jest.mock('@/src/services/FeedService', () => ({
  ...jest.requireActual('@/src/services/FeedService'),
  FeedService: {
    getCommunityFeed: (o: unknown) => mockCommunity(o),
    getFollowingFeed: (o: unknown) => mockFollowing(o),
    getStacksFeed: (...a: unknown[]) => mockStacks(...a),
  },
}));
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 'me' } }),
}));
const mockSocial = { following: ['someone'] };
jest.mock('@/src/stores/followStore', () => ({
  useSocialStore: Object.assign((sel: (s: unknown) => unknown) => sel(mockSocial), { getState: () => mockSocial }),
}));
jest.mock('@/src/stores/blockStore', () => ({
  useBlockStore: { getState: () => ({ isHidden: (id: string) => id === 'blocked' }) },
}));

const logs = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({
  id: `log-${from + i}`, user_id: 'author', created_at: `2026-09-01T10:00:${String((from + i) % 60).padStart(2, '0')}Z`,
}));
const stacks = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `stack-${i}`, curatorId: 'curator', createdAt: `2026-09-01T10:${String(i % 60).padStart(2, '0')}:00Z`,
}));
function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return React.createElement(QueryClientProvider, { client }, children);
}
const renderFeed = <T,>(useFeed: () => T) => renderHook(useFeed, { wrapper });
const pageParamOf =(call: unknown[]) => (call[0] as { pageParam?: string }).pageParam;

beforeEach(() => { mockCommunity.mockReset(); mockFollowing.mockReset(); mockStacks.mockReset(); });

describe.each([
  ['community', useCommunityFeed, mockCommunity],
  ['following', useFollowingFeed, mockFollowing],
] as const)('the %s feed', (_name, useFeed, service) => {
  it('asks for the next page from the last row of a full one', async () => {
    const first = logs(FEED_PAGE);
    service.mockResolvedValueOnce(first).mockResolvedValueOnce(logs(3, FEED_PAGE));
    const { result } = await renderFeed(() => useFeed());
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));

    await act(async () => { await result.current.fetchNextPage(); });

    const last = first[first.length - 1];
    expect(pageParamOf(service.mock.calls[1])).toBe(`${last.created_at}|${last.id}`);
    await waitFor(() => expect(result.current.hasNextPage).toBe(false));
  });

  it('stops at a short page, and draws nobody it hides', async () => {
    service.mockResolvedValueOnce([...logs(2), { id: 'log-x', user_id: 'blocked', created_at: '2026-09-01T09:00:00Z' }]);
    const { result } = await renderFeed(() => useFeed());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.data!.pages[0].map((r) => r.id)).toEqual(['log-0', 'log-1']);
  });
});

describe('the stacks feed', () => {
  it('pages by its own size, from the last stack of a full page', async () => {
    const first = stacks(STACKS_PAGE);
    mockStacks.mockResolvedValueOnce(first).mockResolvedValueOnce(stacks(1));
    const { result } = await renderFeed(() => useStacksFeed('all', ''));
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));

    await act(async () => { await result.current.fetchNextPage(); });

    const last = first[first.length - 1];
    expect((mockStacks.mock.calls[1][2] as { pageParam?: string }).pageParam).toBe(`${last.createdAt}|${last.id}`);
  });

  it('is the last page when shorter than a stacks page, even at a logs page', async () => {
    mockStacks.mockResolvedValueOnce(stacks(FEED_PAGE));
    const { result } = await renderFeed(() => useStacksFeed('all', ''));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });
});

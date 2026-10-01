import type { FeedItem, StackData } from '@/src/schemas/feed.schema';
import { FeedService, FEED_PAGE, STACKS_PAGE } from '@/src/services/FeedService';
import { useAuthStore } from '@/src/stores/auth';
import { useSocialStore } from '@/src/stores/followStore';
import { filterContentByBlocks } from '@/src/utils/filterContentByBlocks';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

/** A full page continues from its last row; a short one is the last. The id breaks a tied time. */
function nextCursor<T extends { id: string }>(page: T[], size: number, at: (row: T) => string) {
  if (page.length < size) return undefined;
  const last = page[page.length - 1];
  return `${at(last)}|${last.id}`;
}

export function useCommunityFeed() {
  return useInfiniteQuery({
    queryKey: ['feed', 'community'],
    queryFn: async ({ pageParam, signal }) => {
      return FeedService.getCommunityFeed({ pageParam, signal });
    },
    // The page's length decides the next page, so the server filters blocks and mutes;
    // `select` hides anyone blocked since the page arrived.
    getNextPageParam: (lastPage) => nextCursor(lastPage, FEED_PAGE, (row) => row.created_at),
    initialPageParam: undefined as string | undefined,
    staleTime: 60 * 1000, // 1 minute
    select: (data) => ({
      ...data,
      pages: data.pages.map((page) =>
        filterContentByBlocks(page, (item: FeedItem) => item.user_id ?? ''),
      ),
    }),
  });
}

export function useFollowingFeed() {
  const userId = useAuthStore((s) => s.user?.id);
  const followingForEnabled = useSocialStore((s) => s.following);

  return useInfiniteQuery({
    queryKey: ['feed', 'following', userId],
    queryFn: async ({ pageParam, signal }) => FeedService.getFollowingFeed({ pageParam, signal }),
    getNextPageParam: (lastPage) => nextCursor(lastPage, FEED_PAGE, (row) => row.created_at),
    initialPageParam: undefined as string | undefined,
    enabled: followingForEnabled.length > 0,
    staleTime: 60 * 1000,
    select: (data) => ({
      ...data,
      pages: data.pages.map((page) =>
        filterContentByBlocks(page, (item: FeedItem) => item.user_id ?? ''),
      ),
    }),
  });
}

export function useStacksFeed(filter: 'all' | 'following' = 'all', search: string = '') {
  const userId = useAuthStore((s) => s.user?.id);

  // No follow-graph subscription: socialSlice invalidates this key on follow and unfollow.

  return useInfiniteQuery({
    queryKey: ['feed', 'stacks', filter, search, userId],
    queryFn: async ({ pageParam, signal }) => {
      const followingCount = useSocialStore.getState().following.length;
      return FeedService.getStacksFeed(filter, search, { pageParam, signal }, followingCount);
    },
    getNextPageParam: (lastPage) => nextCursor(lastPage, STACKS_PAGE, (row) => row.createdAt),
    initialPageParam: undefined as string | undefined,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    select: (data) => ({
      ...data,
      pages: data.pages.map((page) =>
        filterContentByBlocks(page, (item: StackData) => item.curatorId),
      ),
    }),
  });
}

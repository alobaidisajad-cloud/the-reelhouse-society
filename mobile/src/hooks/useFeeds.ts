import type { FeedItem, StackData } from '@/src/schemas/feed.schema';
import { FeedService } from '@/src/services/FeedService';
import { useAuthStore } from '@/src/stores/auth';
import { useSocialStore } from '@/src/stores/followStore';
import { filterContentByBlocks } from '@/src/utils/filterContentByBlocks';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

export function useCommunityFeed() {
  return useInfiniteQuery({
    queryKey: ['feed', 'community'],
    queryFn: async ({ pageParam, signal }) => {
      return FeedService.getCommunityFeed({ pageParam, signal });
    },
    // Compound cursor (created_at|id) replaces bare created_at.
    // Without the id tiebreaker, two logs with identical timestamps cause
    // duplicates or skips on the next page — matching following/stacks pattern.
    //
    // getNextPageParam reads the raw page length, so block/mute filtering
    // must happen server-side (get_community_feed_auth_cursor) for this
    // length check to match what `select` below actually renders. The
    // `select` filter is a defense-in-depth backstop for the direct-query
    // fallback path in FeedService, which can't filter blocks server-side.
    getNextPageParam: (lastPage) => {
      if (lastPage.length < 40) return undefined;
      const last = lastPage[lastPage.length - 1];
      return last ? `${last.created_at}|${last.id}` : undefined;
    },
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
    queryFn: async ({ pageParam, signal }) => {
      const following = useSocialStore.getState().following;
      return FeedService.getFollowingFeed({ pageParam, signal }, following);
    },
    // Cursor-based pagination — compound (created_at|id) cursor
    // prevents duplicate items caused by offset drift on concurrent inserts.
    getNextPageParam: (lastPage) => {
      if (lastPage.length < 40) return undefined;
      const last = lastPage[lastPage.length - 1];
      return last ? `${last.created_at}|${last.id}` : undefined;
    },
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const followingForEnabled = useSocialStore((s) => s.following);

  return useInfiniteQuery({
    queryKey: ['feed', 'stacks', filter, search, userId],
    queryFn: async ({ pageParam, signal }) => {
      const following = useSocialStore.getState().following;
      return FeedService.getStacksFeed(filter, search, { pageParam, signal }, following);
    },
    // Cursor-based pagination for stacks feed.
    getNextPageParam: (lastPage) => {
      if (lastPage.length < 60) return undefined;
      const last = lastPage[lastPage.length - 1];
      return last ? `${last.createdAt}|${last.id}` : undefined;
    },
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

/**
 * The Reel's cards, told that a record changed.
 *
 * The cards are drawn from the feed's pages (['feed', 'community'], ['feed', 'following', me]),
 * and a record amended or withdrawn from its sheet touched only the film store, its film's page
 * and its own page: back on the Reel, the card still read the old rating and words, and a deleted
 * record's card stood, opening a page that went straight back (review round 6). Coming back from
 * a sheet is not an app focus, so nothing read them again until a pull.
 *
 * Amended: the pages are read again. Withdrawn: its card leaves at once (the delete may be waiting
 * on the wire), and the pages are read again.
 */
import type { InfiniteData } from '@tanstack/react-query';
import { queryClient } from '@/src/lib/queryClient';
import type { FeedItem } from '@/src/schemas/feed.schema';
import { FEED_PAGE, type FeedPage } from '@/src/services/FeedService';

const REEL_KEYS = [['feed', 'community'], ['feed', 'following']] as const;

/** A page without the withdrawn row, keeping its word on what follows (as the page it was). */
function without(page: FeedPage<FeedItem>, id: string): FeedPage<FeedItem> {
  if (!page.some((row) => row.id === id)) return page;
  const last = page[page.length - 1];
  // A page restored from the saved cache carries no word and is judged by its length: a full
  // page continued from its last row, and still does with a row taken out of it.
  const next = page.next !== undefined ? page.next
    : page.length >= FEED_PAGE && last ? `${last.created_at}|${last.id}` : null;
  return Object.defineProperty(page.filter((row) => row.id !== id), 'next', { value: next, enumerable: false }) as FeedPage<FeedItem>;
}

export function reelMayHaveChanged(withdrawnId?: string): void {
  for (const queryKey of REEL_KEYS) {
    if (withdrawnId) {
      queryClient.setQueriesData<InfiniteData<FeedPage<FeedItem>>>({ queryKey }, (data) =>
        data ? { ...data, pages: data.pages.map((page) => without(page, withdrawnId)) } : data);
    }
    void queryClient.invalidateQueries({ queryKey });
  }
}

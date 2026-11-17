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
import { FEED_PAGE } from '@/src/lib/feedPages';
import type { FeedPage } from '@/src/services/FeedService';

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

/** A list holding its own copy of records, told of each change the Reel is told of: `withdrawnId`
 *  for a record withdrawn, nothing for one filed or amended. */
type RecordsHeard = (withdrawnId?: string) => void;
const hearers = new Set<RecordsHeard>();

/**
 * A film's Log Archive holds its records in its own state, read as it opened: a record deleted from
 * it stood on it still (opening "No Such Record"), and one amended kept its old rating and words,
 * beside the film's page that had them (review round 8). It hears here what the Reel hears.
 * Answers the way to stop hearing.
 */
export function hearRecordsChanged(hear: RecordsHeard): () => void {
  hearers.add(hear);
  return () => { hearers.delete(hear); };
}

export function reelMayHaveChanged(withdrawnId?: string): void {
  for (const hear of hearers) hear(withdrawnId);
  for (const queryKey of REEL_KEYS) {
    if (withdrawnId) {
      queryClient.setQueriesData<InfiniteData<FeedPage<FeedItem>>>({ queryKey }, (data) =>
        data ? { ...data, pages: data.pages.map((page) => without(page, withdrawnId)) } : data);
    }
    void queryClient.invalidateQueries({ queryKey });
  }
}

/**
 * A record changed that the Reel draws no card for (a film an older build marked watched, sent
 * later by the queue): only what holds the member's records hears it (a night on the calendar is
 * one all the same); the Reel's pages are not read again.
 */
export function recordsMayHaveChanged(): void {
  for (const hear of hearers) hear();
}

/**
 * The feeds' pages, shared through the cache with each page's word on what follows.
 *
 * A feed page's \`next\` (FeedService's \`sentAs\`) is a property beside its rows, not one of them.
 * The library's structural sharing copies a page that changed (a read again that found a new row,
 * a card taken off by reelMayHaveChanged) into a new array, and the copy had no \`next\`: a full
 * page then read as the last by its length once a row had left it, and the Reel stopped there
 * (review round 6). Every page the sharing makes anew is given its word back from the page it
 * was made from; a page it keeps is the page as it was, word and all.
 */
import { replaceEqualDeep, type InfiniteData } from '@tanstack/react-query';
import type { FeedPage } from '@/src/services/FeedService';

export function keepsEachPagesWord(prev: unknown, data: unknown): unknown {
  const shared = replaceEqualDeep(prev, data) as InfiniteData<FeedPage<unknown>> | undefined;
  const given = data as InfiniteData<FeedPage<unknown>> | undefined;
  if (!shared?.pages || !given?.pages || shared === prev) return shared;
  shared.pages.forEach((page, i) => {
    const from = given.pages[i];
    if (!from || page === from || from.next === undefined || page.next !== undefined) return;
    Object.defineProperty(page, 'next', { value: from.next, enumerable: false });
  });
  return shared;
}

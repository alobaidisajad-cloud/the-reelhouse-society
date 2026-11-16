/**
 * theReelHearsARecordChanged.test.ts — review round 6 (src/components/feed/reelRead.ts)
 * ─────────────────────────────────────────────────────────────────────────────────────
 * A record amended or withdrawn from its sheet touched the film store, its film's page and its
 * own page, never the Reel's pages: back on the Reel, the card still read the old rating, and a
 * deleted record's card stood, opening a page that went straight back. Now an amendment reads the
 * Reel's feeds again, and a withdrawal takes its card off both of them at once (the delete may
 * still be on the wire), each page keeping its word on what follows it.
 */
import type { InfiniteData } from '@tanstack/react-query';
import { queryClient } from '@/src/lib/queryClient';
import { reelMayHaveChanged } from '@/src/components/feed/reelRead';
import { FEED_PAGE, type FeedPage } from '@/src/services/FeedService';
import type { FeedItem } from '@/src/schemas/feed.schema';

const COMMUNITY = ['feed', 'community'];
const FOLLOWING = ['feed', 'following', 'me'];
const STACKS = ['feed', 'stacks', 'all', ''];

const card = (id: string, minute: number) => ({ id, created_at: `2026-11-16T10:${String(minute).padStart(2, '0')}:00Z` }) as unknown as FeedItem;
/** A page as FeedService hands it over: its word on what follows, kept off its rows. */
const page = (rows: FeedItem[], next?: string | null): FeedPage<FeedItem> =>
  (next === undefined ? [...rows] : Object.defineProperty([...rows], 'next', { value: next, enumerable: false })) as FeedPage<FeedItem>;
const hold = (key: string[], ...pages: FeedPage<FeedItem>[]) =>
  queryClient.setQueryData<InfiniteData<FeedPage<FeedItem>>>(key, { pages, pageParams: pages.map(() => undefined) });
const pagesOf = (key: string[]) => {
  const data = queryClient.getQueryData<InfiniteData<FeedPage<FeedItem>>>(key);
  expect(data).toBeDefined();
  return data!.pages;
};
const ids = (key: string[]) => pagesOf(key).map((p) => p.map((row) => row.id));
const askedAgain = (key: string[]) => !!queryClient.getQueryState(key)?.isInvalidated;

afterEach(() => { queryClient.removeQueries({ queryKey: ['feed'] }); });

it("a deleted record's card leaves the community and the following Reel at once, and both are read again", () => {
  hold(COMMUNITY, page([card('a', 3), card('gone', 2), card('b', 1)], '2026-11-16T10:01:00Z|b'));
  hold(FOLLOWING, page([card('gone', 2)], null), page([card('c', 0)], null));
  reelMayHaveChanged('gone');
  expect(ids(COMMUNITY)).toEqual([['a', 'b']]);
  expect(ids(FOLLOWING)).toEqual([[], ['c']]);
  expect([askedAgain(COMMUNITY), askedAgain(FOLLOWING)]).toEqual([true, true]);
});

it('a page a card left keeps its word on what follows it, out of its rows', () => {
  hold(COMMUNITY, page([card('a', 3), card('gone', 2)], '2026-11-16T10:02:00Z|gone'));
  reelMayHaveChanged('gone');
  const [first] = pagesOf(COMMUNITY);
  expect(first).toBeDefined();
  expect(first!.next).toBe('2026-11-16T10:02:00Z|gone');
  expect(Object.keys(first!)).toEqual(['0']);
});

it('a full page restored from the saved cache, with no word, still goes on past its last card', () => {
  const rows = Array.from({ length: FEED_PAGE }, (_, i) => card(`r${i}`, 59 - i));
  hold(COMMUNITY, page(rows));
  reelMayHaveChanged('r5');
  const [first] = pagesOf(COMMUNITY);
  expect(first).toBeDefined();
  const last = rows[rows.length - 1];
  expect(last).toBeDefined();
  expect(first!.next).toBe(`${last!.created_at}|${last!.id}`);
  expect(first!.some((row) => row.id === 'r5')).toBe(false);
});

it('a short page restored with no word is the last there is', () => {
  hold(COMMUNITY, page([card('a', 3), card('gone', 2)]));
  reelMayHaveChanged('gone');
  const [first] = pagesOf(COMMUNITY);
  expect(first).toBeDefined();
  expect(first!.next).toBeNull();
});

it("an amended record reads the Reel's two feeds again, and leaves every card and the stacks as they are", () => {
  hold(COMMUNITY, page([card('a', 3)], null));
  hold(FOLLOWING, page([card('a', 3)], null));
  hold(STACKS, page([card('s', 3)], null));
  reelMayHaveChanged();
  expect([ids(COMMUNITY), ids(FOLLOWING)]).toEqual([[['a']], [['a']]]);
  expect([askedAgain(COMMUNITY), askedAgain(FOLLOWING), askedAgain(STACKS)]).toEqual([true, true, false]);
});

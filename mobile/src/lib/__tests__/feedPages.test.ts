/**
 * feedPages.test.ts — the feeds' pages keep their word on what follows through the cache.
 *
 * A feed page's `next` is a property beside its rows. The library's structural sharing makes a
 * page that changed anew, as a plain array without it; keepsEachPagesWord gives it back, from the
 * page it was made from, and leaves every page the sharing kept as it was (review round 6).
 */
import type { InfiniteData } from '@tanstack/react-query';
import { keepsEachPagesWord } from '@/src/lib/feedPages';
import type { FeedPage } from '@/src/services/FeedService';

type Row = { id: string };
const page = (ids: string[], next: string | null | undefined): FeedPage<Row> => {
  const rows = ids.map((id) => ({ id }));
  return (next === undefined ? rows : Object.defineProperty(rows, 'next', { value: next, enumerable: false })) as FeedPage<Row>;
};
const data = (...pages: FeedPage<Row>[]): InfiniteData<FeedPage<Row>> => ({ pages, pageParams: pages.map(() => undefined) });
const pagesOf = (v: unknown) => (v as InfiniteData<FeedPage<Row>>).pages;

it('a page that changed is made anew with its word on what follows', () => {
  const prev = data(page(['a', 'b'], 'cursor-1'), page(['c'], null));
  const next = data(page(['b'], 'cursor-1'), page(['c'], null));
  const [first, second] = pagesOf(keepsEachPagesWord(prev, next));
  expect(first).toBeDefined();
  expect(first!.map((r) => r.id)).toEqual(['b']);
  expect(first!.next).toBe('cursor-1');
  // The word stays beside the rows, never one of them.
  expect(Object.keys(first!)).toEqual(['0']);
  // The page that did not change is the page as it was.
  expect(second).toBe(pagesOf(prev)[1]);
});

it('the last page says it is the last, as the page it was made from said', () => {
  const prev = data(page(['a'], null));
  const next = data(page(['a', 'z'], null));
  const [only] = pagesOf(keepsEachPagesWord(prev, next));
  expect(only).toBeDefined();
  expect(only!.next).toBeNull();
});

it('a page with no word (restored from the phone) is given none', () => {
  const prev = data(page(['a'], undefined));
  const next = data(page(['b'], undefined));
  const [only] = pagesOf(keepsEachPagesWord(prev, next));
  expect(only).toBeDefined();
  expect(only!.next).toBeUndefined();
});

it('nothing changed: the data held is the data, untouched', () => {
  const prev = data(page(['a'], 'cursor-1'));
  const same = data(page(['a'], 'cursor-1'));
  expect(keepsEachPagesWord(prev, same)).toBe(prev);
});

it('what is not a feed passes as the library shares it', () => {
  expect(keepsEachPagesWord(undefined, { count: 3 })).toEqual({ count: 3 });
  expect(keepsEachPagesWord({ count: 3 }, { count: 4 })).toEqual({ count: 4 });
});

/**
 * aDroppedRowEndsNoReel.test.ts — a page is judged by the rows the server SENT, not those kept.
 *
 * A malformed row is dropped and the page kept (parseRowsSafely). The page's length then decided
 * the next page: a full page with one row dropped read as short, the last, and the Reel said
 * "The End" over logs still to come; its cursor was the last row kept, not the last sent. The page
 * now carries the server's word (`next`), off its items, so the lists that read pages as rows, and
 * the saved cache, read them as before.
 */
import { FeedService, FEED_PAGE } from '../FeedService';
import { supabaseFake } from '@/test-utils/supabaseFake';

/** The rows each feed function sends, set by each case. */
let mockSent: unknown[] = [];
const mockHouse = supabaseFake({ rpc: { get_community_feed_auth_cursor: () => mockSent, get_following_feed_auth_cursor: () => mockSent } });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/utils/withAbortSignal', () => ({ withAbortSignal: (q: unknown) => q }));

const row = (i: number) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  film_id: 550, film_title: 'Fight Club', poster_path: null, rating: 4, review: null, drop_cap: false,
  status: 'watched', abandoned_reason: null, created_at: new Date(Date.UTC(2026, 10, 15, 9) - i * 60_000).toISOString(),
  year: 1999, user_id: '11111111-1111-4111-8111-111111111111', username: 'ana', avatar_url: null, role: 'cinephile',
  editorial_header: null, pull_quote: null, watched_with: null, is_autopsied: false, autopsy: null, is_spoiler: false,
  certify_count: 0, critique_count: 0, certified: false,
});
const rows = (n: number) => Array.from({ length: n }, (_, i) => row(i));

describe.each([
  ['community', () => FeedService.getCommunityFeed()],
  ['following', () => FeedService.getFollowingFeed()],
] as const)('the %s feed', (_name, read) => {
  it('a full page with a malformed row continues, from the last row SENT', async () => {
    const last = { ...row(FEED_PAGE - 1), username: undefined as unknown as string };   // malformed, and last
    mockSent = [...rows(FEED_PAGE - 1), last];
    const page = await read();
    expect(page).toHaveLength(FEED_PAGE - 1);
    expect(page.next).toBe(`${last.created_at}|${last.id}`);
  });

  it('a short page is the last', async () => {
    mockSent = rows(3);
    expect((await read()).next).toBeNull();
  });

  it('the word is off the page’s items: a list or the saved cache reads only its rows', async () => {
    mockSent = rows(FEED_PAGE);
    const page = await read();
    expect(Object.keys(page)).toHaveLength(FEED_PAGE);
    expect(JSON.parse(JSON.stringify(page))).toHaveLength(FEED_PAGE);
    expect(Array.isArray(page)).toBe(true);
  });
});

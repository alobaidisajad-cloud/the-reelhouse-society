/**
 * aFeedRowWithANullIsStillDrawn.test.ts — the Reel's two schemas agree on what a row may hold.
 * ─────────────────────────────────────────────────────────────────────────────
 * A feed row is read twice: by the row schema, which drops a malformed row on its
 * own, and then by the card schema, whose `parse` throws for the whole page. The
 * row schema let `status` be null (the column allows it); the card schema did
 * not, so one such log would have failed the Reel for every member. Every field
 * the row may hold as null is tried here, so a column added later is tried too.
 */
import { FeedItemSchema, FollowingFeedRowSchema } from '../feed.schema';

const ROW = {
  id: 'log-1', film_id: 550, film_title: 'Fight Club', poster_path: '/p.jpg', rating: 4, review: 'Yes.',
  drop_cap: false, status: 'watched', abandoned_reason: null, created_at: '2026-09-01T10:00:00Z', year: 1999,
  user_id: 'u1', username: 'reader', avatar_url: null, role: 'cinephile', editorial_header: null,
  pull_quote: null, watched_with: null, is_autopsied: false, autopsy: null, is_spoiler: false,
  certify_count: 3, critique_count: 1, certified: false,
};

describe('a feed row', () => {
  it('as it arrives, is drawn', () => {
    const row = FollowingFeedRowSchema.parse(ROW);
    expect(FeedItemSchema.parse(row)).toEqual(expect.objectContaining({ id: 'log-1', film_id: 550, status: 'watched' }));
  });

  const nullable = Object.keys(FollowingFeedRowSchema.shape)
    .filter((k) => FollowingFeedRowSchema.shape[k as keyof typeof FollowingFeedRowSchema.shape].safeParse(null).success);

  it('has nullable fields to try, or this proves nothing', () => {
    expect(nullable).toEqual(expect.arrayContaining(['status', 'review', 'poster_path']));
  });

  it.each(nullable)('with %s null, is still drawn', (key) => {
    const row = FollowingFeedRowSchema.parse({ ...ROW, [key]: null });
    expect(FeedItemSchema.safeParse(row).success).toBe(true);
  });

  it('with a null status reads as the column default, watched', () => {
    expect(FeedItemSchema.parse(FollowingFeedRowSchema.parse({ ...ROW, status: null })).status).toBe('watched');
  });

  it('carries a film id as a number, and drops a row whose id is not one', () => {
    expect(FollowingFeedRowSchema.parse({ ...ROW, film_id: '550' }).film_id).toBe(550);
    for (const bad of ['abc', '', '5.5', -3, 0, Number.NaN]) {
      expect(FollowingFeedRowSchema.safeParse({ ...ROW, film_id: bad }).success).toBe(false);
    }
  });
});

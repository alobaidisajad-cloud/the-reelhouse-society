import { supabase } from '@/src/lib/supabase';
import { FilmReviewSchema, type FilmReview } from '@/src/schemas/film.schema';
import { withAbortSignal } from '@/src/utils/withAbortSignal';
import { filterContentByBlocks } from '@/src/utils/filterContentByBlocks';
import { z } from 'zod';

/** A film review row as it arrives, validated rather than cast. */
const FilmReviewRowSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  rating: z.number().nullable().transform(v => v ?? 0),
  review: z.string().nullable().optional(),
  status: z.string().default('watched'),
  abandoned_reason: z.string().nullable().optional(),
  created_at: z.string(),
  pull_quote: z.string().nullable().optional(),
  drop_cap: z.boolean().nullable().optional(),
  is_spoiler: z.boolean().nullable().optional(),
  user_id: z.string().nullable().optional(),
  profiles: z.union([
    z.object({ username: z.string(), role: z.string(), avatar_url: z.string().nullable().optional() }),
    z.array(z.object({ username: z.string(), role: z.string(), avatar_url: z.string().nullable().optional() })),
  ]).nullable().optional(),
});

/**
 * What the house made of a film. Maintained server-side by a trigger on `logs`
 * so it is never derived from whichever page of reviews happens to be loaded.
 *
 * Postgres returns `numeric` as a STRING through PostgREST, which is why the
 * average is coerced rather than trusted — reading it as a number would give
 * `NaN` and render an empty reel rail with no error anywhere.
 */
const FilmVerdictSchema = z.object({
  avg_rating: z.union([z.number(), z.string()]).nullable().optional()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n) || n <= 0) return null;
      // Clamped to the scale the reels can draw. `logs.rating` carries NO
      // check constraint in the database — the app has always written 0-5, but
      // one bad row from an import or a future scale change would otherwise
      // put fifty reels in the hero. The column is unbounded so the WRITE can
      // never fail; this is the other half, so the READ can never be absurd.
      return Math.min(n, 5);
    }),
  rating_count: z.number().nullable().optional().transform((v) => v ?? 0),
  log_count: z.number().nullable().optional().transform((v) => v ?? 0),
});

export type FilmVerdict = z.infer<typeof FilmVerdictSchema>;

/** No row, no rating, no error: the state of most films most of the time. */
const EMPTY_VERDICT: FilmVerdict = { avg_rating: null, rating_count: 0, log_count: 0 };

/**
 * Return type for cursor-based film reviews.
 * Consumers receive both the items and the cursor for next-page fetching.
 */
export interface FilmReviewsPage {
  items: FilmReview[];
  nextCursor: string | null;
}

export const FilmService = {
  /**
   * A page of a film's written critiques, newest first, by a compound cursor
   * (created_at|id): no deep-page scans, no repeats when a critique is filed
   * mid-read, and a timestamp collision broken by the id.
   */
  async getFilmReviews(filmId: string, pageSize: number, cursor?: string, signal?: AbortSignal): Promise<FilmReviewsPage> {
    let query = supabase
      .from('logs')
      .select('id, rating, review, status, abandoned_reason, created_at, pull_quote, drop_cap, is_spoiler, user_id, profiles!logs_user_id_fkey(username, role, avatar_url)')
      .eq('film_id', filmId)
      .not('review', 'is', null)
      .neq('review', '')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize);

    // Compound cursor keyset pagination
    if (cursor) {
      const [cursorDate, cursorId] = cursor.split('|');
      if (cursorDate && cursorId) {
        query = query.or(`created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`);
      }
    }

    query = withAbortSignal(query, signal);

    const { data, error } = await query;

    if (error) throw error;
    if (!data || data.length === 0) return { items: [], nextCursor: null };

    // Resilient validation: drop a single malformed row instead of failing the
    // entire reviews page (one bad record must never blank out all reviews).
    const items = data
      .map((d) => {
        const rowParsed = FilmReviewRowSchema.safeParse(d);
        if (!rowParsed.success) {
          if (__DEV__) console.warn('[FilmService] Dropped malformed review row');
          return null;
        }
        const row = rowParsed.data;
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        const itemParsed = FilmReviewSchema.safeParse({ ...row, username: profile?.username, role: profile?.role, avatar_url: profile?.avatar_url ?? null });
        return itemParsed.success ? itemParsed.data : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // Hide reviews authored by blocked/muted users (HOOK-8 parity with feeds,
    // search, and lounge). Applied to the validated items only; cursor/hasMore
    // below derive from the RAW page so filtering can't truncate pagination.
    const visibleItems = filterContentByBlocks(items, (r) => r.user_id ?? '');

    // Cursor/hasMore are computed from the RAW page (not the validated subset),
    // so dropping a malformed row can never truncate pagination early.
    const lastRaw = data[data.length - 1] as { created_at?: string; id?: string } | undefined;
    const hasMore = data.length === pageSize;
    const nextCursor = hasMore && lastRaw?.created_at && lastRaw?.id ? `${lastRaw.created_at}|${lastRaw.id}` : null;

    return { items: visibleItems, nextCursor };
  },

  /**
   * ── THE HOUSE'S VERDICT ────────────────────────────────────────────────────
   * What the members of this house made of a film, as opposed to what the
   * internet did.
   *
   * `getFilmReviews` above cannot answer the question: it returns logs that
   * have WRITING, capped at a page, so its count is "critiques on this page",
   * never "how many people logged this", and it has no average at all. And
   * TMDB's score is never drawn in the house's reels.
   *
   * `avg_rating` is NULL when nobody has rated it. Not zero — zero is a number
   * and would draw as a verdict of no reels. NULL is the absence of a verdict,
   * which is what the hero needs in order to say so out loud.
   */
  async getFilmVerdict(filmId: number, signal?: AbortSignal): Promise<FilmVerdict> {
    if (!Number.isFinite(filmId) || filmId <= 0) return EMPTY_VERDICT;

    const query = supabase
      .from('films')
      .select('avg_rating, rating_count, log_count')
      .eq('id', filmId)
      .maybeSingle();

    const { data, error } = await withAbortSignal(query, signal);

    // A read that failed is thrown, never answered as silence: "the house has
    // not spoken" said over a lost signal is a verdict nobody holds. (supabase-js
    // RESOLVES its errors, so this line is the only thing that sees one.)
    if (error) throw error;
    // A film nobody has touched yet has no row at all, and that is not a
    // failure — it is the commonest case in an archive of a million titles.
    if (!data) return EMPTY_VERDICT;

    const parsed = FilmVerdictSchema.safeParse(data);
    if (!parsed.success) throw parsed.error;
    return parsed.data;
  },
};

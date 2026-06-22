import { supabase } from '@/src/lib/supabase';
import { FilmReviewSchema, type FilmReview } from '@/src/schemas/film.schema';
import { withAbortSignal } from '@/src/utils/withAbortSignal';
import { filterContentByBlocks } from '@/src/utils/filterContentByBlocks';
import { z } from 'zod';

/**
 * Typed Supabase row shape for film reviews.
 * Now validated through Zod instead of `as unknown as` cast.
 */
const FilmReviewRowSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  rating: z.number().nullable().transform(v => v ?? 0),
  review: z.string().nullable().optional(),
  status: z.string().default('watched'),
  abandoned_reason: z.string().nullable().optional(),
  created_at: z.string(),
  pull_quote: z.string().nullable().optional(),
  drop_cap: z.boolean().nullable().optional(),
  user_id: z.string().nullable().optional(),
  profiles: z.union([
    z.object({ username: z.string(), role: z.string() }),
    z.array(z.object({ username: z.string(), role: z.string() })),
  ]).nullable().optional(),
});

/**
 * Return type for cursor-based film reviews.
 * Consumers receive both the items and the cursor for next-page fetching.
 */
export interface FilmReviewsPage {
  items: FilmReview[];
  nextCursor: string | null;
}

export const FilmService = {
  async getFilmReviewCount(filmId: number, signal?: AbortSignal): Promise<number> {
    let query = supabase
      .from('logs')
      .select('id', { count: 'exact', head: true })
      .eq('film_id', filmId);
      
    query = withAbortSignal(query, signal);
    
    const { count, error } = await query;
      
    if (error) throw error;
    return count ?? 0;
  },

  /**
   * Migrated from offset .range() to compound cursor pagination.
   * - Eliminates O(N²) deep-page scans
   * - Prevents duplicate reviews from concurrent inserts shifting offsets
   * - Compound cursor (created_at|id) handles timestamp collisions
   */
  async getFilmReviews(filmId: string, pageSize: number, cursor?: string, signal?: AbortSignal): Promise<FilmReviewsPage> {
    let query = supabase
      .from('logs')
      .select('id, rating, review, status, abandoned_reason, created_at, pull_quote, drop_cap, user_id, profiles!logs_user_id_fkey(username, role)')
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
        const itemParsed = FilmReviewSchema.safeParse({ ...row, username: profile?.username, role: profile?.role });
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
  }
};

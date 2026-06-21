import { supabase } from '@/src/lib/supabase';
import { FilmReviewSchema, type FilmReview } from '@/src/schemas/film.schema';
import { withAbortSignal } from '@/src/utils/withAbortSignal';
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

    // Zod-first validation replaces `as unknown as` cast
    const rows = z.array(FilmReviewRowSchema).parse(data);
    
    const items = rows.map((d) => {
      const profile = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles;
      const rawItem = {
        ...d,
        username: profile?.username,
        role: profile?.role,
      };
      return FilmReviewSchema.parse(rawItem);
    });

    // Compute next cursor from last row
    const lastRow = rows[rows.length - 1];
    const hasMore = rows.length === pageSize;
    const nextCursor = hasMore && lastRow ? `${lastRow.created_at}|${lastRow.id}` : null;

    return { items, nextCursor };
  }
};

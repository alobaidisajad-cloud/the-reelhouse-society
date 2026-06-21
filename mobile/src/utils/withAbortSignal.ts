/**
 * withAbortSignal.ts — Typed AbortSignal Wrapper for Supabase Queries
 * ────────────────────────────────────────────────────────────────────
 * Eliminates 7 occurrences of `as any` casts for
 * AbortSignal across FeedService, FilmService, and profileService.
 *
 * The Supabase JS SDK's TypeScript types don't properly expose the
 * abortSignal method on query builders. This wrapper encapsulates
 * the single unavoidable cast in one place.
 */

/**
 * Attaches an AbortSignal to a Supabase query builder.
 * If no signal is provided, returns the query unchanged.
 *
 * Usage:
 *   let query = supabase.from('logs').select('*');
 *   query = withAbortSignal(query, signal);
 *   const { data, error } = await query;
 */
export function withAbortSignal<T>(query: T, signal?: AbortSignal): T {
  if (!signal) return query;
  // @ts-expect-error — Supabase SDK types don't expose abortSignal on the builder chain
  return query.abortSignal(signal);
}

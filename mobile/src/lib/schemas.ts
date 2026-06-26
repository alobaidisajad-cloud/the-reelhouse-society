import { z } from 'zod';

/**
 * Zod Mathematical Boundary
 * These schemas guarantee that the shape of the data entering the UI thread
 * is 100% mathematically correct, preventing any runtime crashes or silent
 * union-type propagation errors.
 *
 * Scope note: the canonical domain schemas (User, ProfileLog, Watchlist, …)
 * live in `src/schemas/`. This module intentionally only exposes the TMDB-facing
 * FilmSchema (and its id coercion) consumed by the analytics components.
 */

// Single source for "id arrives as string|number, normalize to number" coercion.
// Re-used by the feed schemas for `film_id` so the pattern isn't re-spelled
// (LIB-5). TMDB ids are the canonical consumer, hence the alias below.
export const numericId = z.union([z.string(), z.number()]).transform((val) => Number(val));

// Coerce TMDB ids, which arrive as either string or number, to a number.
export const TmdbIdSchema = numericId;

// Base Film Schema (what we expect from TMDB or our internal DB)
export const FilmSchema = z.object({
  id: TmdbIdSchema,
  title: z.string().optional().default('Unknown Title'),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  release_date: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  vote_average: z.number().nullable().optional(),
  runtime: z.number().nullable().optional(),
});

export type ZodFilm = z.infer<typeof FilmSchema>;

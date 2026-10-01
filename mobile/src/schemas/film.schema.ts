import { z } from 'zod';

/**
 * A written critique of a film, from `logs` with its author's profile
 * (FilmService.getFilmReviews).
 *
 * - `id` accepts a string or a number and normalizes to a string
 * - `created_at` is required: a critique is never given an invented date
 * - `review` is nullable because rating-only entries have no text review
 * - `username` is absent when the author's profile could not be read: the
 *   card says "anonymous" and opens no profile, never a member named "unknown"
 */
export const FilmReviewSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  rating: z.number().nullable().optional().transform(v => v ?? 0),
  review: z.string().nullable().optional(),
  status: z.string().default('watched'),
  abandoned_reason: z.string().nullable().optional(),
  created_at: z.string(),
  pull_quote: z.string().nullable().optional(),
  drop_cap: z.boolean().nullable().optional(),
  is_spoiler: z.boolean().nullable().optional(),
  user_id: z.string().nullable().optional(),
  username: z.string().optional(),
  role: z.string().default('cinephile'),
  avatar_url: z.string().nullable().optional(),
});

export type FilmReview = z.infer<typeof FilmReviewSchema>;

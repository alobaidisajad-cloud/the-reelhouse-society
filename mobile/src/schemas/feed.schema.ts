import { z } from 'zod';
import { numericId } from '../lib/schemas';

/**
 * RESILIENT YEAR PARSER
 * ─────────────────────
 * The `year` column is INT in the database, but RPCs may declare it as TEXT
 * (e.g., get_following_feed_cursor). Postgres auto-casts int→text when the
 * RETURNS TABLE declares text. This coercer accepts both and normalizes to
 * number | null.
 */
const yearCoercer = z.union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    const parsed = parseInt(v, 10);
    return isNaN(parsed) ? null : parsed;
  });

export const FeedItemSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  user_id: z.string().optional(),
  username: z.string().default('unknown'),
  avatar_url: z.string().nullable().optional(),
  role: z.string().default('cinephile'),
  film_title: z.string().default('Unknown Film'),
  film_id: numericId,
  poster_path: z.string().nullable().optional(),
  rating: z.number().nullable().default(0),
  review: z.string().nullable().optional(),
  status: z.string().default('watched'),
  created_at: z.string().default(() => new Date().toISOString()),
  year: yearCoercer,
  editorial_header: z.string().nullable().optional(),
  pull_quote: z.string().nullable().optional(),
  drop_cap: z.boolean().nullable().optional(),
  watched_with: z.string().nullable().optional(),
  is_autopsied: z.boolean().nullable().optional(),
  autopsy: z.unknown().nullable().optional(),
  abandoned_reason: z.string().nullable().optional(),
});

export type FeedItem = z.infer<typeof FeedItemSchema>;

/**
 * Zod schema for raw Supabase community feed join rows.
 * Validates the polymorphic `profiles` field (can be object or array
 * depending on Supabase query config) BEFORE property access.
 * Eliminates the `as unknown as CommunityFeedRow[]` double-cast in FeedService.
 */
const ProfileJoinSchema = z.object({
  username: z.string(),
  avatar_url: z.string().nullable(),
  role: z.string(),
});

export const CommunityFeedRowSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  film_id: numericId,
  film_title: z.string(),
  poster_path: z.string().nullable(),
  rating: z.number().nullable().default(0),
  review: z.string().nullable(),
  drop_cap: z.boolean().nullable(),
  status: z.string().nullable(),
  abandoned_reason: z.string().nullable(),
  created_at: z.string(),
  year: yearCoercer,
  user_id: z.string(),
  editorial_header: z.string().nullable(),
  pull_quote: z.string().nullable(),
  watched_with: z.string().nullable(),
  is_autopsied: z.boolean().nullable(),
  autopsy: z.unknown().nullable(),
  profiles: z.union([
    ProfileJoinSchema,
    z.array(ProfileJoinSchema),
  ]).nullable(),
});

export type CommunityFeedRow = z.infer<typeof CommunityFeedRowSchema>;

/**
 * Input-side Zod schema for the following feed RPC response.
 * Accepts both old `get_following_feed` and new `get_following_feed_cursor` shapes.
 * Key resilience: year accepts string|number, rating accepts null, autopsy accepts any JSONB.
 */
export const FollowingFeedRowSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  film_id: numericId,
  film_title: z.string(),
  poster_path: z.string().nullable(),
  rating: z.number().nullable().default(0),
  review: z.string().nullable(),
  drop_cap: z.boolean().nullable(),
  status: z.string().nullable(),
  abandoned_reason: z.string().nullable().optional(),
  created_at: z.string(),
  year: yearCoercer,
  user_id: z.string(),
  username: z.string(),
  avatar_url: z.string().nullable(),
  role: z.string(),
  editorial_header: z.string().nullable(),
  pull_quote: z.string().nullable(),
  watched_with: z.string().nullable(),
  is_autopsied: z.boolean().nullable(),
  autopsy: z.unknown().nullable(),
});

export type FollowingFeedRow = z.infer<typeof FollowingFeedRowSchema>;

/**
 * Input-side Zod schema for the stacks feed RPC/query response.
 * Handles both RPC and direct-query shapes.
 */
export const StackFeedRowSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string(),
  description: z.string().nullable(),
  username: z.string(),
  user_id: z.string(),
  created_at: z.string(),
  films: z.array(z.object({
    id: z.union([z.number(), z.string()]).transform(Number),
    title: z.string(),
    poster_path: z.string().nullable().optional(),
  })).default([]),
  certify_count: z.union([z.number(), z.string()]).transform(Number),
  is_ranked: z.boolean(),
});

export type StackFeedRow = z.infer<typeof StackFeedRowSchema>;

export const StackFilmSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(Number),
  title: z.string(),
  poster_path: z.string().nullable().optional(),
});

export const StackDataSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().default(''),
  curator: z.string().default('society'),
  curatorId: z.string(),
  createdAt: z.string(),
  films: z.array(StackFilmSchema).default([]),
  count: z.number().default(0),
  certifyCount: z.number().default(0),
  isRanked: z.boolean().default(false),
});

export type StackData = z.infer<typeof StackDataSchema>;
export type StackFilm = z.infer<typeof StackFilmSchema>;

import { z } from 'zod';

/** A TMDB film id, as a number or its digits; anything else drops the row (no /film/NaN). */
const filmId = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).transform(Number);

/** `logs.status` may be null; null is what the column's default fills in. */
const logStatus = z.string().nullable().optional().transform((s) => s ?? 'watched');

/**
 * RESILIENT YEAR PARSER
 * ─────────────────────
 * The `year` column is INT in the database, but RPCs may declare it as TEXT
 * (e.g., get_following_feed_auth_cursor). Postgres auto-casts int→text when the
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

/**
 * A mark's count, however it travelled: a plain integer from the feed functions,
 * `[{ count: 12 }]` from an embedded PostgREST count. Absent is null, never zero:
 * a source that did not say has not said "nobody", so a bar draws no count.
 */
export const markCount = z.unknown()
  .optional()
  .transform((v): number | null => {
    const raw = Array.isArray(v) ? (v[0] as { count?: unknown } | undefined)?.count : v;
    const n = typeof raw === 'string' ? Number(raw) : raw;
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  });

/**
 * The VIEWER's own certification of a log, however it travelled.
 * ───────────────────────────────────────────────────────────────
 * The feed functions return `certified` as a boolean (20260926_03); a direct
 * query embeds it as a count of the viewer's certifications — `[{ count: 1 }]`.
 * Absent is null: a signed-out read, or a source that did not ask, has said
 * nothing about the viewer, and the heart is then left as it was.
 */
export const mineMark = z.unknown()
  .optional()
  .transform((v): boolean | null => {
    if (typeof v === 'boolean') return v;
    const n = markCount.parse(v);
    return n === null ? null : n > 0;
  });

export const FeedItemSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  user_id: z.string().optional(),
  username: z.string().default('unknown'),
  avatar_url: z.string().nullable().optional(),
  role: z.string().default('cinephile'),
  film_title: z.string().default('Unknown Film'),
  film_id: filmId,
  poster_path: z.string().nullable().optional(),
  rating: z.number().nullable().default(0),
  review: z.string().nullable().optional(),
  status: logStatus,
  created_at: z.string().default(() => new Date().toISOString()),
  year: yearCoercer,
  editorial_header: z.string().nullable().optional(),
  pull_quote: z.string().nullable().optional(),
  drop_cap: z.boolean().nullable().optional(),
  watched_with: z.string().nullable().optional(),
  is_autopsied: z.boolean().nullable().optional(),
  autopsy: z.unknown().nullable().optional(),
  abandoned_reason: z.string().nullable().optional(),
  is_spoiler: z.boolean().nullable().optional(),
  certify_count: markCount,
  critique_count: markCount,
  certified: mineMark,
});

export type FeedItem = z.infer<typeof FeedItemSchema>;

/**
 * Input-side Zod schema for the following feed RPC response.
 * The shape get_following_feed_auth_cursor returns.
 * Key resilience: year accepts string|number, rating accepts null, autopsy accepts any JSONB.
 */
export const FollowingFeedRowSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  film_id: filmId,
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
  is_spoiler: z.boolean().nullable().optional(),
  // Added to both feed functions at the END of their columns: the counts by
  // 20260926_01, the viewer's own mark by 20260926_03.
  certify_count: markCount,
  critique_count: markCount,
  certified: mineMark,
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
  /** The stack's true size; required, since the four posters that travel are not its count. */
  film_count: z.union([z.number(), z.string()]).transform(Number),
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

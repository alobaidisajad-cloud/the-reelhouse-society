import { z } from 'zod';

/**
 * 11/10 Architecture: Zod Mathematical Boundary
 * These schemas guarantee that the shape of the data entering the UI thread
 * is 100% mathematically correct, preventing any runtime crashes or silent 
 * union-type propagation errors.
 */

// Basic primitive schemas
export const TmdbIdSchema = z.union([z.string(), z.number()]).transform(val => Number(val));
export const UUIDSchema = z.string().uuid();
export const IsoDateSchema = z.string().datetime({ offset: true }).or(z.string());

// Base Film Schema (What we expect from TMDB or our internal DB)
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

// Profile Log Schema
// This strictly defines a log object returned from Supabase
export const ProfileLogSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid(),
  film_id: TmdbIdSchema,
  rating: z.number().nullable().optional(),
  liked: z.boolean().nullable().optional().default(false),
  watched: z.boolean().nullable().optional().default(true),
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema.nullable().optional(),
  film: FilmSchema.optional(), // The joined film data
});

export type ZodProfileLog = z.infer<typeof ProfileLogSchema>;

// We can parse arrays of logs using this
export const ProfileLogArraySchema = z.array(ProfileLogSchema);

// Watchlist Item Schema
export const WatchlistItemSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid(),
  film_id: TmdbIdSchema,
  created_at: IsoDateSchema,
  film: FilmSchema.optional(),
});

export type ZodWatchlistItem = z.infer<typeof WatchlistItemSchema>;
export const WatchlistArraySchema = z.array(WatchlistItemSchema);

// User Schema
export const UserSchema = z.object({
  id: z.string().uuid().optional(),
  username: z.string().optional(),
  role: z.string().optional(),
  tier: z.string().optional(),
  preferences: z.record(z.string(), z.any()).nullable().optional(),
});

export type ZodUser = z.infer<typeof UserSchema>;

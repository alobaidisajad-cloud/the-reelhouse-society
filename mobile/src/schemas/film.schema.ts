import { z } from 'zod';
import type { DomainLog } from '../types/film.types';

/**
 * Validation schema for the `DomainLog` interface (src/types/film.types.ts).
 *
 * SCHEMA-4: the two are bound by the compile-time guard below so they can't
 * silently drift — if a field is added/retyped on `DomainLog` without a matching
 * change here (or vice-versa), `tsc` fails. `DomainLog` remains the canonical
 * hand-authored type (it carries doc comments + a couple of union shapes that
 * read better written out); this schema is its runtime mirror.
 */
export const DomainLogSchema = z.object({
  id: z.string().uuid(),
  filmId: z.number().int().positive(),
  title: z.string().min(1),
  poster: z.string().nullable().optional(),
  altPoster: z.string().nullable().optional(),
  year: z.number().int().positive().optional(),
  rating: z.number().min(0).max(5),
  status: z.enum(['watched', 'rewatched', 'abandoned']),
  review: z.string().nullable().optional(),
  pullQuote: z.string().nullable().optional(),
  director: z.string().nullable().optional(),
  directors: z.array(z.string()).optional(),
  genres: z.union([
    z.array(z.object({ id: z.number(), name: z.string() })),
    z.array(z.number())
  ]).optional(),
  runtime: z.number().nullable().optional(),
  popularity: z.number().optional(),
  createdAt: z.string().datetime().optional(),
  userId: z.string().uuid().optional(),
  
  genreIds: z.array(z.number()).optional(),
  format: z.string().nullable().optional(),
  watchedDate: z.string().nullable().optional(),
  
  isSpoiler: z.boolean().optional(),
  watchedWith: z.string().nullable().optional(),
  privateNotes: z.string().nullable().optional(),
  abandonedReason: z.string().nullable().optional(),
  physicalMedia: z.string().nullable().optional(),
  isAutopsied: z.boolean().optional(),
  autopsy: z.record(z.string(), z.number()).nullable().optional(),
  editorialHeader: z.string().nullable().optional(),
  dropCap: z.boolean().optional(),
  videoUrl: z.string().nullable().optional(),
  
  viewCount: z.number().int().min(1).optional(),
  viewingHistory: z.array(z.object({
    date: z.string().optional(),
    rating: z.number(),
    review: z.string().optional(),
    watchedWith: z.string().nullable().optional(),
    status: z.enum(['watched', 'rewatched', 'abandoned']).optional(),
    isSpoiler: z.boolean().optional(),
    privateNotes: z.string().nullable().optional(),
    physicalMedia: z.string().nullable().optional(),
    abandonedReason: z.string().nullable().optional(),
    isAutopsied: z.boolean().optional(),
    autopsy: z.record(z.string(), z.number()).nullable().optional(),
    altPoster: z.string().nullable().optional(),
    editorialHeader: z.string().nullable().optional(),
    dropCap: z.boolean().optional(),
    pullQuote: z.string().nullable().optional(),
    videoUrl: z.string().nullable().optional(),
    format: z.string().nullable().optional()
  })).nullable().optional()
});

// SCHEMA-4 drift guard: assert the schema's inferred output and the DomainLog
// interface are mutually assignable. Either side diverging breaks compilation.
// (Compile-time only — `AssertExact` resolves to `true` when both directions hold.)
type AssertExtends<A, B> = A extends B ? true : false;
type _SchemaInfersToDomainLog = AssertExtends<z.infer<typeof DomainLogSchema>, DomainLog>;
type _DomainLogSatisfiesSchema = AssertExtends<DomainLog, z.infer<typeof DomainLogSchema>>;
const _schemaMatchesType: [_SchemaInfersToDomainLog, _DomainLogSatisfiesSchema] = [true, true];
void _schemaMatchesType;

/**
 * Schema for validating film review entries from `logs` table.
 * 
 * Used by: FilmService, LogService, useLogFlow, interactionSlice
 * 
 * @remarks
 * - `id` accepts both string and number (TMDB uses numbers, DB uses UUIDs) and normalizes to string
 * - `created_at` uses a factory default to ensure per-parse timestamps
 * - `review` is nullable because rating-only entries have no text review
 */
export const FilmReviewSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  rating: z.number().nullable().optional().transform(v => v ?? 0),
  review: z.string().nullable().optional(),
  status: z.string().default('watched'),
  abandoned_reason: z.string().nullable().optional(),
  created_at: z.string().default(() => new Date().toISOString()),
  pull_quote: z.string().nullable().optional(),
  drop_cap: z.boolean().nullable().optional(),
  is_spoiler: z.boolean().nullable().optional(),
  user_id: z.string().nullable().optional(),
  username: z.string().default('unknown'),
  role: z.string().default('cinephile'),
  avatar_url: z.string().nullable().optional(),
});

export type FilmReview = z.infer<typeof FilmReviewSchema>;


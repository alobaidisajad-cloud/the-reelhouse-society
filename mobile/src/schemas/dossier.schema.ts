/**
 * dossier.schema.ts — Zod Boundary Schemas for Dispatch Dossiers
 * ───────────────────────────────────────────────────────────────
 * DossierService was the only service layer without
 * Zod validation on read paths. These schemas close that gap.
 */
import { z } from 'zod';

const DossierProfileSchema = z.object({
  username: z.string().default('unknown'),
  avatar_url: z.string().nullable().optional(),
  role: z.string().default('cinephile'),
});

export const DossierFeedItemSchema = z.object({
  id: z.string(),
  title: z.string().default('Untitled Dossier'),
  subtitle: z.string().nullable().optional(),
  cover_url: z.string().nullable().optional(),
  author_id: z.string(),
  published_at: z.string().nullable().optional(),
  read_time: z.number().nullable().optional(),
  is_featured: z.boolean().default(false),
  profiles: DossierProfileSchema,
});

export type DossierFeedItem = z.infer<typeof DossierFeedItemSchema>;

export const DossierDetailSchema = z.object({
  id: z.string(),
  title: z.string().default('Untitled Dossier'),
  subtitle: z.string().nullable().optional(),
  cover_url: z.string().nullable().optional(),
  full_content: z.string().nullable().optional(),
  author_id: z.string(),
  published_at: z.string().nullable().optional(),
  read_time: z.number().nullable().optional(),
  is_featured: z.boolean().default(false),
  views: z.number().default(0),
  certifications: z.number().default(0),
  profiles: DossierProfileSchema,
}).passthrough();

export type DossierDetail = z.infer<typeof DossierDetailSchema>;

export const DossierCommentSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  body: z.string(),
  created_at: z.string(),
  profiles: DossierProfileSchema,
});

export type DossierComment = z.infer<typeof DossierCommentSchema>;

export const DispatchLogSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  film_title: z.string().default('Unknown Film'),
  review: z.string().nullable().optional(),
  created_at: z.string(),
  profiles: z.object({
    username: z.string().default('unknown'),
    avatar_url: z.string().nullable().optional(),
  }),
});

export type DispatchLog = z.infer<typeof DispatchLogSchema>;

/**
 * Zod schema for the raw row shape fetched by content.ts.
 * content.ts was the last remaining Supabase boundary using a raw TypeScript
 * cast (`data as DossierRow[]`) instead of runtime validation. A column rename
 * would silently produce `undefined` values that mapDossierRow() passes through
 * as empty strings — showing blank dispatch cards with no error.
 *
 * Matches DOSSIER_SELECT_COLUMNS: 'id, title, excerpt, full_content, author_username, user_id, views, certify_count, created_at'
 */
export const DossierRowSchema = z.object({
  id: z.string(),
  title: z.string().default('Untitled'),
  // .nullish() (accepts undefined) so a remote column rename yields `undefined`
  // and the field simply defaults — the dossier still renders — instead of the
  // whole row being dropped. Paired with the select('*') read in content.ts
  // (which can't error on a renamed/missing column), this makes the dispatch
  // read fully rename-immune. Core identity fields below stay required.
  excerpt: z.string().nullable().default(null),
  full_content: z.string().nullable().default(null),
  author_username: z.string().nullable().default(null),
  user_id: z.string(),
  views: z.number().nullable().default(null),
  certify_count: z.number().nullable().default(null),
  created_at: z.string(),
});

export type ValidatedDossierRow = z.infer<typeof DossierRowSchema>;


/**
 * dispatchTypes — what a filing is, and how a database row becomes one.
 * ─────────────────────────────────────────────────────────────────────────────
 * One table holds five kinds of filing, and the CHECK constraints on
 * `dispatch_posts` are what decide that a wire has a source and a ballot has
 * options. This file does not re-state those rules — a second opinion about
 * validity is a second opinion that can drift from the first. It states the
 * SHAPE, drops rows that do not match it, and converts what is left into the
 * props the paper components already expect.
 *
 * Rows are validated at the boundary for the same reason `DossierRowSchema`
 * exists: after a column rename, undefined values otherwise flow straight
 * through and render as blank cards rather than as an error anyone can see.
 */
import { z } from 'zod';
import { getTierWeight, resolveTier, TIER_WEIGHTS } from '@/src/utils/tier';
import type { PaperAuthor, PaperFilm, PaperKind, PaperTier } from '@/src/components/dispatch/paper/PaperPost';

export type FilingKind = PaperKind;

/** One choice on a ballot. Two to six of them, and every one is a film. */
export interface BallotOption {
  film_id: number;
  title: string;
  poster_path?: string | null;
}

/**
 * The result written down when a ballot closes.
 *
 * `counts` is keyed by option index as a STRING, because it arrives as jsonb
 * object keys and JSON has no integer keys. Reading it with a number would miss
 * every entry and quietly show a ballot where nobody voted.
 */
export interface FrozenTotals {
  total: number;
  counts: Record<string, number>;
  frozen_at?: string;
}

export interface Filing {
  id: string;
  kind: FilingKind;

  authorId: string | null;
  /** Null when the member has departed — the row keeps the words, not the name. */
  author: PaperAuthor | null;

  film: PaperFilm | null;
  subjectId: number | null;
  subjectKind: 'film' | 'person' | null;

  title: string | null;
  body: string;
  /** Only a dossier has one, and only the reader asks for it. */
  fullContent: string | null;

  source: string | null;
  sourceUrl: string | null;

  options: BallotOption[] | null;
  closesAt: string | null;
  frozenTotals: FrozenTotals | null;
  answerId: string | null;

  seriesId: string | null;
  seriesTitle: string | null;
  partNumber: number | null;

  spoilerLabel: string | null;
  /**
   * Under review by the house.
   *
   * A withheld filing is filtered out of the feed for everyone — but its AUTHOR
   * can still open it by its address, because RLS lets them read their own, and
   * a page that says "no longer here" about something merely under review would
   * be the app lying to the person most entitled to the truth. The reader prints
   * the WITHHELD plate instead.
   */
  withheldAt: string | null;
  /** Set means the filing has been ended; its text is already gone from the row. */
  endedAt: string | null;
  endedBy: 'author' | 'house' | null;

  certifyCount: number;
  commentCount: number;
  createdAt: string;
  editedAt: string | null;
}

export interface Critique {
  id: string;
  postId: string;
  authorId: string | null;
  author: PaperAuthor | null;
  body: string;
  certifyCount: number;
  createdAt: string;
  editedAt: string | null;
}

// ── THE ROW SHAPES ──────────────────────────────────────────────────────────

/**
 * PostgREST returns an embedded relation as an object, or as an ARRAY of one
 * when it cannot prove the relationship is to-one. Both shapes are accepted
 * here because the app has already been bitten by that twice (lounge.ts:536,
 * useEditProfile.ts:238 both unwrap it by hand).
 */
const ProfileSchema = z.object({
  username: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  member_no: z.number().nullable().optional(),
  tier: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  is_founding: z.boolean().nullable().optional(),
});

const EmbeddedProfile = z.union([ProfileSchema, z.array(ProfileSchema), z.null()]).optional();

export const BallotOptionSchema = z.object({
  film_id: z.number(),
  title: z.string(),
  poster_path: z.string().nullable().optional(),
});

export const FilingRowSchema = z.object({
  id: z.string(),
  kind: z.enum(['take', 'seeking', 'wire', 'ballot', 'dossier']),
  user_id: z.string().nullable(),
  author_username: z.string(),

  subject_kind: z.enum(['film', 'person']).nullable().optional(),
  subject_id: z.number().nullable().optional(),
  subject_title: z.string().nullable().optional(),
  subject_sub: z.string().nullable().optional(),
  subject_image: z.string().nullable().optional(),

  title: z.string().nullable().optional(),
  body: z.string(),
  full_content: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),

  options: z.array(BallotOptionSchema).nullable().optional(),
  closes_at: z.string().nullable().optional(),
  frozen_totals: z
    .object({
      total: z.number(),
      counts: z.record(z.string(), z.number()),
      frozen_at: z.string().optional(),
    })
    .nullable()
    .optional(),
  answer_id: z.string().nullable().optional(),

  series_id: z.string().nullable().optional(),
  series_title: z.string().nullable().optional(),
  part_number: z.number().nullable().optional(),

  spoiler_label: z.string().nullable().optional(),
  withheld_at: z.string().nullable().optional(),
  ended_at: z.string().nullable().optional(),
  ended_by: z.enum(['author', 'house']).nullable().optional(),

  certify_count: z.number(),
  comment_count: z.number(),
  created_at: z.string(),
  edited_at: z.string().nullable().optional(),

  profiles: EmbeddedProfile,
});

export const CritiqueRowSchema = z.object({
  id: z.string(),
  post_id: z.string(),
  user_id: z.string().nullable(),
  author_username: z.string(),
  body: z.string(),
  certify_count: z.number(),
  created_at: z.string(),
  edited_at: z.string().nullable().optional(),
  profiles: EmbeddedProfile,
});

export type FilingRow = z.infer<typeof FilingRowSchema>;
export type CritiqueRow = z.infer<typeof CritiqueRowSchema>;

// ── THE MAPPERS ─────────────────────────────────────────────────────────────

type RawProfile = z.infer<typeof ProfileSchema>;

const unwrap = (p: RawProfile | RawProfile[] | null | undefined): RawProfile | null =>
  Array.isArray(p) ? (p[0] ?? null) : (p ?? null);

/**
 * The four facts a byline draws, or null.
 *
 * Null is not a failure case — it is the departed member, whose row keeps their
 * words and not their name. Every paper component already draws that state, so
 * the mapper says "there is nobody here" rather than inventing a blank member.
 *
 * The TIER is resolved through the app's own `resolveTier`, which is also what
 * the database's `profile_tier_weight` does with the same three columns. A ring
 * painted from `tier` alone would be the wrong colour for a founding member and
 * for anyone whose rank comes from their role.
 */
function toAuthor(
  userId: string | null,
  username: string,
  profile: RawProfile | RawProfile[] | null | undefined,
): PaperAuthor | null {
  if (!userId) return null;
  const p = unwrap(profile);
  // Compared by WEIGHT, not by name. `resolveTier` already applies the Highest
  // Watermark rule across tier / role / is_founding, and a founding member comes
  // back as 'founding' — a name-equality check would have painted the app's most
  // senior members with no ring at all, and would do the same to any tier added
  // above archivist later. This is the same comparison isAuteurPlusTier makes.
  const weight = getTierWeight(
    resolveTier({
      tier: p?.tier ?? undefined,
      role: p?.role ?? undefined,
      is_founding: p?.is_founding ?? undefined,
    }),
  );
  const tier: PaperTier =
    weight >= TIER_WEIGHTS.auteur ? 'auteur'
      : weight >= TIER_WEIGHTS.archivist ? 'archivist'
        : 'free';
  return {
    // The row's own handle is authoritative: it is derived server-side on every
    // write (trg_derive_username) and kept current by the rename trigger, so it
    // is never staler than the join and is present even when the join is not.
    name: username,
    memberNo: p?.member_no ?? 0,
    tier,
    avatar: p?.avatar_url ?? null,
  };
}

export function toFilm(row: FilingRow): PaperFilm | null {
  if (row.subject_kind !== 'film' || !row.subject_title) return null;
  return {
    title: row.subject_title,
    // `subject_sub` carries the one line under a title — a year, a director, or
    // both — as the composer captured it. It is not parsed back apart here,
    // because splitting a string a member never split is how a director called
    // "1974" ends up as a year.
    director: row.subject_sub ?? null,
    posterPath: row.subject_image ?? null,
  };
}

export function toFiling(row: FilingRow): Filing {
  return {
    id: row.id,
    kind: row.kind,
    authorId: row.user_id,
    author: toAuthor(row.user_id, row.author_username, row.profiles),
    film: toFilm(row),
    subjectId: row.subject_id ?? null,
    subjectKind: row.subject_kind ?? null,
    title: row.title ?? null,
    body: row.body,
    fullContent: row.full_content ?? null,
    source: row.source ?? null,
    sourceUrl: row.source_url ?? null,
    options: row.options ?? null,
    closesAt: row.closes_at ?? null,
    frozenTotals: row.frozen_totals ?? null,
    answerId: row.answer_id ?? null,
    seriesId: row.series_id ?? null,
    seriesTitle: row.series_title ?? null,
    partNumber: row.part_number ?? null,
    spoilerLabel: row.spoiler_label ?? null,
    withheldAt: row.withheld_at ?? null,
    endedAt: row.ended_at ?? null,
    endedBy: row.ended_by ?? null,
    certifyCount: row.certify_count,
    commentCount: row.comment_count,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
  };
}

export function toCritique(row: CritiqueRow): Critique {
  return {
    id: row.id,
    postId: row.post_id,
    authorId: row.user_id,
    author: toAuthor(row.user_id, row.author_username, row.profiles),
    body: row.body,
    certifyCount: row.certify_count,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
  };
}

/**
 * Parse a page, dropping what does not match rather than rendering it blank.
 *
 * It returns the dropped COUNT as well as the rows, because a silent drop is
 * how a schema change becomes "the feed looks short today" instead of an error
 * anybody investigates.
 */
export function parseFilingRows(rows: unknown[]): { filings: Filing[]; dropped: number } {
  const filings: Filing[] = [];
  let dropped = 0;
  for (const r of rows) {
    const parsed = FilingRowSchema.safeParse(r);
    if (parsed.success) filings.push(toFiling(parsed.data));
    else dropped++;
  }
  return { filings, dropped };
}

export function parseCritiqueRows(rows: unknown[]): { critiques: Critique[]; dropped: number } {
  const critiques: Critique[] = [];
  let dropped = 0;
  for (const r of rows) {
    const parsed = CritiqueRowSchema.safeParse(r);
    if (parsed.success) critiques.push(toCritique(parsed.data));
    else dropped++;
  }
  return { critiques, dropped };
}

// ── WHAT THE FEED ASKS FOR ──────────────────────────────────────────────────

/**
 * The feed's columns, WITHOUT `full_content`.
 *
 * An essay is up to 25,000 characters and the card renders 500 of them. Asking
 * for it on a twenty-row page would make the body of the response 83% text
 * nobody draws — the exact defect a guard test already pins for the old dossier
 * feed. The reader asks for it, once, for the one filing being read.
 */
export const FILING_CARD_COLUMNS =
  'id, kind, user_id, author_username, subject_kind, subject_id, subject_title, ' +
  'subject_sub, subject_image, title, body, source, source_url, options, closes_at, ' +
  'frozen_totals, answer_id, series_id, series_title, part_number, spoiler_label, ' +
  'withheld_at, ended_at, ended_by, certify_count, comment_count, created_at, edited_at, ' +
  'profiles!dispatch_posts_profile_fkey(username, avatar_url, member_no, tier, role, is_founding)';

/** The same, plus the essay — one filing, once, when it is opened. */
export const FILING_FULL_COLUMNS = FILING_CARD_COLUMNS.replace(
  'title, body,',
  'title, body, full_content,',
);

export const CRITIQUE_COLUMNS =
  'id, post_id, user_id, author_username, body, certify_count, created_at, edited_at, ' +
  'profiles!dispatch_comments_profile_fkey(username, avatar_url, member_no, tier, role, is_founding)';

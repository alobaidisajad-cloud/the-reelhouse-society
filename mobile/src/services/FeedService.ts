import { supabase } from '@/src/lib/supabase';
import {
    FeedItem,
    FeedItemSchema,
    FollowingFeedRowSchema,
    StackData,
    StackDataSchema,
    StackFeedRowSchema,
} from '@/src/schemas/feed.schema';

import { tellMarks } from '@/src/stores/tellMarks';
import { logger } from '@/src/utils/logger';
import { reportValidationTelemetry } from '@/src/utils/validateWithTelemetry';
import { withAbortSignal } from '@/src/utils/withAbortSignal';
import { z } from 'zod';

export class FeedNetworkError extends Error {
  constructor(message: string = 'Network connection failed') {
    super(message);
    this.name = 'FeedNetworkError';
  }
}

export class FeedServiceError extends Error {
  constructor(public originalError: unknown, message: string = 'Failed to retrieve society feeds') {
    super(message);
    this.name = 'FeedServiceError';
  }
}

// ──────────────────────────────────────────────────────────────
// RESILIENT ROW PARSER
// ──────────────────────────────────────────────────────────────
// Uses safeParse so one bad row doesn't kill the entire page.
// If batch parse succeeds, great. If not, falls back to per-row
// and salvages every valid row.
// ──────────────────────────────────────────────────────────────
function parseRowsSafely<T>(data: unknown[], schema: z.ZodType<T>, context: string): T[] {
  if (data.length === 0) return [];

  const batchResult = z.array(schema).safeParse(data);
  if (batchResult.success) return batchResult.data;

  // Batch failed — salvage valid rows individually
  if (__DEV__) {
    logger.warn(`[FeedService.${context}] Batch parse failed, salvaging per-row`, batchResult.error.issues.slice(0, 3));
  }

  const valid: T[] = [];
  for (const row of data) {
    const r = schema.safeParse(row);
    if (r.success) valid.push(r.data);
  }

  // Production observability: report invalid row ratio to Sentry
  reportValidationTelemetry({
    context: `FeedService.${context}`,
    totalRows: data.length,
    invalidCount: data.length - valid.length,
  });

  if (valid.length === 0) {
    throw new FeedServiceError(batchResult.error, `All ${data.length} rows failed validation in ${context}`);
  }

  if (__DEV__) {
    logger.info(`[FeedService.${context}] Salvaged ${valid.length}/${data.length} rows`);
  }

  return valid;
}

// ──────────────────────────────────────────────────────────────
// CURSOR HELPERS
// ──────────────────────────────────────────────────────────────
// Cursor parts are server-generated (`created_at|id`) and round-tripped through React
// Query's pageParam. Downstream they are string-interpolated directly into PostgREST
// `.or()` filter expressions, so we validate their SHAPE here before use. The patterns
// are tightly anchored (^…$) and allow only the characters a real timestamp / uuid
// contains — anything carrying PostgREST filter metacharacters (`,` `(` `)` `"` `.` as
// an operator) fails to match and is treated as absent, degrading to a safe first-page
// fetch instead of a broken or injectable query.
/**
 * Posters requested per stack card.
 *
 * The card draws three (`ReelsCards.tsx` filters to films that have a poster and
 * slices three). A fourth is asked for as headroom so the row still fills if one
 * is unusable. The stack's real size travels separately as `film_count`.
 */
const STACK_CARD_POSTERS = 4;

/** Rows a page asks for; a shorter page is the last (useFeeds). */
export const FEED_PAGE = 40;
export const STACKS_PAGE = 60;

/** Tell the shared count store what this page of logs said, and when it was asked. */
function tellFeed(items: FeedItem[], askedAt: number): FeedItem[] {
  tellMarks('log', items.map((i) => ({ id: i.id, certify: i.certify_count, critique: i.critique_count, certified: i.certified })), askedAt);
  return items;
}

const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:?\d{2})?|Z)?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCursor(pageParam?: string): { cursorDate: string | null; cursorId: string | null } {
  if (!pageParam) return { cursorDate: null, cursorId: null };
  const parts = pageParam.split('|');
  const rawDate = parts[0] ?? '';
  const rawId = parts[1] ?? '';
  return {
    cursorDate: ISO_TIMESTAMP_RE.test(rawDate) ? rawDate : null,
    cursorId: UUID_RE.test(rawId) ? rawId : null,
  };
}

/**
 * FeedService — the Reel's three feeds, each read through the house's own
 * function: blocks and mutes filtered on the server, so a page's length is what
 * the card list draws, and keyset cursors (`created_at|id`) never repeat a row.
 * Every refusal is thrown: an unread feed is never drawn as an empty one, and a
 * missing function is never quietly replaced by an unfiltered query
 * (backend-contract.json requires all three).
 */
export const FeedService = {
  /** The community feed, newest first. */
  async getCommunityFeed({ pageParam, signal }: { pageParam?: string; signal?: AbortSignal } = {}): Promise<FeedItem[]> {
    const { cursorDate, cursorId } = parseCursor(pageParam);
    // Taken BEFORE the request: see tellMarkCounts.
    const askedAt = Date.now();
    const { data, error } = await withAbortSignal(supabase.rpc('get_community_feed_auth_cursor', {
      p_limit: FEED_PAGE,
      p_cursor_created_at: cursorDate,
      p_cursor_id: cursorId,
    }), signal);
    if (error) throw new FeedServiceError(error);
    if (!data || data.length === 0) return [];
    const rows = parseRowsSafely(data, FollowingFeedRowSchema, 'getCommunityFeed');
    return tellFeed(rows.map((d) => FeedItemSchema.parse(d)), askedAt);
  },

  /** The logs of the members the viewer follows, newest first. */
  async getFollowingFeed({ pageParam, signal }: { pageParam?: string; signal?: AbortSignal } = {}): Promise<FeedItem[]> {
    const { cursorDate, cursorId } = parseCursor(pageParam);
    const askedAt = Date.now();
    const { data, error } = await withAbortSignal(supabase.rpc('get_following_feed_auth_cursor', {
      p_limit: FEED_PAGE,
      p_cursor_created_at: cursorDate,
      p_cursor_id: cursorId,
    }), signal);
    if (error) throw new FeedServiceError(error);
    if (!data || data.length === 0) return [];
    const rows = parseRowsSafely(data, FollowingFeedRowSchema, 'getFollowingFeed');
    return tellFeed(rows.map((d) => FeedItemSchema.parse(d)), askedAt);
  },

  /**
   * Curated stacks, newest first, searched and filtered on the server.
   * @param followingCount - whom the viewer follows: none means no followed stacks to ask for
   */
  async getStacksFeed(filter: 'all' | 'following', search: string, { pageParam, signal }: { pageParam?: string; signal?: AbortSignal } = {}, followingCount = 0): Promise<StackData[]> {
    if (filter === 'following' && followingCount === 0) return [];
    const { cursorDate, cursorId } = parseCursor(pageParam);
    // A stack's card shows its certify count; certifying on its page moves it at once.
    const askedAt = Date.now();
    const { data, error } = await withAbortSignal(supabase.rpc('get_filtered_stacks_auth_cursor_v2', {
      p_search: search.trim().toLowerCase(),
      p_filter_following: filter === 'following',
      p_limit: STACKS_PAGE,
      p_cursor_created_at: cursorDate,
      p_cursor_id: cursorId,
      p_poster_count: STACK_CARD_POSTERS,
    }), signal);
    if (error) throw new FeedServiceError(error, 'Failed to fetch stacks feed');
    if (!data || data.length === 0) return [];
    const stacks = parseRowsSafely(data, StackFeedRowSchema, 'getStacksFeed').map((l) => StackDataSchema.parse({
      id: l.id,
      title: l.title,
      description: l.description,
      curator: l.username,
      curatorId: l.user_id,
      createdAt: l.created_at,
      films: l.films || [],
      // The stack's real size: the poster array holds four at most.
      count: l.film_count,
      certifyCount: Number(l.certify_count) || 0,
      isRanked: l.is_ranked,
    }));
    // The card draws no heart, so only the count is told.
    tellMarks('list', stacks.map((st) => ({ id: st.id, certify: st.certifyCount })), askedAt);
    return stacks;
  },
};

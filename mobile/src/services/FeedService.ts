import { supabase } from '@/src/lib/supabase';
import {
    CommunityFeedRowSchema,
    FeedItem,
    FeedItemSchema,
    FollowingFeedRowSchema,
    StackData,
    StackDataSchema,
    StackFeedRowSchema,
} from '@/src/schemas/feed.schema';

import { buildSearchPattern } from '@/src/utils/searchPattern';
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
 * FeedService — cursor-paginated feed data access layer.
 *
 * Provides community, following, and stacks feeds with resilient row parsing,
 * cursor-based pagination, and automatic RPC-to-direct-query fallback.
 */
export const FeedService = {
  /**
   * Fetches the community feed (all public reviews) with cursor pagination.
   * Uses keyset pagination on `created_at|id` for stable ordering.
   * Tries the block-aware server-side RPC first, falls back to a direct
   * query (which cannot filter blocks server-side — see Strategy 2 below).
   * @returns Parsed and validated feed items, newest first
   * @throws {FeedServiceError} on network or total validation failure
   */
  async getCommunityFeed({ pageParam, signal }: { pageParam?: string; signal?: AbortSignal } = {}): Promise<FeedItem[]> {
    const limit = 40;
    const { cursorDate, cursorId } = parseCursor(pageParam);

    // ── Strategy 1: Block-aware cursor RPC ──
    // Filters blocked/muted authors server-side so the page length used for
    // pagination matches what the client actually renders (see useFeeds.ts).
    try {
      const rpcResult = await supabase.rpc('get_community_feed_auth_cursor', {
        p_limit: limit,
        p_cursor_created_at: cursorDate,
        p_cursor_id: cursorId,
      });

      if (!rpcResult.error) {
        if (!rpcResult.data || rpcResult.data.length === 0) return [];
        const rows = parseRowsSafely(rpcResult.data, FollowingFeedRowSchema, 'getCommunityFeed.rpc');
        return rows.map((d) => FeedItemSchema.parse(d));
      }

      const msg = rpcResult.error.message || '';
      const isMissingFunction = msg.includes('does not exist') || msg.includes('42883') || rpcResult.error.code === '42883';
      if (!isMissingFunction) {
        throw new FeedServiceError(rpcResult.error);
      }
      if (__DEV__) console.warn('[FeedService] get_community_feed_auth_cursor RPC not found, falling back to direct query');
    } catch (e) {
      if (e instanceof FeedServiceError) throw e;
      if (__DEV__) console.warn('[FeedService] Community feed RPC call failed unexpectedly, using direct query:', e);
    }

    // ── Strategy 2: Direct query fallback (no server-side block filter) ──
    // Block/mute filtering for this path happens client-side only, in
    // useFeeds.ts's `select`. Deploy get_community_feed_auth_cursor to close
    // that gap.
    let query = supabase.from('logs')
      .select('id, film_id, film_title, poster_path, rating, review, drop_cap, status, abandoned_reason, created_at, year, user_id, editorial_header, pull_quote, watched_with, is_autopsied, autopsy, is_spoiler, profiles!logs_user_id_fkey(username, avatar_url, role)')
      .not('review', 'is', null).neq('review', '')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);

    if (cursorDate && cursorId) {
      query = query.or(`created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`);
    } else if (cursorDate) {
      query = query.lt('created_at', cursorDate);
    }

    query = withAbortSignal(query, signal);

    const { data, error } = await query;

    if (error) throw new FeedServiceError(error);
    if (!data || data.length === 0) return [];

    const rows = parseRowsSafely(data, CommunityFeedRowSchema, 'getCommunityFeed.direct');

    return rows.map((d) => {
      const profile = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles;
      const rawItem = {
        ...d,
        username: profile?.username,
        avatar_url: profile?.avatar_url,
        role: profile?.role,
      };
      return FeedItemSchema.parse(rawItem);
    });
  },

  /**
   * Fetches the following feed for the current user with cursor pagination.
   * Tries server-side RPC first, falls back to client-side filtered query.
   * @param fallbackFollowing - Followed usernames for direct-query fallback (max 150 used)
   * @returns Parsed feed items from followed users, newest first
   * @throws {FeedServiceError} on network or total validation failure
   */
  async getFollowingFeed({ pageParam, signal }: { pageParam?: string; signal?: AbortSignal } = {}, fallbackFollowing?: string[]): Promise<FeedItem[]> {
    const limit = 40;
    const { cursorDate, cursorId } = parseCursor(pageParam);

    // ── Strategy 1: Server-side cursor RPC ──
    try {
      const rpcResult = await supabase.rpc('get_following_feed_auth_cursor', {
        p_limit: limit,
        p_cursor_created_at: cursorDate,
        p_cursor_id: cursorId,
      });

      if (!rpcResult.error && rpcResult.data && rpcResult.data.length > 0) {
        const rows = parseRowsSafely(rpcResult.data, FollowingFeedRowSchema, 'getFollowingFeed.rpc');
        return rows.map((d) => FeedItemSchema.parse(d));
      }

      if (rpcResult.error) {
        const msg = rpcResult.error.message || '';
        const isMissingFunction = msg.includes('does not exist') || msg.includes('42883') || rpcResult.error.code === '42883';
        if (!isMissingFunction) {
          throw new FeedServiceError(rpcResult.error);
        }
        if (__DEV__) console.warn('[FeedService] get_following_feed_auth_cursor RPC not found, falling back to direct query');
      }
      
      if (!rpcResult.error && rpcResult.data) return [];
    } catch (e) {
      if (e instanceof FeedServiceError) throw e;
      if (__DEV__) console.warn('[FeedService] RPC call failed unexpectedly, using direct query:', e);
    }

    // ── Strategy 2: Direct query fallback (Safely bounded to prevent 414 URI crashes) ──
    // 150 UUIDs = ~5.5KB URI, well under the 8KB hard limit of standard load balancers.
    const safeFollowing = fallbackFollowing ? fallbackFollowing.slice(0, 150) : [];
    // Log when truncation occurs for production observability
    if (fallbackFollowing && fallbackFollowing.length > 150) {
      logger.warn(`[FeedService.getFollowingFeed] Truncated following list: ${fallbackFollowing.length} → 150 (direct query fallback). Deploy get_following_feed_auth_cursor RPC to resolve.`);
    }
    if (safeFollowing.length === 0) return [];
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .in('username', safeFollowing)
      .limit(150);

    if (profileError) throw new FeedServiceError(profileError);
    if (!profiles || profiles.length === 0) return [];

    let query = supabase.from('logs')
      .select('id, film_id, film_title, poster_path, rating, review, drop_cap, status, abandoned_reason, created_at, year, user_id, editorial_header, pull_quote, watched_with, is_autopsied, autopsy, is_spoiler, profiles!logs_user_id_fkey(username, avatar_url, role)')
      .in('user_id', profiles.map(p => p.id))
      .not('review', 'is', null).neq('review', '')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);

    if (cursorDate && cursorId) {
      query = query.or(`created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`);
    } else if (cursorDate) {
      query = query.lt('created_at', cursorDate);
    }

    query = withAbortSignal(query, signal);

    const { data, error } = await query;
    if (error) throw new FeedServiceError(error);
    if (!data || data.length === 0) return [];

    // Direct query returns CommunityFeedRow shape (with profiles join)
    const rows = parseRowsSafely(data, CommunityFeedRowSchema, 'getFollowingFeed.direct');
    return rows.map((d) => {
      const profile = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles;
      return FeedItemSchema.parse({
        ...d,
        username: profile?.username,
        avatar_url: profile?.avatar_url,
        role: profile?.role,
      });
    });
  },

  /**
   * Fetches curated stacks (lists) with filtering, search, and cursor pagination.
   * Tries server-side RPC first, falls back to multi-query client-side assembly.
   * @param filter - Show all public stacks or only from followed users
   * @param search - Free-text search applied to title/description
   * @param fallbackFollowing - Followed usernames for 'following' filter fallback
   * @returns Parsed stack data with films and endorsement counts
   * @throws {FeedServiceError} on network or total validation failure
   */
  async getStacksFeed(filter: 'all' | 'following', search: string, { pageParam, signal }: { pageParam?: string; signal?: AbortSignal } = {}, fallbackFollowing?: string[]): Promise<StackData[]> {
    if (filter === 'following' && (!fallbackFollowing || fallbackFollowing.length === 0)) return [];

    const limit = 60;
    const { cursorDate, cursorId } = parseCursor(pageParam);

    // ── Strategy 1: Server-side cursor RPC ──
    try {
      const rpcResult = await supabase.rpc('get_filtered_stacks_auth_cursor', {
        p_search: search.trim().toLowerCase(),
        p_filter_following: filter === 'following',
        p_limit: limit,
        p_cursor_created_at: cursorDate,
        p_cursor_id: cursorId,
      });

      if (!rpcResult.error && rpcResult.data) {
        if (rpcResult.data.length === 0) return [];

        const stackRows = parseRowsSafely(rpcResult.data, StackFeedRowSchema, 'getStacksFeed.rpc');
        return stackRows.map((l) => {
          const rawStack = {
            id: l.id,
            title: l.title,
            description: l.description,
            curator: l.username,
            curatorId: l.user_id,
            createdAt: l.created_at,
            films: l.films || [],
            count: (l.films || []).length,
            certifyCount: Number(l.certify_count) || 0,
            isRanked: l.is_ranked,
          };
          return StackDataSchema.parse(rawStack);
        });
      }

      if (rpcResult.error) {
        const msg = rpcResult.error.message || '';
        const isMissingFunction = msg.includes('does not exist') || msg.includes('42883') || rpcResult.error.code === '42883';
        if (!isMissingFunction) {
          throw new FeedServiceError(rpcResult.error, 'Failed to fetch stacks feed');
        }
        if (__DEV__) logger.warn('[FeedService] get_filtered_stacks_auth_cursor RPC not found, falling back to direct query');
      }
    } catch (e) {
      if (e instanceof FeedServiceError) throw e;
      if (__DEV__) logger.warn('[FeedService] Stacks RPC failed, using direct query:', e);
    }

    // ── Strategy 2: Direct query fallback ──
    let listQuery = supabase
      .from('lists')
      .select('id, title, description, created_at, user_id, is_private, is_ranked, profiles!lists_user_id_fkey(username)')
      .eq('is_private', false)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);

    if (cursorDate && cursorId) {
      listQuery = listQuery.or(`created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`);
    } else if (cursorDate) {
      listQuery = listQuery.lt('created_at', cursorDate);
    }

    if (filter === 'following' && fallbackFollowing && fallbackFollowing.length > 0) {
      const safeFollowing = fallbackFollowing.slice(0, 150); // Maximize payload, prevent 8KB URI crash
      // Get user IDs for followed usernames
      const { data: followedProfiles } = await supabase
        .from('profiles')
        .select('id')
        .in('username', safeFollowing)
        .limit(150);
      
      if (!followedProfiles || followedProfiles.length === 0) return [];
      listQuery = listQuery.in('user_id', followedProfiles.map(p => p.id));
    }

    if (search.trim()) {
      // Unquoted: inside a quoted value PostgREST swallows the escape, so the
      // wildcards stayed live and the filter could be rewritten. `null` means the
      // term is nothing but separators — search for nothing rather than everything.
      const pattern = buildSearchPattern(search);
      if (pattern === null) return [];
      listQuery = listQuery.or(`title.ilike.*${pattern}*,description.ilike.*${pattern}*`);
    }

    listQuery = withAbortSignal(listQuery, signal);

    const { data: lists, error: listError } = await listQuery;
    if (listError) throw new FeedServiceError(listError, 'Failed to fetch stacks');
    if (!lists || lists.length === 0) return [];

    const listIds = lists.map((l: any) => l.id);

    // Fetch items and endorsements in parallel
    const [itemsResp, endorseResp] = await Promise.all([
      listIds.length > 0
        ? supabase.from('list_items').select('list_id, film_id, film_title, poster_path').in('list_id', listIds).order('rank_position', { ascending: true }).order('created_at', { ascending: true }).limit(600)
        : Promise.resolve({ data: [] as any[], error: null }),
      listIds.length > 0
        ? supabase.from('interactions').select('target_list_id').in('target_list_id', listIds).eq('type', 'endorse_list').limit(3000)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    const itemsMap: Record<string, { film_id: number; film_title: string; poster_path: string | null }[]> = {};
    if (itemsResp.data) {
      for (const item of itemsResp.data as any[]) {
        if (!itemsMap[item.list_id]) itemsMap[item.list_id] = [];
        itemsMap[item.list_id].push(item);
      }
    }

    const endorseMap: Record<string, number> = {};
    if (endorseResp.data) {
      for (const e of endorseResp.data as any[]) {
        endorseMap[e.target_list_id] = (endorseMap[e.target_list_id] ?? 0) + 1;
      }
    }

    return lists.map((l: any) => {
      const curator = Array.isArray(l.profiles) ? l.profiles[0]?.username : l.profiles?.username;
      const films = (itemsMap[l.id] ?? []).map((item) => ({
        id: item.film_id,
        title: item.film_title,
        poster_path: item.poster_path ?? null,
      }));
      return StackDataSchema.parse({
        id: l.id,
        title: l.title,
        description: l.description ?? '',
        curator: curator ?? 'society',
        curatorId: l.user_id,
        createdAt: l.created_at,
        films,
        count: films.length,
        certifyCount: endorseMap[l.id] ?? 0,
        isRanked: l.is_ranked ?? false,
      });
    });
  }
};

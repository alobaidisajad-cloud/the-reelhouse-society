/**
 * ProfileDataService — every read a member's file makes, typed and validated.
 * ────────────────────────────────────────────────────────────────────────
 * Another member's profile is read with PUBLIC_PROFILE_COLUMNS, so their own
 * settings never leave the database. A failed read is logged (`logger.warn`
 * reaches Sentry in production) and thrown, or answered as nothing.
 */

import { z } from 'zod';
import { supabase } from '../lib/supabase';
import * as Sentry from '@sentry/react-native';
import { logger } from '../utils/logger';
import { withAbortSignal } from '../utils/withAbortSignal';
import { mapLogRow, PUBLIC_LOG_COLUMNS } from '../utils/mappers';
import type { LogRow } from '../utils/mappers';
import type { ProfileLog, ProfileWatchlistItem, ProfileVaultItem, ProfileList, LedgerRating, WatchlistDecade, ShelfSort } from '../types';
import { LEDGER_HIGH_FLOOR } from '../types';
import { sortAxis, parseCursor, keysetFilter, buildCursor, pgLiteral } from '../utils/keysetCursor';
import type { AnalyticsShape } from '../hooks/useProfileData';
import type { TasteProfile } from '../constants/taste';
import { ProfileUserSchema, type ValidatedProfileUser } from '../schemas/profile.schema';
import { isArchivistPlusTier, isAuteurPlusTier } from '../utils/tier';
import { buildSearchPattern } from '../utils/searchPattern';

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Safely parse an array of rows, dropping only invalid rows
 * instead of destroying the entire batch if a single row has a schema mismatch.
 */
function parseRowsSafely<T extends z.ZodTypeAny>(schema: T, data: unknown[]): z.infer<T>[] {
  if (!Array.isArray(data)) return [];
  const valid: z.infer<T>[] = [];
  for (const row of data) {
    const parsed = schema.safeParse(row);
    if (parsed.success) valid.push(parsed.data);
    else logger.warn('[ProfileDataService] Dropped invalid row:', parsed.error.message);
  }
  return valid;
}

// ── Column Constants ───────────────────────────────────────────────────

/** Your own profile only (a new column may belong in PROFILE_SELECT_COLUMNS too). */
export const SELF_PROFILE_COLUMNS = 'id, username, avatar_url, display_name, bio, role, tier, is_founding, persona, is_social_private, followers_count, following_count, favorite_films, preferences, created_at, social_links, member_no' as const;

/** Anyone else's: no `preferences`, only `public_prefs`, the database's whitelist of it. */
export const PUBLIC_PROFILE_COLUMNS = 'id, username, avatar_url, display_name, bio, role, tier, is_founding, persona, is_social_private, followers_count, following_count, favorite_films, created_at, social_links, member_no, public_prefs' as const;

/** A visitor's `preferences`: display keys, each ALSO in the database's `public_prefs()`. */
export const VISITOR_PREFERENCE_KEYS = ['programmes', 'favorites', 'backdrop'] as const;

// ── Zod Schemas ────────────────────────────────────────────────────────


const WatchlistRowSchema = z.object({
  film_id: z.coerce.number(),
  film_title: z.string(),
  poster_path: z.string().nullable().optional(),
  year: z.coerce.number().nullable().optional(),
});

const VaultRowSchema = z.object({
  id: z.union([z.string(), z.coerce.number()]),
  film_id: z.coerce.number(),
  film_title: z.string(),
  poster_path: z.string().nullable().optional(),
  year: z.coerce.number().nullable().optional(),
  formats: z.array(z.string()).nullable().optional(),
  notes: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  created_at: z.string(),
});

const ListItemRowSchema = z.object({
  list_id: z.string(),
  film_id: z.coerce.number(),
  film_title: z.string(),
  poster_path: z.string().nullable().optional(),
});
type ListItemRow = z.infer<typeof ListItemRowSchema>;

/**
 * A stack's items, each validated alone: one bad item is dropped, never the
 * whole stack (parseRowsSafely drops a failing row); anything else is [].
 */
const ListItemsField = z
  .array(ListItemRowSchema.nullable().catch(null))
  .nullable()
  .optional()
  .catch(null)
  .transform((items) => (items ?? []).filter((i): i is ListItemRow => i !== null));

const ListRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  is_ranked: z.boolean().nullable().optional(),
  is_private: z.boolean().nullable().optional(),
  created_at: z.string(),
  list_items: ListItemsField,
}).passthrough();

const AnalyticsRowSchema = z.object({
  id: z.coerce.string(),
  film_id: z.coerce.number(),
  film_title: z.string(),
  poster_path: z.string().nullable().optional(),
  year: z.coerce.number().nullable().optional(),
  rating: z.coerce.number().nullable().optional(),
  status: z.string().nullable().optional(),
  watched_date: z.string().nullable().optional(),
  created_at: z.string(),
  physical_media: z.string().nullable().optional(),
  is_autopsied: z.boolean().nullable().optional(),
  autopsy: z.any().nullable().optional(),
});

// ── Service ────────────────────────────────────────────────────────────

/** A count, or undefined when it could not be read: a failed read is not a member with none. */
const countRead = (r: { count?: number | null; error?: unknown }): number | undefined =>
  !r.error && typeof r.count === 'number' ? r.count : undefined;

const UNREAD_COUNTS = {
  logs: undefined, ledger: undefined, watchlist: undefined, vault: undefined, lists: undefined,
  followers: undefined, following: undefined,
} as const satisfies Record<string, number | undefined>;

export const ProfileDataService = {
  /**
   * Fetches a user profile by username.
   * Uses restricted column set for non-self queries to protect privacy.
   */
  async fetchProfile(username: string, isSelf: boolean, signal?: AbortSignal): Promise<ValidatedProfileUser | null> {
    const columns = isSelf ? SELF_PROFILE_COLUMNS : PUBLIC_PROFILE_COLUMNS;
    const { data, error } = await withAbortSignal(
      supabase.from('profiles').select(columns).eq('username', username).maybeSingle(),
      signal
    );
    if (error) {
      logger.warn('[ProfileDataService] fetchProfile error:', error.message);
      throw error;
    }
    if (!data) return null;

    // Map the database's whitelist projection back onto `preferences` for Zod.
    // `public_prefs` can only ever contain whitelisted keys, so nothing private
    // can arrive here even if this mapping is later widened by mistake.
    const rawData = data as any;
    if (!isSelf) {
      const publicPrefs = rawData.public_prefs ?? {};
      delete rawData.public_prefs;
      rawData.preferences = {};
      for (const key of VISITOR_PREFERENCE_KEYS) {
        if (publicPrefs[key] !== undefined) rawData.preferences[key] = publicPrefs[key];
      }
    }

    // Zod validation at the service boundary.
    // safeParse prevents a single unexpected field from crashing the entire profile.
    const parsed = ProfileUserSchema.safeParse(data);
    if (!parsed.success) {
      logger.warn('[ProfileDataService] fetchProfile schema mismatch:', parsed.error.message);
      // Graceful degradation: return raw data with passthrough rather than crash
      return data as unknown as ValidatedProfileUser;
    }
    return parsed.data;
  },

  /** Every room's count in one call; five counting queries if that call fails. */
  async fetchCounts(targetUser: Pick<ValidatedProfileUser, 'id' | 'tier' | 'role' | 'is_founding'>, isSelf: boolean = false, signal?: AbortSignal) {
    try {
      const { data, error } = await withAbortSignal(
        supabase.rpc('get_profile_counts', { p_user_id: targetUser.id }),
        signal
      );

      const result = Array.isArray(data) ? data[0] : data;
      if (!error && result && typeof result.logs_count === 'number') {

        const counts = result as any;
        return {
          logs: counts.logs_count ?? 0,
          ledger: counts.ledger_count ?? 0,
          watchlist: counts.watchlist_count ?? counts.watch_count ?? 0,
          vault: isArchivistPlusTier(targetUser) ? (counts.vault_count ?? 0) : 0,
          lists: counts.lists_count ?? 0,
          // Live counts; if absent, callers fall back to the profile row's.
          followers: typeof counts.followers_count === 'number' ? counts.followers_count : undefined,
          following: typeof counts.following_count === 'number' ? counts.following_count : undefined,
        };
      }
      logger.info('[ProfileDataService] get_profile_counts RPC unavailable, using fallback');
    } catch {
      // Counted the long way below.
    }
    return this._fetchCountsFallback(targetUser, isSelf, signal);
  },

  /** The counts the long way: five HEAD requests, when get_profile_counts fails. */
  async _fetchCountsFallback(targetUser: Pick<ValidatedProfileUser, 'id' | 'tier' | 'role' | 'is_founding'>, isSelf: boolean = false, signal?: AbortSignal) {

    try {
      let listsQuery = supabase.from('lists').select('id', { count: 'exact', head: true }).eq('user_id', targetUser.id);
      if (!isSelf) {
        listsQuery = listsQuery.eq('is_private', false);
      }

      const [logsCount, ledgerCount, watchCount, vaultCount, listsCount] = await Promise.all([
        withAbortSignal(supabase.from('logs').select('id', { count: 'exact', head: true }).eq('user_id', targetUser.id), signal),
        withAbortSignal(supabase.from('logs').select('id', { count: 'exact', head: true }).eq('user_id', targetUser.id).or('rating.gt.0,review.neq.""'), signal),
        withAbortSignal(supabase.from('watchlists').select('id', { count: 'exact', head: true }).eq('user_id', targetUser.id), signal),
        isArchivistPlusTier(targetUser)
          ? withAbortSignal(supabase.from('physical_archive').select('id', { count: 'exact', head: true }).eq('user_id', targetUser.id), signal)
          : Promise.resolve({ count: 0, error: null }),
        withAbortSignal(listsQuery, signal),
      ]);

      return {
        logs: countRead(logsCount),
        ledger: countRead(ledgerCount),
        watchlist: countRead(watchCount),
        vault: countRead(vaultCount),
        lists: countRead(listsCount),
        followers: undefined as number | undefined,
        following: undefined as number | undefined,
      };
    } catch {
      return UNREAD_COUNTS;
    }
  },

  /** An Auteur's analytics, computed by the database, not from logs sent here. */
  /**
   * The member's record, counted over the WHOLE history by the server: what the
   * honours and the passport are earned from. Every member's (the server alone
   * decides who may read it); a read that fails throws, so a room never draws
   * a record from the logs that happened to load.
   */
  async fetchProfileAnalytics(targetUser: Pick<ValidatedProfileUser, 'id'>, signal?: AbortSignal) {
    const { data, error } = await withAbortSignal(
      supabase.rpc('get_public_profile_analytics', { p_user_id: targetUser.id }),
      signal
    );
    if (error) {
      logger.warn('[ProfileDataService] fetchProfileAnalytics error:', error.message);
      throw error;
    }
    return data;
  },

  /**
   * Another member's logs, a page at a time, by keyset: the cursor is the last
   * row's watched date and id, so a deep scroll never repeats or skips a row.
   */
  async fetchOtherUserLogs(userId: string, limit: number = 50, cursorString?: string, signal?: AbortSignal, options?: { search?: string, titleOnly?: boolean, rating?: LedgerRating, status?: string, hasRatingOrReview?: boolean }): Promise<{ items: ProfileLog[], nextCursor: string | null }> {
    const fetchLimit = limit + 1;
    let query = supabase.from('logs')
      .select(PUBLIC_LOG_COLUMNS)
      .eq('user_id', userId)

    // Server-side search and filtering for paginated ledger and archive.
    // Unquoted on purpose: PostgREST consumes the escape inside a quoted value,
    // so the quoted form left `%` and `_` live as wildcards and let the filter be
    // rewritten. A `null` pattern means the term is only separators.
    if (options?.search) {
      const pattern = buildSearchPattern(options.search);
      if (pattern === null) return { items: [], nextCursor: null };
      // The Ledger's search reaches reviews; the Archive's, titles only (a film
      // found for a word in its review, with no sign why, bewilders).
      query = options.titleOnly
        ? query.ilike('film_title', `%${pattern}%`)
        : query.or(`film_title.ilike.*${pattern}*,review.ilike.*${pattern}*`);
    }
    // `'high'` is a SENTINEL, not a rating — a range, which is the one thing an
    // `.eq()` cannot express. Checked BEFORE the numeric branch, because
    // `.eq('rating', 'high')` would be a 22P02 against an integer column.
    if (options?.rating === 'high') {
      query = query.gte('rating', LEDGER_HIGH_FLOOR);
    } else if (options?.rating !== undefined && options.rating !== 'all') {
      query = query.eq('rating', options.rating);
    }
    if (options?.status && options.status !== 'all') {
      query = query.eq('status', options.status);
    }
    if (options?.hasRatingOrReview) {
      query = query.or('rating.gt.0,review.neq.""');
    }

    query = query.order('watched_date', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(fetchLimit);

    if (cursorString) {
      try {
        const cursor = JSON.parse(cursorString);
        if (cursor.lastId) {
          const safeId = pgLiteral(String(cursor.lastId));
          if (cursor.wasDateNull) {
            query = query.is('watched_date', null).lt('id', cursor.lastId);
          } else if (cursor.lastDate) {
            const safeDate = pgLiteral(String(cursor.lastDate));
            query = query.or(`watched_date.lt.${safeDate},and(watched_date.eq.${safeDate},id.lt.${safeId}),watched_date.is.null`);
          }
        }

      } catch (e) {
        // Fallback or ignore invalid cursor
      }
    }

    const { data, error } = await withAbortSignal(query, signal);
    if (error) {
      logger.warn('[ProfileDataService] fetchOtherUserLogs error:', error.message);
      throw error;
    }
    const rows = (data ?? []) as LogRow[];
    const hasMore = rows.length === fetchLimit;
    const paginatedRows = hasMore ? rows.slice(0, limit) : rows;

    const items = paginatedRows.map(mapLogRow) as ProfileLog[];
    const lastRow = paginatedRows.length > 0 ? paginatedRows[paginatedRows.length - 1] : null;

    const nextCursor = hasMore && lastRow ? JSON.stringify({
      lastDate: lastRow.watched_date,
      lastId: lastRow.id,
      wasDateNull: lastRow.watched_date === null
    }) : null;
    return { items, nextCursor };
  },

  /**
   * Fetches cursor-paginated watchlist for another user's profile.
   */
  async fetchOtherUserWatchlist(userId: string, limit: number = 50, cursor?: string, signal?: AbortSignal, options?: { search?: string, sort?: ShelfSort, decade?: WatchlistDecade }): Promise<{ items: ProfileWatchlistItem[], nextCursor: string | null }> {
    const fetchLimit = limit + 1;
    let query = supabase.from('watchlists')
      .select('id, film_id, film_title, poster_path, year, created_at')
      .eq('user_id', userId)

    // Through the one escaper, which also refuses a term of only separators.
    if (options?.search) {
      const pattern = buildSearchPattern(options.search);
      if (pattern === null) return { items: [], nextCursor: null };
      query = query.ilike('film_title', `%${pattern}%`);
    }

    // A decade is a range, 1990 to 1999; tested as a number, so 0 is not falsy.
    if (typeof options?.decade === 'number' && Number.isFinite(options.decade)) {
      query = query.gte('year', options.decade).lt('year', options.decade + 10);
    }

    // ONE axis for the order, the cursor filter and the cursor handed back:
    // three that disagreed would repeat rows on a deep scroll.
    const axis = sortAxis(options?.sort, 'film_title');
    const asc = axis.direction === 'asc';
    query = query.order(axis.column, { ascending: asc }).order('id', { ascending: asc }).limit(fetchLimit);

    const keyset = keysetFilter(axis.column, parseCursor(cursor), axis.direction);
    if (keyset) query = query.or(keyset);

    const { data, error } = await withAbortSignal(query, signal);
    if (error) {
      logger.warn('[ProfileDataService] fetchOtherUserWatchlist error:', error.message);
      throw error;
    }
    const schema = WatchlistRowSchema.extend({ id: z.union([z.string(), z.coerce.number()]), created_at: z.string() });
    const rawRows = data ?? [];
    const hasMore = rawRows.length === fetchLimit;
    const paginatedRaw = hasMore ? rawRows.slice(0, limit) : rawRows;
    const validRows = parseRowsSafely(schema, paginatedRaw);

    const items = validRows.map(w => ({ id: w.film_id, filmId: w.film_id, title: w.film_title, poster_path: w.poster_path ?? null, year: w.year ?? null }));
    const lastRow = paginatedRaw.length > 0 ? (paginatedRaw[paginatedRaw.length - 1] as any) : null;
    const nextCursor = hasMore && lastRow ? buildCursor(lastRow[axis.column], lastRow.id) : null;
    return { items, nextCursor };
  },

  /**
   * Fetches cursor-paginated vault items for another user's profile.
   */
  async fetchOtherUserVault(targetUser: Pick<ValidatedProfileUser, 'id' | 'tier' | 'role' | 'is_founding'>, limit: number = 50, cursor?: string, signal?: AbortSignal, options?: { filter?: string, sort?: ShelfSort, search?: string }): Promise<{ items: ProfileVaultItem[], nextCursor: string | null }> {

    if (!isArchivistPlusTier(targetUser)) return { items: [], nextCursor: null };

    const fetchLimit = limit + 1;
    let query = supabase.from('physical_archive')
      .select('id, film_id, film_title, poster_path, year, formats, notes, condition, created_at')
      .eq('user_id', targetUser.id)

    // Server-side filtering by physical format
    if (options?.filter && options.filter !== 'all') {
      // physical_archive formats is text[]
      query = query.contains('formats', [options.filter]);
    }

    // Titles AND the member's notes: "the one Dad gave me" is how a disc is found.
    if (options?.search) {
      const pattern = buildSearchPattern(options.search);
      if (pattern === null) return { items: [], nextCursor: null };
      query = query.or(`film_title.ilike.*${pattern}*,notes.ilike.*${pattern}*`);
    }

    // In the order it was filled, or A–Z: the Watchlist's one-axis rule.
    const axis = sortAxis(options?.sort, 'film_title');
    const asc = axis.direction === 'asc';
    query = query.order(axis.column, { ascending: asc })
      .order('id', { ascending: asc })
      .limit(fetchLimit);

    // Through keysetFilter, which quotes a title like `Kill Bill: Vol. 1 "Extended"`.
    const keyset = keysetFilter(axis.column, parseCursor(cursor), axis.direction);
    if (keyset) query = query.or(keyset);

    const { data, error } = await withAbortSignal(query, signal);
    if (error) {
      logger.warn('[ProfileDataService] fetchOtherUserVault error:', error.message);
      throw error;
    }
    const rawRows = data ?? [];
    const hasMore = rawRows.length === fetchLimit;
    const paginatedRaw = hasMore ? rawRows.slice(0, limit) : rawRows;
    const validRows = parseRowsSafely(VaultRowSchema, paginatedRaw);

    const items = validRows.map(v => ({
      id: String(v.id), film_id: v.film_id, filmId: v.film_id, title: v.film_title,
      poster_path: v.poster_path ?? null, year: v.year ?? null,
      formats: v.formats ?? [], notes: v.notes ?? '', condition: v.condition ?? 'good',
      created_at: v.created_at, createdAt: v.created_at,
    }));
    const lastRow = paginatedRaw.length > 0 ? (paginatedRaw[paginatedRaw.length - 1] as any) : null;
    const nextCursor = hasMore && lastRow ? buildCursor(lastRow[axis.column], lastRow.id) : null;
    return { items, nextCursor };
  },

  /**
   * Fetches cursor-paginated lists with their items for another user's profile.
   */
  async fetchOtherUserLists(userId: string, limit: number = 50, cursor?: string, signal?: AbortSignal, options?: { sort?: ShelfSort, search?: string }): Promise<{ items: ProfileList[], nextCursor: string | null }> {
    const fetchLimit = limit + 1;
    const axis = sortAxis(options?.sort, 'title');
    const asc = axis.direction === 'asc';
    // Four posters, and the TRUE size of the stack from an aggregate embed in
    // the same round trip (never the capped array's length). Aggregates are on
    // in this project (checked live); the answer is an ARRAY: `film_count[0].count`.
    let query = supabase.from('lists')
      .select('id, title, description, is_ranked, is_private, created_at, list_items(list_id, film_id, film_title, poster_path), film_count:list_items(count)')
      .eq('user_id', userId)
      .eq('is_private', false)
      .order(axis.column, { ascending: asc })
      .order('id', { ascending: asc })
      // The items keep the member's own sequence, whatever the stacks' order.
      .order('rank_position', { foreignTable: 'list_items', ascending: true })
      .limit(fetchLimit)
      .limit(4, { foreignTable: 'list_items' });

    // Title and description: a stack is named one way and described another.
    if (options?.search) {
      const pattern = buildSearchPattern(options.search);
      if (pattern === null) return { items: [], nextCursor: null };
      query = query.or(`title.ilike.*${pattern}*,description.ilike.*${pattern}*`);
    }

    const keyset = keysetFilter(axis.column, parseCursor(cursor), axis.direction);
    if (keyset) query = query.or(keyset);

    const { data: listsData, error } = await withAbortSignal(query, signal);
    if (error) {
      logger.warn('[ProfileDataService] fetchOtherUserLists error:', error.message);
      throw error;
    }
    const rawRows = listsData ?? [];
    const hasMore = rawRows.length === fetchLimit;
    const paginatedRaw = hasMore ? rawRows.slice(0, limit) : rawRows;
    const validLists = parseRowsSafely(ListRowSchema, paginatedRaw);

    const items = validLists.map(l => ({
      id: l.id,
      title: l.title,
      description: l.description ?? '',
      isRanked: l.is_ranked ?? false,
      isPrivate: l.is_private ?? false,
      createdAt: l.created_at,
      films: l.list_items.map((i) => ({
        id: i.film_id, title: i.film_title, poster: i.poster_path ?? null,
      })),
      // No aggregate: an under-count beats `undefined FILMS`.
      filmCount: (l as { film_count?: { count: number }[] }).film_count?.[0]?.count
        ?? l.list_items.length,
    }));
    const lastRow = paginatedRaw.length > 0 ? (paginatedRaw[paginatedRaw.length - 1] as any) : null;
    const nextCursor = hasMore && lastRow ? buildCursor(lastRow[axis.column], lastRow.id) : null;
    return { items, nextCursor };
  },

  /**
   * Fetches cursor-paginated analytics logs (for projector/calendar views).
   */
    async fetchAnalyticsBatch(
      targetUser: Pick<ValidatedProfileUser, 'id' | 'tier' | 'role' | 'is_founding'>,
      batchSize: number,
      cursor: { lastDate: string | null; lastId: string | null; wasDateNull?: boolean },
      signal?: AbortSignal
    ) {

      if (!isAuteurPlusTier(targetUser)) return [];

      let query = withAbortSignal(
        supabase.from('logs')
          .select('id, film_id, film_title, poster_path, year, rating, status, watched_date, created_at, physical_media, is_autopsied, autopsy')
          .eq('user_id', targetUser.id)
          .order('watched_date', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false })
          .limit(batchSize),
        signal
      );

      if (cursor.lastId) {
        const safeId = pgLiteral(String(cursor.lastId));
        if (cursor.wasDateNull) {
          query = query.is('watched_date', null).lt('id', cursor.lastId);
        } else if (cursor.lastDate) {
          const safeDate = pgLiteral(String(cursor.lastDate));
          query = query.or(`watched_date.lt.${safeDate},and(watched_date.eq.${safeDate},id.lt.${safeId}),watched_date.is.null`);
        }
      }

    const { data, error } = await query;
    if (error) {
      logger.warn('[ProfileDataService] analytics batch error:', error.message);
      throw error;
    }
    return (data ?? []) as z.infer<typeof AnalyticsRowSchema>[];
  },

  /** The whole history for analytics, in batches of 1,000, validated, capped at 10,000. */
  async fetchAnalyticsLogs(targetUser: Pick<ValidatedProfileUser, 'id' | 'tier' | 'role' | 'is_founding'>, isSelf: boolean, signal?: AbortSignal): Promise<ProfileLog[]> {
    if (!isSelf && !isAuteurPlusTier(targetUser)) return [];

    const BATCH_SIZE = 1000;
    const MAX_ROWS = 10_000;
    const allRows: z.infer<typeof AnalyticsRowSchema>[] = [];

    // Timed on members' phones (Sentry): a long history is the slowest read a profile makes.
    const read = await Sentry.startSpan({ name: 'profile.analytics', op: 'db.query' }, async (span) => {
      let cursor: { lastDate: string | null; lastId: string | null; wasDateNull?: boolean } = { lastDate: null, lastId: null, wasDateNull: false };
      let hasMore = true;
      while (hasMore) {
        if (signal?.aborted) return false;

        const batch = await this.fetchAnalyticsBatch(targetUser, BATCH_SIZE, cursor, signal);
        const validBatch = parseRowsSafely(AnalyticsRowSchema, batch);

        // A breath for the JS thread after parsing 1,000 rows, so frames keep coming.
        await new Promise(r => setTimeout(r, 0));

        if (validBatch.length < batch.length) {
          logger.warn(`[ProfileDataService] Dropped ${batch.length - validBatch.length} invalid analytics logs`);
        }
        allRows.push(...validBatch);

        if (batch.length < BATCH_SIZE || allRows.length >= MAX_ROWS) {
          hasMore = false;
        } else {
          const lastRaw = batch[batch.length - 1];
          cursor = {
            lastDate: lastRaw.watched_date ?? null,
            lastId: String(lastRaw.id),
            wasDateNull: lastRaw.watched_date == null,
          };
        }
      }
      span.setAttribute('rows', allRows.length);
      return true;
    });
    if (!read) return [];

    return allRows.slice(0, MAX_ROWS).map(l => ({
      id: String(l.id),
      filmId: l.film_id,
      title: l.film_title ?? '',
      poster: l.poster_path ?? null,
      year: l.year ?? null,
      rating: l.rating ?? 0,
      status: l.status ?? 'watched',
      watchedDate: l.watched_date ?? null,
      physicalMedia: l.physical_media ?? null,
      createdAt: l.created_at,
      review: null,
      pullQuote: '',
      altPoster: null,
      watchedWith: null,
      abandonedReason: null,
      isAutopsied: l.is_autopsied ?? false,
      autopsy: l.autopsy ?? null
    }));
  },

  /** A member's analytics, summed by the database (~2KB, not every log); null if refused. */
  async fetchAnalyticsSummary(targetUser: Pick<ValidatedProfileUser, 'id' | 'tier' | 'role' | 'is_founding'>, signal?: AbortSignal) {
    try {
      const { data, error } = await withAbortSignal(
        supabase.rpc('get_user_analytics', { p_user_id: targetUser.id }),
        signal
      );
      if (!error && data) {
        const shape = data as AnalyticsShape;
        // A refusal is `{ error: 'forbidden' }`, not a throw: never data (0 films).
        if (shape?.error) return null;
        return shape;
      }
      logger.info('[ProfileDataService] get_user_analytics RPC unavailable');
    } catch {
      // Nothing: the caller falls back to fetchAnalyticsLogs.
    }
    return null;
  },

  /**
   * A member's taste over their WHOLE archive, in one ~2KB call however many
   * films. It reports its own coverage (`films_total`, `films_known`), as the
   * films table fills in over time and the screen says what it rests on.
   */
  /**
   * Genres, actors and directors over the member's WHOLE archive. Null when the
   * viewer may not read it (a refusal is not an empty taste); a read that fails
   * throws, so its room says so rather than looking unread.
   */
  async fetchTasteProfile(targetUser: Pick<ValidatedProfileUser, 'id'>, signal?: AbortSignal): Promise<TasteProfile | null> {
    const { data, error } = await withAbortSignal(
      supabase.rpc('get_taste_profile', { p_user_id: targetUser.id }),
      signal
    );
    if (error) {
      logger.warn('[ProfileDataService] get_taste_profile error:', error.message);
      throw error;
    }
    const shape = data as TasteProfile & { error?: string };
    if (!shape || shape.error) return null;
    return shape;
  },

  /**
   * "Read whatever films are outstanding", fire and forget: it drains the
   * whole backlog, so a lost ping costs nothing; the next, from anyone, catches up.
   */
  pingFilmSync(): void {
    try {
      void supabase.functions.invoke('sync-films').catch(() => { /* best effort */ });
    } catch {
      /* never let a background nicety reach the member */
    }
  },

  /**
   * The calendar's three columns, for every member (their logs, under the
   * same visibility as every room). Bounded by the 52 weeks the grid DRAWS
   * (NitrateCalendarGrid's WEEKS), not a row count; past 5,000 logs in a year
   * every cell is already full, so the limit is only a backstop.
   */
  async fetchCalendarData(targetUser: Pick<ValidatedProfileUser, 'id'>, signal?: AbortSignal): Promise<{ date: string; rating: number; status: string }[]> {
    const CALENDAR_WEEKS = 52;
    const from = new Date();
    from.setDate(from.getDate() - (CALENDAR_WEEKS * 7 + 7));   // a week of slack for timezone edges
    const fromKey = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;

    const { data, error } = await withAbortSignal(
      supabase.from('logs')
        .select('watched_date, rating, status')
        .eq('user_id', targetUser.id)
        .not('watched_date', 'is', null)
        .gte('watched_date', fromKey)
        .order('watched_date', { ascending: false })
        .limit(5000),
      signal
    );
    if (error) {
      logger.warn('[ProfileDataService] calendar data error:', error.message);
      throw error;
    }
    return (data ?? []).map(r => ({
      date: r.watched_date,
      rating: r.rating ?? 0,
      status: r.status ?? 'watched',
    }));
  },
};

/**
 * ProfileDataService — Service-layer boundary for profile data fetching.
 * ────────────────────────────────────────────────────────────────────────
 * Extracts 12 raw Supabase queries from useProfileData.ts
 * into a typed, validated service layer with Sentry observability.
 *
 * Uses PUBLIC_PROFILE_COLUMNS when fetching other users'
 * profiles to avoid leaking preferences (oracle_persona, notify settings).
 *
 * All queries pass through logger on error for production observability.
 */

import { z } from 'zod';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';
import { withAbortSignal } from '../utils/withAbortSignal';
import { mapLogRow, PUBLIC_LOG_COLUMNS } from '../utils/mappers';
import type { LogRow } from '../utils/mappers';
import type { ProfileLog, ProfileWatchlistItem, ProfileVaultItem, ProfileList } from '../types';
import { ProfileUserSchema, type ValidatedProfileUser } from '../schemas/profile.schema';
import { isArchivistPlusTier, isAuteurPlusTier } from '../utils/tier';
import { escapeSearchPattern } from '../utils/escapeSearchPattern';

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

/**
 * Full profile columns — ONLY for self-profile queries.
 * @see {@link ../profileService.ts#PROFILE_SELECT_COLUMNS} for the auth-bootstrap column set.
 * When adding a new profile column, check if it also needs to be in PROFILE_SELECT_COLUMNS.
 */
export const SELF_PROFILE_COLUMNS = 'id, username, avatar_url, display_name, bio, role, tier, is_founding, persona, is_social_private, followers_count, following_count, favorite_films, preferences, created_at, social_links, member_no' as const;

/** Public profile columns — excludes `preferences` to prevent
 *  leaking user settings (oracle_persona, notification prefs, etc.) to other users.
 *
 *  Reads `public_prefs`, a database-side WHITELIST projection of `preferences`
 *  (see supabase/migrations/20260731_08_public_prefs_projection.sql). This used to
 *  select `programmes:preferences->programmes` and friends, but a JSONB path read
 *  still requires column-level SELECT on `preferences` — so the old form kept the
 *  raw settings blob readable by anyone, including logged-out visitors. The
 *  projection is enforced by the database, not by this string.
 *
 *  @see {@link ../profileService.ts#PROFILE_SELECT_COLUMNS} for the auth-bootstrap column set.
 */
export const PUBLIC_PROFILE_COLUMNS = 'id, username, avatar_url, display_name, bio, role, tier, is_founding, persona, is_social_private, followers_count, following_count, favorite_films, created_at, social_links, member_no, public_prefs' as const;

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
 * Embedded list items, validated WITHOUT ever risking the parent list.
 *
 * parseRowsSafely drops a whole row when its schema fails, so a plain
 * `z.array(ListItemRowSchema)` would erase an entire list from a member's
 * public profile because of one bad item. Instead each item is caught
 * individually and a bad one becomes null, then the nulls are filtered out.
 * A missing, null, or non-array value collapses to []. The list itself
 * always survives.
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
      if (publicPrefs.programmes !== undefined) {
        rawData.preferences.programmes = publicPrefs.programmes;
      }
      if (publicPrefs.favorites !== undefined) {
        rawData.preferences.favorites = publicPrefs.favorites;
      }
      if (publicPrefs.hide_stats !== undefined) {
        // Ensure a true boolean mapping from postgres JSON scaler
        rawData.preferences.hide_stats = publicPrefs.hide_stats === true || publicPrefs.hide_stats === 'true';
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

  /**
   * Fetches all tab counts via server-side RPC (single round-trip).
   * Falls back to 5 parallel HEAD requests if the RPC isn't deployed.
   * BLOCK4-COUNTS: 5 requests → 1 request per profile view.
   */
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
          // Live follower/following counts (added to the RPC in the counts migration).
          // Undefined until that migration lands — callers fall back to the profile row.
          followers: typeof counts.followers_count === 'number' ? counts.followers_count : undefined,
          following: typeof counts.following_count === 'number' ? counts.following_count : undefined,
        };
      }
      // RPC not deployed — fallback to parallel queries
      logger.info('[ProfileDataService] get_profile_counts RPC unavailable, using fallback');
    } catch {
      // RPC not deployed — fallback
    }
    return this._fetchCountsFallback(targetUser, isSelf, signal);
  },

  /**
   * Fallback: 5 parallel HEAD requests for tab counts.
   * Used when the get_profile_counts RPC hasn't been deployed yet.
   */
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
          : Promise.resolve({ count: 0 }),
        withAbortSignal(listsQuery, signal),
      ]);

      return {
        logs: logsCount.count ?? 0,
        ledger: ledgerCount.count ?? 0,
        watchlist: watchCount.count ?? 0,
        vault: vaultCount.count ?? 0,
        lists: listsCount.count ?? 0,
        followers: undefined as number | undefined,
        following: undefined as number | undefined,
      };
    } catch {
      return { logs: 0, ledger: 0, watchlist: 0, vault: 0, lists: 0, followers: undefined as number | undefined, following: undefined as number | undefined };
    }
  },

  /**
   * Phase 3: Fetches pre-computed Analytics directly from PostgreSQL RPC.
   * Eliminates the need to download thousands of logs to the client.
   */
  async fetchProfileAnalytics(targetUser: Pick<ValidatedProfileUser, 'id' | 'tier' | 'role' | 'is_founding'>, signal?: AbortSignal) {
    
    if (!isAuteurPlusTier(targetUser)) return null;
    
    try {
      const { data, error } = await withAbortSignal(
        supabase.rpc('get_public_profile_analytics', { p_user_id: targetUser.id }),
        signal
      );
      
      if (error) {
        logger.warn('[ProfileDataService] fetchProfileAnalytics error:', error.message);
        return null;
      }
      return data;
    } catch (e: any) {
      logger.warn('[ProfileDataService] fetchProfileAnalytics crash:', e.message);
      return null;
    }
  },

  /**
   * Fetches cursor-paginated logs for another user's profile.
   * Cursor-based keyset pagination replaces offset .range().
   * Compound cursor format: "created_at|id" for deterministic deep-scroll ordering.
   */
  async fetchOtherUserLogs(userId: string, limit: number = 50, cursorString?: string, signal?: AbortSignal, options?: { search?: string, rating?: number | 'all', status?: string, hasRatingOrReview?: boolean }): Promise<{ items: ProfileLog[], nextCursor: string | null }> {
    const fetchLimit = limit + 1;
    let query = supabase.from('logs')
      .select(PUBLIC_LOG_COLUMNS)
      .eq('user_id', userId)

    // Server-side search and filtering for paginated ledger and archive
    if (options?.search) {
      // escapeSearchPattern handles both LIKE metacharacters (%, _, \)
      // and PostgREST CSV double-quote escaping in a single pass.
      const safeSearch = escapeSearchPattern(options.search);
      query = query.or(`film_title.ilike."%${safeSearch}%",review.ilike."%${safeSearch}%"`);
    }
    if (options?.rating !== undefined && options.rating !== 'all') {
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
          const safeId = /^\d+$/.test(String(cursor.lastId)) ? cursor.lastId : `"${cursor.lastId}"`;
          if (cursor.wasDateNull) {
            query = query.is('watched_date', null).lt('id', cursor.lastId);
          } else if (cursor.lastDate) {
            const safeDate = String(cursor.lastDate).replace(/"/g, '""');
            query = query.or(`watched_date.lt."${safeDate}",and(watched_date.eq."${safeDate}",id.lt.${safeId}),watched_date.is.null`);
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
  async fetchOtherUserWatchlist(userId: string, limit: number = 50, cursor?: string, signal?: AbortSignal, options?: { search?: string, sort?: 'default' | 'az' | 'za' }): Promise<{ items: ProfileWatchlistItem[], nextCursor: string | null }> {
    const fetchLimit = limit + 1;
    let query = supabase.from('watchlists')
      .select('id, film_id, film_title, poster_path, year, created_at')
      .eq('user_id', userId)

    // Server-side search and multi-axis sorting
    if (options?.search) {
      query = query.ilike('film_title', `%${escapeSearchPattern(options.search)}%`);
    }

    if (options?.sort === 'az') {
      query = query.order('film_title', { ascending: true }).order('id', { ascending: true });
    } else if (options?.sort === 'za') {
      query = query.order('film_title', { ascending: false }).order('id', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false }).order('id', { ascending: false });
    }
    
    query = query.limit(fetchLimit);

    if (cursor) {
      const parts = cursor.split('|');
      if (parts.length >= 2) {
        // Multi-axis cursor parser for A-Z, Z-A, and chronological sorts
        const primaryCursor = parts.slice(0, -1).join('|'); // film_title or created_at
        const cursorId = parts[parts.length - 1];
        const safeId = /^\d+$/.test(String(cursorId)) ? cursorId : `"${cursorId}"`;
        const safePrimary = primaryCursor.includes('"') || primaryCursor.includes("'") ? `"${primaryCursor.replace(/"/g, '""')}"` : `"${primaryCursor}"`;
        
        if (options?.sort === 'az') {
          query = query.or(`film_title.gt.${safePrimary},and(film_title.eq.${safePrimary},id.gt.${safeId})`);
        } else if (options?.sort === 'za') {
          query = query.or(`film_title.lt.${safePrimary},and(film_title.eq.${safePrimary},id.lt.${safeId})`);
        } else {
          query = query.or(`created_at.lt.${safePrimary},and(created_at.eq.${safePrimary},id.lt.${safeId})`);
        }
      }
    }

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
    let nextCursor = null;
    if (hasMore && lastRow) {
      if (options?.sort === 'az' || options?.sort === 'za') {
        nextCursor = `${lastRow.film_title || ''}|${lastRow.id}`;
      } else {
        nextCursor = `${lastRow.created_at || ''}|${lastRow.id}`;
      }
    }
    return { items, nextCursor };
  },

  /**
   * Fetches cursor-paginated vault items for another user's profile.
   */
  async fetchOtherUserVault(targetUser: Pick<ValidatedProfileUser, 'id' | 'tier' | 'role' | 'is_founding'>, limit: number = 50, cursor?: string, signal?: AbortSignal, options?: { filter?: string }): Promise<{ items: ProfileVaultItem[], nextCursor: string | null }> {
    
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

    query = query.order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(fetchLimit);

    if (cursor) {
      const [cursorDate, cursorId] = cursor.split('|');
      if (cursorDate && cursorId) {
        const safeId = /^\d+$/.test(String(cursorId)) ? cursorId : `"${cursorId}"`;
        query = query.or(`created_at.lt."${cursorDate}",and(created_at.eq."${cursorDate}",id.lt.${safeId})`);
      }
    }

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
    const nextCursor = hasMore && lastRow ? `${lastRow.created_at || ''}|${lastRow.id}` : null;
    return { items, nextCursor };
  },

  /**
   * Fetches cursor-paginated lists with their items for another user's profile.
   */
  async fetchOtherUserLists(userId: string, limit: number = 50, cursor?: string, signal?: AbortSignal): Promise<{ items: ProfileList[], nextCursor: string | null }> {
    const fetchLimit = limit + 1;
    let query = supabase.from('lists')
      .select('id, title, description, is_ranked, is_private, created_at, list_items(list_id, film_id, film_title, poster_path)')
      .eq('user_id', userId)
      .eq('is_private', false)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .order('rank_position', { foreignTable: 'list_items', ascending: true })
      .limit(fetchLimit)
      .limit(4, { foreignTable: 'list_items' });

    if (cursor) {
      const [cursorDate, cursorId] = cursor.split('|');
      if (cursorDate && cursorId) {
        const safeId = /^\d+$/.test(String(cursorId)) ? cursorId : `"${cursorId}"`;
        query = query.or(`created_at.lt."${cursorDate}",and(created_at.eq."${cursorDate}",id.lt.${safeId})`);
      }
    }

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
    }));
    const lastRow = paginatedRaw.length > 0 ? (paginatedRaw[paginatedRaw.length - 1] as any) : null;
    const nextCursor = hasMore && lastRow ? `${lastRow.created_at || ''}|${lastRow.id}` : null;
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
        const safeId = /^\d+$/.test(String(cursor.lastId)) ? cursor.lastId : `"${cursor.lastId}"`;
        if (cursor.wasDateNull) {
          query = query.is('watched_date', null).lt('id', cursor.lastId);
        } else if (cursor.lastDate) {
          const safeDate = String(cursor.lastDate).replace(/"/g, '""');
          query = query.or(`watched_date.lt."${safeDate}",and(watched_date.eq."${safeDate}",id.lt.${safeId}),watched_date.is.null`);
        }
      }

    const { data, error } = await query;
    if (error) {
      logger.warn('[ProfileDataService] analytics batch error:', error.message);
      throw error;
    }
    return (data ?? []) as z.infer<typeof AnalyticsRowSchema>[];
  },

  /**
   * Orchestrates cursor-paginated analytics log retrieval.
   * Composes fetchAnalyticsBatch() with Zod validation, 10K safety cap,
   * and ProfileLog mapping. Replaces the broken inline code in useProfileData.ts
   * that referenced unimported symbols (supabase, withAbortSignal).
   */
    async fetchAnalyticsLogs(targetUser: Pick<ValidatedProfileUser, 'id' | 'tier' | 'role' | 'is_founding'>, isSelf: boolean, signal?: AbortSignal): Promise<ProfileLog[]> {
      
      if (!isSelf && !isAuteurPlusTier(targetUser)) return [];

      const BATCH_SIZE = 1000;
      const MAX_ROWS = 10_000;
      const allRows: z.infer<typeof AnalyticsRowSchema>[] = [];
      let cursor: { lastDate: string | null; lastId: string | null; wasDateNull?: boolean } = { lastDate: null, lastId: null, wasDateNull: false };
      let hasMore = true;
    const fetchStart = Date.now(); // Performance timing

    while (hasMore) {
      if (signal?.aborted) return [];

      const batch = await this.fetchAnalyticsBatch(targetUser, BATCH_SIZE, cursor, signal);

      const validBatch = parseRowsSafely(AnalyticsRowSchema, batch);
      
      // Yield to the React Native JS event loop after synchronous parsing 
      // of 1,000 objects. This prevents frame drops and maintains 60fps scrolling.
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
            wasDateNull: lastRaw.watched_date == null 
          };
        }
    }

    // Sentry breadcrumb for slow analytics fetches — enables diagnosis
    // of constrained-network performance issues without active user reports.
    const durationMs = Date.now() - fetchStart;
    if (durationMs > 2000 || allRows.length > 1000) {
      logger.info(`[ProfileDataService] analytics_fetch: ${allRows.length} rows in ${durationMs}ms`);
    }

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

  /**
   * BLOCK4-ANALYTICS: Server-side pre-aggregated analytics via RPC.
   * Returns ~2KB of JSON instead of downloading ALL log rows (~2.5MB).
   * Falls back to full fetchAnalyticsLogs if RPC not deployed.
   */
  async fetchAnalyticsSummary(targetUser: Pick<ValidatedProfileUser, 'id' | 'tier' | 'role' | 'is_founding'>, signal?: AbortSignal) {
    try {
      const { data, error } = await withAbortSignal(
        supabase.rpc('get_user_analytics', { p_user_id: targetUser.id }),
        signal
      );
      if (!error && data) {
        return data as {
          total_logs: number;
          avg_rating: number;
          rating_distribution: { rating: number; count: number }[];
          monthly_activity: { month: string; count: number }[];
          current_streak: number;
          longest_streak: number;
          format_breakdown: { format: string; count: number }[];
        };
      }
      logger.info('[ProfileDataService] get_user_analytics RPC unavailable');
    } catch {
      // RPC not deployed — caller should fall back to fetchAnalyticsLogs
    }
    return null;
  },

  /**
   * BLOCK4-CALENDAR: Lightweight calendar heatmap data.
   * Returns only 3 columns (date, rating, status) instead of 10.
   * Max 2000 rows for 5.5 years of daily viewing.
   */
  async fetchCalendarData(targetUser: Pick<ValidatedProfileUser, 'id' | 'tier' | 'role' | 'is_founding'>, signal?: AbortSignal): Promise<{ date: string; rating: number; status: string }[]> {
    
    if (!isArchivistPlusTier(targetUser)) return [];

    const { data, error } = await withAbortSignal(
      supabase.from('logs')
        .select('watched_date, rating, status')
        .eq('user_id', targetUser.id)
        .not('watched_date', 'is', null)
        .order('watched_date', { ascending: false })
        .limit(2000),
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

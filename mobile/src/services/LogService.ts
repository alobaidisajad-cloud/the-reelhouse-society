import { captureError } from '@/src/lib/sentry';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { logger } from '@/src/utils/logger';
import { PUBLIC_LOG_COLUMNS } from '@/src/utils/mappers';
import { resolveTier } from '@/src/utils/tier';
import { validateWithTelemetry } from '@/src/utils/validateWithTelemetry';
import { withAbortSignal } from '@/src/utils/withAbortSignal';
import { sanitizeInput } from '@/src/utils/sanitizeInput';
import { z } from 'zod';
 
import { getOfflineQueue } from '@/src/utils/offlineQueue';

/**
 * How many ids may go into one `.in(...)` lookup.
 *
 * The ids are carried in the request URL, and the request fails outright once
 * the whole URL passes roughly 13.8KB — measured against production: 300 uuids
 * succeed, 400 do not, and the same 300 fail once 2KB of other filters are
 * added. The budget is the URL, not the id count, so this is set well below the
 * boundary to leave room for whatever else a query carries.
 */
const PROFILE_LOOKUP_BATCH = 200;

/**
 * Critiques fetched per log.
 *
 * ── WHY 100 AND NOT THE DOSSIER'S 30 ────────────────────────────────────────
 * The dossier screen pairs a 30-row page with a "LOAD EARLIER · N MORE" control,
 * so nothing it bounds is ever unreachable. This screen has the bounded page and
 * the honest total but NOT that control yet — so at 30 a member would correctly
 * be told there are 45 critiques while 15 of them could not be reached. Trading
 * an unbounded query for hidden comments is the same defect wearing a hat.
 *
 * 100 closes the actual defect — the query is bounded — while putting the
 * unreachable case far beyond anything that exists (the largest thread in the
 * database is ONE comment). When a thread approaches this, the fix is the
 * dossier's control, not a bigger number; the total already travels beside the
 * page, which is the hard half.
 */
const COMMENT_PAGE_SIZE = 100;

const LogCommentPayloadSchema = z.object({
  id: z.string().uuid(),
  log_id: z.string().uuid(),
  user_id: z.string().uuid(),
  body: z.string().min(1),
});

// Strict coercion boundary for native layout safety
const AutopsySchema = z.preprocess(
  (val) => {
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return null; }
    }
    return val;
  },
  z.object({
    story: z.number().optional(),
    screenplay: z.number().optional(),
    script: z.number().optional(),
    acting: z.number().optional(),
    direction: z.number().optional(),
    cinematography: z.number().optional(),
    editing: z.number().optional(),
    pacing: z.number().optional(),
    sound: z.number().optional(),
  }).catch(null as any).nullable().optional()
);

// ── Zod schemas for read-path boundary validation ──────────────────
// Ensures Supabase schema changes don't silently inject malformed data into the UI.

const LogDetailProfileSchema = z.object({
  username: z.string(),
  avatar_url: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
}).nullable().optional();

const LogDetailSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  film_id: z.coerce.number(),
  film_title: z.string().nullable().optional(),
  poster_path: z.string().nullable().optional(),
  year: z.coerce.number().nullable().optional(),
  rating: z.coerce.number().nullable().optional(),
  review: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  watched_date: z.string().nullable().optional(),
  is_spoiler: z.boolean().nullable().optional(),
  watched_with: z.string().nullable().optional(),
  private_notes: z.string().nullable().optional(),
  abandoned_reason: z.string().nullable().optional(),
  physical_media: z.string().nullable().optional(),
  is_autopsied: z.boolean().nullable().optional(),
  autopsy: AutopsySchema,
  alt_poster: z.string().nullable().optional(),
  editorial_header: z.string().nullable().optional(),
  drop_cap: z.boolean().nullable().optional(),
  pull_quote: z.string().nullable().optional(),
  video_url: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  created_at: z.string(),
  view_count: z.number().nullable().optional(),
  viewing_history: z.unknown().nullable().optional(),
  profiles: z.union([LogDetailProfileSchema, z.array(LogDetailProfileSchema)]).nullable().optional(),
});

const LogCommentSchema = z.object({
  id: z.string(),
  log_id: z.string(),
  user_id: z.string(),
  body: z.string(),
  created_at: z.string(),
  profiles: z.union([
    z.object({ username: z.string(), avatar_url: z.string().nullable().optional(), display_name: z.string().nullable().optional() }),
    z.array(z.object({ username: z.string(), avatar_url: z.string().nullable().optional(), display_name: z.string().nullable().optional() })),
  ]).nullable().optional(),
});

export const LogService = {
  /** AbortSignal support for screen unmount cancellation. */
  async getLogDetails(logId: string, signal?: AbortSignal) {
    const currentUserId = useAuthStore.getState().user?.id;
    const queue = getOfflineQueue();

    // 1. Pending Removes check
    const isPendingRemove = queue.some((q) => q.type === 'remove_log' && q.payload.log_id === logId);
    if (isPendingRemove) {
        throw new Error('Log not found');
    }

    let query = supabase
      .from('logs')
      .select(`${PUBLIC_LOG_COLUMNS}, profiles!logs_user_id_fkey(username, avatar_url, role, display_name, member_no)`)
      .eq('id', logId)
      .maybeSingle();

    query = withAbortSignal(query, signal);
    let { data, error } = await query;

    // 2. Handle Offline Creations (Prevent 404 crashes)
    let logData: any = data;
    if (error || !logData) {
        const pendingAdd = queue.find((q) => (q.type === 'add_log' || q.type === 'mark_watched') && q.payload.id === logId);
        if (pendingAdd) {
            logData = { ...pendingAdd.payload };
            if (currentUserId) {
                const user = useAuthStore.getState().user;
                if (user) {
                    logData.profiles = {
                        username: user.username,
                        avatar_url: user.avatar_url,
                        role: resolveTier(user),
                        display_name: user.display_name
                    };
                }
            }
            error = null;
        } else {
            if (error) throw error;
            throw new Error('Log not found');
        }
    }

    if (logData) {
        // 3. Apply pending offline updates FIRST
        let hasOfflinePrivateNotesUpdate = false;
        const pendingUpdates = queue.filter((q) => q.type === 'update_log' && q.payload.id === logId);
        for (const up of pendingUpdates) {
            logData = { ...logData, ...(up.payload.updates as any) };
            if ('private_notes' in (up.payload.updates as any)) {
                hasOfflinePrivateNotesUpdate = true;
            }
        }

        // 4. Multi-device sync trap resolution for private_notes
        if (currentUserId && logData.user_id === currentUserId) {
            if (!hasOfflinePrivateNotesUpdate && logData.private_notes === undefined) {
                let privQuery = supabase.from('logs').select('private_notes').eq('id', logId).maybeSingle();
                privQuery = withAbortSignal(privQuery, signal);
                const { data: priv } = await privQuery;
                logData.private_notes = priv?.private_notes ?? null;
            }
        }
    }

    // Validate response shape — logs structured warning on mismatch
    // Production observability via Sentry on schema drift
    const parsed = LogDetailSchema.safeParse(logData);
    if (!parsed.success) {
      logger.warn('[LogService.getLogDetails] Schema mismatch:', parsed.error.message);
      if (!__DEV__) captureError(new Error(`[LogService] Schema drift: ${parsed.error.issues[0]?.path.join('.')}`));
    }
    return logData;
  },

  /**
   * One page of a log's critiques, newest-first on the wire, oldest-first for
   * display — plus the TRUE total.
   *
   * ── WHY NOT JUST `.limit(50)` ────────────────────────────────────────────────
   * The fetch was unbounded. The obvious fix is a limit, and the obvious limit is
   * wrong twice over:
   *   • the order is ASCENDING, so `.limit(50)` keeps the OLDEST fifty and hides
   *     the newest — including a comment the member just posted.
   *   • the header renders `CRITIQUES (${comments.length})`, so a bounded array
   *     would print a wrong number the moment a thread exceeds the bound.
   * So this asks for the newest page, reverses it for display, and carries a
   * server-side total that does not shrink with the page. Same shape the dossier
   * screen already uses.
   */
  async getLogComments(logId: string, signal?: AbortSignal, limit: number = COMMENT_PAGE_SIZE) {
    let query = supabase
      .from('log_comments')
      .select('id, log_id, user_id, body, created_at')
      .eq('log_id', logId)
      // Newest first ON THE WIRE so the bound keeps the most recent, then
      // reversed below — the screen reads oldest-first.
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);

    query = withAbortSignal(query, signal);
    const [{ data: newestFirst, error }, totalRes] = await Promise.all([
      query,
      supabase
        .from('log_comments')
        .select('id', { count: 'exact', head: true })
        .eq('log_id', logId),
    ]);

    if (error) throw error;
    if (totalRes.error) {
      logger.warn('[LogService.getLogComments] total failed:', totalRes.error.message);
    }
    const total = totalRes.error ? (newestFirst?.length ?? 0) : (totalRes.count ?? 0);
    if (!newestFirst || newestFirst.length === 0) return { comments: [], total };

    const comments = [...newestFirst].reverse();

    // DataLoader pattern: fetch profiles manually to bypass the missing DB foreign
    // key. `log_comments` genuinely has no link to `profiles` — probed live, the
    // embed returns PGRST200 — so this lookup cannot be replaced by a join.
    //
    // It IS batched, because the ids travel in the request URL and the request
    // fails outright past roughly 350 of them (measured: 300 succeed, 400 do
    // not). The page above is now bounded, so this can no longer be exceeded in
    // one go — the batching stays because the bound is a page size, not a law.
    const userIds = [...new Set(comments.map(c => c.user_id))];
    const profileMap: Record<string, any> = {};
    for (let i = 0; i < userIds.length; i += PROFILE_LOOKUP_BATCH) {
      const batch = userIds.slice(i, i + PROFILE_LOOKUP_BATCH);
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, display_name')
        .in('id', batch);
      if (profileError) {
        // Names are decoration here — the words still render. Never silent.
        logger.warn('[LogService.getLogComments] profile batch failed:', profileError.message);
        continue;
      }
      for (const profile of profiles ?? []) {
        profileMap[profile.id] = { username: profile.username, avatar_url: profile.avatar_url, display_name: profile.display_name };
      }
    }

    const data = comments.map(c => ({
      ...c,
      profiles: profileMap[c.user_id] || { username: 'unknown', avatar_url: null, display_name: null }
    }));

    // Validate each comment row
    const { valid } = validateWithTelemetry({
      schema: LogCommentSchema,
      context: 'LogService.getLogComments',
      data,
    });
    return { comments: valid, total };
  },

  async addLogComment(payload: unknown) {
    const safePayload = LogCommentPayloadSchema.parse(payload);
    // COMP-1: sanitize at the service boundary so the ONLINE path matches the
    // offline mutationExecutor (`sanitizeInput(body, 'logComment')`) - one choke point.
    // log_comments.username is NOT NULL and no trigger populates it — inject the
    // current user's username (denormalized column; display uses the profiles join).
    const username = useAuthStore.getState().user?.username ?? 'anonymous';
    const sanitized = { ...safePayload, username, body: sanitizeInput(safePayload.body, 'logComment') };

    const { data: commentData, error } = await supabase
      .from('log_comments')
      .upsert(sanitized, { onConflict: 'id' })
      // Explicit columns replace select('*') - prevents payload bloat
      .select('id, log_id, user_id, body, created_at')
      .maybeSingle();

    if (error) throw error;
    if (!commentData) throw new Error('Failed to add comment');

    // DataLoader pattern: Fetch profile manually to bypass missing DB Foreign Key
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, avatar_url, display_name')
      .eq('id', commentData.user_id)
      .maybeSingle();

    return {
      ...commentData,
      profiles: profile || { username: 'unknown', avatar_url: null, display_name: null }
    };
  },

  /** Defense-in-depth user ownership guard on comment deletion. */
  async deleteLogComment(commentId: string) {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) throw new Error('Authentication required');
    const { error } = await supabase
      .from('log_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', userId);

    if (error) throw error;
  }
};

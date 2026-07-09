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

  async getLogComments(logId: string, signal?: AbortSignal) {
    let query = supabase
      .from('log_comments')
      .select('id, log_id, user_id, body, created_at')
      .eq('log_id', logId)
      .order('created_at', { ascending: true });

    query = withAbortSignal(query, signal);
    const { data: comments, error } = await query;

    if (error) throw error;
    if (!comments || comments.length === 0) return [];

    // DataLoader pattern: Fetch profiles manually to bypass missing DB Foreign Key
    const userIds = [...new Set(comments.map(c => c.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, display_name')
      .in('id', userIds);

    const profileMap = (profiles || []).reduce((acc, profile) => {
      acc[profile.id] = { username: profile.username, avatar_url: profile.avatar_url, display_name: profile.display_name };
      return acc;
    }, {} as Record<string, any>);

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
    return valid;
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

import { supabase } from '@/src/lib/supabase';
import { z } from 'zod';
import { logger } from '@/src/utils/logger';
import { sanitizeInput } from '@/src/utils/sanitizeInput';

const CommentPayloadSchema = z.object({
  list_id: z.string().uuid(),
  user_id: z.string().uuid(),
  content: z.string().min(1),
});

// ── Zod schemas for read-path boundary validation ──────────────────

const StackDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  user_id: z.string(),
  is_private: z.boolean().nullable().optional(),
  is_ranked: z.boolean().nullable().optional(),
  created_at: z.string(),
  profiles: z.union([
    z.object({ username: z.string() }),
    z.array(z.object({ username: z.string() })),
  ]).nullable().optional(),
});

const StackItemSchema = z.object({
  film_id: z.number(),
  film_title: z.string().nullable().optional(),
  poster_path: z.string().nullable().optional(),
});

const StackCommentRowSchema = z.object({
  id: z.string(),
  list_id: z.string(),
  user_id: z.string(),
  content: z.string(),
  created_at: z.string(),
  profiles: z.union([
    z.object({ username: z.string(), avatar_url: z.string().nullable().optional() }),
    z.array(z.object({ username: z.string(), avatar_url: z.string().nullable().optional() })),
  ]),
});

/**
 * Films loaded for a stack detail screen.
 *
 * The fetch was unbounded. Generous on purpose — the largest stack in existence
 * is 96 — and the TRUE size travels separately as filmCount, so the number on
 * screen stays right even if a stack ever passes this.
 */
const STACK_ITEMS_LIMIT = 500;

export const StackService = {
  async getStackFullPayload(stackId: string) {
    const [listRes, itemsRes, filmCountRes, endorseRes] = await Promise.all([
      supabase.from('lists')
        .select('id, title, description, user_id, is_private, is_ranked, created_at, profiles(username)')
        .eq('id', stackId)
        .maybeSingle(),
      // Bounded. This was unbounded — a stack of any size loaded in full, and the
      // screen's "N REELS" counts what it receives. The cap is generous (the
      // largest stack in existence is 96) and the count below is asked of the
      // server, so the number stays true even if a stack ever exceeds it.
      supabase.from('list_items')
        .select('film_id, film_title, poster_path')
        .eq('list_id', stackId)
        .order('rank_position', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(STACK_ITEMS_LIMIT),
      supabase.from('list_items')
        .select('film_id', { count: 'exact', head: true })
        .eq('list_id', stackId),
      supabase.from('interactions')
        .select('user_id', { count: 'exact', head: true })
        .eq('target_list_id', stackId)
        .eq('type', 'endorse_list'),
    ]);

    if (listRes.error) throw listRes.error;
    if (itemsRes.error) throw itemsRes.error;
    if (!listRes.data) throw new Error('Stack not found');

    // Activate Schema Validation Boundaries
    if (!StackDetailSchema.safeParse(listRes.data).success) {
      logger.warn(`[StackService.getStackFullPayload] list payload failed schema validation`);
    }
    const profile = Array.isArray(listRes.data.profiles) ? listRes.data.profiles[0] : listRes.data.profiles;

    // O(N) Array Reduce: Validates, drops corrupted rows, and maps UI shape in one pass.
    const validFilms = (itemsRes.data || []).reduce((acc, item) => {
      const parsed = StackItemSchema.safeParse(item);
      if (parsed.success) {
        acc.push({
          id: parsed.data.film_id,
          title: parsed.data.film_title || 'Unknown',
          poster_path: parsed.data.poster_path || null,
        });
      } else {
        logger.warn(`[StackService.getStackFullPayload] list_item failed schema validation: ${parsed.error.message}`);
      }
      return acc;
    }, [] as { id: number; title: string; poster_path: string | null }[]);

    return {
      id: listRes.data.id,
      title: listRes.data.title,
      description: listRes.data.description ?? '',
      userId: listRes.data.user_id,
      user: profile?.username || 'anonymous',
      createdAt: listRes.data.created_at,
      films: validFilms,
      // The stack's TRUE size, from the server. The screen prints "N REELS" and
      // used to count the array it received — correct only while the fetch was
      // unbounded. Now that it is capped, this is the number that must be shown.
      filmCount: filmCountRes.count ?? validFilms.length,
      isPrivate: listRes.data.is_private ?? false,
      isRanked: listRes.data.is_ranked ?? false,
      endorseCount: endorseRes.count ?? 0,
    };
  },

  /**
   * Single joined query replaces N+1 pattern.
   * Previously: 2 queries (comments → profile IDs → profiles).
   * Now: 1 query with Supabase foreign key join.
   */
  async getStackComments(stackId: string) {
    const { data, error } = await supabase
      .from('list_comments')
      .select('id, list_id, user_id, content, created_at, profiles!inner(username, avatar_url)')
      .eq('list_id', stackId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    if (!data || data.length === 0) return [];

    // O(N) Array Reduce: Validates, drops corrupted rows, and maps UI shape in one pass.
    const formatted = data.reduce((acc, row) => {
      const parsed = StackCommentRowSchema.safeParse(row);
      if (parsed.success) {
        const c = parsed.data;
        const profile = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
        acc.push({
          id: c.id,
          list_id: c.list_id,
          user_id: c.user_id,
          content: c.content,
          created_at: c.created_at,
          username: profile?.username || 'unknown',
          avatar_url: profile?.avatar_url ?? null,
        });
      } else {
        logger.warn(`[StackService.getStackComments] row failed schema validation: ${parsed.error.message}`);
      }
      return acc;
    }, [] as { id: string; list_id: string; user_id: string; content: string; created_at: string; username: string; avatar_url: string | null }[]);

    return formatted.reverse();
  },

  async addStackComment(payload: unknown) {
    const safePayload = CommentPayloadSchema.parse(payload);
    
    // list_comments' text column is 'content' (verified against the live schema),
    // matching the UI/API shape — no remap needed, just sanitize.
    // COMP-1: sanitize at the service boundary so the ONLINE path matches the
    // offline mutationExecutor (`sanitizeInput(content, 'listComment')`).
    const { content, ...rest } = safePayload;
    const dbPayload = { ...rest, content: sanitizeInput(content, 'listComment') };
    
    // Add the comment and fetch joined profile in a single query
    const { data, error } = await supabase
      .from('list_comments')
      .insert([dbPayload])
      .select('id, list_id, user_id, content, created_at, profiles(username, avatar_url)')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Failed to add stack comment');

    // SVC-1: the DB trigger tr_notify_list_comment already emits the correct
    // notification on the list_comments INSERT above. The prior manual insert here
    // targeted a non-existent `metadata` column (and duplicated the trigger), so it
    // always failed silently — removed to match the offline mutationExecutor path.

    // Remap db shape back to UI shape for perfect optimistic updates
    const profile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
    return {
      id: data.id,
      list_id: data.list_id,
      user_id: data.user_id,
      content: data.content,
      created_at: data.created_at,
      username: profile?.username || 'unknown',
      avatar_url: (profile as { avatar_url?: string | null } | undefined)?.avatar_url ?? null,
    };
  }
};

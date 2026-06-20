import { captureError } from '@/src/lib/sentry';
import { supabase } from '@/src/lib/supabase';
import { logger } from '@/src/utils/logger';
import { validateWithTelemetry } from '@/src/utils/validateWithTelemetry';
import { z } from 'zod';

export const LoungeMessagePayloadSchema = z.object({
  id: z.string().uuid().optional(),
  lounge_id: z.string().uuid(),
  user_id: z.string().uuid(),
  content: z.string().max(2000),
  type: z.enum(['text', 'film_share', 'log_share', 'list_share', 'system']),
  film_id: z.number().nullable().optional(),
  film_title: z.string().nullable().optional(),
  film_poster: z.string().nullable().optional(),
  reply_to_id: z.string().uuid().nullable().optional(),
  reply_to_username: z.string().nullable().optional(),
  reply_to_content: z.string().nullable().optional(),
  // T1-5 FIX: z.any() → z.record() — preserves Zod type safety. z.any() was the
  // only unvalidated field in the entire schema layer, bypassing runtime validation.
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ── S3 FIX: Zod schemas for read-path boundary validation ──────────────────

const LoungeDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  cover_image: z.string().nullable().optional(),
  created_at: z.string(),
  creator_id: z.string(),
  member_count: z.number().nullable().optional(),
  is_private: z.boolean().nullable().optional(),
  invite_code: z.string().nullable().optional(),
});

const LoungeMemberSchema = z.object({
  user_id: z.string(),
  profiles: z.union([
    z.object({ username: z.string(), avatar_url: z.string().nullable().optional() }),
    z.array(z.object({ username: z.string(), avatar_url: z.string().nullable().optional() })),
  ]).nullable().optional(),
});

const UserLoungeSchema = z.object({
  lounge_id: z.string(),
  lounges: z.union([
    z.object({ id: z.string(), name: z.string() }),
    z.array(z.object({ id: z.string(), name: z.string() })),
  ]).nullable().optional(),
});

export const LoungeService = {
  async getLoungeDetails(loungeId: string) {
    const { data, error } = await supabase
      .from('lounges')
      .select('id, name, description, cover_image, created_at, creator_id, member_count, is_private, invite_code')
      .eq('id', loungeId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Lounge not found');
    // S3 FIX: Validate response shape
    // TRIBUNAL FIX: Production observability via Sentry on schema drift
    const parsed = LoungeDetailSchema.safeParse(data);
    if (!parsed.success) {
      logger.warn('[LoungeService.getLoungeDetails] Schema mismatch:', parsed.error.message);
      if (!__DEV__) captureError(new Error(`[LoungeService] Schema drift: ${parsed.error.issues[0]?.path.join('.')}`));
    }
    return data;
  },

  async checkMembership(loungeId: string, userId: string) {
    const { data, error } = await supabase
      .from('lounge_members')
      .select('id')
      .eq('lounge_id', loungeId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  },

  async getLoungeMembers(loungeId: string) {
    const { data, error } = await supabase
      .from('lounge_members')
      .select('user_id, profiles(username, avatar_url)')
      .eq('lounge_id', loungeId);

    if (error) throw error;
    // S3 FIX: Validate member rows
    const { valid } = validateWithTelemetry({
      schema: LoungeMemberSchema,
      context: 'LoungeService.getLoungeMembers',
      data: data ?? [],
    });
    return valid;
  },

  async getUserLounges(userId: string) {
    const { data, error } = await supabase
      .from('lounge_members')
      .select('lounge_id, lounges(id, name)')
      .eq('user_id', userId);

    if (error) throw error;
    // F3 FIX: Return Zod-parsed data with proper typing — eliminates the need
    // for `as unknown as` casts in consumers (ShareToLoungeModal, etc.)
    // CONSISTENCY: salvage valid rows + telemetry (matches getLoungeMembers above)
    // instead of throwing the entire call when a single row drifts from the schema.
    const { valid } = validateWithTelemetry({
      schema: UserLoungeSchema,
      context: 'LoungeService.getUserLounges',
      data: data ?? [],
    });
    return valid;
  },

  async shareToLounge(payload: unknown) {
    const safePayload = LoungeMessagePayloadSchema.parse(payload);
    const { error } = await supabase.from('lounge_messages').upsert([safePayload], { onConflict: 'id' });
    if (error) throw error;
  }
};

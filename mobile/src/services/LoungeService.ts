import { supabase } from '@/src/lib/supabase';
import { validateWithTelemetry } from '@/src/utils/validateWithTelemetry';
import { z } from 'zod';

export const LoungeMessagePayloadSchema = z.object({
  id: z.string().uuid().optional(),
  lounge_id: z.string().uuid(),
  user_id: z.string().uuid(),
  content: z.string().max(2000),
  type: z.enum(['text', 'film_share', 'log_share', 'list_share', 'dossier_share', 'system']),
  film_id: z.number().nullable().optional(),
  film_title: z.string().nullable().optional(),
  film_poster: z.string().nullable().optional(),
  reply_to_id: z.string().uuid().nullable().optional(),
  reply_to_username: z.string().nullable().optional(),
  reply_to_content: z.string().nullable().optional(),
  // z.any() → z.record() — preserves Zod type safety. z.any() was the
  // only unvalidated field in the entire schema layer, bypassing runtime validation.
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ── Zod schemas for read-path boundary validation ──────────────────

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
      .select('user_id, profiles!lounge_members_user_id_fkey(username, avatar_url)')
      .eq('lounge_id', loungeId);

    if (error) throw error;
    // Validate member rows
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
    // Return Zod-parsed data with proper typing — eliminates the need
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

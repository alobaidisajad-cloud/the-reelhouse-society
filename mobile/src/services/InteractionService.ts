import { supabase } from '@/src/lib/supabase';
import { z } from 'zod';

/** A certification of a log or of a stack: the two a member can make. */
export const InteractionPayloadSchema = z.object({
  user_id: z.string().uuid(),
  type: z.enum(['endorse_log', 'endorse_list']),
  target_log_id: z.string().uuid().optional(),
  target_list_id: z.string().uuid().optional(),
}).refine(data =>
  data.target_log_id || data.target_list_id,
  { message: "Interaction requires at least one target ID" }
);

export const InteractionService = {
  /**
   * Adds an endorsement (reaction). Safe boundary.
   */
  async addEndorsement(payload: unknown) {
    const safePayload = InteractionPayloadSchema.parse(payload);

    // Direct insertion for all interactions
    const { error } = await supabase.from('interactions').insert([safePayload]);
    if (error) throw error;
  },

  /**
   * Removes an endorsement. Safe boundary.
   */
  async removeEndorsement(payload: unknown) {
    const safePayload = InteractionPayloadSchema.parse(payload);

    // Core query builder helper
    let query = supabase.from('interactions').delete().eq('user_id', safePayload.user_id);
    if (safePayload.target_log_id) query = query.eq('target_log_id', safePayload.target_log_id).eq('type', 'endorse_log');
    else if (safePayload.target_list_id) query = query.eq('target_list_id', safePayload.target_list_id).eq('type', 'endorse_list');

    const { error } = await query;
    if (error) throw error;
  }
};

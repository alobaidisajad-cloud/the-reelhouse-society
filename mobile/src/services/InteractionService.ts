import { supabase } from '@/src/lib/supabase';
import { z } from 'zod';
// Removed unused logger import

// Zod schemas for runtime boundary safety
const InteractionPayloadSchema = z.object({
  user_id: z.string().uuid(),
  type: z.enum(['endorse_log', 'endorse_list', 'endorse_film', 'endorse_review']),
  target_log_id: z.string().uuid().optional(),
  target_list_id: z.string().uuid().optional(),
  // TMDB film IDs are integers (e.g., 550), not UUIDs.
  // Accept both UUID strings and numeric IDs (coerced to string for storage).
  target_film_id: z.union([z.string().uuid(), z.string().regex(/^\d+$/), z.number().int().positive().transform(String)]).optional(),
  target_review_id: z.string().uuid().optional(),
}).refine(data => 
  data.target_log_id || data.target_list_id || data.target_film_id || data.target_review_id, 
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
    else if (safePayload.target_film_id) query = query.eq('target_film_id', safePayload.target_film_id).eq('type', 'endorse_film');
    else if (safePayload.target_review_id) query = query.eq('target_review_id', safePayload.target_review_id).eq('type', 'endorse_review');
    
    const { error } = await query;
    if (error) throw error;
  }
};

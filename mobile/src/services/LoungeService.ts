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
  // A record of unknowns, validated as one: never z.any().
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ── Zod schemas for read-path boundary validation ──────────────────

const UserLoungeSchema = z.object({
  lounge_id: z.string(),
  lounges: z.union([
    z.object({ id: z.string(), name: z.string() }),
    z.array(z.object({ id: z.string(), name: z.string() })),
  ]).nullable().optional(),
});

export const LoungeService = {
  async getUserLounges(userId: string) {
    const { data, error } = await supabase
      .from('lounge_members')
      .select('lounge_id, lounges(id, name)')
      .eq('user_id', userId);

    if (error) throw error;
    // Parsed, so the share sheet needs no casts; a row that drifts from the
    // schema is dropped (and reported), never the whole list.
    const { valid } = validateWithTelemetry({
      schema: UserLoungeSchema,
      context: 'LoungeService.getUserLounges',
      data: data ?? [],
    });
    return valid;
  }
};

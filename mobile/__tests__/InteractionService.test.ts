/**
 * InteractionService.test.ts — Zod Boundary Validation Tests
 * ───────────────────────────────────────────────────────────
 * Validates that the InteractionService correctly:
 *   1. Accepts valid endorsement payloads
 *   2. Rejects invalid payloads with clear Zod errors
 *   3. Enforces the "at least one target ID" refinement
 *   4. Handles TMDB numeric film IDs correctly
 */

import { z } from 'zod';

// Re-create the schema locally to test it in isolation (avoids Supabase import)
const InteractionPayloadSchema = z.object({
  user_id: z.string().uuid(),
  type: z.enum(['endorse_log', 'endorse_list', 'endorse_film', 'endorse_review']),
  target_log_id: z.string().uuid().optional(),
  target_list_id: z.string().uuid().optional(),
  target_film_id: z.union([
    z.string().uuid(),
    z.string().regex(/^\d+$/),
    z.number().int().positive().transform(String),
  ]).optional(),
  target_review_id: z.string().uuid().optional(),
}).refine(data =>
  data.target_log_id || data.target_list_id || data.target_film_id || data.target_review_id,
  { message: "Interaction requires at least one target ID" }
);

describe('InteractionPayloadSchema', () => {
  const validUserId = '550e8400-e29b-41d4-a716-446655440000';
  const validLogId = '660e8400-e29b-41d4-a716-446655440001';

  it('should accept a valid endorsement with log target', () => {
    const payload = {
      user_id: validUserId,
      type: 'endorse_log' as const,
      target_log_id: validLogId,
    };

    const result = InteractionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('should accept TMDB numeric film IDs', () => {
    const payload = {
      user_id: validUserId,
      type: 'endorse_film' as const,
      target_film_id: 550, // The Godfather's TMDB ID
    };

    const result = InteractionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      // Numeric IDs should be coerced to string
      expect(result.data.target_film_id).toBe('550');
    }
  });

  it('should accept string numeric film IDs', () => {
    const payload = {
      user_id: validUserId,
      type: 'endorse_film' as const,
      target_film_id: '12345',
    };

    const result = InteractionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('should reject payloads missing user_id', () => {
    const payload = {
      type: 'endorse_log' as const,
      target_log_id: validLogId,
    };

    const result = InteractionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('should reject payloads with invalid UUID user_id', () => {
    const payload = {
      user_id: 'not-a-uuid',
      type: 'endorse_log' as const,
      target_log_id: validLogId,
    };

    const result = InteractionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('should reject payloads with invalid type', () => {
    const payload = {
      user_id: validUserId,
      type: 'invalid_type',
      target_log_id: validLogId,
    };

    const result = InteractionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('should reject payloads with no target IDs (refinement check)', () => {
    const payload = {
      user_id: validUserId,
      type: 'endorse_log' as const,
      // No target_log_id, target_list_id, target_film_id, or target_review_id
    };

    const result = InteractionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(
        issue => issue.message === 'Interaction requires at least one target ID'
      )).toBe(true);
    }
  });

  it('should reject negative film IDs', () => {
    const payload = {
      user_id: validUserId,
      type: 'endorse_film' as const,
      target_film_id: -1,
    };

    const result = InteractionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('should accept all 4 endorsement types', () => {
    const types = ['endorse_log', 'endorse_list', 'endorse_film', 'endorse_review'] as const;

    types.forEach((type) => {
      const payload: Record<string, unknown> = {
        user_id: validUserId,
        type,
      };

      // Assign the correct target ID for each type
      if (type === 'endorse_log') payload.target_log_id = validLogId;
      else if (type === 'endorse_list') payload.target_list_id = validLogId;
      else if (type === 'endorse_film') payload.target_film_id = '550';
      else if (type === 'endorse_review') payload.target_review_id = validLogId;

      const result = InteractionPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });
});

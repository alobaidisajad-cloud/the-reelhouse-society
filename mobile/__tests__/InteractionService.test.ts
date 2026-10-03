/**
 * InteractionService.test.ts — Zod Boundary Validation Tests
 * ───────────────────────────────────────────────────────────
 * Validates that the InteractionService correctly:
 *   1. Accepts the two certifications a member can make — a log, a stack
 *   2. Rejects invalid payloads with clear Zod errors
 *   3. Enforces the "at least one target ID" refinement
 */

// The service's own schema: a copy here would pass whatever the real one became.
import { InteractionPayloadSchema } from '@/src/services/InteractionService';

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

  it('should accept a valid endorsement with stack target', () => {
    const result = InteractionPayloadSchema.safeParse({
      user_id: validUserId,
      type: 'endorse_list' as const,
      target_list_id: validLogId,
    });
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

  it('refuses the film and review kinds — nothing in the house makes them', () => {
    for (const type of ['endorse_film', 'endorse_review']) {
      expect(InteractionPayloadSchema.safeParse({ user_id: validUserId, type, target_log_id: validLogId }).success).toBe(false);
    }
  });

  it('should reject payloads with no target IDs (refinement check)', () => {
    const payload = {
      user_id: validUserId,
      type: 'endorse_log' as const,
      // No target_log_id or target_list_id
    };

    const result = InteractionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(
        issue => issue.message === 'Interaction requires at least one target ID'
      )).toBe(true);
    }
  });
});

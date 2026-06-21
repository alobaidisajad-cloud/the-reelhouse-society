/**
 * mutationExecutor.pbt.test.ts — Property-Based Tests for applyIdMapToPayload
 * ────────────────────────────────────────────────────────────────────────────
 * Validates: Requirements 1.2
 *
 * Tests the ID remapping function used during offline queue flush.
 * applyIdMapToPayload only remaps specific known keys:
 * id, log_id, list_id, dossier_id, dossier_uuid, target_log_id,
 * target_list_id, target_review_id, comment_id, message_id, reply_to_id
 */

import * as fc from 'fast-check';

// Mock dependencies that mutationExecutor.ts imports at module level
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { getSession: jest.fn() },
  },
}));
jest.mock('../../services/InteractionService', () => ({
  InteractionService: { addEndorsement: jest.fn() },
}));
jest.mock('../sanitizeInput', () => ({
  sanitizeInput: jest.fn((input: string) => input),
}));
jest.mock('../logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// Ensure clean module state when run in full suite alongside integration tests
jest.mock('../../stores/auth', () => ({
  useAuthStore: { getState: () => ({ user: null }) },
}));

import { applyIdMapToPayload } from '../mutationExecutor';

describe('applyIdMapToPayload — Property-Based Tests', () => {
  const REMAPPABLE_KEYS = [
    'id', 'log_id', 'list_id', 'dossier_id', 'dossier_uuid',
    'target_log_id', 'target_list_id', 'target_review_id',
    'comment_id', 'message_id', 'reply_to_id',
  ] as const;

  it('property: all remappable keys present in idMap are remapped in output', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REMAPPABLE_KEYS),
        fc.uuid(),
        fc.uuid(),
        (key, oldId, newId) => {
          const payload: Record<string, unknown> = { [key]: oldId, other_field: 'untouched' };
          const idMap: Record<string, string> = { [oldId]: newId };
          const result = applyIdMapToPayload(payload, idMap);
          return result[key] === newId;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('property: keys NOT in idMap are unchanged in output', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REMAPPABLE_KEYS),
        fc.uuid(),
        (key, value) => {
          const payload: Record<string, unknown> = { [key]: value, other_field: 'data' };
          const idMap: Record<string, string> = { 'some-other-id-not-matching': 'mapped-value' };
          const result = applyIdMapToPayload(payload, idMap);
          return result[key] === value;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('property: output has same keys as input (no keys added or removed)', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.constantFrom(...REMAPPABLE_KEYS, 'user_id', 'film_id', 'type', 'content'),
          fc.uuid()
        ),
        fc.dictionary(fc.uuid(), fc.uuid()),
        (payload, idMap) => {
          const result = applyIdMapToPayload(payload, idMap);
          const inputKeys = Object.keys(payload).sort();
          const outputKeys = Object.keys(result).sort();
          return JSON.stringify(inputKeys) === JSON.stringify(outputKeys);
        }
      ),
      { numRuns: 200, seed: 42 }
    );
  });

  it('property: applying an empty idMap returns the payload unchanged', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.constantFrom(...REMAPPABLE_KEYS, 'user_id', 'film_id', 'type'),
          fc.oneof(fc.string(), fc.integer(), fc.boolean())
        ),
        (payload) => {
          const result = applyIdMapToPayload(payload, {});
          return JSON.stringify(result) === JSON.stringify({ ...payload });
        }
      ),
      { numRuns: 200 }
    );
  });

  it('non-remappable keys are never affected by idMap', () => {
    const payload = {
      id: 'fake-123',
      user_id: 'user-456',
      film_id: 550,
      type: 'endorse_log',
      content: 'test message',
    };
    const idMap = { 'fake-123': 'real-789', 'user-456': 'should-not-remap' };
    const result = applyIdMapToPayload(payload, idMap);

    expect(result.id).toBe('real-789'); // remappable key
    expect(result.user_id).toBe('user-456'); // NOT a remappable key — unchanged
    expect(result.film_id).toBe(550); // number, not in idMap
    expect(result.type).toBe('endorse_log'); // not remappable
    expect(result.content).toBe('test message'); // not remappable
  });
});

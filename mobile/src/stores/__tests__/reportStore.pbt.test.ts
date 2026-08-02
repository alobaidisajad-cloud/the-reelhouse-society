/**
 * reportStore.pbt.test.ts — Property-Based Tests for ReportStore
 * ──────────────────────────────────────────────────────────────────
 * Property 7: Report payload schema validation (Task 3.4)
 * Property 8: Invalid payload produces no side effects (Task 3.5)
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 4.5, 1.5, 9.4
 */

import * as fc from 'fast-check';
import { ReportableContentType, ReportPayloadSchema, ReportReason } from '../../types/moderation';

// ── Import after mocks ───────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase';
import { enqueueMutation } from '../../utils/offlineQueue';
import { useReportStore } from '../reportStore';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    from: jest.fn(() => ({
      upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});

jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock('../../utils/networkError', () => ({
  isNetworkError: jest.fn(() => false),
}));

jest.mock('../blockStore', () => ({
  useBlockStore: { getState: jest.fn(() => ({ blockUser: jest.fn() })) },
}));

jest.mock('../auth', () => ({
  useAuthStore: { getState: jest.fn(() => ({ user: { id: 'auth-user-id' } })) },
}));

jest.mock('../../lib/queryClient', () => ({
  queryClient: { invalidateQueries: jest.fn() },
}));

jest.mock('../../lib/sentry', () => ({
  captureError: jest.fn(),
}));

jest.mock('../resetAllStores', () => ({
  registerStoreReset: jest.fn(),
}));

// ── Arbitraries ──────────────────────────────────────────────────────────────

const contentTypeArb = fc.constantFrom(...ReportableContentType.options);
const _reasonArb = fc.constantFrom(...ReportReason.options);
const reasonNonOtherArb = fc.constantFrom(
  ...ReportReason.options.filter((r) => r !== 'other'),
);

/** Generates a valid ReportPayload object. */
const validPayloadArb = fc.record({
  reporter_id: fc.uuid(),
  content_id: fc.uuid(),
  content_type: contentTypeArb,
  reason: reasonNonOtherArb,
  details: fc.option(fc.string({ minLength: 0, maxLength: 500 }), { nil: null }),
  block_target: fc.option(fc.boolean(), { nil: undefined }),
  target_user_id: fc.uuid(),
});

/** Generates a valid payload with reason='other' and non-empty details. */
const validOtherReasonPayloadArb = fc.record({
  reporter_id: fc.uuid(),
  content_id: fc.uuid(),
  content_type: contentTypeArb,
  reason: fc.constant('other' as const),
  details: fc.string({ minLength: 1, maxLength: 500 }).filter((s) => s.trim().length > 0),
  block_target: fc.option(fc.boolean(), { nil: undefined }),
  target_user_id: fc.uuid(),
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ReportStore PBT — Property 7: Schema validation', () => {
  /**
   * **Validates: Requirements 9.1, 9.2, 9.3, 4.5, 1.5**
   *
   * Property: Invalid UUIDs, details > 500 chars, reason='other' with
   * empty details all reject. Valid payloads matching all constraints pass.
   */

  it('rejects payloads with invalid reporter_id (non-UUID)', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => {
          // Exclude strings that happen to be valid UUIDs
          return !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
        }),
        fc.uuid(),
        contentTypeArb,
        reasonNonOtherArb,
        fc.uuid(),
        (invalidId, contentId, contentType, reason, targetUserId) => {
          const result = ReportPayloadSchema.safeParse({
            reporter_id: invalidId,
            content_id: contentId,
            content_type: contentType,
            reason,
            target_user_id: targetUserId,
          });
          return !result.success;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects payloads with invalid content_id (non-UUID)', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string().filter((s) => {
          return !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
        }),
        contentTypeArb,
        reasonNonOtherArb,
        fc.uuid(),
        (reporterId, invalidContentId, contentType, reason, targetUserId) => {
          const result = ReportPayloadSchema.safeParse({
            reporter_id: reporterId,
            content_id: invalidContentId,
            content_type: contentType,
            reason,
            target_user_id: targetUserId,
          });
          return !result.success;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects payloads with invalid target_user_id (non-UUID)', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        contentTypeArb,
        reasonNonOtherArb,
        fc.string().filter((s) => {
          return !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
        }),
        (reporterId, contentId, contentType, reason, invalidTargetId) => {
          const result = ReportPayloadSchema.safeParse({
            reporter_id: reporterId,
            content_id: contentId,
            content_type: contentType,
            reason,
            target_user_id: invalidTargetId,
          });
          return !result.success;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects payloads with details exceeding 500 characters', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        contentTypeArb,
        reasonNonOtherArb,
        fc.uuid(),
        fc.string({ minLength: 501, maxLength: 1000 }),
        (reporterId, contentId, contentType, reason, targetUserId, longDetails) => {
          const result = ReportPayloadSchema.safeParse({
            reporter_id: reporterId,
            content_id: contentId,
            content_type: contentType,
            reason,
            details: longDetails,
            target_user_id: targetUserId,
          });
          return !result.success;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects reason="other" with empty or whitespace-only details', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        contentTypeArb,
        fc.uuid(),
        fc.constantFrom('', '   ', '\t', '\n', '  \n  '),
        (reporterId, contentId, contentType, targetUserId, emptyDetails) => {
          const result = ReportPayloadSchema.safeParse({
            reporter_id: reporterId,
            content_id: contentId,
            content_type: contentType,
            reason: 'other',
            details: emptyDetails,
            target_user_id: targetUserId,
          });
          return !result.success;
        },
      ),
      { numRuns: 50 },
    );
  });

  it('rejects reason="other" with null/undefined details', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        contentTypeArb,
        fc.uuid(),
        fc.constantFrom(null, undefined),
        (reporterId, contentId, contentType, targetUserId, nilDetails) => {
          const result = ReportPayloadSchema.safeParse({
            reporter_id: reporterId,
            content_id: contentId,
            content_type: contentType,
            reason: 'other',
            details: nilDetails,
            target_user_id: targetUserId,
          });
          return !result.success;
        },
      ),
      { numRuns: 50 },
    );
  });

  it('accepts valid payloads with non-other reasons', () => {
    fc.assert(
      fc.property(validPayloadArb, (payload) => {
        const result = ReportPayloadSchema.safeParse(payload);
        return result.success;
      }),
      { numRuns: 200 },
    );
  });

  it('accepts valid payloads with reason="other" and non-empty details', () => {
    fc.assert(
      fc.property(validOtherReasonPayloadArb, (payload) => {
        const result = ReportPayloadSchema.safeParse(payload);
        return result.success;
      }),
      { numRuns: 100 },
    );
  });
});

describe('ReportStore PBT — Property 8: Invalid payload no side effects', () => {
  /**
   * **Validates: Requirements 9.4**
   *
   * Property: Failed validation results in no RPC call, no enqueue,
   * unchanged recentReports.
   */

  beforeEach(() => {
    // Reset the store state
    useReportStore.setState({ isSubmitting: false, recentReports: new Set<string>() });
    jest.clearAllMocks();
  });

  it('invalid payloads produce no RPC call, no enqueue, unchanged recentReports', async () => {
    // Generate a batch of invalid payloads and test them sequentially
    const invalidPayloads = fc.sample(
      fc.oneof(
        // Invalid reporter_id
        fc.record({
          reporter_id: fc.string({ minLength: 1, maxLength: 10 }),
          content_id: fc.uuid(),
          content_type: contentTypeArb,
          reason: reasonNonOtherArb,
          target_user_id: fc.uuid(),
        }),
        // Invalid content_id
        fc.record({
          reporter_id: fc.uuid(),
          content_id: fc.string({ minLength: 1, maxLength: 10 }),
          content_type: contentTypeArb,
          reason: reasonNonOtherArb,
          target_user_id: fc.uuid(),
        }),
        // reason='other' with empty details
        fc.record({
          reporter_id: fc.uuid(),
          content_id: fc.uuid(),
          content_type: contentTypeArb,
          reason: fc.constant('other' as const),
          details: fc.constantFrom('', '   ', null),
          target_user_id: fc.uuid(),
        }),
        // Details > 500 chars
        fc.record({
          reporter_id: fc.uuid(),
          content_id: fc.uuid(),
          content_type: contentTypeArb,
          reason: reasonNonOtherArb,
          details: fc.string({ minLength: 501, maxLength: 600 }),
          target_user_id: fc.uuid(),
        }),
      ),
      50,
    );

    for (const payload of invalidPayloads) {
      const recentBefore = new Set(useReportStore.getState().recentReports);

      const result = await useReportStore.getState().submitReport(payload as any);

      // Should return error status
      expect(result.status).toBe('error');
      // No RPC call
      expect(supabase.rpc).not.toHaveBeenCalled();
      // No enqueue
      expect(enqueueMutation).not.toHaveBeenCalled();
      // recentReports unchanged
      const recentAfter = useReportStore.getState().recentReports;
      expect(recentAfter.size).toBe(recentBefore.size);
    }
  });
});

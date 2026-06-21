/**
 * withAbortSignal.test.ts — Abort Signal Wrapper Tests
 * ────────────────────────────────────────────────────
 * Tests the typed wrapper that attaches AbortSignal to
 * Supabase query builders (F3-01 hardening).
 */

import { withAbortSignal } from '../withAbortSignal';

describe('withAbortSignal', () => {
  it('returns query unchanged when signal is undefined', () => {
    const mockQuery = { select: jest.fn(), eq: jest.fn() };
    const result = withAbortSignal(mockQuery, undefined);
    expect(result).toBe(mockQuery);
  });

  it('returns query unchanged when signal is not provided', () => {
    const mockQuery = { select: jest.fn() };
    const result = withAbortSignal(mockQuery);
    expect(result).toBe(mockQuery);
  });

  it('calls abortSignal on query when signal is provided', () => {
    const controller = new AbortController();
    const mockQuery = {
      abortSignal: jest.fn().mockReturnValue('query-with-signal'),
    };
    const result = withAbortSignal(mockQuery, controller.signal);
    expect(mockQuery.abortSignal).toHaveBeenCalledWith(controller.signal);
    expect(result).toBe('query-with-signal');
  });

  it('passes through the exact signal reference', () => {
    const controller = new AbortController();
    const mockQuery = {
      abortSignal: jest.fn().mockReturnThis(),
    };
    withAbortSignal(mockQuery, controller.signal);
    expect(mockQuery.abortSignal).toHaveBeenCalledWith(controller.signal);
    // Verify it's the exact same signal, not a copy
    const passedSignal = mockQuery.abortSignal.mock.calls[0][0];
    expect(passedSignal).toBe(controller.signal);
  });

  it('preserves generic type (returns same type as input)', () => {
    const mockQuery = { select: jest.fn(), eq: jest.fn(), limit: jest.fn() };
    const result = withAbortSignal(mockQuery, undefined);
    // Result should have the exact same shape
    expect(result.select).toBeDefined();
    expect(result.eq).toBeDefined();
    expect(result.limit).toBeDefined();
  });
});

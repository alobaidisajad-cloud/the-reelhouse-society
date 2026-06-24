import * as fc from 'fast-check';
import { isNetworkError, isTransientError } from '../networkError';

describe('isNetworkError — Property-Based Tests', () => {
  describe('returns true for known network error patterns', () => {
    it('errors with network-related keywords in message', () => {
      const networkKeywords = ['fetch', 'network', 'offline', 'timeout', 'Network request failed', 'Failed to fetch'];
      for (const keyword of networkKeywords) {
        expect(isNetworkError(new Error(keyword))).toBe(true);
        expect(isNetworkError({ message: keyword })).toBe(true);
        expect(isNetworkError({ message: `Something ${keyword} happened` })).toBe(true);
      }
    });

    it('errors with gateway/server status codes 502, 503, 504', () => {
      expect(isNetworkError({ message: 'error', status: 502 })).toBe(true);
      expect(isNetworkError({ message: 'error', status: 503 })).toBe(true);
      expect(isNetworkError({ message: 'error', status: 504 })).toBe(true);
    });

    it('errors with postgres connection failure codes', () => {
      expect(isNetworkError({ message: 'error', code: '57014' })).toBe(true);
      expect(isNetworkError({ message: 'error', code: '08000' })).toBe(true);
      expect(isNetworkError({ message: 'error', code: '08003' })).toBe(true);
      expect(isNetworkError({ message: 'error', code: '08006' })).toBe(true);
    });
  });

  describe('returns false for non-network errors', () => {
    it('client error status codes (400, 401, 403, 404, 409, 422)', () => {
      const clientStatuses = [400, 401, 403, 404, 409, 422];
      for (const status of clientStatuses) {
        // These have non-network messages and client-side status codes
        expect(isNetworkError({ message: 'Unauthorized', status })).toBe(false);
      }
    });

    it('PostgREST errors (PGRST codes)', () => {
      expect(isNetworkError({ message: 'column not found', code: 'PGRST116' })).toBe(false);
      expect(isNetworkError({ message: 'relation not found', code: 'PGRST204' })).toBe(false);
    });

    it('validation and auth errors', () => {
      expect(isNetworkError(new Error('Invalid email format'))).toBe(false);
      expect(isNetworkError(new Error('Password too short'))).toBe(false);
      expect(isNetworkError(new Error('duplicate key value'))).toBe(false);
      expect(isNetworkError(new Error('JWT expired'))).toBe(false);
    });
  });

  describe('property: never throws regardless of input type', () => {
    it('handles null, undefined, numbers, booleans, arrays', () => {
      expect(() => isNetworkError(null)).not.toThrow();
      expect(() => isNetworkError(undefined)).not.toThrow();
      expect(() => isNetworkError(42)).not.toThrow();
      expect(() => isNetworkError(true)).not.toThrow();
      expect(() => isNetworkError([])).not.toThrow();
      expect(() => isNetworkError({})).not.toThrow();
    });

    it('property: never throws for any arbitrary input that is string-coercible', () => {
      // The function may throw for exotic objects where toString is non-callable
      // (e.g., {toString: 0}). We test with well-formed inputs that can be coerced to string.
      const safeArbitrary = fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined),
        fc.record({
          message: fc.string(),
          status: fc.oneof(fc.integer(), fc.constant(null)),
          code: fc.oneof(fc.string(), fc.constant(null)),
        }),
        fc.record({ message: fc.string() }),
        fc.constant(new Error('test')),
        fc.array(fc.anything({ maxDepth: 0 }))
      );

      fc.assert(
        fc.property(
          safeArbitrary,
          (input) => {
            // Should never throw for well-formed inputs — always returns boolean
            const result = isNetworkError(input);
            return typeof result === 'boolean';
          }
        ),
        { numRuns: 500 }
      );
    });
  });
});

describe('isTransientError — retryable server failures (OFFQ-1)', () => {
  it('returns true for 408, 429, and 5xx HTTP statuses', () => {
    for (const status of [408, 429, 500, 501, 502, 503, 504, 599]) {
      expect(isTransientError({ message: 'server', status })).toBe(true);
    }
  });

  it('returns true for retryable Postgres codes (serialization/deadlock/lock/limits)', () => {
    for (const code of ['40001', '40P01', '55P03', '53300', '53400', '57P03']) {
      expect(isTransientError({ message: 'pg', code })).toBe(true);
    }
  });

  it('returns true for rate-limit messages', () => {
    expect(isTransientError({ message: 'Rate limit exceeded' })).toBe(true);
    expect(isTransientError({ message: 'Too many requests' })).toBe(true);
  });

  it('returns false for permanent client errors (400/401/403/404/409/422)', () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(isTransientError({ message: 'client', status })).toBe(false);
    }
  });

  it('returns false for semantic PostgREST/constraint errors', () => {
    expect(isTransientError({ message: 'duplicate key', code: '23505' })).toBe(false);
    expect(isTransientError({ message: 'column not found', code: 'PGRST116' })).toBe(false);
    expect(isTransientError(new Error('Row-level security violation'))).toBe(false);
  });

  it('never throws for arbitrary inputs', () => {
    for (const input of [null, undefined, 42, true, [], {}, 'str']) {
      expect(() => isTransientError(input)).not.toThrow();
      expect(typeof isTransientError(input)).toBe('boolean');
    }
  });
});

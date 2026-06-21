/**
 * FeedService — Service Boundary Tests
 * ─────────────────────────────────────
 * Validates Zod schema enforcement, error wrapping,
 * and edge cases for the community feed service layer.
 */

// Mock supabase before importing the service
import { FeedServiceError, FeedNetworkError, parseCursor } from '../FeedService';

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
    })),
    rpc: jest.fn(),
  },
}));

jest.mock('@/src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    alert: jest.fn(),
  },
}));

jest.mock('@/src/utils/withAbortSignal', () => ({
  withAbortSignal: jest.fn((query: unknown) => query),
}));

describe('FeedService — Error Types', () => {
  describe('FeedServiceError', () => {
    it('should wrap original errors with a message', () => {
      const original = new Error('Supabase timeout');
      const err = new FeedServiceError(original, 'Feed fetch failed');

      expect(err.name).toBe('FeedServiceError');
      expect(err.message).toBe('Feed fetch failed');
      expect(err.originalError).toBe(original);
      expect(err).toBeInstanceOf(Error);
    });

    it('should use default message when none provided', () => {
      const err = new FeedServiceError('some error');
      expect(err.message).toBe('Failed to retrieve society feeds');
    });
  });

  describe('FeedNetworkError', () => {
    it('should identify network failures', () => {
      const err = new FeedNetworkError();
      expect(err.name).toBe('FeedNetworkError');
      expect(err.message).toBe('Network connection failed');
      expect(err).toBeInstanceOf(Error);
    });

    it('should accept custom message', () => {
      const err = new FeedNetworkError('Connection reset');
      expect(err.message).toBe('Connection reset');
    });
  });
});

describe('FeedService — Schema Validation', () => {
  it('should import FeedItemSchema from schema module', () => {
    // Verify the schema module is importable
    const { FeedItemSchema } = require('@/src/schemas/feed.schema');
    expect(FeedItemSchema).toBeDefined();
    expect(typeof FeedItemSchema.safeParse).toBe('function');
  });

  it('should validate well-formed feed items', () => {
    const { FeedItemSchema } = require('@/src/schemas/feed.schema');
    const validItem = {
      id: 'log-123',
      film_id: 550,
      film_title: 'Fight Club',
      poster_path: '/poster.jpg',
      rating: 5,
      review: 'First rule...',
      drop_cap: false,
      status: 'watched',
      created_at: '2024-01-15T10:00:00Z',
      username: 'cinephile',
      avatar_url: null,
      role: 'member',
    };

    const result = FeedItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it('should reject feed items with missing required fields', () => {
    const { FeedItemSchema } = require('@/src/schemas/feed.schema');
    const invalidItem = {
      // Missing filmId, filmTitle, rating, etc.
      id: 'log-123',
    };

    const result = FeedItemSchema.safeParse(invalidItem);
    expect(result.success).toBe(false);
  });
});

// 2b: cursor shape validation — the parts are interpolated into PostgREST .or()
// filters, so a malformed/crafted cursor must be rejected (→ safe first-page fetch)
// rather than passed through. These lock that boundary.
describe('FeedService.parseCursor', () => {
  it('accepts a well-formed created_at|uuid cursor', () => {
    const { cursorDate, cursorId } = parseCursor(
      '2024-01-15T10:00:00.123456+00:00|3d67ceb1-d9d8-483a-a52d-d957d945b276',
    );
    expect(cursorDate).toBe('2024-01-15T10:00:00.123456+00:00');
    expect(cursorId).toBe('3d67ceb1-d9d8-483a-a52d-d957d945b276');
  });

  it('accepts a Z-suffixed timestamp', () => {
    const { cursorDate, cursorId } = parseCursor(
      '2024-01-15T10:00:00Z|3d67ceb1-d9d8-483a-a52d-d957d945b276',
    );
    expect(cursorDate).toBe('2024-01-15T10:00:00Z');
    expect(cursorId).not.toBeNull();
  });

  it('returns nulls for an empty/absent cursor', () => {
    expect(parseCursor(undefined)).toEqual({ cursorDate: null, cursorId: null });
    expect(parseCursor('')).toEqual({ cursorDate: null, cursorId: null });
  });

  it('rejects a PostgREST filter-injection payload in either part', () => {
    // Date part carrying a filter breakout
    const a = parseCursor('2024-01-15T10:00:00Z,id.lt.0)|3d67ceb1-d9d8-483a-a52d-d957d945b276');
    expect(a.cursorDate).toBeNull();
    // Id part carrying a breakout
    const b = parseCursor('2024-01-15T10:00:00Z|abc),or(rating.gt.0');
    expect(b.cursorId).toBeNull();
    // Garbage in both
    const c = parseCursor('not-a-date|not-a-uuid');
    expect(c).toEqual({ cursorDate: null, cursorId: null });
  });
});

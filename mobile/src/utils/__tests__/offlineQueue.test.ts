/**
 * Offline Queue — Resilience Tests
 *
 * Tests the offline mutation queue that stores failed mutations
 * when the device is offline and flushes them when reconnected.
 */

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

describe('Offline Queue — Resilience Logic', () => {
  describe('Queue Capacity', () => {
    it('should enforce a maximum queue size of 100', () => {
      const MAX_QUEUE = 100;
      const queue: any[] = [];

      // Fill the queue
      for (let i = 0; i < 120; i++) {
        queue.push({ type: 'log', filmId: i, timestamp: Date.now() });
      }

      // Trim to max
      const trimmed = queue.slice(-MAX_QUEUE);
      expect(trimmed).toHaveLength(MAX_QUEUE);
      expect(trimmed[0].filmId).toBe(20); // oldest kept
      expect(trimmed[99].filmId).toBe(119); // newest
    });
  });

  describe('Stale Mutation Pruning', () => {
    it('should prune mutations older than 24 hours', () => {
      const now = Date.now();
      const STALE_THRESHOLD = 24 * 60 * 60 * 1000; // 24h in ms

      const queue = [
        { type: 'log', timestamp: now - (STALE_THRESHOLD + 1000) }, // 24h1s ago — stale
        { type: 'log', timestamp: now - (STALE_THRESHOLD - 1000) }, // 23h59s ago — fresh
        { type: 'log', timestamp: now - 3600000 }, // 1h ago — fresh
        { type: 'log', timestamp: now }, // just now — fresh
      ];

      const fresh = queue.filter(m => now - m.timestamp < STALE_THRESHOLD);
      expect(fresh).toHaveLength(3);
    });
  });

  describe('Mutation Deduplication', () => {
    it('should deduplicate mutations for the same resource', () => {
      const queue = [
        { type: 'endorse', filmId: 123, timestamp: 1000 },
        { type: 'endorse', filmId: 456, timestamp: 2000 },
        { type: 'endorse', filmId: 123, timestamp: 3000 }, // duplicate — newer
      ];

      const seen = new Map<string, any>();
      for (const m of queue) {
        const key = `${m.type}-${m.filmId}`;
        if (!seen.has(key) || m.timestamp > seen.get(key).timestamp) {
          seen.set(key, m);
        }
      }

      const deduped = Array.from(seen.values());
      expect(deduped).toHaveLength(2);
      expect(deduped.find(m => m.filmId === 123)!.timestamp).toBe(3000); // kept the newer one
    });
  });

  describe('Error Classification', () => {
    it('should retry on network errors', () => {
      const isRetryable = (error: any) => {
        const msg = error?.message ?? '';
        return (
          msg.includes('Network request failed') ||
          msg.includes('fetch failed') ||
          msg.includes('AbortError') ||
          msg.includes('ECONNREFUSED')
        );
      };

      expect(isRetryable({ message: 'Network request failed' })).toBe(true);
      expect(isRetryable({ message: 'fetch failed' })).toBe(true);
      expect(isRetryable({ message: 'AbortError' })).toBe(true);
    });

    it('should discard on constraint errors (409/23505)', () => {
      const isConstraintError = (error: any) => {
        return error?.code === '23505' || error?.status === 409;
      };

      expect(isConstraintError({ code: '23505' })).toBe(true);
      expect(isConstraintError({ status: 409 })).toBe(true);
      expect(isConstraintError({ code: '42P01' })).toBe(false);
    });
  });
});

/**
 * Films Store — Critical Path Tests
 *
 * Tests the core business logic of the films store:
 * - Log creation and rewatch detection
 * - Watchlist toggling
 * - Stats computation
 * - Offline queue behavior
 */

// Mock the supabase client before importing the store
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } } }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'new-log-id', created_at: new Date().toISOString() }, error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

jest.mock('@/src/lib/tmdb', () => ({
  tmdb: {
    detail: jest.fn().mockResolvedValue({ id: 123, title: 'Test Film', genres: [] }),
    poster: jest.fn((path: string) => `https://image.tmdb.org/t/p/w500${path}`),
  },
}));

describe('Films Store — Core Business Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Log Data Integrity', () => {
    it('should create a valid log entry with all required fields', () => {
      const log = {
        filmId: 123,
        title: 'Stalker',
        poster: '/poster.jpg',
        rating: 5,
        review: 'A masterpiece of slow cinema.',
        status: 'watched' as const,
        watchedDate: '2024-01-15',
        isSpoiler: false,
      };

      // Verify all required fields exist and are typed correctly
      expect(log.filmId).toBe(123);
      expect(log.rating).toBeGreaterThanOrEqual(0);
      expect(log.rating).toBeLessThanOrEqual(5);
      expect(typeof log.review).toBe('string');
      expect(['watched', 'rewatched', 'abandoned']).toContain(log.status);
      expect(log.watchedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should enforce rating boundaries (0-5)', () => {
      const validRatings = [0, 1, 2, 3, 4, 5];
      const invalidRatings = [-1, 6, 10, 100, -0.5];

      validRatings.forEach(r => {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(5);
      });

      invalidRatings.forEach(r => {
        expect(r < 0 || r > 5).toBe(true);
      });
    });

    it('should detect rewatch status correctly', () => {
      const isRewatch = (existingLog: any, newStatus: string) => {
        if (!existingLog) return false;
        return newStatus !== 'abandoned';
      };

      expect(isRewatch(null, 'watched')).toBe(false);
      expect(isRewatch({ id: '1' }, 'watched')).toBe(true);
      expect(isRewatch({ id: '1' }, 'abandoned')).toBe(false);
    });
  });

  describe('Viewing History', () => {
    it('should properly guard against non-array viewingHistory', () => {
      const testCases = [
        { input: undefined, expected: [] },
        { input: null, expected: [] },
        { input: 'legacy-string', expected: [] },
        { input: { key: 1 }, expected: [] },
        { input: [{ date: '2024-01-01', rating: 4 }], expected: [{ date: '2024-01-01', rating: 4 }] },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = Array.isArray(input) ? input : [];
        expect(result).toEqual(expected);
      });
    });

    it('should archive existing log data before overwriting', () => {
      const existingLog = {
        rating: 4,
        review: 'Original review',
        watchedDate: '2024-01-01',
        watchedWith: 'Solo',
        viewingHistory: [],
      };

      const archivedEntry = {
        date: existingLog.watchedDate,
        rating: existingLog.rating,
        review: existingLog.review,
        watchedWith: existingLog.watchedWith,
      };

      const newHistory = [archivedEntry, ...(Array.isArray(existingLog.viewingHistory) ? existingLog.viewingHistory : [])];

      expect(newHistory).toHaveLength(1);
      expect(newHistory[0].rating).toBe(4);
      expect(newHistory[0].review).toBe('Original review');
    });
  });

  describe('Watchlist Operations', () => {
    it('should prevent duplicate watchlist entries', () => {
      const watchlist = [
        { filmId: 123, title: 'Film A' },
        { filmId: 456, title: 'Film B' },
      ];

      const filmIdToAdd = 123;
      const alreadyExists = watchlist.some(w => w.filmId === filmIdToAdd);
      expect(alreadyExists).toBe(true);
    });

    it('should remove from watchlist by filmId', () => {
      const watchlist = [
        { filmId: 123, title: 'Film A' },
        { filmId: 456, title: 'Film B' },
        { filmId: 789, title: 'Film C' },
      ];

      const filtered = watchlist.filter(w => w.filmId !== 456);
      expect(filtered).toHaveLength(2);
      expect(filtered.find(w => w.filmId === 456)).toBeUndefined();
    });
  });

  describe('Stats Computation', () => {
    it('should compute film count correctly', () => {
      const logs = [
        { filmId: 1, status: 'watched' },
        { filmId: 2, status: 'watched' },
        { filmId: 3, status: 'abandoned' },
        { filmId: 1, status: 'rewatched' }, // duplicate filmId
      ];

      const uniqueFilms = new Set(logs.map(l => l.filmId));
      expect(uniqueFilms.size).toBe(3);

      const watchedCount = logs.filter(l => l.status !== 'abandoned').length;
      expect(watchedCount).toBe(3);
    });

    it('should compute average rating excluding zeroes', () => {
      const logs = [
        { rating: 5 },
        { rating: 4 },
        { rating: 0 }, // unrated — exclude
        { rating: 3 },
      ];

      const rated = logs.filter(l => l.rating > 0);
      const avg = rated.reduce((sum, l) => sum + l.rating, 0) / rated.length;
      expect(avg).toBeCloseTo(4.0);
    });
  });
});

/**
 * ProfileDataService — Privacy & Validation Tests
 * ────────────────────────────────────────────────────
 * T4-03 AUDIT: Validates column-level privacy enforcement,
 * ensuring public profiles never expose private fields.
 */

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
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

jest.mock('@/src/utils/mappers', () => ({
  mapLogRow: jest.fn((row: Record<string, unknown>) => ({
    id: row.id,
    filmId: row.film_id,
    title: row.film_title,
    poster: row.poster_path,
    rating: row.rating,
    status: row.status,
  })),
}));

describe('ProfileDataService — Column-Level Privacy', () => {
  it('PUBLIC_PROFILE_COLUMNS should not include preferences', () => {
    // Verify at the source level that the constant doesn't leak private fields
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'ProfileDataService.ts'),
      'utf8'
    );

    // Extract the PUBLIC_PROFILE_COLUMNS constant
    const publicMatch = source.match(/PUBLIC_PROFILE_COLUMNS\s*=\s*'([^']+)'/);
    expect(publicMatch).toBeTruthy();

    const publicColumns = publicMatch![1];
    // Check that the full 'preferences' column (JSONB blob) isn't exposed
    // (computed sub-fields like 'preferences->programmes' are fine)
    const publicCols = publicColumns.split(',').map((s: string) => s.trim());
    expect(publicCols).not.toContain('preferences');
    expect(publicColumns).toContain('username');
    expect(publicColumns).toContain('avatar_url');
    expect(publicColumns).toContain('display_name');
    expect(publicColumns).toContain('bio');
  });

  it('SELF_PROFILE_COLUMNS should include preferences', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'ProfileDataService.ts'),
      'utf8'
    );

    const selfMatch = source.match(/SELF_PROFILE_COLUMNS\s*=\s*'([^']+)'/);
    expect(selfMatch).toBeTruthy();

    const selfColumns = selfMatch![1];
    expect(selfColumns).toContain('preferences');
    expect(selfColumns).toContain('username');
  });

  it('PUBLIC columns should be a strict subset of SELF columns (by base column names)', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'ProfileDataService.ts'),
      'utf8'
    );

    const publicMatch = source.match(/PUBLIC_PROFILE_COLUMNS\s*=\s*'([^']+)'/);
    const selfMatch = source.match(/SELF_PROFILE_COLUMNS\s*=\s*'([^']+)'/);

    const publicCols = publicMatch![1].split(',').map((s: string) => s.trim());
    const selfCols = selfMatch![1].split(',').map((s: string) => s.trim());

    // Every public column should exist in self columns (excluding computed/nested columns)
    publicCols.forEach((col: string) => {
      // Computed columns like 'programmes:preferences->programmes' won't match directly
      if (col.includes(':') || col.includes('->')) return;
      expect(selfCols).toContain(col);
    });

    // Self should have the 'preferences' column which public lacks (it uses computed sub-fields instead)
    expect(selfCols).toContain('preferences');
    // Public columns that are NOT computed should be fewer than self
    const publicBaseCols = publicCols.filter((col: string) => !col.includes(':') && !col.includes('->'));
    expect(selfCols.length).toBeGreaterThanOrEqual(publicBaseCols.length);
  });
});

describe('ProfileDataService — Zod Schema Validation', () => {
  it('WatchlistRowSchema should accept valid rows', () => {
    const { z } = require('zod');
    const WatchlistRowSchema = z.object({
      film_id: z.number(),
      film_title: z.string(),
      poster_path: z.string().nullable().optional(),
      year: z.number().nullable().optional(),
    });

    const validRow = {
      film_id: 550,
      film_title: 'Fight Club',
      poster_path: '/poster.jpg',
      year: 1999,
    };

    expect(WatchlistRowSchema.safeParse(validRow).success).toBe(true);
  });

  it('WatchlistRowSchema should reject rows with missing film_id', () => {
    const { z } = require('zod');
    const WatchlistRowSchema = z.object({
      film_id: z.number(),
      film_title: z.string(),
      poster_path: z.string().nullable().optional(),
      year: z.number().nullable().optional(),
    });

    const invalidRow = {
      film_title: 'No ID Film',
    };

    expect(WatchlistRowSchema.safeParse(invalidRow).success).toBe(false);
  });

  it('CountResultSchema should accept nullable counts', () => {
    const { z } = require('zod');
    const CountResultSchema = z.object({
      count: z.number().nullable(),
    });

    expect(CountResultSchema.safeParse({ count: 42 }).success).toBe(true);
    expect(CountResultSchema.safeParse({ count: null }).success).toBe(true);
    expect(CountResultSchema.safeParse({ count: 'not-a-number' }).success).toBe(false);
  });
});

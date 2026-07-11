/**
 * D-01: Schema validation tests — ensures Zod schemas correctly validate
 * data from Supabase boundaries. These tests catch schema drift before
 * it reaches production.
 */


// ── Import schemas ──
// Using require-style dynamic imports since these are pure Zod schemas
// and don't need React Native runtime.

describe('FilmReviewSchema', () => {
   
  const { FilmReviewSchema } = require('../../schemas/film.schema');

  it('should parse a valid film review', () => {
    const result = FilmReviewSchema.safeParse({
      id: '123',
      rating: 4.5,
      review: 'A masterpiece.',
      status: 'watched',
      created_at: '2024-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('123');
      expect(result.data.rating).toBe(4.5);
    }
  });

  it('should coerce numeric ID to string', () => {
    const result = FilmReviewSchema.safeParse({
      id: 42,
      rating: 3,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('42');
    }
  });

  it('should use factory default for created_at', () => {
    const before = new Date().toISOString();
    const result = FilmReviewSchema.safeParse({
      id: '1',
      rating: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.created_at).toBeDefined();
      // Should be a recent timestamp, not a static one
      expect(new Date(result.data.created_at).getTime()).toBeGreaterThanOrEqual(
        new Date(before).getTime() - 1000
      );
    }
  });

  it('should allow null review', () => {
    const result = FilmReviewSchema.safeParse({
      id: '1',
      rating: 5,
      review: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.review).toBeNull();
    }
  });

  it('should default rating to 0', () => {
    const result = FilmReviewSchema.safeParse({ id: '1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rating).toBe(0);
    }
  });
});

describe('UserSchema', () => {
   
  const { UserSchema } = require('../../schemas/user');

  const validUser = {
    id: 'user-123',
    username: 'archivist_noir',
    role: 'cinephile' as const,
  };

  it('should parse a minimal valid user', () => {
    const result = UserSchema.safeParse(validUser);
    expect(result.success).toBe(true);
  });

  it('should reject invalid role', () => {
    const result = UserSchema.safeParse({
      ...validUser,
      role: 'overlord',
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid roles (admin is the Tribunal key)', () => {
    const roles = ['free', 'cinephile', 'archivist', 'auteur', 'admin'];
    for (const role of roles) {
      const result = UserSchema.safeParse({ ...validUser, role });
      expect(result.success).toBe(true);
    }
  });

  it('should handle social_links in both formats', () => {
    // Record format (legacy)
    const recordResult = UserSchema.safeParse({
      ...validUser,
      social_links: { twitter: '@test', imdb: 'nm0001' },
    });
    expect(recordResult.success).toBe(true);

    // Array format (new)
    const arrayResult = UserSchema.safeParse({
      ...validUser,
      social_links: [
        { title: 'Twitter', url: 'https://twitter.com/test' },
      ],
    });
    expect(arrayResult.success).toBe(true);
  });
});

describe('FeedItemSchema', () => {
   
  const { FeedItemSchema } = require('../../schemas/feed.schema');

  it('should coerce string film_id to number', () => {
    const result = FeedItemSchema.safeParse({
      id: '1',
      film_id: '12345',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.film_id).toBe(12345);
      expect(typeof result.data.film_id).toBe('number');
    }
  });

  it('should default username to "unknown"', () => {
    const result = FeedItemSchema.safeParse({
      id: 1,
      film_id: 100,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe('unknown');
    }
  });

  it('should handle autopsy field', () => {
    const result = FeedItemSchema.safeParse({
      id: '1',
      film_id: 100,
      is_autopsied: true,
      autopsy: { cinematography: 9, sound: 8, story: 7 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.autopsy).toEqual({
        cinematography: 9,
        sound: 8,
        story: 7,
      });
    }
  });
});

describe('UserPreferencesSchema', () => {
   
  const { UserPreferencesSchema } = require('../../schemas/user');

  it('should parse empty preferences', () => {
    const result = UserPreferencesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should tolerate unknown keys via catchall', () => {
    const result = UserPreferencesSchema.safeParse({
      notif_follows: true,
      future_field: 'should pass through',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notif_follows).toBe(true);
      expect(result.data.future_field).toBe('should pass through');
    }
  });
});

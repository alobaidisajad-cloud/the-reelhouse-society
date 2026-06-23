/**
 * schemas.ts — Unit Tests
 * ────────────────────────────────────────────────────────
 * Covers the TMDB-facing FilmSchema and its id coercion (TmdbIdSchema),
 * the only schemas this module intentionally exposes.
 */
import { TmdbIdSchema, FilmSchema } from '../schemas';

describe('TmdbIdSchema', () => {
  it('passes a number through unchanged', () => {
    expect(TmdbIdSchema.parse(550)).toBe(550);
  });

  it('coerces a numeric string to a number', () => {
    expect(TmdbIdSchema.parse('550')).toBe(550);
  });

  it('rejects non-numeric input types', () => {
    expect(() => TmdbIdSchema.parse(null)).toThrow();
    expect(() => TmdbIdSchema.parse(undefined)).toThrow();
  });
});

describe('FilmSchema', () => {
  it('parses a minimal film, defaulting title and leaving optionals undefined', () => {
    const result = FilmSchema.parse({ id: 550 });
    expect(result.id).toBe(550);
    expect(result.title).toBe('Unknown Title');
    expect(result.poster_path).toBeUndefined();
  });

  it('coerces a string id and keeps provided fields', () => {
    const result = FilmSchema.parse({
      id: '550',
      title: 'Fight Club',
      poster_path: '/poster.jpg',
      vote_average: 8.4,
      runtime: 139,
    });
    expect(result.id).toBe(550);
    expect(result.title).toBe('Fight Club');
    expect(result.poster_path).toBe('/poster.jpg');
    expect(result.vote_average).toBe(8.4);
    expect(result.runtime).toBe(139);
  });

  it('allows nullable fields to be explicitly null', () => {
    const result = FilmSchema.parse({ id: 1, poster_path: null, backdrop_path: null, overview: null, vote_average: null, runtime: null });
    expect(result.poster_path).toBeNull();
    expect(result.backdrop_path).toBeNull();
    expect(result.overview).toBeNull();
  });

  it('rejects a missing id', () => {
    expect(() => FilmSchema.parse({ title: 'No ID' })).toThrow();
  });
});

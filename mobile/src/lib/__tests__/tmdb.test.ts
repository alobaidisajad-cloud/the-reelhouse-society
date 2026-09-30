/**
 * tmdb.ts — Unit Tests
 * ────────────────────────────────────────────────────────
 * Covers the pure utility exports (obscurityScore, formatRuntime, getYear,
 * the image-URL builders) and the multi-tier search algorithm in tmdb.search
 * (exact/typo/semantic fallback tiers, person-result expansion, dedup), with
 * global.fetch mocked to stand in for the Supabase tmdb-proxy edge function.
 */
// jest.setup.ts globally mocks this module (films store onRehydrateStorage
// needs a lightweight stub); unmock it here to exercise the real implementation.
import { obscurityScore, formatRuntime, getYear, tmdb } from '../tmdb';

jest.unmock('../tmdb');

describe('obscurityScore', () => {
  it('returns 99 for zero or negative popularity', () => {
    expect(obscurityScore({ popularity: 0 })).toBe(99);
    expect(obscurityScore({ popularity: -5 })).toBe(99);
    expect(obscurityScore({})).toBe(99);
  });

  it('returns a low score for very popular films', () => {
    expect(obscurityScore({ popularity: 5000 })).toBeLessThanOrEqual(2);
  });

  it('clamps the score between 2 and 99', () => {
    expect(obscurityScore({ popularity: 1_000_000 })).toBeGreaterThanOrEqual(2);
    expect(obscurityScore({ popularity: 0.0001 })).toBeLessThanOrEqual(99);
  });
});

describe('formatRuntime', () => {
  it('returns an em dash for null/undefined/zero', () => {
    expect(formatRuntime(null)).toBe('—');
    expect(formatRuntime(undefined)).toBe('—');
    expect(formatRuntime(0)).toBe('—');
  });

  it('formats minutes under an hour without an hour segment', () => {
    expect(formatRuntime(45)).toBe('45m');
  });

  it('formats hours and minutes together', () => {
    expect(formatRuntime(125)).toBe('2h 5m');
  });

  it('formats an exact hour with a zero-minute remainder', () => {
    expect(formatRuntime(120)).toBe('2h 0m');
  });
});

describe('getYear', () => {
  it('returns an em dash for null/undefined/empty', () => {
    expect(getYear(null)).toBe('—');
    expect(getYear(undefined)).toBe('—');
    expect(getYear('')).toBe('—');
  });

  it('extracts the 4-digit year prefix from a date string', () => {
    expect(getYear('1999-10-15')).toBe('1999');
  });
});

describe('tmdb image URL builders', () => {
  it('poster returns undefined for a null/undefined path', () => {
    expect(tmdb.poster(null, 'w342')).toBeUndefined();
    expect(tmdb.poster(undefined, 'w342')).toBeUndefined();
  });

  it('poster builds a sized TMDB image URL', () => {
    expect(tmdb.poster('/abc.jpg', 'w342')).toBe('https://image.tmdb.org/t/p/w342/abc.jpg');
  });

  it('backdrop defaults to w1280', () => {
    expect(tmdb.backdrop('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w1280/abc.jpg');
  });

  it('profile defaults to w185', () => {
    expect(tmdb.profile('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w185/abc.jpg');
  });

  it('logo defaults to w45', () => {
    expect(tmdb.logo('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w45/abc.jpg');
  });


  it('youtubeThumbnail builds the hqdefault thumbnail URL from a video key', () => {
    expect(tmdb.youtubeThumbnail('dQw4w9WgXcQ')).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });
});

describe('tmdb.search', () => {
  const mockFetchOnce = (body: unknown, ok = true, status = 200) => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok, status,
      json: async () => body,
    });
  };

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('a catalogue that cannot be reached is not "no match": the search throws', async () => {
    // It answered { searchType: 'failed', results: [] }, and every search box
    // in the app told a member with no signal that the film does not exist.
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));
    await expect(tmdb.search('Inception')).rejects.toMatchObject({ name: 'TmdbUnreachable' });
    expect(global.fetch).toHaveBeenCalledTimes(3);   // tried, then said
  }, 10000);

  it('a search the catalogue answered with nothing is "failed", after every tier', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({ results: [] }) });
    const result = await tmdb.search('zzqxv');
    expect(result.searchType).toBe('failed');
    expect(result.results).toEqual([]);
  });

  it('marks movie results as exact matches and tags media_type: movie', async () => {
    mockFetchOnce({
      results: [{ id: 1, title: 'Inception', media_type: 'movie', popularity: 100 }],
      total_results: 1,
    });
    const result = await tmdb.search('Inception');
    expect(result.searchType).toBe('exact');
    expect(result.results).toEqual([{ id: 1, title: 'Inception', media_type: 'movie', popularity: 100 }]);
  });

  it('sorts an exact title match to the front regardless of popularity', async () => {
    mockFetchOnce({
      results: [
        { id: 1, title: 'Inception 2', media_type: 'movie', popularity: 500 },
        { id: 2, title: 'Inception', media_type: 'movie', popularity: 10 },
      ],
    });
    const result = await tmdb.search('Inception');
    expect(result.results[0].id).toBe(2);
  });

  it('keeps the catalogue’s order among exact matches: Casablanca the film before a person named Casablanca', async () => {
    // As the catalogue answered "casablanca" (e2e/supabase/functions/tmdb-proxy
    // fixtures): the film first, the person eighth. The search put the person
    // first, and a member tapping the top suggestion opened a stranger's page.
    mockFetchOnce({
      results: [
        { id: 289, title: 'Casablanca', media_type: 'movie', popularity: 13.88 },
        { id: 32876, name: 'Casablanca', media_type: 'tv', popularity: 2.28 },
        { id: 2377154, name: 'Casablanca', media_type: 'person', popularity: 0.27, profile_path: null },
      ],
    });
    const result = await tmdb.search('casablanca');
    expect(result.results.map((r: any) => r.id)).toEqual([289, 2377154]);
  });

  it('a person does not outrank the films the catalogue ranks above them', async () => {
    mockFetchOnce({
      results: [
        { id: 11, title: 'Star Wars', media_type: 'movie', popularity: 80 },
        { id: 77, name: 'Star Starling', media_type: 'person', popularity: 6, profile_path: '/s.jpg', known_for: [] },
      ],
    });
    const result = await tmdb.search('star');
    expect(result.results[0].id).toBe(11);
  });

  it('expands a high-popularity person result into their known-for movies, deduped, and labels person matches whose name is only part of the query', async () => {
    mockFetchOnce({
      results: [
        {
          id: 99, name: 'Christopher Nolan', media_type: 'person', popularity: 50, profile_path: '/nolan.jpg',
          known_for: [
            { id: 1, title: 'Inception', media_type: 'movie' },
            { id: 1, title: 'Inception', media_type: 'movie' },
          ],
        },
      ],
    });
    // Query isn't an exact textual match for the person's name, so the result
    // is tagged as a person-match rather than 'exact'.
    const result = await tmdb.search('Nolan director');
    expect(result.searchType).toBe('person');
    expect(result.matchedContext).toBe('Christopher Nolan');
    const movieIds = result.results.filter((r: any) => r.media_type === 'movie').map((r: any) => r.id);
    expect(movieIds).toEqual([1]);
  });

  it('excludes a low-popularity person result with no photo from the results', async () => {
    mockFetchOnce({
      results: [
        { id: 1, title: 'Some Movie', media_type: 'movie', popularity: 10 },
        { id: 99, name: 'Obscure Person', media_type: 'person', popularity: 0.1, profile_path: null },
      ],
    });
    const result = await tmdb.search('Some Movie');
    expect(result.results.some((r: any) => r.media_type === 'person')).toBe(false);
  });

  it('falls back to the typo tier when tier 1 returns no results, dropping the worst-fit word', async () => {
    mockFetchOnce({ results: [] });
    mockFetchOnce(null, false, 404);
    mockFetchOnce({
      results: [{ id: 5, title: 'The Matrix', media_type: 'movie', popularity: 200 }],
    });
    const result = await tmdb.search('teh matrix');
    expect(result.searchType).toBe('typo');
    expect(result.matchedContext).toContain('IGNORED');
  }, 10000);
});

describe('a catalogue read tells "not there" from "could not ask"', () => {
  const answer = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: async () => body });
  beforeEach(() => { global.fetch = jest.fn(); });

  it('a film the catalogue does not have is an answer: null', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(answer(404));
    await expect(tmdb.detail(910001)).resolves.toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('a catalogue failing for a moment is asked again, and its answer kept', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(answer(503))
      .mockResolvedValueOnce(answer(200, { id: 910002, title: 'Sunrise' }));
    await expect(tmdb.detail(910002)).resolves.toMatchObject({ title: 'Sunrise' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  }, 10000);

  it('one that keeps failing is unreachable, after three tries — never an empty answer', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(answer(502));
    await expect(tmdb.trending('day')).rejects.toMatchObject({ name: 'TmdbUnreachable' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  }, 10000);

  it('the proxy refusing the app is unreachable at once, not a missing film', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(answer(401));
    await expect(tmdb.detail(910003)).rejects.toMatchObject({ name: 'TmdbUnreachable' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('a failure is not remembered: the next read asks again', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    await expect(tmdb.detail(910004)).rejects.toMatchObject({ name: 'TmdbUnreachable' });
    (global.fetch as jest.Mock).mockReset().mockResolvedValue(answer(200, { id: 910004, title: 'Greed' }));
    await expect(tmdb.detail(910004)).resolves.toMatchObject({ title: 'Greed' });
  }, 10000);
});

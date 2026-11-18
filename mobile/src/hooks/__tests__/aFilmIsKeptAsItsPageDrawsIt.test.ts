/**
 * A film's read keeps what its page draws, not the catalogue's whole answer (round 13).
 *
 * The read is kept on the phone's disk with the rest of the cache. TMDB's appended detail carries
 * every country's release dates and services, the whole cast and crew and two pages of films like
 * it, often 100-300 KB a film; ten films opened filled the cache, and every write of it serialised
 * them all. The page draws fifteen of the cast, the directors, one country's services and one
 * certificate: those are what is kept, and the page draws the same from them.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { filmAsDrawn, poolAsDrawn, CAST_DRAWN, VIDEOS_DRAWN } from '@/src/hooks/filmAsDrawn';
import { buildRecommendationPool } from '@/src/utils/recommendations';
import { youtubeKey } from '@/src/utils/outsideValues';
import { pickCertificate } from '@/src/components/film/pickCertificate';
import { pickRegion } from '@/src/components/film/WatchProviders';

jest.mock('@/src/utils/deviceRegion', () => ({ deviceRegion: () => mockRegion.value }));
const mockRegion: { value: string | null } = { value: 'GB' };

const COUNTRIES = Array.from({ length: 60 }, (_, i) => `${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`);

/** A catalogue answer the size TMDB sends for a well-known film. */
const answer = () => ({
  id: 550,
  title: 'Fight Club',
  runtime: 139,
  overview: 'An insomniac office worker...',
  production_countries: [{ iso_3166_1: 'US' }],
  videos: { results: [{ site: 'YouTube', key: 'SUXWAEX2jlg', type: 'Trailer', name: 'Official Trailer' }] },
  credits: {
    cast: Array.from({ length: 80 }, (_, i) => ({ id: i, name: `Actor ${i}`, character: `Part ${i}`, profile_path: `/a${i}.jpg` })),
    crew: [
      ...Array.from({ length: 300 }, (_, i) => ({ id: 1000 + i, name: `Crew ${i}`, job: 'Grip', department: 'Camera' })),
      { id: 7467, name: 'David Fincher', job: 'Director', department: 'Directing' },
    ],
  },
  'watch/providers': {
    results: Object.fromEntries([...COUNTRIES, 'GB', 'US'].map((c) => [c, { link: `https://watch/${c}`, flatrate: [{ provider_name: `Service ${c}`, logo_path: '/l.jpg' }] }])),
  },
  release_dates: {
    results: [...COUNTRIES, 'GB', 'US'].map((c) => ({ iso_3166_1: c, release_dates: [{ certification: c === 'GB' ? '18' : c === 'US' ? 'R' : `${c}-16`, release_date: '1999-10-15', note: '' }] })),
  },
  recommendations: { results: Array.from({ length: 20 }, (_, i) => ({ id: 2000 + i, title: `Like it ${i}`, overview: 'x'.repeat(300) })) },
  similar: { results: Array.from({ length: 20 }, (_, i) => ({ id: 3000 + i, title: `Similar ${i}`, overview: 'x'.repeat(300) })) },
});

describe("a film's read keeps what its page draws", () => {
  beforeEach(() => { mockRegion.value = 'GB'; });

  it('keeps the first fifteen of the cast and the directors, and the page names the same people', () => {
    const whole = answer();
    const kept = filmAsDrawn(whole);
    expect(kept.credits.cast).toEqual(whole.credits.cast.slice(0, CAST_DRAWN));
    expect(kept.credits.crew.filter((c) => c.job === 'Director')).toEqual(whole.credits.crew.filter((c) => c.job === 'Director'));
    expect(kept.credits.crew.map((c) => c.name)).toEqual(['David Fincher']);
  });

  it("keeps the member's own country's services and certificate, the ones the page shows", () => {
    const whole = answer();
    const kept = filmAsDrawn(whole);
    expect(Object.keys(kept['watch/providers'].results)).toEqual(['GB']);
    expect(kept['watch/providers'].results.GB).toEqual(whole['watch/providers'].results.GB);
    expect(pickCertificate(kept.release_dates, 'US', 'GB')).toEqual(pickCertificate(whole.release_dates, 'US', 'GB'));
    expect(pickCertificate(kept.release_dates, 'US', 'GB')).toEqual({ value: '18', region: 'GB' });
  });

  it('a phone that names no country is shown the country the page would choose, and only that one', () => {
    mockRegion.value = null;
    const whole = answer();
    const kept = filmAsDrawn(whole);
    const shown = pickRegion(whole['watch/providers'].results, null);
    expect(shown).toBe('US');
    expect(Object.keys(kept['watch/providers'].results)).toEqual(['US']);
    expect(pickCertificate(kept.release_dates, 'US', null)).toEqual(pickCertificate(whole.release_dates, 'US', null));
  });

  it("keeps the film's own facts whole, and not the two pages of films like it (their pool is built first)", () => {
    const whole = answer();
    const kept = filmAsDrawn(whole) as Record<string, unknown>;
    expect([kept.id, kept.title, kept.runtime, kept.overview]).toEqual([550, 'Fight Club', 139, 'An insomniac office worker...']);
    expect(kept.videos).toEqual(whole.videos);
    expect('recommendations' in kept).toBe(false);
    expect('similar' in kept).toBe(false);
  });

  it('is a small part of the whole answer, so the cache written to disk stays small', () => {
    const whole = answer();
    const size = (v: unknown) => JSON.stringify(v).length;
    expect(size(filmAsDrawn(whole))).toBeLessThan(size(whole) / 10);
  });

  it('a film the catalogue does not have stays the answer it is', () => {
    expect(filmAsDrawn(null)).toBeNull();
    expect(filmAsDrawn({ id: 1, title: 'Bare' })).toEqual({ id: 1, title: 'Bare' });
  });
});

// Round 13's review: on TMDB's real answers the kept read was still 22-37 KB, the pool of films like
// it kept whole (overviews, genres, votes) and every video (76 for one film). Measured on the repo's
// own recorded answers, each kept as its page draws it.
describe('on the catalogue\'s real answers', () => {
  const DIR = join(__dirname, '..', '..', '..', 'e2e', 'supabase', 'functions', 'tmdb-proxy', 'fixtures');
  const films = readdirSync(DIR).filter((f) => /^movie_\d+_append_to_response/.test(f))
    .map((f) => (JSON.parse(readFileSync(join(DIR, f), 'utf8')) as { body: Record<string, any> }).body);
  type V = { site?: string; key?: string; type?: string; name?: string };
  /** The page's own choices: its six videos, and the trailer its TRAILER row opens. */
  const pageOf = (detail: Record<string, any>) => {
    const playable = ((detail.videos?.results ?? []) as V[]).filter((v) => v.site === 'YouTube' && youtubeKey(v.key));
    const trailer = playable.find((v) => v.type === 'Trailer' && v.name?.toLowerCase().includes('official'))
      ?? playable.find((v) => v.type === 'Trailer') ?? playable.find((v) => v.type === 'Teaser') ?? null;
    return { listed: playable.slice(0, 6).map((v) => v.key), trailer: trailer?.key ?? null };
  };
  const size = (v: unknown) => JSON.stringify(v).length;

  it('reads the recorded films', () => {
    expect(films.length).toBeGreaterThanOrEqual(5);
  });

  it('keeps of each film like it only what its card draws: its poster, its title, its id', () => {
    for (const whole of films) {
      const pool = poolAsDrawn(buildRecommendationPool(whole.recommendations?.results, whole.similar?.results, whole.id));
      expect(pool.length).toBeGreaterThan(0);
      for (const entry of pool) expect(Object.keys(entry).sort()).toEqual(['id', 'name', 'poster_path', 'title']);
    }
  });

  it('keeps the six videos the page lists and the trailer it opens, as the whole answer gives them', () => {
    for (const whole of films) {
      const kept = filmAsDrawn(whole) as Record<string, any>;
      expect(kept.videos.results.length).toBeLessThanOrEqual(VIDEOS_DRAWN + 1);
      expect(pageOf(kept)).toEqual(pageOf(whole));
    }
  });

  it('keeps a film in some 10-12 KB, about a tenth of the whole answer', () => {
    for (const whole of films) {
      const read = {
        detail: filmAsDrawn(whole),
        similar: poolAsDrawn(buildRecommendationPool(whole.recommendations?.results, whole.similar?.results, whole.id)),
      };
      expect(size(read)).toBeLessThan(13 * 1024);
      expect(size(read)).toBeLessThan(size(whole) / 6);
    }
  });
});

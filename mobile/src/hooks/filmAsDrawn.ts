/**
 * filmAsDrawn — a film's catalogue answer cut to what its page draws.
 *
 * TMDB's appended detail carries every country's release dates and streaming services, the whole
 * cast and crew, every video, and two pages of films like it: 85-202 KB a film in the repo's real
 * answers (e2e/supabase/functions/tmdb-proxy/fixtures). The page draws the first fifteen of the
 * cast, the directors, one country's services, one certificate, six of the YouTube videos and the
 * trailer, and of each film like it its poster and title (the pool, built from the two pages before
 * this cut, kept by poolAsDrawn). The film's read keeps only that: some 10-12 KB a film on those
 * answers, so the cache the phone writes to disk holds about a tenth of the whole, and every write
 * of it serialises that much less. The whole answer stays in the catalogue's own memory (tmdb.ts)
 * for the session.
 */
import { pickCertificate, type ReleaseDates } from '@/src/components/film/pickCertificate';
import { pickRegion } from '@/src/components/film/WatchProviders';
import { deviceRegion } from '@/src/utils/deviceRegion';
import { youtubeKey } from '@/src/utils/outsideValues';

/** As many of the cast as the page draws. */
export const CAST_DRAWN = 15;
/** As many videos as the page lists. */
export const VIDEOS_DRAWN = 6;

type Video = { site?: string; key?: unknown; type?: string; name?: string };

/**
 * The videos the page draws: the first six it can play (YouTube, a key it trusts), and the trailer
 * its TRAILER row opens, chosen as the page chooses it (an official trailer, then any trailer, then
 * a teaser), kept after the six when it is not among them.
 */
function videosAsDrawn(results: unknown): Video[] {
  const playable = (Array.isArray(results) ? results as Video[] : []).filter((v) => v?.site === 'YouTube' && youtubeKey(v.key));
  const trailer = playable.find((v) => v.type === 'Trailer' && v.name?.toLowerCase().includes('official'))
    ?? playable.find((v) => v.type === 'Trailer') ?? playable.find((v) => v.type === 'Teaser');
  const listed = playable.slice(0, VIDEOS_DRAWN);
  return trailer && !listed.includes(trailer) ? [...listed, trailer] : listed;
}

/** A film like it, as its card draws it: the poster and the title, and the id it opens. */
export type PoolFilm = { id: number; title?: string; name?: string; poster_path?: string | null };
export function poolAsDrawn(pool: readonly PoolFilm[]): PoolFilm[] {
  return pool.map(({ id, title, name, poster_path }) => ({ id, title, name, poster_path }));
}

type Person = { job?: string };
type Detail = Record<string, unknown> & {
  credits?: { cast?: unknown[]; crew?: Person[] } | null;
  'watch/providers'?: { results?: Record<string, unknown> | null } | null;
  release_dates?: ReleaseDates | null;
  production_countries?: { iso_3166_1?: string }[] | null;
};

export function filmAsDrawn<T>(detail: T): T {
  if (!detail || typeof detail !== 'object') return detail;
  const { recommendations: _pool1, similar: _pool2, ...film } = detail as Detail;
  const drawn: Detail = { ...film };

  const credits = film.credits;
  if (credits && typeof credits === 'object') {
    drawn.credits = {
      cast: Array.isArray(credits.cast) ? credits.cast.slice(0, CAST_DRAWN) : [],
      // The page names its directors from the crew, and no one else.
      crew: Array.isArray(credits.crew) ? credits.crew.filter((c) => c?.job === 'Director') : [],
    };
  }

  const videos = (film.videos as { results?: unknown } | null | undefined)?.results;
  if (videos !== undefined) drawn.videos = { results: videosAsDrawn(videos) };

  const providers = film['watch/providers']?.results;
  if (providers && typeof providers === 'object') {
    // The one country the page shows, chosen as WatchProviders chooses it.
    const region = pickRegion(providers, deviceRegion());
    const shown = region !== null ? providers[region] : undefined;
    drawn['watch/providers'] = { results: region !== null && shown !== undefined ? { [region]: shown } : {} };
  }

  if (film.release_dates && typeof film.release_dates === 'object') {
    // The one certificate the page prints, with its country, chosen as the page chooses it.
    const picked = pickCertificate(film.release_dates, film.production_countries?.[0]?.iso_3166_1, deviceRegion());
    drawn.release_dates = {
      results: picked ? [{ iso_3166_1: picked.region, release_dates: [{ certification: picked.value }] }] : [],
    };
  }

  return drawn as T;
}

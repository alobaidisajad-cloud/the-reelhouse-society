// ============================================================
// REELHOUSE MOBILE — TMDB API Client
// Resilient, cached, deduplicated — ported from web
// ============================================================
import { isTmdbUnreachable, TmdbUnreachable } from './tmdbErrors';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const PROXY_URL = `${SUPABASE_URL}/functions/v1/tmdb-proxy`;
// F-1: the TMDB API key is NOT read on the client — it lives only in the tmdb-proxy
// edge function's server-side secret, so it can never be extracted from the JS bundle.
const TMDB_IMG = 'https://image.tmdb.org/t/p';

// ── Response interfaces ──
interface TMDBWatchProvider {
    provider_id: number;
    provider_name: string;
    logo_path: string;
}

export interface TMDBWatchProviderResult {
    link?: string;
    /** Free to watch, with no subscription. */
    free?: TMDBWatchProvider[];
    /** Free, with advertising. */
    ads?: TMDBWatchProvider[];
    /** With a subscription to the service. */
    flatrate?: TMDBWatchProvider[];
    rent?: TMDBWatchProvider[];
    buy?: TMDBWatchProvider[];
}

interface TMDBSearchResult {
    id: number;
    title?: string;
    name?: string;
    media_type?: string;
    poster_path?: string | null;
    profile_path?: string | null;
    popularity?: number;
    known_for?: TMDBSearchResult[];
    release_date?: string;
    vote_average?: number;
    vote_count?: number;
    known_for_department?: string;
    overview?: string;
}

interface TMDBSearchResponse {
    results: TMDBSearchResult[];
    total_results?: number;
    total_pages?: number;
    page?: number;
    searchType?: string;
    matchedContext?: string;
}

export interface CrewMember {
    id: number;
    job: string;
    name: string;
    profile_path?: string | null;
}

export interface CastMember {
    id: number;
    character: string;
    name: string;
    profile_path?: string | null;
}

export interface VideoResult {
    id: string;
    site: string;
    key: string;
    type: string;
    name?: string;
}

interface TMDBMovieDetail {
    id: number;
    title: string;
    overview?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    release_date?: string;
    runtime?: number;
    vote_average?: number;
    genres?: { id: number; name: string }[];
    credits?: { cast?: CastMember[]; crew?: CrewMember[] };
    videos?: { results?: VideoResult[] };
    similar?: { results?: TMDBSearchResult[] };
    production_countries?: { iso_3166_1: string; name: string }[];
    production_companies?: { id: number; name: string; logo_path?: string | null; origin_country?: string }[];
    status?: string;
    original_language?: string;
    budget?: number;
    revenue?: number;
    tagline?: string;
    vote_count?: number;
    'watch/providers'?: { results?: Record<string, TMDBWatchProviderResult> };
    release_dates?: { results?: { iso_3166_1: string; release_dates: { certification?: string; type: number; release_date: string }[] }[] };
    popularity?: number;
}

export type { TMDBMovieDetail };

/** One image of a film, as TMDB files it. `iso_639_1` null: no words on it. */
export interface TMDBArt {
    file_path: string;
    iso_639_1?: string | null;
    vote_average?: number;
    vote_count?: number;
    width?: number;
    height?: number;
}

interface TMDBMovieListResponse {
    results: TMDBSearchResult[];
    total_results?: number;
    total_pages?: number;
    page?: number;
}

interface TMDBPersonDetail {
    id: number;
    name: string;
    biography?: string;
    profile_path?: string | null;
    birthday?: string;
    deathday?: string | null;
    place_of_birth?: string;
    known_for_department?: string;
    also_known_as?: string[];
}

interface TMDBPersonCredits {
    cast?: TMDBSearchResult[];
    crew?: TMDBSearchResult[];
}

// ── Simple LRU cache (memory-only, 200 entries, 10min TTL) ──
const _cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE = 200;             // Reduced from 500 — mobile memory safety

function cacheGet(key: string): unknown | undefined {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return undefined; }
  
  // LRU bump: Move to the end of the Map to mark as recently used
  _cache.delete(key);
  _cache.set(key, entry);
  
  return entry.data;
}

function cacheSet(key: string, data: unknown) {
  // Batch prune oldest 50 entries to prevent single-eviction linear growth
  if (_cache.size >= MAX_CACHE) {
    const keys = [..._cache.keys()].slice(0, 50);
    keys.forEach(k => _cache.delete(k));
  }
  _cache.set(key, { data, ts: Date.now() });
}

// ── Inflight dedup ──
const _inflight = new Map<string, Promise<unknown>>();

// Single source of truth for the movie-detail cache key (detail + peekDetail).
// `recommendations` = TMDB's behaviour-based engine (the real "you may also
// like"); `similar` stays as the genre/keyword fallback for obscure titles.
// Both ride the one detail call — no extra round trip.
const detailPath = (id: number) =>
  `/movie/${id}?append_to_response=credits,videos,recommendations,similar,watch/providers,release_dates`;

/**
 * One catalogue read, through the tmdb-proxy (the only path: it holds the key).
 *
 * `fallback` is the answer for "not there" (a 404, or a request TMDB rejects).
 * A catalogue that cannot be REACHED (no connection, or 5xx/429 through three
 * tries, or the proxy refusing us) throws TmdbUnreachable instead: answered
 * with the fallback, React Query cached an empty success for minutes and a
 * screen said "nothing found" to a member who had no signal.
 */
async function fetchTMDB<T = unknown>(path: string, fallback: T | null = null): Promise<T | null> {
  const cached = cacheGet(path);
  if (cached !== undefined) return cached as T;

  const existing = _inflight.get(path);
  if (existing) return existing as Promise<T | null>;

  const promise = (async () => {
    let why = 'no answer';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        let res: Response;
        try {
          res = await fetch(PROXY_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ path }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        // A server failing for a moment: tried again, then unreachable.
        if (res.status === 429 || res.status >= 500) {
          why = `status ${res.status}`;
          if (attempt < 2) await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
          continue;
        }
        // The proxy refusing the app is not a missing film.
        if (res.status === 401 || res.status === 403) throw new TmdbUnreachable(path, `status ${res.status}`);
        if (!res.ok) return fallback; // 404 and the like: not there.
        const data = await res.json();
        if (!path.includes('/search/')) cacheSet(path, data);
        return data as T;
      } catch (e: unknown) {
        if (isTmdbUnreachable(e)) throw e;
        why = e instanceof Error ? e.message : String(e);
        if (attempt < 2) await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
    throw new TmdbUnreachable(path, why);
  })();

  _inflight.set(path, promise);
  // Cleared either way; the rejection is the caller's, not this bookkeeping's.
  promise.then(() => _inflight.delete(path), () => _inflight.delete(path));
  return promise;
}

export const tmdb = {
  // ── Search ──
  search: async (query: string, page = 1) => {
    const searchStart = Date.now();
    const SEARCH_BUDGET_MS = 6000;

    // TIER 1: Omni-Search — routed through hardened fetchTMDB (timeout + retry + dedup).
    // A catalogue that cannot be reached THROWS (TmdbUnreachable), as every
    // catalogue read does: it is not "no match", and the searcher says so.
    const data = await fetchTMDB<TMDBSearchResponse>(
      `/search/multi?query=${encodeURIComponent(query)}&page=${page}&include_adult=false`,
      { results: [], total_results: 0, total_pages: 0, page: 1 }
    );
    if (!data) return { searchType: 'failed', results: [] } as TMDBSearchResponse;

    let items: TMDBSearchResult[] = [];
    let topPerson: string | null = null;

    if (data.results?.length > 0) {
        // The catalogue's own order is its relevance; an exact title or name is
        // lifted to the front, and nothing else is reordered (the sort is
        // stable). It used to put every PERSON before every film: "casablanca"
        // put a person named Casablanca (popularity 0.27, no photograph) above
        // the 1942 film the catalogue ranks first.
        const queryLower = query.toLowerCase();
        const exact = (r: TMDBSearchResult) => ((r.name || r.title) ?? '').toLowerCase() === queryLower;
        const sortedResults = [...data.results].sort((a: TMDBSearchResult, b: TMDBSearchResult) =>
            Number(exact(b)) - Number(exact(a)));

        for (const item of sortedResults) {
            if (item.media_type === 'movie') {
                items.push({ ...item, media_type: 'movie' });
            } else if (item.media_type === 'person') {
                const isExact = (item.name || '').toLowerCase() === query.toLowerCase();
                const hasPhoto = !!item.profile_path;
                const isHighPop = (item.popularity || 0) > 5;

                if (isExact || hasPhoto || isHighPop) {
                    if (!topPerson) topPerson = item.name ?? null;
                    items.push({ ...item, media_type: 'person' });
                }

                if (hasPhoto || isHighPop || isExact) {
                    const knownFor = item.known_for?.filter((k: TMDBSearchResult) => k.media_type === 'movie') || [];
                    items.push(...knownFor.map((m: TMDBSearchResult) => ({ ...m, media_type: 'movie' })));
                }
            }
        }

        if (items.length > 0 || page > 1) {
            const ids = new Set<string>();
            const unique = items.filter((m: TMDBSearchResult) => {
                const key = `${m.media_type || 'movie'}-${m.id}`;
                if (ids.has(key)) return false;
                ids.add(key);
                return true;
            });

            data.results = unique;

            const firstMatch = unique[0];
            const firstText = (firstMatch?.title || firstMatch?.name || '').toLowerCase();
            const queryText = query.toLowerCase();

            if (topPerson && !firstText.includes(queryText)) {
                data.searchType = 'person';
                data.matchedContext = topPerson;
            } else {
                data.searchType = 'exact';
            }
            return data;
        }
    }

    // Budget check: skip fallback tiers if Tier 1 already consumed most of the time budget
    if (Date.now() - searchStart > SEARCH_BUDGET_MS) {
        data.searchType = 'failed';
        return data;
    }

    // TIER 2: Typo Fallback — also routed through fetchTMDB
    const cleanWords = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 0);
    if (cleanWords.length > 1 && cleanWords.length <= 6) {
        const fallbacks = [];
        for (let i = 0; i < cleanWords.length; i++) {
            const words = [...cleanWords];
            const dropped = words.splice(i, 1)[0];
            const text = words.join(' ');
            if (text.length > 2) {
                fallbacks.push({ text, dropped });
            }
        }

        const fallbackResults = await Promise.all(fallbacks.map(async (fb) => {
            try {
                const fData = await fetchTMDB<TMDBSearchResponse>(
                    `/search/multi?query=${encodeURIComponent(fb.text)}&page=1&include_adult=false`,
                    null
                );
                if (fData?.results?.length) {
                    const bestItem = [...fData.results].sort((a: TMDBSearchResult, b: TMDBSearchResult) => ((b.popularity ?? 0) - (a.popularity ?? 0)))[0];
                    return { data: fData, fallback: fb, bestItem };
                }
            } catch { }
            return null;
        }));

        let winner = null;
        let highestPop = -1;
        for (const fbResult of fallbackResults) {
            if (fbResult && fbResult.bestItem && (fbResult.bestItem.popularity ?? 0) > highestPop) {
                highestPop = fbResult.bestItem.popularity ?? 0;
                winner = fbResult;
            }
        }

        if (winner) {
            const typoItems: TMDBSearchResult[] = [];
            for (const item of winner.data.results) {
                if (item.media_type === 'movie') typoItems.push({ ...item, media_type: 'movie' });
                else if (item.media_type === 'person') {
                    typoItems.push({ ...item, media_type: 'person' });
                    const known = item.known_for?.filter((k: TMDBSearchResult) => k.media_type === 'movie') || [];
                    typoItems.push(...known.map((k: TMDBSearchResult) => ({ ...k, media_type: 'movie' })));
                }
            }
            const ids = new Set<string>();
            winner.data.results = typoItems.filter((m: TMDBSearchResult) => {
                const key = `${m.media_type || 'movie'}-${m.id}`;
                if (ids.has(key)) return false;
                ids.add(key); return true;
            });
            winner.data.searchType = 'typo';
            winner.data.matchedContext = `IGNORED "${winner.fallback.dropped.toUpperCase()}"`;
            return winner.data;
        }
    }

    // Budget check: skip semantic tier if budget exhausted
    if (Date.now() - searchStart > SEARCH_BUDGET_MS) {
        data.searchType = 'failed';
        return data;
    }

    // TIER 3: Semantic Logic — also routed through fetchTMDB
    const words = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w: string) => w.length > 2);
    if (words.length > 0) {
        const keywordIds: number[] = [];
        await Promise.all(words.map(async (word: string) => {
            try {
                const kwData = await fetchTMDB<{ results: { id: number }[] }>(
                    `/search/keyword?query=${encodeURIComponent(word)}`,
                    null
                );
                if (kwData?.results?.length) keywordIds.push(kwData.results[0].id);
            } catch { }
        }));
        if (keywordIds.length > 0) {
            const discoverData = await fetchTMDB<TMDBMovieListResponse>(
                `/discover/movie?with_keywords=${keywordIds.join('|')}&sort_by=popularity.desc&page=1`,
                null
            ).catch(() => null); // a fallback tier: its failure leaves tier 1's answer
            if (discoverData?.results?.length) {
                return {
                    ...discoverData,
                    searchType: 'semantic',
                    matchedContext: words.join(', '),
                } as TMDBSearchResponse;
            }
        }
    }

    data.searchType = 'failed';
    return data;
  },

  // ── Film Details ──
  detail: async (id: number) => fetchTMDB<TMDBMovieDetail>(detailPath(id), null),

  /**
   * Synchronous LRU peek for the film page's instant placeholder — returns the
   * cached detail (warm from the feed's viewability prefetch) without a promise
   * or network. Shares detailPath() with detail() so the key can never drift.
   */
  peekDetail: (id: number): TMDBMovieDetail | undefined =>
    cacheGet(detailPath(id)) as TMDBMovieDetail | undefined,

  // ── Trending ──
  trending: async (timeWindow = 'week') => fetchTMDB<TMDBMovieListResponse>(
    `/trending/movie/${timeWindow}`,
    { results: [] }
  ),

  /**
   * The Canon — films that actually built the medium.
   *
   * NOT TMDB's top-rated list. That endpoint sorts by raw vote average with a low
   * vote-count floor, so a three-week-old release with a few hundred votes
   * outranks the canon. Measured against production on 2026-08-13 it returned:
   *
   *   Avatar Aang (2026)          9.273
   *   Accidental Partners (2026)  8.9
   *   Swapped (2026)              8.886
   *   The Shawshank Redemption    8.727   <- fourth
   *   The Godfather               8.686   <- sixth
   *
   * So the Lobby's "ESSENTIAL ARCHIVES · The films that built the medium" was
   * showing this month's releases — quietly contradicting the one thing that
   * section claims.
   *
   * A vote-count floor fixes it, and the number matters: at 5,000 a 2026 title
   * still slips in. At 8,000 the list reads Shawshank, The Godfather, Godfather
   * II, Schindler's List, 12 Angry Men, The Dark Knight, Spirited Away, The
   * Green Mile. Both thresholds were run against the live proxy, not reasoned
   * about.
   *
   * Response shape is identical to the top-rated list's (checked field by field), and the
   * rail reads only `id` and `poster_path`.
   */
  canon: async (page = 1) => fetchTMDB<TMDBMovieListResponse>(
    `/discover/movie?sort_by=vote_average.desc&vote_count.gte=8000&page=${page}`,
    { results: [] }
  ),


  // ── Similar ──
  similar: async (id: number) => {
    const data = await fetchTMDB<{ results: unknown[] }>(`/movie/${id}/similar?page=1`, { results: [] });
    return data?.results || [];
  },

  // ── Person ──
  person: async (id: number) => fetchTMDB<TMDBPersonDetail>(`/person/${id}`, null),
  personCredits: async (id: number) => fetchTMDB<TMDBPersonCredits>(`/person/${id}/movie_credits`, null),

  // ── Images (the log composer's alternate posters and stills) ──
  movieImages: async (id: number) => fetchTMDB<{ posters: { file_path: string }[]; backdrops: { file_path: string }[]; logos: { file_path: string }[] }>(`/movie/${id}/images`, { posters: [], backdrops: [], logos: [] }),

  /**
   * The film's art with NO words on it (TMDB files it under no language): the
   * Lobby's one-sheet lays its own title over the art, and a poster that
   * already prints its title would print it twice.
   */
  keyArt: async (id: number) => fetchTMDB<{ posters: TMDBArt[]; backdrops: TMDBArt[] }>(
    `/movie/${id}/images?include_image_language=null`, { posters: [], backdrops: [] }),

  // ── Discover ──
  discover: async (params: Record<string, string> = {}) => {
    const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    return fetchTMDB<TMDBMovieListResponse>(`/discover/movie?${qs}`, { results: [] });
  },

  // ── Image URLs ──
  poster: (path: string | null | undefined, size: 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original') =>
    path ? `${TMDB_IMG}/${size}${path}` : undefined,

  backdrop: (path: string | null | undefined, size = 'w1280') =>
    path ? `${TMDB_IMG}/${size}${path}` : undefined,

  profile: (path: string | null | undefined, size = 'w185') =>
    path ? `${TMDB_IMG}/${size}${path}` : undefined,

  logo: (path: string | null | undefined, size = 'w45') =>
    path ? `${TMDB_IMG}/${size}${path}` : undefined,

  youtubeThumbnail: (key: string) => `https://img.youtube.com/vi/${key}/hqdefault.jpg`,
};

// ── Utility Functions ──
export function obscurityScore(movie: { popularity?: number }) {
  const pop = movie.popularity || 0;
  if (pop <= 0) return 99;
  const score = Math.round(100 - (Math.log10(Math.max(pop, 1)) / Math.log10(5000)) * 98);
  return Math.max(2, Math.min(99, score));
}

export function formatRuntime(minutes: number | null | undefined) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function getYear(dateStr: string | null | undefined) {
  return dateStr ? dateStr.slice(0, 4) : '—';
}

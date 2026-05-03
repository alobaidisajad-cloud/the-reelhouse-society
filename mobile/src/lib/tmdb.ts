// ============================================================
// REELHOUSE MOBILE — TMDB API Client
// Resilient, cached, deduplicated — ported from web
// ============================================================

const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

// ── Response interfaces ──
interface TMDBWatchProvider {
    provider_id: number;
    provider_name: string;
    logo_path: string;
}

export interface TMDBWatchProviderResult {
    link?: string;
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
    release_dates?: { results?: { iso_3166_1: string; release_dates: { certification: string }[] }[] };
    popularity?: number;
}

export type { TMDBMovieDetail };

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

// ── Simple LRU cache (memory-only, 200 entries, 5min TTL) ──
const _cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE = 200;             // M-01 AUDIT FIX: Reduced from 500 — mobile memory safety

function cacheGet(key: string): unknown | undefined {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return undefined; }
  return entry.data;
}

function cacheSet(key: string, data: unknown) {
  // L-12 FIX: Batch prune oldest 50 entries to prevent single-eviction linear growth
  if (_cache.size >= MAX_CACHE) {
    const keys = [..._cache.keys()].slice(0, 50);
    keys.forEach(k => _cache.delete(k));
  }
  _cache.set(key, { data, ts: Date.now() });
}

// ── Inflight dedup ──
const _inflight = new Map<string, Promise<unknown>>();

async function fetchTMDB<T = unknown>(path: string, fallback: T | null = null): Promise<T | null> {
  const cached = cacheGet(path);
  if (cached !== undefined) return cached as T;

  const existing = _inflight.get(path);
  if (existing) return existing as Promise<T | null>;

  const promise = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const sep = path.includes('?') ? '&' : '?';
        const url = `${TMDB_BASE}${path}${sep}api_key=${TMDB_API_KEY}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);

        if (res.status === 429 || res.status === 503) {
          await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
          continue;
        }
        if (!res.ok) return fallback;
        const data = await res.json();
        if (!path.includes('/search/')) cacheSet(path, data);
        return data as T;
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return fallback;
        if (attempt < 2) await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
    return fallback;
  })();

  _inflight.set(path, promise);
  promise.finally(() => _inflight.delete(path));
  return promise;
}

export const tmdb = {
  // ── Search ──
  search: async (query: string, page = 1) => {
    // TIER 1: Omni-Search — routed through hardened fetchTMDB (timeout + retry + dedup)
    let data = await fetchTMDB<TMDBSearchResponse>(
        `/search/multi?query=${encodeURIComponent(query)}&page=${page}&include_adult=false`,
        { results: [], total_results: 0, total_pages: 0, page: 1 }
    );
    if (!data) return { searchType: 'failed', results: [] } as TMDBSearchResponse;

    let items: TMDBSearchResult[] = [];
    let topPerson: string | null = null;

    if (data.results?.length > 0) {
        const sortedResults = [...data.results].sort((a: TMDBSearchResult, b: TMDBSearchResult) => {
            const aName = ((a.name || a.title) ?? '').toLowerCase();
            const bName = ((b.name || b.title) ?? '').toLowerCase();
            const queryLower = query.toLowerCase();

            const aExact = aName === queryLower;
            const bExact = bName === queryLower;
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;

            if (a.media_type === 'person' && b.media_type !== 'person') return -1;
            if (a.media_type !== 'person' && b.media_type === 'person') return 1;

            return ((b.popularity ?? 0) - (a.popularity ?? 0));
        });

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

    // TIER 2: Typo Fallback — also routed through fetchTMDB
    const cleanWords = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 0);
    if (cleanWords.length > 1) {
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
            );
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

  searchMulti: async (query: string) => {
    const data = await fetchTMDB<TMDBSearchResponse>(
      `/search/multi?query=${encodeURIComponent(query)}&page=1&include_adult=false`,
      { results: [] }
    );
    return (data?.results || [])
      .filter((r) => r.media_type === 'movie' || (r.media_type === 'person' && r.profile_path))
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 8);
  },

  // ── Film Details ──
  detail: async (id: number) => fetchTMDB<TMDBMovieDetail>(
    `/movie/${id}?append_to_response=credits,videos,similar,watch/providers,release_dates`,
    null
  ),

  // ── Trending ──
  trending: async (timeWindow = 'week') => fetchTMDB<TMDBMovieListResponse>(
    `/trending/movie/${timeWindow}`,
    { results: [] }
  ),

  // ── Top Rated ──
  topRated: async (page = 1) => fetchTMDB<TMDBMovieListResponse>(`/movie/top_rated?page=${page}`, { results: [] }),

  // ── Now Playing ──
  nowPlaying: async () => fetchTMDB<TMDBMovieListResponse>(`/movie/now_playing`, { results: [] }),

  // ── Similar ──
  similar: async (id: number) => {
    const data = await fetchTMDB<{ results: unknown[] }>(`/movie/${id}/similar?page=1`, { results: [] });
    return data?.results || [];
  },

  // ── Person ──
  person: async (id: number) => fetchTMDB<TMDBPersonDetail>(`/person/${id}`, null),
  personCredits: async (id: number) => fetchTMDB<TMDBPersonCredits>(`/person/${id}/movie_credits`, null),

  // ── Extended Missing Query Methods ──
  watchProviders: async (id: number) => {
      const data = await fetchTMDB<{ results: Record<string, TMDBWatchProviderResult> }>(`/movie/${id}/watch/providers`, { results: {} });
      return data?.results || {};
  },
  releaseDates: async (id: number) => {
      const data = await fetchTMDB<{ results: unknown[] }>(`/movie/${id}/release_dates`, { results: [] });
      return data?.results || [];
  },
  companySearch: async (query: string) => {
      const data = await fetchTMDB<{ results: unknown[] }>(`/search/company?query=${encodeURIComponent(query)}`, { results: [] });
      return data?.results || [];
  },
  movieImages: async (id: number) => fetchTMDB<{ posters: { file_path: string }[]; backdrops: { file_path: string }[]; logos: { file_path: string }[] }>(`/movie/${id}/images`, { posters: [], backdrops: [], logos: [] }),

  // ── Discover ──
  discover: async (params: Record<string, string> = {}) => {
    const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    return fetchTMDB<TMDBMovieListResponse>(`/discover/movie?${qs}`, { results: [] });
  },

  // ── Real-time News Proxy ──
  getNews: async () => {
        // Simple fallback
        const relDate = (daysAgo: number) => {
            const d = new Date();
            d.setDate(d.getDate() - daysAgo);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
        };

        const FALLBACK_NEWS = [
            {
                id: 'fb1',
                title: "OSCAR RADAR: The Monochrome Revival",
                excerpt: "Why modern auteurs are returning to black and white for their most personal statements. A deep look at this year's Academy favorites.",
                date: relDate(1),
                time: "10:30 AM",
                category: "AWARDS",
                author: "THE ARCHIVIST",
                link: "#",
                image: "https://images.unsplash.com/photo-1542204147-993abd55f2eb?q=80&w=2000"
            },
            {
                id: 'fb2',
                title: "CANNES UNVEILED: The Latest Selection",
                excerpt: "The festival returns to its roots with a heavy focus on European surrealism and South American neo-noir.",
                date: relDate(2),
                time: "02:15 PM",
                category: "FESTIVALS",
                author: "MIDNIGHT DEVOTEE",
                link: "#",
                image: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=2000"
            }
        ];

        const feeds = ['https://www.theguardian.com/film/rss'];
        try {
            const results = await Promise.all(feeds.map(async (url: string) => {
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 4000);
                    const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`, { signal: controller.signal });
                    clearTimeout(timer);
                    if (!res.ok) return [];
                    const data = await res.json();
                    return data.items || [];
                } catch {
                    return [];
                }
            }));

            const liveItems = results.flat();
            if (liveItems.length === 0) return FALLBACK_NEWS;

            const decodeEntities = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");

            interface RSSItem {
                guid?: string; link?: string; title: string; description?: string;
                pubDate: string; categories?: string[]; enclosure?: { link?: string };
                thumbnail?: string; author?: string;
            }
            const allItems = (liveItems as RSSItem[])
                .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
                .map((item) => ({
                    id: item.guid || item.link,
                    title: decodeEntities(item.title),
                    excerpt: decodeEntities((item.description?.replace(/<[^>]*>?/gm, '') ?? '').slice(0, 160)) + '...',
                    date: new Date(item.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase(),
                    time: new Date(item.pubDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                    category: item.categories?.[0]?.toUpperCase() || 'WIRE',
                    image: item.enclosure?.link || item.thumbnail || null,
                    author: item.author || 'THE ORACLE',
                    link: item.link
                }));

            return [...allItems, ...FALLBACK_NEWS];
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e: unknown) {
            return FALLBACK_NEWS;
        }
    },

  // ── Image URLs ──
  poster: (path: string | null | undefined, size = 'w185') =>
    path ? `${TMDB_IMG}/${size}${path}` : undefined,

  backdrop: (path: string | null | undefined, size = 'w1280') =>
    path ? `${TMDB_IMG}/${size}${path}` : undefined,

  profile: (path: string | null | undefined, size = 'w185') =>
    path ? `${TMDB_IMG}/${size}${path}` : undefined,

  posterThumb: (path: string | null | undefined) =>
    path ? `${TMDB_IMG}/w92${path}` : undefined,
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

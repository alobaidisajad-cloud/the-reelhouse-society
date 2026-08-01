// TMDB API utilities
//
// The TMDB API key is NOT read here. Vite inlines `import.meta.env.VITE_*` at build
// time, so a key referenced from client code is baked into the shipped bundle and
// can be lifted straight out of view-source — which is exactly what was happening.
// Every request now goes through the `tmdb-proxy` edge function, whose key lives in
// a server-side Supabase secret. Mobile has worked this way since F-1
// (mobile/src/lib/tmdb.ts:9); this brings the web in line.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const PROXY_URL = `${SUPABASE_URL}/functions/v1/tmdb-proxy`

// image.tmdb.org is an unauthenticated public CDN — no key, nothing to leak.
const TMDB_IMG = 'https://image.tmdb.org/t/p'

import { LRUCache, dedup } from './utils/retry'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import type { TMDBMovie, TMDBPaginatedResponse, TMDBPerson, TMDBCredits } from './types/tmdb'

// ── Response cache: prevents redundant API calls across components (5min TTL) ──
const _responseCache = new LRUCache<unknown>(200, 5 * 60 * 1000)

// Resilient fetch wrapper — 10s timeout, retry on 429/503, LRU cached, deduped
// `path` is the TMDB API path (e.g. /search/multi?query=...)
async function fetchTMDB<T = unknown>(path: string, fallback: T | null = null): Promise<T | null> {
    const cached = _responseCache.get(path)
    if (cached !== undefined) return cached as T

    return dedup(`tmdb:${path}`, async () => {
        let lastError: unknown
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const controller = new AbortController()
                const timer = setTimeout(() => controller.abort(), 10000)
                // The proxy takes the TMDB path in the body and appends the key
                // server-side. Its allow-list covers every path this file requests.
                const res = await fetch(PROXY_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    },
                    body: JSON.stringify({ path }),
                    signal: controller.signal,
                })
                clearTimeout(timer)

                if (res.status === 429 || res.status === 503) {
                    const delay = Math.min(500 * Math.pow(2, attempt) + Math.random() * 200, 4000)
                    await new Promise(r => setTimeout(r, delay))
                    continue
                }

                if (!res.ok) {
                    // Throwing explicitly instead of returning fallback on API error responses
                    throw new Error(`TMDB Error: ${res.status} ${res.statusText}`)
                }
                const data = await res.json()
                if (!path.includes('/search/')) {
                    _responseCache.set(path, data)
                }
                return data as T
            } catch (e: unknown) {
                lastError = e
                if (e instanceof Error && e.name === 'AbortError') return fallback
                if (attempt < 2) {
                    await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)))
                    continue
                }
            }
        }
        if (lastError) {
            console.error(`TMDB fetch failed for ${path}:`, lastError)
        }
        return fallback
    })
}

function decodeEntities(str: string): string {
    if (!str || typeof str !== 'string') return str
    try {
        return new DOMParser().parseFromString(str, 'text/html').documentElement.textContent || str
    } catch {
        return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    }
}

export type MultiSearchResult = (TMDBMovie & { media_type: 'movie' }) | (TMDBPerson & { media_type: 'person', popularity?: number, known_for?: any[] })

export const tmdb = {
    search: async (query: string, page: number = 1) => {
        const data = await fetchTMDB<TMDBPaginatedResponse<MultiSearchResult> & { searchType?: string, matchedContext?: string }>(
            `/search/multi?query=${encodeURIComponent(query)}&page=${page}&include_adult=false`,
            { results: [], total_pages: 0, total_results: 0, page: 1 }
        )
        if (!data) return { results: [], searchType: 'failed' }

        let items: MultiSearchResult[] = []
        let topPerson: string | null = null

        if (data.results?.length > 0) {
            const sortedResults = [...data.results].sort((a, b) => {
                const aName = ('name' in a ? a.name : 'title' in a ? a.title : '').toLowerCase()
                const bName = ('name' in b ? b.name : 'title' in b ? b.title : '').toLowerCase()
                const queryLower = query.toLowerCase()

                const aExact = aName === queryLower
                const bExact = bName === queryLower
                if (aExact && !bExact) return -1
                if (!aExact && bExact) return 1

                if (a.media_type === 'person' && b.media_type !== 'person') return -1
                if (a.media_type !== 'person' && b.media_type === 'person') return 1

                return (b.popularity || 0) - (a.popularity || 0)
            })

            for (const item of sortedResults) {
                if (item.media_type === 'movie') {
                    items.push(item)
                } else if (item.media_type === 'person') {
                    const isExact = (item.name || '').toLowerCase() === query.toLowerCase()
                    const hasPhoto = !!item.profile_path
                    const isHighPop = (item.popularity || 0) > 5

                    if (isExact || hasPhoto || isHighPop) {
                        if (!topPerson) topPerson = item.name
                        items.push(item)
                    }

                    if (hasPhoto || isHighPop || isExact) {
                        const knownFor = item.known_for?.filter(k => k.media_type === 'movie') || []
                        items.push(...knownFor.map(m => ({ ...m, media_type: 'movie' as const } as unknown as MultiSearchResult)))
                    }
                }
            }

            if (items.length > 0 || page > 1) {
                const ids = new Set<string>()
                const unique = items.filter(m => {
                    const key = `${m.media_type || 'movie'}-${m.id}`
                    if (ids.has(key)) return false
                    ids.add(key)
                    return true
                })

                data.results = unique

                const firstMatch = unique[0]
                const firstText = ('title' in firstMatch ? firstMatch.title : 'name' in firstMatch ? firstMatch.name : '').toLowerCase()
                const queryText = query.toLowerCase()

                if (topPerson && !firstText.includes(queryText)) {
                    data.searchType = 'person'
                    data.matchedContext = topPerson
                } else {
                    data.searchType = 'exact'
                }
                return data
            }
        }

        const cleanWords = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 0)

        if (cleanWords.length > 1) {
            const fallbacks = []
            for (let i = 0; i < cleanWords.length; i++) {
                const words = [...cleanWords]
                const dropped = words.splice(i, 1)[0]
                const text = words.join(' ')
                if (text.length > 2) {
                    fallbacks.push({ text, dropped })
                }
            }

            const fallbackResults = await Promise.all(fallbacks.map(async fb => {
                try {
                    const fData = await fetchTMDB<TMDBPaginatedResponse<MultiSearchResult>>(
                        `/search/multi?query=${encodeURIComponent(fb.text)}&page=1&include_adult=false`,
                        { results: [], total_pages: 0, total_results: 0, page: 1 }
                    )
                    if (fData?.results?.length) {
                        const bestItem = fData.results.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0]
                        return { data: fData, fallback: fb, bestItem }
                    }
                } catch { }
                return null
            }))

            let winner: { data: any, fallback: any, bestItem: any } | null = null;
            let highestPopularity = -1;

            for (const res of fallbackResults) {
                if (res && res.bestItem) {
                    if ((res.bestItem.popularity ?? 0) > highestPopularity) {
                        highestPopularity = res.bestItem.popularity ?? 0
                        winner = res
                    }
                }
            }

            if (winner) {
                const items: MultiSearchResult[] = []
                for (const item of winner.data.results) {
                    if (item.media_type === 'movie') items.push(item)
                    else if (item.media_type === 'person') {
                        items.push(item)
                        const known = item.known_for?.filter((k: any) => k.media_type === 'movie') || []
                        items.push(...known.map((k: any) => ({ ...k, media_type: 'movie' as const } as unknown as MultiSearchResult)))
                    }
                }

                const ids = new Set()
                winner.data.results = items.filter(m => {
                    const key = `${m.media_type || 'movie'}-${m.id}`
                    if (ids.has(key)) return false
                    ids.add(key); return true
                })

                winner.data.searchType = 'typo'
                winner.data.matchedContext = `IGNORED "${winner.fallback.dropped.toUpperCase()}"`
                return winner.data
            }
        }

        const words = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2)
        if (words.length > 0) {
            const keywordIds: number[] = []
            await Promise.all(words.map(async word => {
                try {
                    const kwData = await fetchTMDB<TMDBPaginatedResponse<{ id: number }>>(
                        `/search/keyword?query=${encodeURIComponent(word)}`,
                        { results: [], total_pages: 0, total_results: 0, page: 1 }
                    )
                    if (kwData?.results?.length) {
                        keywordIds.push(kwData.results[0].id)
                    }
                } catch { }
            }))

            if (keywordIds.length > 0) {
                const discoverData = await fetchTMDB<TMDBPaginatedResponse<MultiSearchResult> & { searchType?: string, matchedContext?: string }>(
                    `/discover/movie?with_keywords=${keywordIds.join('|')}&sort_by=popularity.desc&page=1`,
                    { results: [], total_pages: 0, total_results: 0, page: 1 }
                )
                if (discoverData?.results?.length) {
                    discoverData.searchType = 'semantic'
                    discoverData.matchedContext = words.join(', ')
                    return discoverData
                }
            }
        }

        data.searchType = 'failed'
        return data
    },

    trending: async (timeWindow: string = 'week') => fetchTMDB<TMDBPaginatedResponse<TMDBMovie>>(
        `/trending/movie/${timeWindow}`,
        { results: [], total_pages: 0, total_results: 0, page: 1 }
    ),

    searchMulti: async (query: string) => {
        const data = await fetchTMDB<TMDBPaginatedResponse<MultiSearchResult>>(
            `/search/multi?query=${encodeURIComponent(query)}&page=1&include_adult=false`,
            { results: [], total_pages: 0, total_results: 0, page: 1 }
        )
        return (data?.results || [])
            .filter((r) => r.media_type === 'movie' || (r.media_type === 'person' && r.profile_path))
            .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
            .slice(0, 6)
    },

    topRated: async (page: number = 1) => fetchTMDB<TMDBPaginatedResponse<TMDBMovie>>(
        `/movie/top_rated?page=${page}`,
        { results: [], total_pages: 0, total_results: 0, page: 1 }
    ),

    nowPlaying: async () => fetchTMDB<TMDBPaginatedResponse<TMDBMovie>>(
        `/movie/now_playing`,
        { results: [], total_pages: 0, total_results: 0, page: 1 }
    ),

    upcoming: async () => fetchTMDB<TMDBPaginatedResponse<TMDBMovie>>(
        `/movie/upcoming`,
        { results: [], total_pages: 0, total_results: 0, page: 1 }
    ),

    detail: async (id: number) => {
        const IDB_KEY = `tmdb-detail-${id}`
        const result = await fetchTMDB<TMDBMovie>(
            `/movie/${id}?append_to_response=credits,videos,similar,watch/providers,release_dates`,
            null
        )
        if (result) {
            // Cache successful response to IDB for offline fallback
            idbSet(IDB_KEY, { data: result, ts: Date.now() }).catch(() => {})
            return result
        }
        // Offline fallback: serve stale cached data (7-day max age)
        try {
            const cached = await idbGet(IDB_KEY) as { data: TMDBMovie; ts: number } | undefined
            if (cached && Date.now() - cached.ts < 7 * 24 * 60 * 60 * 1000) {
                return cached.data
            }
        } catch { /* IDB read failure — return null */ }
        return null
    },

    watchProviders: async (id: number) => {
        const data = await fetchTMDB<{ results: Record<string, unknown> }>(`/movie/${id}/watch/providers`, { results: {} })
        return data?.results || {}
    },

    releaseDates: async (id: number) => {
        const data = await fetchTMDB<{ results: unknown[] }>(`/movie/${id}/release_dates`, { results: [] })
        return data?.results || []
    },

    companySearch: async (query: string) => {
        const data = await fetchTMDB<{ results: unknown[] }>(`/search/company?query=${encodeURIComponent(query)}`, { results: [] })
        return data?.results || []
    },

    discover: async (params: Record<string, string> = {}) => {
        const qs = new URLSearchParams(params).toString()
        return fetchTMDB<TMDBPaginatedResponse<TMDBMovie>>(`/discover/movie?${qs}`, { results: [], total_pages: 0, total_results: 0, page: 1 })
    },

    poster: (path: string | null | undefined, size: string = 'w185') => path ? `${TMDB_IMG}/${size}${path}` : undefined,
    backdrop: (path: string | null | undefined, size: string = 'w1280') => path ? `${TMDB_IMG}/${size}${path}` : undefined,
    profile: (path: string | null | undefined, size: string = 'w185') => path ? `${TMDB_IMG}/${size}${path}` : undefined,

    responsivePoster: (path: string | null | undefined) => {
        if (!path) return undefined
        const w = typeof window !== 'undefined' ? window.innerWidth : 1280
        const size = w < 480 ? 'w185' : w < 900 ? 'w342' : 'w500'
        return `${TMDB_IMG}/${size}${path}`
    },

    posterSrcSet: (path: string | null | undefined) => {
        if (!path) return { src: undefined, srcSet: undefined, sizes: undefined }
        const widths = [92, 154, 185, 342] as const
        const srcSet = widths.map(w => `${TMDB_IMG}/w${w}${path} ${w}w`).join(', ')
        return {
            src: `${TMDB_IMG}/w185${path}`,
            srcSet,
            sizes: '(max-width: 480px) 130px, (max-width: 900px) 170px, 185px',
        }
    },

    backdropSrcSet: (path: string | null | undefined) => {
        if (!path) return { src: undefined, srcSet: undefined, sizes: undefined }
        const widths = [300, 780, 1280] as const
        const srcSet = widths.map(w => `${TMDB_IMG}/w${w}${path} ${w}w`).join(', ')
        return {
            src: `${TMDB_IMG}/w1280${path}`,
            srcSet,
            sizes: '(max-width: 768px) 780px, 1280px',
        }
    },

    posterThumb: (path: string | null | undefined) => path ? `${TMDB_IMG}/w92${path}` : undefined,

    similar: async (id: number) => {
        const data = await fetchTMDB<{ results: TMDBMovie[] }>(`/movie/${id}/similar?page=1`, { results: [] })
        return data?.results || []
    },

    movieDetails: async (id: number) => fetchTMDB<TMDBMovie>(
        `/movie/${id}?append_to_response=credits,videos,similar`,
        null
    ),

    movieCredits: async (id: number) => fetchTMDB<TMDBCredits>(`/movie/${id}/credits`, null),

    movieImages: async (id: number) => fetchTMDB(`/movie/${id}/images`, { posters: [], backdrops: [], logos: [] }),

    person: async (id: number) => fetchTMDB<TMDBPerson>(`/person/${id}`, null),

    personCredits: async (id: number) => fetchTMDB<{ cast: TMDBMovie[], crew: TMDBMovie[] }>(`/person/${id}/movie_credits`, null),

    getNews: async () => {
        const NEWS_CACHE_KEY = '__rh_news_cache'
        const NEWS_TTL = 15 * 60 * 1000 
        const cached = (window as Record<string, any>)[NEWS_CACHE_KEY]
        if (cached && Date.now() - cached.ts < NEWS_TTL) return cached.data

        const relDate = (daysAgo: number) => {
            const d = new Date()
            d.setDate(d.getDate() - daysAgo)
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
        }

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
            },
            {
                id: 'fb3',
                title: "DEEP VAULT: Silent Era Masterpiece Restored",
                excerpt: "Metropolis-style visuals meet gothic horror in this newly unearthed reel from the Weimar Republic archives.",
                date: relDate(3),
                time: "09:00 PM",
                category: "HISTORY",
                author: "THE ORACLE",
                link: "#",
                image: "https://images.unsplash.com/photo-1478720568477-152d9b164e26?q=80&w=2000"
            },
            {
                id: 'fb4',
                title: "NEON TRANCE: The Soundscapes of Cinema",
                excerpt: "How modern electronic scores are redefining the cinematic experience through spatial audio and grain frequency.",
                date: relDate(4),
                time: "11:45 PM",
                category: "SOUND",
                author: "THE WEEPER",
                link: "#",
                image: null
            }
        ]

        const feeds = [
            'https://www.theguardian.com/film/rss',
        ]

        try {
            const results = await Promise.all(feeds.map(async (url) => {
                try {
                    const controller = new AbortController()
                    const timer = setTimeout(() => controller.abort(), 4000)
                    const res = await fetch(
                        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`,
                        { signal: controller.signal }
                    )
                    clearTimeout(timer)
                    if (!res.ok) return []
                    const data = await res.json()
                    return data.items || []
                } catch {
                    return []
                }
            }))

            const liveItems = results.flat()

            if (liveItems.length === 0) {
                ;(window as Record<string, any>)[NEWS_CACHE_KEY] = { ts: Date.now(), data: FALLBACK_NEWS }
                return FALLBACK_NEWS
            }

            const allItems = liveItems
                .sort((a: any, b: any) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
                .map((item: any) => ({
                    id: item.guid || item.link,
                    title: decodeEntities(item.title),
                    excerpt: decodeEntities(item.description?.replace(/<[^>]*>?/gm, '')?.slice(0, 160) || '') + '...',
                    fullContent: decodeEntities(item.description?.replace(/<[^>]*>?/gm, '') || ''),
                    date: new Date(item.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase(),
                    time: new Date(item.pubDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                    category: item.categories?.[0]?.toUpperCase() || 'WIRE',
                    image: item.enclosure?.link || item.thumbnail || null,
                    author: item.author || 'THE ORACLE',
                    link: item.link
                }))

            const newsResult = [...allItems, ...FALLBACK_NEWS]
            ;(window as Record<string, any>)[NEWS_CACHE_KEY] = { ts: Date.now(), data: newsResult }
            return newsResult
        } catch (e) {
            console.warn("Archive Wire failed, switching to Deep Archive:", e)
            ;(window as Record<string, any>)[NEWS_CACHE_KEY] = { ts: Date.now(), data: FALLBACK_NEWS }
            return FALLBACK_NEWS
        }
    }
}

export function obscurityScore(movie: { popularity?: number }) {
    const pop = movie.popularity || 0
    if (pop <= 0) return 99
    const score = Math.round(100 - (Math.log10(Math.max(pop, 1)) / Math.log10(5000)) * 98)
    return Math.max(2, Math.min(99, score))
}

export function formatRuntime(minutes: number | null | undefined) {
    if (!minutes) return '—'
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return h ? `${h}h ${m}m` : `${m}m`
}

export function getYear(dateStr: string | null | undefined) {
    return dateStr ? dateStr.slice(0, 4) : '—'
}

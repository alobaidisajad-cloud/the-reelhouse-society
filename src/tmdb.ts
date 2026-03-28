// TMDB API utilities
// Uses VITE_TMDB_API_KEY env var — set in Vercel dashboard, .env.local for dev
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || ''
const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMG = 'https://image.tmdb.org/t/p'

// Resilient fetch wrapper — 10s timeout, logs errors, always returns a safe fallback
// `path` is the TMDB API path (e.g. /search/multi?query=...)
async function fetchTMDB<T = unknown>(path: string, fallback: T | null = null): Promise<T | null> {
    try {
        const separator = path.includes('?') ? '&' : '?'
        const url = `${TMDB_BASE}${path}${separator}api_key=${TMDB_API_KEY}`
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10000)
        const res = await fetch(url, { signal: controller.signal })
        clearTimeout(timer)
        if (!res.ok) return fallback
        return await res.json()
    } catch (e: unknown) {
        if (e instanceof Error && e.name !== 'AbortError') { /* silently swallow — fallback returned */ }
        return fallback
    }
}

// Decode HTML entities from RSS text (fixes â€", â€™, &amp; etc.)
function decodeEntities(str: string): string {
    if (!str || typeof str !== 'string') return str
    try {
        return new DOMParser().parseFromString(str, 'text/html').documentElement.textContent
    } catch {
        return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    }
}

export const tmdb = {
    search: async (query: string, page: number = 1) => {
        // TIER 1: Omni-Search (Movies + Actors + Directors simultaneously)
        const res = await fetch(
            `${TMDB_BASE}/search/multi?query=${encodeURIComponent(query)}&page=${page}&include_adult=false&api_key=${TMDB_API_KEY}`
        )
        if (!res.ok) throw new Error('TMDB search failed')
        let data = await res.json()

        let items = []
        let topPerson = null

        if (data.results?.length > 0) {
            // Sort multi-search results with surgical precision:
            // 1. Exact name/title matches for the query string come first
            // 2. People matching the name come before movies where they just appear
            // 3. Fall back to raw popularity
            const sortedResults = [...data.results].sort((a: { name?: string; title?: string; media_type?: string; popularity?: number }, b: { name?: string; title?: string; media_type?: string; popularity?: number }) => {
                const aName = (a.name || a.title || '').toLowerCase()
                const bName = (b.name || b.title || '').toLowerCase()
                const queryLower = query.toLowerCase()

                const aExact = aName === queryLower
                const bExact = bName === queryLower
                if (aExact && !bExact) return -1
                if (!aExact && bExact) return 1

                // If both are exact or neither, prioritize people in a multi-search
                if (a.media_type === 'person' && b.media_type !== 'person') return -1
                if (a.media_type !== 'person' && b.media_type === 'person') return 1

                return (b.popularity || 0) - (a.popularity || 0)
            })

            for (const item of sortedResults) {
                if (item.media_type === 'movie') {
                    items.push({ ...item, media_type: 'movie' })
                } else if (item.media_type === 'person') {
                    const isExact = (item.name || '').toLowerCase() === query.toLowerCase()
                    const hasPhoto = !!item.profile_path
                    const isHighPop = (item.popularity || 0) > 5

                    // Only include the person in the main grid if they are a real match
                    // We don't want to clutter the grid with 50 "Tom Hardys" that have no photos
                    if (isExact || hasPhoto || isHighPop) {
                        if (!topPerson) topPerson = item.name
                        items.push({ ...item, media_type: 'person' })
                    }

                    // Always consider their movies if they are somewhat known
                    if (hasPhoto || isHighPop || isExact) {
                        const knownFor = item.known_for?.filter((k: any) => k.media_type === 'movie') || []
                        items.push(...knownFor.map((m: any) => ({ ...m, media_type: 'movie' })))
                    }
                }
            }

            if (items.length > 0 || page > 1) {
                const ids = new Set()
                const unique = items.filter((m: any) => {
                    const key = `${m.media_type || 'movie'}-${m.id}`
                    if (ids.has(key)) return false
                    ids.add(key)
                    return true
                })

                data.results = unique

                const firstMatch = unique[0]
                const firstText = (firstMatch?.title || firstMatch?.name || '').toLowerCase()
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

        // TIER 2: Typo-Tolerance Fallback (Fuzzy Rescue)
        // If "med max fury road" failed because of "med", we try dropping one word at a time
        // and concurrently search the fragments, returning the variation that yields the most popular movie
        const cleanWords = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w: any) => w.length > 0)

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

            const fallbackResults = await Promise.all(fallbacks.map(async (fb: any) => {
                try {
                    // Search both movies and people in fallback
                    const fRes = await fetch(`${TMDB_BASE}/search/multi?query=${encodeURIComponent(fb.text)}&page=1&api_key=${TMDB_API_KEY}`)
                    if (fRes.ok) {
                        const fData = await fRes.json()
                        if (fData.results?.length > 0) {
                            // Find the best match in the multi-result (movie or person)
                            const bestItem = fData.results.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0))[0]
                            return { data: fData, fallback: fb, bestItem }
                        }
                    }
                } catch { }
                return null
            }))

            let winner = null;
            let highestPopularity = -1;

            for (const res of fallbackResults) {
                if (res && res.bestItem) {
                    if (res.bestItem.popularity > highestPopularity) {
                        highestPopularity = res.bestItem.popularity
                        winner = res
                    }
                }
            }

            if (winner) {
                // Post-process winning results to include person/movie flags
                const items = []
                for (const item of winner.data.results) {
                    if (item.media_type === 'movie') items.push({ ...item, media_type: 'movie' })
                    else if (item.media_type === 'person') {
                        items.push({ ...item, media_type: 'person' })
                        const known = item.known_for?.filter((k: any) => k.media_type === 'movie') || []
                        items.push(...known.map((k: any) => ({ ...k, media_type: 'movie' })))
                    }
                }

                const ids = new Set()
                winner.data.results = items.filter((m: any) => {
                    const key = `${m.media_type || 'movie'}-${m.id}`
                    if (ids.has(key)) return false
                    ids.add(key); return true
                })

                winner.data.searchType = 'typo'
                winner.data.matchedContext = `IGNORED "${winner.fallback.dropped.toUpperCase()}"`
                return winner.data
            }
        }

        // TIER 3: Semantic / Natural Lang Phrase Parsing (e.g. "dark neo tokyo car street")
        // Strip grammar and look for words > 3 chars
        const words = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w: any) => w.length > 2)
        if (words.length > 0) {
            const keywordIds: number[] = []
            // Look up TMDB's internal keyword Dictionary for each word
            await Promise.all(words.map(async (word: any) => {
                try {
                    const kwRes = await fetch(`${TMDB_BASE}/search/keyword?query=${encodeURIComponent(word)}&api_key=${TMDB_API_KEY}`)
                    const kwData = await kwRes.json()
                    // Take the most popular exact keyword match
                    if (kwData.results?.length > 0) {
                        keywordIds.push(kwData.results[0].id)
                    }
                } catch { }
            }))

            if (keywordIds.length > 0) {
                // Use a 'Discover' query to mathematically group films that have these keywords!
                // Using an OR (|) operator for fuzzier matching, AND (,) for strict.
                const discoverRes = await fetch(`${TMDB_BASE}/discover/movie?with_keywords=${keywordIds.join('|')}&sort_by=popularity.desc&page=1&api_key=${TMDB_API_KEY}`)
                if (discoverRes.ok) {
                    const discoverData = await discoverRes.json()
                    if (discoverData.results?.length > 0) {
                        discoverData.searchType = 'semantic'
                        discoverData.matchedContext = words.join(', ')
                        return discoverData
                    }
                }
            }
        }

        // Return empty if all 3 tiers fail
        data.searchType = 'failed'
        return data
    },

    trending: async (timeWindow: string = 'week') => fetchTMDB<any>(
        `/trending/movie/${timeWindow}`,
        { results: [] }
    ),

    searchMulti: async (query: string) => {
        const data = await fetchTMDB<any>(
            `/search/multi?query=${encodeURIComponent(query)}&page=1&include_adult=false`,
            { results: [] }
        )
        return (data?.results || [])
            .filter((r: any) => r.media_type === 'movie' || (r.media_type === 'person' && r.profile_path))
            .sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0))
            .slice(0, 6)
    },

    topRated: async (page: number = 1) => fetchTMDB<any>(
        `/movie/top_rated?page=${page}`,
        { results: [] }
    ),

    nowPlaying: async () => fetchTMDB<any>(
        `/movie/now_playing`,
        { results: [] }
    ),

    upcoming: async () => fetchTMDB<any>(
        `/movie/upcoming`,
        { results: [] }
    ),

    detail: async (id: number) => fetchTMDB<any>(
        `/movie/${id}?append_to_response=credits,videos,similar,watch/providers,release_dates`,
        null
    ),

    // Watch providers (streaming, rent, buy) for a specific movie
    watchProviders: async (id: number) => {
        const data = await fetchTMDB<{ results: Record<string, unknown> }>(`/movie/${id}/watch/providers`, { results: {} })
        return data?.results || {}
    },

    // Release dates by country for a movie
    releaseDates: async (id: number) => {
        const data = await fetchTMDB<{ results: unknown[] }>(`/movie/${id}/release_dates`, { results: [] })
        return data?.results || []
    },

    // Search production companies by name (for Discover filter)
    companySearch: async (query: string) => {
        const data = await fetchTMDB<{ results: unknown[] }>(`/search/company?query=${encodeURIComponent(query)}`, { results: [] })
        return data?.results || []
    },

    discover: async (params: Record<string, string> = {}) => {
        const qs = new URLSearchParams(params).toString()
        return fetchTMDB(`/discover/movie?${qs}`, { results: [] })
    },

    poster: (path: string | null | undefined, size: string = 'w185') => path ? `${TMDB_IMG}/${size}${path}` : undefined,
    backdrop: (path: string | null | undefined, size: string = 'w1280') => path ? `${TMDB_IMG}/${size}${path}` : undefined,
    profile: (path: string | null | undefined, size: string = 'w185') => path ? `${TMDB_IMG}/${size}${path}` : undefined,

    // Responsive poster — picks smallest size that still looks good at current viewport
    responsivePoster: (path: string | null | undefined) => {
        if (!path) return undefined
        const w = typeof window !== 'undefined' ? window.innerWidth : 1280
        const size = w < 480 ? 'w185' : w < 900 ? 'w342' : 'w500'
        return `${TMDB_IMG}/${size}${path}`
    },

    // B1: Responsive poster srcSet — browser picks the optimal size automatically
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

    // B1: Responsive backdrop srcSet
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

    // B2: Tiny placeholder URL for blur-up effect
    posterThumb: (path: string | null | undefined) => path ? `${TMDB_IMG}/w92${path}` : undefined,


    // Separate similar endpoint (avoids double-fetching detail)
    similar: async (id: number) => {
        const data = await fetchTMDB<{ results: unknown[] }>(`/movie/${id}/similar?page=1`, { results: [] })
        return data?.results || []
    },

    // Aliases used by hover-prefetch in FilmCard
    movieDetails: async (id: number) => fetchTMDB<any>(
        `/movie/${id}?append_to_response=credits,videos,similar`,
        null
    ),

    movieCredits: async (id: number) => fetchTMDB<any>(`/movie/${id}/credits`, null),

    // Fetch all images for a movie (posters, backdrops, logos)
    movieImages: async (id: number) => fetchTMDB(`/movie/${id}/images`, { posters: [], backdrops: [], logos: [] }),

    // Fetch person details (Actor/Director profile)
    person: async (id: number) => fetchTMDB<any>(`/person/${id}`, null),

    // Fetch person's movie credits
    personCredits: async (id: number) => fetchTMDB<any>(`/person/${id}/movie_credits`, null),

    // NEW: Real-time News Proxy (Aggregates Film News)
    getNews: async () => {
        // Compute relative dates at runtime so fallback news never looks stale
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

        // We use a public RSS-to-JSON bridge to fetch real movie industry news
        // movieweb.com removed — consistently returns 500 on the rss2json bridge
        const feeds = [
            'https://www.theguardian.com/film/rss',
        ]

        try {
            const results = await Promise.all(feeds.map(async (url: any) => {
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

            if (liveItems.length === 0) return FALLBACK_NEWS

            // Flatten, sort by date, and format for the UI
            const allItems = liveItems
                .sort((a: any, b: any) => (new Date(b.pubDate) as any) - (new Date(a.pubDate) as any))
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

            return [...allItems, ...FALLBACK_NEWS]
        } catch (e) {
            console.warn("Archive Wire failed, switching to Deep Archive:", e)
            return FALLBACK_NEWS
        }
    }
}

// Compute obscurity score (0–100, higher = more obscure)
// Uses a continuous log10 scale so every film gets a unique score.
// pop ~3000+ → near 2 (MAINSTREAM), pop ~1 → near 99 (GHOST REEL)
export function obscurityScore(movie: { popularity?: number }) {
    const pop = movie.popularity || 0
    if (pop <= 0) return 99
    const score = Math.round(100 - (Math.log10(Math.max(pop, 1)) / Math.log10(5000)) * 98)
    return Math.max(2, Math.min(99, score))
}

// Format runtime
export function formatRuntime(minutes: number | null | undefined) {
    if (!minutes) return '—'
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return h ? `${h}h ${m}m` : `${m}m`
}

// Get year from date string
export function getYear(dateStr: string | null | undefined) {
    return dateStr ? dateStr.slice(0, 4) : '—'
}

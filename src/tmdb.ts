// TMDB API utilities
const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMG = 'https://image.tmdb.org/t/p'

// API key must be set in .env.local as VITE_TMDB_API_KEY
const API_KEY = import.meta.env.VITE_TMDB_API_KEY || '3fd2be6f0c70a2a598f084ddfb75487c'
if (!API_KEY && import.meta.env.MODE !== 'test') {
    console.error('[ReelHouse] VITE_TMDB_API_KEY is not set. Add it to .env.local')
}

// Resilient fetch wrapper — 8s timeout, logs errors, always returns a safe fallback
async function fetchTMDB(url: any, fallback: any = null) {
    try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 8000)
        const res = await fetch(url, { signal: controller.signal })
        clearTimeout(timer)
        if (!res.ok) {
            console.warn(`[TMDB] ${res.status} ${res.statusText} — ${url.split('?')[0]}`)
            return fallback
        }
        return await res.json()
    } catch (e: any) {
        if (e.name !== 'AbortError') console.warn('[TMDB] Fetch error:', e.message)
        return fallback
    }
}

// Decode HTML entities from RSS text (fixes â€", â€™, &amp; etc.)
function decodeEntities(str: any) {
    if (!str || typeof str !== 'string') return str
    try {
        return new DOMParser().parseFromString(str, 'text/html').documentElement.textContent
    } catch {
        return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    }
}

export const tmdb = {
    search: async (query: any, page: any = 1) => {
        // TIER 1: Omni-Search (Movies + Actors + Directors simultaneously)
        const res = await fetch(
            `${TMDB_BASE}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`
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
            const sortedResults = [...data.results].sort((a: any, b: any) => {
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
                        const knownFor = item.known_for?.filter(k => k.media_type === 'movie') || []
                        items.push(...knownFor.map(m => ({ ...m, media_type: 'movie' })))
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
                    const fRes = await fetch(`${TMDB_BASE}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(fb.text)}&page=1`)
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
                        const known = item.known_for?.filter(k => k.media_type === 'movie') || []
                        items.push(...known.map(k => ({ ...k, media_type: 'movie' })))
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
            const keywordIds = []
            // Look up TMDB's internal keyword Dictionary for each word
            await Promise.all(words.map(async (word: any) => {
                try {
                    const kwRes = await fetch(`${TMDB_BASE}/search/keyword?api_key=${API_KEY}&query=${encodeURIComponent(word)}`)
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
                const discoverRes = await fetch(`${TMDB_BASE}/discover/movie?api_key=${API_KEY}&with_keywords=${keywordIds.join('|')}&sort_by=popularity.desc&page=1`)
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

    trending: async (timeWindow: any = 'week') => fetchTMDB(
        `${TMDB_BASE}/trending/movie/${timeWindow}?api_key=${API_KEY}`,
        { results: [] }
    ),

    topRated: async (page: any = 1) => fetchTMDB(
        `${TMDB_BASE}/movie/top_rated?api_key=${API_KEY}&page=${page}`,
        { results: [] }
    ),

    nowPlaying: async () => fetchTMDB(
        `${TMDB_BASE}/movie/now_playing?api_key=${API_KEY}`,
        { results: [] }
    ),

    upcoming: async () => fetchTMDB(
        `${TMDB_BASE}/movie/upcoming?api_key=${API_KEY}`,
        { results: [] }
    ),

    detail: async (id: any) => fetchTMDB(
        `${TMDB_BASE}/movie/${id}?api_key=${API_KEY}&append_to_response=credits,videos,similar,watch/providers,release_dates`,
        null
    ),

    // Watch providers (streaming, rent, buy) for a specific movie
    watchProviders: async (id: any) => {
        const data = await fetchTMDB(`${TMDB_BASE}/movie/${id}/watch/providers?api_key=${API_KEY}`, {})
        return data?.results || {}
    },

    // Release dates by country for a movie
    releaseDates: async (id: any) => {
        const data = await fetchTMDB(`${TMDB_BASE}/movie/${id}/release_dates?api_key=${API_KEY}`, {})
        return data?.results || []
    },

    // Search production companies by name (for Discover filter)
    companySearch: async (query: any) => {
        const data = await fetchTMDB(`${TMDB_BASE}/search/company?api_key=${API_KEY}&query=${encodeURIComponent(query)}`, {})
        return data?.results || []
    },

    discover: async (params: any = {}) => {
        const qs = new URLSearchParams({ api_key: API_KEY, ...params }).toString()
        return fetchTMDB(`${TMDB_BASE}/discover/movie?${qs}`, { results: [] })
    },

    poster: (path: any, size: any = 'w342') => path ? `${TMDB_IMG}/${size}${path}` : null,
    backdrop: (path: any, size: any = 'w1280') => path ? `${TMDB_IMG}/${size}${path}` : null,
    profile: (path: any, size: any = 'w185') => path ? `${TMDB_IMG}/${size}${path}` : null,

    // Responsive poster — picks smallest size that still looks good at current viewport
    responsivePoster: (path: any) => {
        if (!path) return null
        const w = typeof window !== 'undefined' ? window.innerWidth : 1280
        const size = w < 480 ? 'w185' : w < 900 ? 'w342' : 'w500'
        return `${TMDB_IMG}/${size}${path}`
    },


    // Separate similar endpoint (avoids double-fetching detail)
    similar: async (id: any) => {
        const data = await fetchTMDB(`${TMDB_BASE}/movie/${id}/similar?api_key=${API_KEY}&page=1`, {})
        return data?.results || []
    },

    // Aliases used by hover-prefetch in FilmCard
    movieDetails: async (id: any) => fetchTMDB(
        `${TMDB_BASE}/movie/${id}?api_key=${API_KEY}&append_to_response=credits,videos,similar`,
        null
    ),

    movieCredits: async (id: any) => fetchTMDB(`${TMDB_BASE}/movie/${id}/credits?api_key=${API_KEY}`, null),

    // Fetch all images for a movie (posters, backdrops, logos)
    movieImages: async (id: any) => fetchTMDB(`${TMDB_BASE}/movie/${id}/images?api_key=${API_KEY}`, { posters: [], backdrops: [], logos: [] }),

    // Fetch person details (Actor/Director profile)
    person: async (id: any) => fetchTMDB(`${TMDB_BASE}/person/${id}?api_key=${API_KEY}`, null),

    // Fetch person's movie credits
    personCredits: async (id: any) => fetchTMDB(`${TMDB_BASE}/person/${id}/movie_credits?api_key=${API_KEY}`, null),

    // NEW: Real-time News Proxy (Aggregates Film News)
    getNews: async () => {
        // Compute relative dates at runtime so fallback news never looks stale
        const relDate = (daysAgo: any) => {
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
export function obscurityScore(movie: any) {
    const pop = movie.popularity || 0
    if (pop <= 0) return 99
    const score = Math.round(100 - (Math.log10(Math.max(pop, 1)) / Math.log10(5000)) * 98)
    return Math.max(2, Math.min(99, score))
}

// Format runtime
export function formatRuntime(minutes: any) {
    if (!minutes) return '—'
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return h ? `${h}h ${m}m` : `${m}m`
}

// Get year from date string
export function getYear(dateStr: any) {
    return dateStr ? dateStr.slice(0, 4) : '—'
}

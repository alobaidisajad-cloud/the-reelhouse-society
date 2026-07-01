import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') || ''
const TMDB_BASE = 'https://api.themoviedb.org/3'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── In-Memory Edge Cache ──────────────────────────────────────
// Deno Deploy instances are long-lived; cache hot paths to reduce TMDB API pressure.
const responseCache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(key: string): unknown | null {
    const entry = responseCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
        responseCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key: string, data: unknown) {
    // Evict if cache grows too large (prevent memory leak on edge worker)
    if (responseCache.size > 500) {
        const oldest = responseCache.keys().next().value;
        if (oldest) responseCache.delete(oldest);
    }
    responseCache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
}

// ── Multi-Tier Search (ported from client tmdb.ts) ────────────
async function multiTierSearch(query: string, page = 1): Promise<unknown> {
    // Tier 1: Exact search
    const exactUrl = `${TMDB_BASE}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
    const exactRes = await fetch(exactUrl);
    const exactData = await exactRes.json();

    if (exactData.results && exactData.results.length > 0) {
        return { ...exactData, searchType: 'exact' };
    }

    // Tier 2: Fuzzy — strip common suffixes, articles
    const fuzzyQuery = query
        .replace(/\b(the|a|an|of|and|in|on|at|to|for)\b/gi, '')
        .replace(/[^\w\s]/g, '')
        .trim();

    if (fuzzyQuery && fuzzyQuery !== query) {
        const fuzzyUrl = `${TMDB_BASE}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(fuzzyQuery)}&page=${page}&include_adult=false`;
        const fuzzyRes = await fetch(fuzzyUrl);
        const fuzzyData = await fuzzyRes.json();
        if (fuzzyData.results && fuzzyData.results.length > 0) {
            return { ...fuzzyData, searchType: 'typo' };
        }
    }

    // Tier 3: Multi-search (catches person names, TV shows)
    const multiUrl = `${TMDB_BASE}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
    const multiRes = await fetch(multiUrl);
    const multiData = await multiRes.json();
    if (multiData.results && multiData.results.length > 0) {
        return { ...multiData, searchType: 'semantic' };
    }

    return { results: [], total_pages: 0, total_results: 0, page: 1, searchType: 'failed' };
}

// BACKEND-TMDB-1: best-effort per-IP throttle to deter open-proxy abuse of the
// hidden TMDB key. In-memory ⇒ per edge instance (not global), but it caps the
// easy abuse path; the 5-min response cache absorbs most legitimate load.
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 120 // requests / IP / minute
const _ipHits = new Map<string, { count: number; resetAt: number }>()
function rateLimited(ip: string): boolean {
    const now = Date.now()
    const e = _ipHits.get(ip)
    if (!e || now > e.resetAt) {
        if (_ipHits.size > 5000) _ipHits.clear() // bound memory
        _ipHits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
        return false
    }
    e.count += 1
    return e.count > RATE_MAX
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
    if (rateLimited(ip)) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    try {
        const url = new URL(req.url)
        
        // Extract the path after /tmdb-proxy
        let pathPart = url.pathname;
        if (pathPart.startsWith('/functions/v1/tmdb-proxy')) {
            pathPart = pathPart.replace('/functions/v1/tmdb-proxy', '');
        } else if (pathPart.startsWith('/tmdb-proxy')) {
            pathPart = pathPart.replace('/tmdb-proxy', '');
        }
        
        if (req.method === 'POST' && (!pathPart || pathPart === '/')) {
            try {
                const body = await req.clone().json();
                if (body && body.path) {
                    pathPart = body.path;
                }
            } catch (e) {
                // ignore
            }
        }

        // If there is no path, return a 400
        if (!pathPart || pathPart === '/') {
            return new Response(JSON.stringify({ error: 'Missing TMDB endpoint path' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // ── Smart Search Route ──
        if (pathPart === '/smart-search') {
            const query = url.searchParams.get('query') ?? '';
            const page = parseInt(url.searchParams.get('page') ?? '1', 10);
            if (!query) {
                return new Response(JSON.stringify({ error: 'Missing query parameter' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            const cacheKey = `search:${query.toLowerCase()}:${page}`;
            const cached = getCached(cacheKey);
            if (cached) {
                return new Response(JSON.stringify(cached), {
                    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' }
                });
            }

            const result = await multiTierSearch(query, page);
            setCache(cacheKey, result);
            return new Response(JSON.stringify(result), {
                status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' }
            });
        }

        // ── Generic TMDB Proxy (passthrough) ──
        const cacheKey = `proxy:${pathPart}?${url.searchParams.toString()}`;
        const cached = getCached(cacheKey);
        if (cached) {
            return new Response(JSON.stringify(cached), {
                status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' }
            });
        }

        // Forward all query parameters from the original request
        const tmdbUrl = new URL(`${TMDB_BASE}${pathPart}`)
        url.searchParams.forEach((value, key) => {
            tmdbUrl.searchParams.append(key, value)
        })
        
        // Append the secret API key
        tmdbUrl.searchParams.append('api_key', TMDB_API_KEY)

        // Make the request to TMDB
        const response = await fetch(tmdbUrl.toString(), {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        })

        const data = await response.json()
        setCache(cacheKey, data);

        // Return the TMDB response back to the client
        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: { 
                ...corsHeaders, 
                'Content-Type': 'application/json', 
                'X-Cache': 'MISS',
                'X-Debug-Url': tmdbUrl.toString() 
            }
        })

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Internal Server Error';
        console.error('TMDB Proxy Error:', message);
        return new Response(JSON.stringify({ error: message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})

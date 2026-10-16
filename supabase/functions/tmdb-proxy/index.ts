/**
 * tmdb-proxy — the only way the apps reach TMDB.
 *
 * The TMDB key lives here as a server secret and nowhere else. Both clients
 * POST { path: "/movie/550?append_to_response=credits" } with the anon key.
 *
 * What this function must never do is hand the key back. It used to: every
 * response carried an `X-Debug-Url` header holding the full TMDB URL, key
 * included, so anyone with the anon key (which ships in the app) could read
 * it. No response here repeats the URL it fetched.
 *
 * Only the paths the apps use are fetched (paths.js), checked after the URL
 * has resolved them, so `..` cannot climb out of /3.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { resolveTmdbUrl } from "./paths.js"

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') || ''
// Where the checked path is fetched: TMDB itself, unless the settings name the sealed world's stand-in.
const TMDB_ORIGIN = Deno.env.get('TMDB_ORIGIN') || ''
// How long TMDB may take, its answer read: past it, the caller hears 504 and tries again.
const TMDB_LIMIT_MS = 10_000

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra } })

// ── In-memory cache ──────────────────────────────────────────
// An edge instance lives for a while; hot paths are served from here to spare TMDB.
const responseCache = new Map<string, { data: unknown; status: number; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key: string) {
    const entry = responseCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
        responseCache.delete(key);
        return null;
    }
    return entry;
}

function setCache(key: string, data: unknown, status: number) {
    // Bounded, so a long-lived instance cannot grow without limit.
    if (responseCache.size > 500) {
        const oldest = responseCache.keys().next().value;
        if (oldest) responseCache.delete(oldest);
    }
    responseCache.set(key, { data, status, expiry: Date.now() + CACHE_TTL_MS });
}

// A best-effort per-IP throttle. In memory, so per instance rather than global,
// but it caps the easy abuse path; the cache absorbs most legitimate load.
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

/** The TMDB path the caller asked for: the POST body's `path`, or what follows /tmdb-proxy in the URL. */
async function callerPath(req: Request): Promise<string> {
    if (req.method === 'POST') {
        try {
            const body = await req.clone().json();
            if (body && typeof body.path === 'string') return body.path;
        } catch {
            // Not JSON — fall through to the URL.
        }
    }
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/functions\/v1\/tmdb-proxy/, '').replace(/^\/tmdb-proxy/, '');
    return path + url.search;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
    if (rateLimited(ip)) return json({ error: 'Rate limit exceeded' }, 429)

    try {
        const target = resolveTmdbUrl(await callerPath(req));
        if (!target) return json({ error: 'Path not allowed' }, 403);

        // Keyed on the URL WITHOUT the key.
        const cacheKey = target.toString();
        const cached = getCached(cacheKey);
        if (cached) return json(cached.data, cached.status, { 'X-Cache': 'HIT' });

        // Moved after the check: the path is still the one paths.js allowed.
        const fetched = TMDB_ORIGIN ? new URL(target.pathname + target.search, TMDB_ORIGIN) : target;
        fetched.searchParams.set('api_key', TMDB_API_KEY);
        const response = await fetch(fetched.toString(), {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(TMDB_LIMIT_MS),
        });
        let data: unknown;
        try {
            data = await response.json();
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === 'TimeoutError') throw err;
            // TMDB's own front door answers an outage with a page, not JSON: it is TMDB that failed.
            return json({ error: 'TMDB answered something unreadable' }, 502);
        }
        if (response.ok) setCache(cacheKey, data, response.status);
        return json(data, response.status, { 'X-Cache': 'MISS' });
    } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'TimeoutError') return json({ error: 'TMDB did not answer in time' }, 504);
        // Never the error's own text: a fetch error can quote the URL, and the URL holds the key.
        console.error('tmdb-proxy error:', err instanceof Error ? err.name : 'unknown');
        return json({ error: 'Internal Server Error' }, 500);
    }
})

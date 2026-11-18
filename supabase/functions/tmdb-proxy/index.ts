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
import { rateRule } from "./rate.js"

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') || ''
// Where the checked path is fetched: TMDB itself, unless the settings name the sealed world's stand-in.
const TMDB_ORIGIN = Deno.env.get('TMDB_ORIGIN') || ''
// How long TMDB may take, its answer read: past it, the caller hears 504, a deadline already
// spent, which the app says at once rather than asking again.
const TMDB_LIMIT_MS = 10_000

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    // So the website can read how long to wait after a 429.
    'Access-Control-Expose-Headers': 'Retry-After',
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

// How fast each address may make this instance ask TMDB (rate.js), counted only for a question
// the cache cannot answer.
const admit = rateRule()

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

    try {
        const target = resolveTmdbUrl(await callerPath(req));
        if (!target) return json({ error: 'Path not allowed' }, 403);

        // Keyed on the URL WITHOUT the key.
        const cacheKey = target.toString();
        const cached = getCached(cacheKey);
        if (cached) return json(cached.data, cached.status, { 'X-Cache': 'HIT' });

        // Only a question TMDB must answer is counted: the cache above costs it nothing.
        const verdict = admit({ address: ip, now: Date.now() });
        if (!verdict.ok) return json({ error: 'Rate limit exceeded' }, 429, { 'Retry-After': String(verdict.retryAfter) });

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
        // TMDB pacing the house itself: its own word on how long to wait is passed on.
        const tmdbWait = response.status === 429 ? response.headers.get('retry-after') : null;
        return json(data, response.status, { 'X-Cache': 'MISS', ...(tmdbWait ? { 'Retry-After': tmdbWait } : {}) });
    } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'TimeoutError') return json({ error: 'TMDB did not answer in time' }, 504);
        // Never the error's own text: a fetch error can quote the URL, and the URL holds the key.
        console.error('tmdb-proxy error:', err instanceof Error ? err.name : 'unknown');
        return json({ error: 'Internal Server Error' }, 500);
    }
})

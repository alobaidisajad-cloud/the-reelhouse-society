/**
 * tmdb-proxy — Server-Side TMDB API Proxy
 * ────────────────────────────────────────────────────────
 * D-02 SECURITY FIX: Moves the TMDB API key from client-side
 * (EXPO_PUBLIC_TMDB_API_KEY, extractable from JS bundle) to
 * server-side only (Supabase secret / Deno.env).
 *
 * Benefits:
 *   1. API key is never shipped to the client binary
 *   2. Per-IP rate limiting prevents abuse (60 req/min)
 *   3. CDN-edge response caching via Cache-Control headers
 *   4. Path allowlisting blocks unexpected TMDB endpoints
 *
 * Setup:
 *   supabase secrets set TMDB_API_KEY=<your-key>
 *   supabase functions deploy tmdb-proxy
 *
 * Client migration:
 *   Replace direct TMDB fetch URLs with:
 *   POST /functions/v1/tmdb-proxy { path: "/movie/550?append_to_response=credits" }
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// ── Rate Limiter (in-memory, per-isolate) ──────────────────
// Deno Deploy isolates are ephemeral, so this is best-effort.
// For stricter enforcement, use Supabase Vault + Redis.
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// Periodic cleanup to prevent memory leaks in long-running isolates
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 120_000); // Every 2 minutes

// ── Path Allowlist ─────────────────────────────────────────
// Only proxy known TMDB API endpoints. Prevents SSRF-like abuse
// where an attacker sends arbitrary paths through the proxy.
const ALLOWED_PATH_PREFIXES = [
  '/search/multi',
  '/search/movie',
  '/search/person',
  '/search/company',
  '/movie/',
  '/person/',
  '/trending/movie',
  '/discover/movie',
  '/genre/movie',
] as const;

function isPathAllowed(path: string): boolean {
  return ALLOWED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

// ── Cache TTL by path pattern ──────────────────────────────
function getCacheTTL(path: string): number {
  if (path.includes('/search/')) return 300;       // 5 min for search
  if (path.includes('/trending/')) return 3600;     // 1 hour for trending
  if (path.includes('/discover/')) return 1800;     // 30 min for discover
  if (path.includes('/movie/now_playing')) return 3600;
  if (path.includes('/movie/top_rated')) return 3600;
  return 86400; // 24h for film details (rarely change)
}

// ── CORS Headers ───────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // 1. Rate limit by client IP
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown';

    if (isRateLimited(clientIp)) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again shortly.' }), {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': '60',
        },
      });
    }

    // 2. Parse request body
    const body = await req.json().catch(() => null);
    const path = body?.path;

    if (!path || typeof path !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid `path` field' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Validate path against allowlist
    if (!isPathAllowed(path)) {
      return new Response(JSON.stringify({ error: 'Path not allowed' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Fetch from TMDB with server-side API key
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      console.error('[tmdb-proxy] TMDB_API_KEY secret is not set');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const separator = path.includes('?') ? '&' : '?';
    const tmdbUrl = `https://api.themoviedb.org/3${path}${separator}api_key=${TMDB_API_KEY}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const tmdbRes = await fetch(tmdbUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeout);

    if (!tmdbRes.ok) {
      // Forward TMDB error status (but not the raw body which might leak key info)
      return new Response(JSON.stringify({ error: `TMDB returned ${tmdbRes.status}` }), {
        status: tmdbRes.status === 404 ? 404 : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await tmdbRes.json();
    const cacheTTL = getCacheTTL(path);

    // 5. Return response with CDN cache headers
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': `public, s-maxage=${cacheTTL}, max-age=${Math.floor(cacheTTL / 2)}`,
      },
    });
  } catch (e) {
    const isAbort = e instanceof DOMException && e.name === 'AbortError';
    return new Response(
      JSON.stringify({ error: isAbort ? 'TMDB request timed out' : 'Internal server error' }),
      {
        status: isAbort ? 504 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

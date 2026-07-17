/**
 * fetch-rss — RSS Feed Proxy Edge Function
 * ────────────────────────────────────────────────────────
 * Fetches RSS feeds and converts to JSON for the Dispatch tab.
 * Uses rss2json.com as a reliable RSS→JSON converter.
 *
 * Benefits:
 *   1. Avoids CORS issues on mobile (direct RSS fetch blocked)
 *   2. CDN-edge caching (30min) reduces external API calls
 *   3. 8s timeout prevents slow feeds from blocking the UI
 *   4. Graceful degradation (returns empty items[] on failure)
 *
 * Deploy:
 *   supabase functions deploy fetch-rss
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

// F-11: per-IP rate limit (best-effort, per-isolate) + a feed-host allowlist, so this
// endpoint can't be used as an open relay (previously it would proxy ANY URL through
// rss2json). The app only ever requests the hosts below. Add new feed hosts here.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const e = rateLimitMap.get(ip);
  if (!e || now > e.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  e.count++;
  return e.count > RATE_LIMIT_MAX;
}
const ALLOWED_FEED_HOSTS = new Set(['www.theguardian.com', 'theguardian.com']);

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

  // F-11: rate limit by client IP
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('cf-connecting-ip')
    || 'unknown';
  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again shortly.' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  try {
    const body = await req.json().catch(() => null);
    const url = body?.url;

    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid `url` field' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // F-11: only proxy allowlisted feed hosts over https (blocks open-relay abuse & non-http schemes)
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (parsedUrl.protocol !== 'https:' || !ALLOWED_FEED_HOSTS.has(parsedUrl.hostname)) {
      return new Response(JSON.stringify({ error: 'Feed host not allowed' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch via rss2json.com — free, no API key, reliable
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();

    return new Response(JSON.stringify({ items: data.items || [] }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=1800, max-age=900',
      },
    });
  } catch (e) {
    const isAbort = e instanceof DOMException && e.name === 'AbortError';
    return new Response(
      JSON.stringify({ items: [], error: isAbort ? 'RSS feed timed out' : 'Fetch failed' }),
      {
        status: 200, // Return 200 with empty items so client degrades gracefully
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

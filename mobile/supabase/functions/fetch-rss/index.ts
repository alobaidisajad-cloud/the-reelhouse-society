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
    const body = await req.json().catch(() => null);
    const url = body?.url;

    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid `url` field' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate URL is a reasonable RSS feed URL (basic sanitization)
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return new Response(JSON.stringify({ error: 'Invalid URL scheme' }), {
        status: 400,
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

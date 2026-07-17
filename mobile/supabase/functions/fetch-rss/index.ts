/**
 * fetch-rss — RSS Feed Proxy Edge Function
 * ────────────────────────────────────────────────────────
 * Fetches an allowlisted RSS feed server-side and returns a normalized
 * JSON item list for the Dispatch tab.
 *
 * Why server-side:
 *   1. Avoids mobile CORS (direct RSS fetch is blocked in-app)
 *   2. CDN-edge caching (30min) reduces upstream calls
 *   3. 8s timeout prevents slow feeds from blocking the UI
 *   4. Graceful degradation (returns empty items[] on any failure)
 *
 * History: this function used to relay through api.rss2json.com. That free
 * third-party rate-limits shared datacenter IPs (it returned empty items[] to
 * this function's egress IP even while serving browsers fine), and it dropped
 * article images (thumbnail:""). We now fetch the feed XML directly and parse
 * it here — no third-party dependency, real images, and the F-11 open-relay
 * surface is gone (the function only ever fetches allowlisted hosts).
 *
 * Deploy (MUST keep it public — the app calls it with no auth header):
 *   supabase functions deploy fetch-rss --no-verify-jwt
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

// F-11: per-IP rate limit (best-effort, per-isolate) + a feed-host allowlist, so this
// endpoint can't be used as an open relay. The app only ever requests the hosts below.
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

const MAX_ITEMS = 30;

// ── Minimal, dependency-free RSS 2.0 parsing ───────────────────────────────────
function stripCdata(s: string): string {
  const m = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1] : s;
}
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&'); // decode &amp; LAST so "&amp;lt;" doesn't collapse to "<"
}
function firstTag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? stripCdata(m[1]).trim() : '';
}
function allTags(block: string, name: string): string[] {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out.push(stripCdata(m[1]).trim());
  return out;
}
function allAttrUrls(block: string, name: string): string[] {
  const re = new RegExp(`<${name}[^>]*\\burl="([^"]+)"`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out.push(m[1]);
  return out;
}

interface RssItem {
  title: string;
  link: string;
  guid: string;
  pubDate: string;
  author: string;
  description: string;
  categories: string[];
  thumbnail: string;
  enclosure: { link: string };
}

function parseRss(xml: string): RssItem[] {
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  return blocks.slice(0, MAX_ITEMS).map((block): RssItem => {
    // Guardian orders <media:content> ascending by width; the last is the largest.
    const media = allAttrUrls(block, 'media:content');
    const rawImg = media.length ? media[media.length - 1] : (allAttrUrls(block, 'enclosure')[0] ?? '');
    const image = rawImg ? decodeEntities(rawImg) : '';
    return {
      title: decodeEntities(firstTag(block, 'title')),
      link: firstTag(block, 'link'),
      guid: firstTag(block, 'guid') || firstTag(block, 'link'),
      pubDate: firstTag(block, 'pubDate'),
      author: decodeEntities(firstTag(block, 'dc:creator')),
      // Client strips tags then decodes; return real (decoded) HTML like rss2json did.
      description: decodeEntities(firstTag(block, 'description')),
      categories: allTags(block, 'category').map(decodeEntities),
      thumbnail: image,
      enclosure: { link: image },
    };
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
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

    // Fetch the feed XML directly (fetch follows the Guardian 302 redirect).
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'ReelHouseSociety/1.0 (+https://reelhouse.society)',
        'Accept': 'application/rss+xml, application/xml, text/xml; q=0.9, */*; q=0.8',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const xml = await res.text();
    const items = parseRss(xml);

    return new Response(JSON.stringify({ items }), {
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
        status: 200, // 200 + empty items so the client degrades gracefully to fallback
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

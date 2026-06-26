import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

/**
 * news-proxy — RSS Feed Parser Edge Function
 * ───────────────────────────────────────────────
 * Offloads XML RSS parsing from the mobile client UI thread.
 * Fetches film news RSS feeds, parses XML, and returns clean JSON.
 * Includes a 10-minute in-memory cache to reduce upstream pressure.
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── In-Memory Cache ──
let cachedNews: { data: unknown; expiry: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface NewsItem {
    title: string;
    link: string;
    description: string;
    pubDate: string;
    image?: string;
}

function extractTag(xml: string, tag: string): string {
    const match = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    return (match?.[1] ?? match?.[2] ?? '').trim();
}

function extractImage(xml: string): string | undefined {
    // Try media:content, media:thumbnail, or enclosure
    const mediaMatch = xml.match(/url="([^"]+\.(jpg|jpeg|png|webp)[^"]*)"/i);
    if (mediaMatch) return mediaMatch[1];
    
    // Try <img> inside description
    const imgMatch = xml.match(/<img[^>]+src="([^"]+)"/i);
    return imgMatch?.[1];
}

async function fetchAndParseRSS(): Promise<NewsItem[]> {
    const RSS_FEEDS = [
        'https://feeds.feedburner.com/ScreenDaily',
        'https://www.indiewire.com/feed/',
        'https://theplaylist.net/feed/',
    ];

    const allItems: NewsItem[] = [];

    for (const feedUrl of RSS_FEEDS) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            
            const res = await fetch(feedUrl, {
                signal: controller.signal,
                headers: { 'User-Agent': 'ReelHouse/1.0 (RSS Aggregator)' },
            });
            clearTimeout(timeout);

            if (!res.ok) continue;
            const xml = await res.text();

            // Simple XML item extraction
            const items = xml.split('<item>').slice(1, 6); // Max 5 per feed
            for (const item of items) {
                allItems.push({
                    title: extractTag(item, 'title'),
                    link: extractTag(item, 'link'),
                    description: extractTag(item, 'description').replace(/<[^>]*>/g, '').slice(0, 200),
                    pubDate: extractTag(item, 'pubDate'),
                    image: extractImage(item),
                });
            }
        } catch {
            // Skip failed feeds silently — other feeds may succeed
        }
    }

    // Sort by date, newest first
    allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    return allItems.slice(0, 12); // Cap at 12 items total
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Check cache
        if (cachedNews && Date.now() < cachedNews.expiry) {
            return new Response(JSON.stringify(cachedNews.data), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
            });
        }

        const news = await fetchAndParseRSS();
        cachedNews = { data: news, expiry: Date.now() + CACHE_TTL_MS };

        return new Response(JSON.stringify(news), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch news';
        console.error('News Proxy Error:', message);
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});

/**
 * NewsService — RSS-based film news fetcher
 * ───────────────────────────────────────────────────────────
 * BLOCK6-A: Extracted from tmdb.ts to maintain single-responsibility.
 * tmdb.ts is now a pure TMDB API client; news fetching is its own service.
 *
 * Features:
 *   • RSS feed fetching via Supabase Edge Function proxy
 *   • HTML entity decoding and tag stripping
 *   • Fallback static content for offline/failure scenarios
 *   • Optional AbortSignal support for component unmount cancellation
 */

import { logger } from '../utils/logger';

// ── Types ──────────────────────────────────────────────────────

export interface NewsItem {
    id: string;
    title: string;
    excerpt: string;
    date: string;
    time: string;
    category: string;
    author: string;
    link: string;
    image: string | null;
}

interface RSSItem {
    guid?: string;
    link?: string;
    title: string;
    description?: string;
    pubDate: string;
    categories?: string[];
    enclosure?: { link?: string };
    thumbnail?: string;
    author?: string;
}

// ── Helpers ────────────────────────────────────────────────────

const relDate = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
};

const decodeEntities = (s: string) =>
    s.replace(/&amp;/g, '&')
     .replace(/&lt;/g, '<')
     .replace(/&gt;/g, '>')
     .replace(/&quot;/g, '"')
     .replace(/&#039;/g, "'");

const FALLBACK_NEWS: NewsItem[] = [
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
    }
];

// ── Service ────────────────────────────────────────────────────

const RSS_FEEDS = ['https://www.theguardian.com/film/rss'];

/**
 * Fetches film news from RSS feeds via Supabase Edge Function proxy.
 * Returns curated fallback content on network failure or empty results.
 * Includes a 4-second timeout per feed and supports external cancellation.
 * @param signal - AbortSignal for component-unmount cancellation
 * @returns Sorted news items (live feed + fallback), newest first
 */
export async function getNews(signal?: AbortSignal): Promise<NewsItem[]> {
    try {
        const results = await Promise.all(RSS_FEEDS.map(async (url: string) => {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 4000);

                // Chain with external signal if provided
                if (signal) {
                    signal.addEventListener('abort', () => controller.abort(), { once: true });
                }

                const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
                const res = await fetch(`${supabaseUrl}/functions/v1/fetch-rss`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url }),
                    signal: controller.signal
                });
                clearTimeout(timer);
                if (!res.ok) return [];
                const data = await res.json();
                return data.items || [];
            } catch {
                return [];
            }
        }));

        const liveItems = results.flat();
        if (liveItems.length === 0) return FALLBACK_NEWS;

        const allItems = (liveItems as RSSItem[])
            .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
            .map((item): NewsItem => ({
                id: item.guid || item.link || '',
                title: decodeEntities(item.title),
                excerpt: decodeEntities((item.description?.replace(/<[^>]*>?/gm, '') ?? '').slice(0, 160)) + '...',
                date: new Date(item.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase(),
                time: new Date(item.pubDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                category: item.categories?.[0]?.toUpperCase() || 'WIRE',
                image: item.enclosure?.link || item.thumbnail || null,
                author: item.author || 'THE ORACLE',
                link: item.link || '',
            }));

        return [...allItems, ...FALLBACK_NEWS];
    } catch (e: unknown) {
        logger.warn('[NewsService] RSS news fetch failed:', e);
        return FALLBACK_NEWS;
    }
}

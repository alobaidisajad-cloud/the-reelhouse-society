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
// SVC-3: use the shared, more complete entity decoder instead of a local 5-entity copy.
import { decodeEntities } from '../utils/html';

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

/**
 * ── WHY THERE IS NO FALLBACK CONTENT HERE ────────────────────────────────────
 *
 * This module used to carry two invented articles — "OSCAR RADAR: The Monochrome
 * Revival" and "CANNES UNVEILED" — bylined to writers who do not exist, dated by
 * a helper that made them read as yesterday and the day before NO MATTER WHEN
 * they were shown, and linked to "#".
 *
 * They were returned on the two failure paths below, which meant that any member
 * OFFLINE — an ordinary state, not a rare one — opened the wire to invented
 * journalism that looked like today's. Tapping through called the URL opener with
 * "#", which fails the scheme allowlist, so the app told them the link was
 * unsafe.
 *
 * The original placement was deliberate and scoped — a comment below still
 * records that these must never be appended to live results — but the failure
 * path is the one a member actually reaches, and this app refuses invented
 * content everywhere else.
 *
 * The honest alternative was already written and simply unreachable: the Dispatch
 * screen has an empty state ("The wire is silent tonight.") that could never
 * appear while this guaranteed a non-empty list. Returning nothing reveals it.
 */

// ── Service ────────────────────────────────────────────────────

const RSS_FEEDS = ['https://www.theguardian.com/film/rss'];

/**
 * Fetches film news from RSS feeds via Supabase Edge Function proxy.
 * Returns an EMPTY array on network failure or empty results — never invented
 * content; see the note above. Includes a 4-second timeout per feed and supports
 * external cancellation.
 *
 * Never rejects: every exit returns an array. The caller's `.catch` is therefore
 * unreachable — noted rather than changed, since signalling failure distinctly
 * from "no news" is a product decision on a screen due to be rebuilt.
 * @param signal - AbortSignal for component-unmount cancellation
 * @returns Live news items, newest first; empty if the wire is down or quiet
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
        // Nothing, not something invented. The screen has an honest empty state.
        if (liveItems.length === 0) return [];

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

        // Live results stand on their own. This comment used to explain why the
        // fabricated items must not be appended here; they no longer exist at
        // all, which is the stronger version of the same rule.
        return allItems;
    } catch (e: unknown) {
        logger.warn('[NewsService] RSS news fetch failed:', e);
        return [];
    }
}

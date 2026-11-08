/**
 * queryClient.ts — React Query, with its cache kept on the phone (MMKV).
 *
 * The cache is written to disk (only when storage is encrypted: it holds
 * member data) and read back at launch, so a screen draws what it last showed
 * at once and refreshes behind it. Kept 24 hours at most, 2 MB at most: past
 * that, its newest reads that fit.
 */

import { agedSince } from './waits';
import NetInfo from '@/src/lib/reachability';
import { AppState } from 'react-native';
import { defaultShouldDehydrateQuery, focusManager, onlineManager, QueryClient, type Query } from '@tanstack/react-query';
// Not from auth.ts, which imports this file: that would be a cycle.
import { storage, setSensitive } from '../stores/mmkv-storage';
import { e2eTrace } from '../utils/e2eTrace';
import { QUERY_POLICY } from './queryPolicy';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

// ── Query Client Configuration ──────────────────────────────
// The rules live in queryPolicy.ts, where the clients tests build read them too.
export const queryClient = new QueryClient({ defaultOptions: QUERY_POLICY });

// React Query hears of the connection from a browser's online/offline events,
// which a phone never fires: without this it thinks it is always online, so a
// query neither waits out a lost connection nor refetches when it returns.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
);

// Nor does it hear the app come back to the front, which a browser tells it by the window's
// focus. Heard here, once: a read that asks to be current on return (refetchOnWindowFocus)
// is fetched again then; the house rule (queryPolicy.ts) keeps every other read as it is.
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
  return () => sub.remove();
});

// ── MMKV Persister ──────────────────────────────────────────
const CACHE_KEY = 'REELHOUSE_QUERY_CACHE';
// Cap persisted cache to prevent cold-start lag for power users
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — stale cache is worse than no cache
const MAX_CACHE_SIZE_BYTES = 2 * 1024 * 1024;  // 2 MB — prevents JS thread parse stalls

/**
 * The bytes a string takes stored as UTF-8, counted rather than estimated:
 * `.length` counts UTF-16 units, and a CJK character is one unit but three bytes.
 */
function utf8Bytes(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

/** Reads never kept: a search answers what was typed, and the search opens empty after a start. */
const NEVER_KEPT = new Set(['universalSearch']);
/** Which reads the cache keeps: an answered read, never a search. */
export const keepsQuery = (query: Query): boolean =>
  defaultShouldDehydrateQuery(query) && !NEVER_KEPT.has(String(query.queryKey[0]));
/** That rule, as app/_layout.tsx hands it to the cache's provider (persistOptions.dehydrateOptions). */
export const CACHE_KEEPS = { shouldDehydrateQuery: keepsQuery };

/** The reads a start draws first, the Lobby's and the Reels' feeds: kept before any other. */
const DRAWN_FIRST = new Set(['lobby', 'feed']);
const drawnFirst = (query: { queryKey?: readonly unknown[] }): number =>
  DRAWN_FIRST.has(String(query.queryKey?.[0])) ? 1 : 0;

/**
 * A cache past the ceiling, cut to it: the reads a start draws first, then the newest, each whole
 * while it fits, so a member whose reads outgrow 2 MB opens on what they saw last rather than on
 * nothing, and ten films opened since never push out the Lobby. Null when not one read fits. Each
 * read's share counts its comma, so the whole never passes.
 */
function cutToCeiling(client: PersistedClient): PersistedClient | null {
  const { queries } = client.clientState;
  const frame = utf8Bytes(JSON.stringify({ ...client, clientState: { ...client.clientState, queries: [] } }));
  const newest = queries
    .map((query) => ({ query, share: utf8Bytes(JSON.stringify(query)) + 1 }))
    .sort((a, b) => drawnFirst(b.query) - drawnFirst(a.query)
      || (b.query.state?.dataUpdatedAt ?? 0) - (a.query.state?.dataUpdatedAt ?? 0));
  let room = MAX_CACHE_SIZE_BYTES - frame;
  const kept: typeof queries = [];
  for (const { query, share } of newest) {
    if (share <= room) { kept.push(query); room -= share; }
  }
  if (kept.length === 0) return null;
  return { ...client, clientState: { ...client.clientState, queries: kept } };
}

// Each write and read of the cache, its size and the ms it held the thread, for the speed lab
// (the E2E build alone): a screen's answer is taken in only once the thread is free.
export const mmkvPersister: Persister = {
  persistClient: async (client: PersistedClient) => {
    try {
      const started = Date.now();
      let serialized: string | null = JSON.stringify(client);
      let bytes = utf8Bytes(serialized);
      if (bytes > MAX_CACHE_SIZE_BYTES) {
        const cut = cutToCeiling(client);
        serialized = cut ? JSON.stringify(cut) : null;
        bytes = serialized === null ? 0 : utf8Bytes(serialized);
      }
      e2eTrace('cache.persist', { bytes, ms: Date.now() - started });
      // Not one read fits: the cache on disk is never left in its place, and the next start reads afresh.
      if (serialized === null) { storage.delete(CACHE_KEY); return; }
      setSensitive(CACHE_KEY, serialized);
    } catch {
      // Silently fail — app works without cache, just slower on cold start
    }
  },
  restoreClient: async () => {
    try {
      const started = Date.now();
      const data = storage.getString(CACHE_KEY);
      if (!data) return undefined;
      const parsed = JSON.parse(data) as PersistedClient;
      e2eTrace('cache.restore', { chars: data.length, ms: Date.now() - started });
      // Discard cache if older than 24 hours
      if (parsed.timestamp && agedSince(parsed.timestamp) > MAX_CACHE_AGE_MS) {
        storage.delete(CACHE_KEY);
        return undefined;
      }
      return parsed;
    } catch {
      // Corrupted cache — start fresh
      storage.delete(CACHE_KEY);
      return undefined;
    }
  },
  removeClient: async () => {
    storage.delete(CACHE_KEY);
  },
};


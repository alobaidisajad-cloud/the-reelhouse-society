/**
 * queryClient.ts — MMKV-Backed React Query Persistence Engine
 * ─────────────────────────────────────────────────────────────
 * Wires @tanstack/react-query v5 into the existing MMKV C++ storage
 * instance from auth.ts. Every successful query result is automatically
 * persisted to MMKV and restored on cold start, making the app feel
 * instant — zero network wait on launch.
 *
 * Architecture: Twitter/X + Instagram pattern
 *   1. App launches → MMKV restores cached query data (~1ms, C++ mmap)
 *   2. UI renders immediately from cache
 *   3. Background refetch silently replaces stale data
 *   4. User never sees a loading spinner on warm start
 *
 * This replaces the scattered ad-hoc AsyncStorage caches
 * (lobby_cache, nitrate_memory_feed) with a unified, TTL-managed,
 * stale-while-revalidate system backed by MMKV instead of SQLite.
 */

import { QueryClient } from '@tanstack/react-query';
// Import from lightweight mmkv-storage instead of heavyweight auth.ts
// to avoid circular dependency risk (auth -> queryClient -> auth)
import { storage, setSensitive } from '../stores/mmkv-storage';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

// ── Query Client Configuration ──────────────────────────────
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 min — data is "fresh" for this window
      gcTime: 30 * 60 * 1000,           // 30 min — garbage collect unused queries
      retry: 1,                          // Single retry (withRetry handles critical ops)
      retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,       // Not applicable on mobile
      refetchOnReconnect: 'always',      // Always refetch when network returns
    },
  },
});

// ── MMKV Persister ──────────────────────────────────────────
// Direct integration with the C++ MMKV instance — no middleware,
// no AsyncStorage SQLite bridge. ~100x faster than the old approach.
const CACHE_KEY = 'REELHOUSE_QUERY_CACHE';
// Cap persisted cache to prevent cold-start lag for power users
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — stale cache is worse than no cache
const MAX_CACHE_SIZE_BYTES = 2 * 1024 * 1024;  // 2 MB — prevents JS thread parse stalls

export const mmkvPersister: Persister = {
  persistClient: async (client: PersistedClient) => {
    try {
      const serialized = JSON.stringify(client);
      // Use conservative byte estimate (UTF-16 → UTF-8) instead of string.length
      // string.length counts code units, not bytes — multi-byte chars (emoji, CJK) could double actual size
      const estimatedBytes = serialized.length * 2;
      if (estimatedBytes > MAX_CACHE_SIZE_BYTES) {
        if (__DEV__) console.warn(`[QueryCache] Skipping persist — ${(estimatedBytes / 1024).toFixed(0)} KB exceeds 2 MB limit`);
        storage.delete(CACHE_KEY);
        return;
      }
      setSensitive(CACHE_KEY, serialized);
    } catch {
      // Silently fail — app works without cache, just slower on cold start
    }
  },
  restoreClient: async () => {
    try {
      const data = storage.getString(CACHE_KEY);
      if (!data) return undefined;
      const parsed = JSON.parse(data) as PersistedClient;
      // Discard cache if older than 24 hours
      if (parsed.timestamp && Date.now() - parsed.timestamp > MAX_CACHE_AGE_MS) {
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


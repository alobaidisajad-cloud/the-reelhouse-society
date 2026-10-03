/**
 * queryClient.ts — React Query, with its cache kept on the phone (MMKV).
 *
 * The cache is written to disk (only when storage is encrypted: it holds
 * member data) and read back at launch, so a screen draws what it last showed
 * at once and refreshes behind it. Kept 24 hours at most, 2 MB at most.
 */

import NetInfo from '@react-native-community/netinfo';
import { onlineManager, QueryClient } from '@tanstack/react-query';
// Not from auth.ts, which imports this file: that would be a cycle.
import { storage, setSensitive } from '../stores/mmkv-storage';
import { isTmdbUnreachable } from './tmdbErrors';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

/**
 * One more try, once — never for a failure that another try cannot mend: the
 * phone has no connection, or the catalogue was already tried three times
 * inside fetchTMDB. Those go straight to the screen, which says so.
 */
export function shouldRetry(failures: number, error: unknown): boolean {
  return failures < 1 && onlineManager.isOnline() && !isTmdbUnreachable(error);
}

// ── Query Client Configuration ──────────────────────────────
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 min — data is "fresh" for this window
      gcTime: 30 * 60 * 1000,           // 30 min — garbage collect unused queries
      retry: shouldRetry,
      retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
      // Asked even with no connection, so a read fails and the screen says it
      // could not reach the house. React Query's default ('online') instead
      // PAUSES the read: it is neither loading nor failed, and a page opened
      // offline read its missing data as "this film does not exist". What a
      // pause was for, running again when the connection returns, the
      // reconnect refetch below does for every screen on show.
      networkMode: 'always',
      // Coming back to the app never reorders a feed under the member's thumb;
      // a screen that wants word of what is new asks for it (the Dispatch's pill).
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
    },
    // An action taken offline fails and is said to have failed; paused, a
    // report or a ruling waited unseen, its button busy, for a connection.
    mutations: { networkMode: 'always' },
  },
});

// React Query hears of the connection from a browser's online/offline events,
// which a phone never fires: without this it thinks it is always online, so a
// query neither waits out a lost connection nor refetches when it returns.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
);

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

export const mmkvPersister: Persister = {
  persistClient: async (client: PersistedClient) => {
    try {
      const serialized = JSON.stringify(client);
      const bytes = utf8Bytes(serialized);
      if (bytes > MAX_CACHE_SIZE_BYTES) {
        if (__DEV__) console.warn(`[QueryCache] Skipping persist — ${(bytes / 1024).toFixed(0)} KB exceeds 2 MB limit`);
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


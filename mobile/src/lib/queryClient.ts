/**
 * queryClient.ts — React Query, with its cache kept on the phone (MMKV).
 *
 * The cache is written to disk (only when storage is encrypted: it holds
 * member data) and read back at launch, so a screen draws what it last showed
 * at once and refreshes behind it. Kept 24 hours at most, 2 MB at most.
 */

import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
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

// Each write and read of the cache, its size and the ms it held the thread, for the speed lab
// (the E2E build alone): a screen's answer is taken in only once the thread is free.
export const mmkvPersister: Persister = {
  persistClient: async (client: PersistedClient) => {
    try {
      const started = Date.now();
      const serialized = JSON.stringify(client);
      const bytes = utf8Bytes(serialized);
      e2eTrace('cache.persist', { bytes, ms: Date.now() - started });
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
      const started = Date.now();
      const data = storage.getString(CACHE_KEY);
      if (!data) return undefined;
      const parsed = JSON.parse(data) as PersistedClient;
      e2eTrace('cache.restore', { chars: data.length, ms: Date.now() - started });
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


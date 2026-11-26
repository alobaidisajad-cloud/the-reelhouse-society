/**
 * queryClient.ts — React Query, with its cache kept on the phone (MMKV).
 *
 * The cache is written to disk (only when storage is encrypted: it holds
 * member data) and read back at launch, so a screen draws what it last showed
 * at once and refreshes behind it. Kept 24 hours at most, 2 MB at most: past
 * that, its newest reads that fit. Written at most once a second, and at once
 * when the app leaves the front.
 */

import { agedSince } from './waits';
import NetInfo from '@/src/lib/reachability';
import { AppState } from 'react-native';
import { defaultShouldDehydrateQuery, focusManager, onlineManager, QueryClient, type Query } from '@tanstack/react-query';
// Not from auth.ts, which imports this file: that would be a cycle.
import { storage, setSensitive } from '../stores/mmkv-storage';
import { E2E_BUILD, e2eTrace } from '../utils/e2eTrace';
import { QUERY_POLICY } from './queryPolicy';
import { keepsEachPagesWord } from './feedPages';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

// ── Query Client Configuration ──────────────────────────────
// The rules live in queryPolicy.ts, where the clients tests build read them too.
export const queryClient = new QueryClient({ defaultOptions: QUERY_POLICY });
// Every feed, whether or not its screen holds it (restored from the phone, or changed by a write
// while the Reel is away), keeps each page's word on what follows through the cache (feedPages).
queryClient.setQueryDefaults(['feed'], { structuralSharing: keepsEachPagesWord });

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

/**
 * Whether a serialised cache passes the ceiling, its bytes counted only when its length leaves
 * that open: a UTF-16 unit stores as one byte at least and three at most (a pair of them, four),
 * so a string longer than the ceiling is over it, and one a third of the ceiling or shorter is
 * under it. Counting is a loop over every character, on the JS thread.
 */
export function pastTheCeiling(serialized: string): boolean {
  if (serialized.length > MAX_CACHE_SIZE_BYTES) return true;
  if (serialized.length * 3 <= MAX_CACHE_SIZE_BYTES) return false;
  return utf8Bytes(serialized) > MAX_CACHE_SIZE_BYTES;
}

/** The cache serialised once, and cut to the ceiling only when it passes it: null when not one read fits. */
function serialise(client: PersistedClient): string | null {
  const serialized = JSON.stringify(client);
  if (!pastTheCeiling(serialized)) return serialized;
  const cut = cutToCeiling(client);
  return cut ? JSON.stringify(cut) : null;
}

/**
 * The heartbeat's bound, the judge's own (e2e/screen-times.mjs HEARTBEAT_MS, one number: the
 * queryClient tests hold them equal). A wall-clock sample taken while the phone itself is starved
 * measures the phone, not the write (the dark walk, nightly 45676715897: one write 235 ms in a
 * second the whole phone stalled, its neighbours 1 ms). So beside each write a fixed tiny task, the
 * heartbeat, is timed just before and just after it; one over this bound says the moment was
 * starved, and the judge voids a slow write then and reads its next sample.
 */
export const HEARTBEAT_MS = 20;
/** The samples a write is taken in at most, the judge's MEASURE_TAKES: three starved in a row fail it. */
export const MEASURE_TAKES = 3;
/** How long after a starved sample the same work is timed again: a phone-wide stall lasts about a second. */
const RETAKE_AFTER_MS = 1000;
/** The heartbeat's task: always the same small serialisation, well under a millisecond on a phone at rest. */
const BEAT = Array.from({ length: 200 }, (_, i) => ({ id: i, title: 'La Passion de Jeanne d’Arc', year: 1928 }));

/** The heartbeat: the ms its fixed task took now. */
export function heartbeat(): number {
  const started = Date.now();
  JSON.stringify(BEAT);
  return Date.now() - started;
}

/** One sample of a write's work: the ms it held the thread, and the slower of its two heartbeats. */
function sample(client: PersistedClient): { serialized: string | null; ms: number; beat: number } {
  const before = heartbeat();
  const started = Date.now();
  const serialized = serialise(client);
  const ms = Date.now() - started;
  return { serialized, ms, beat: Math.max(before, heartbeat()) };
}

let writesTimed = 0;

/**
 * A starved sample's work timed again for the speed lab (the E2E build alone), when the thread is
 * idle past RETAKE_AFTER_MS, up to MEASURE_TAKES samples in all. It only measures: nothing is
 * stored, so a sign-out between takes leaves nothing behind.
 */
function retake(client: PersistedClient, write: number, take: number): void {
  setTimeout(() => requestIdleCallback(() => {
    try {
      const s = sample(client);
      e2eTrace('cache.persist', { chars: s.serialized?.length ?? 0, ms: s.ms, beat: s.beat, write, take });
      if (s.beat > HEARTBEAT_MS && take < MEASURE_TAKES) retake(client, write, take + 1);
    } catch { /* a measure only: the write itself was stored */ }
  }, { timeout: IDLE_WAIT_MS }), RETAKE_AFTER_MS);
}

/**
 * The write itself: the cache serialised and stored. In the E2E build each write's length, the ms
 * it held the thread and its heartbeat go to the speed lab (a screen's answer is taken in only once
 * the thread is free), and a starved sample is taken again (retake); other builds time nothing.
 */
function writeCache(client: PersistedClient): void {
  try {
    let serialized: string | null;
    if (E2E_BUILD) {
      const write = ++writesTimed;
      const s = sample(client);
      serialized = s.serialized;
      e2eTrace('cache.persist', { chars: serialized?.length ?? 0, ms: s.ms, beat: s.beat, write, take: 1 });
      if (s.beat > HEARTBEAT_MS) retake(client, write, 2);
    } else {
      serialized = serialise(client);
    }
    // Not one read fits: the cache on disk is never left in its place, and the next start reads afresh.
    if (serialized === null) { storage.delete(CACHE_KEY); return; }
    setSensitive(CACHE_KEY, serialized);
  } catch {
    // Silently fail — app works without cache, just slower on cold start
  }
}

/**
 * React Query hands the persister the whole cache on EVERY change to it: each read started,
 * answered or failed, each setQueryData and each invalidation (a film opened is three). Written
 * each time, the whole cache would be serialised and stored many times a second while a screen
 * loads. So the newest is held and written once a second at most (the write carries the latest),
 * and then only when the JS thread is idle (requestIdleCallback; within IDLE_WAIT_MS whatever
 * comes), so a fling on the Reel is never held up by it; and at once when the app leaves the front,
 * where the phone may end it unseen.
 *
 * A held cache belongs to the member it was taken under: one held as they sign out, or taken for
 * one member and due after another signed in, is never written (memberNow at the write). And a
 * sign-out takes the cache away through forgetCache, which takes a held write with it.
 */
const WRITE_EVERY_MS = 1000;
const IDLE_WAIT_MS = 2000;
let held: { client: PersistedClient; member: string | null } | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let idleTask: ReturnType<typeof requestIdleCallback> | null = null;

/** The member signed in now. Read lazily: auth.ts imports this file, so this one cannot import it. */
function memberNow(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded late, past the import loop
    return (require('../stores/auth') as typeof import('../stores/auth')).useAuthStore.getState().user?.id ?? null;
  } catch {
    return null;
  }
}

/** The write waiting its turn, and its idle task, called off. */
function cancelHeldWrite(): void {
  if (writeTimer !== null) { clearTimeout(writeTimer); writeTimer = null; }
  if (idleTask !== null) { cancelIdleCallback(idleTask); idleTask = null; }
}

/** Writes the cache held for its turn now, if one is held and still belongs to the member signed in. */
export function writeHeldCache(): void {
  cancelHeldWrite();
  const taken = held;
  held = null;
  if (taken && taken.member === memberNow()) writeCache(taken.client);
}

/**
 * The cache on disk taken away, with any write of it still waiting its turn: the one door a
 * sign-out (and a member left behind) goes through, so no held write puts it back after.
 */
export function forgetCache(): void {
  cancelHeldWrite();
  held = null;
  storage.delete(CACHE_KEY);
}

AppState.addEventListener('change', (state) => {
  if (state !== 'active') writeHeldCache();
});

export const mmkvPersister: Persister = {
  persistClient: async (client: PersistedClient) => {
    held = { client, member: memberNow() };
    if (writeTimer !== null || idleTask !== null) return;
    writeTimer = setTimeout(() => {
      writeTimer = null;
      idleTask = requestIdleCallback(() => { idleTask = null; writeHeldCache(); }, { timeout: IDLE_WAIT_MS });
    }, WRITE_EVERY_MS);
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
    // A write still waiting its turn would put back what is being taken away.
    forgetCache();
  },
};


/**
 * offlineQueueStore.ts — the offline queue as the screens see it.
 *
 * The queue itself (utils/offlineQueue.ts) lives in MMKV and is written only
 * there; every write it makes is copied here, so this cannot disagree with it.
 * A screen asks this module, never the queue's machinery, what has not gone
 * yet — so a test that replaces the machinery still draws its screen, with
 * nothing waiting.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import type { QueuedMutation } from '../utils/offlineQueue';

export const useOfflineQueueStore = create<{ queued: readonly QueuedMutation[] }>(() => ({
  queued: [],
}));

/** The ids a row of this type was made with, for the writes still waiting. */
function unsentKey(queued: readonly QueuedMutation[], type: QueuedMutation['type']): string {
  let key = '';
  for (const m of queued) {
    const id = m.type === type ? m.payload._tempId : undefined;
    if (typeof id === 'string') key = key ? `${key} ${id}` : id;
  }
  return key;
}

/**
 * The rows of one kind written on this phone and not yet sent — `add_filing`
 * gives the filings still in the queue, which say NOT SENT YET. Re-renders only
 * when that set changes, not on every write the queue makes.
 */
export function useUnsent(type: QueuedMutation['type']): ReadonlySet<string> {
  const key = useOfflineQueueStore((s) => unsentKey(s.queued, type));
  return useMemo(() => new Set(key ? key.split(' ') : []), [key]);
}

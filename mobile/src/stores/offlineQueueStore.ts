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
import { registerStoreReset } from './resetAllStores';

export const useOfflineQueueStore = create<{ queued: readonly QueuedMutation[] }>(() => ({
  queued: [],
}));

// The next member finds nothing waiting: logout empties the queue itself
// (clearOfflineQueue), and this empties the screens' copy with every other store.
registerStoreReset(() => {
  useOfflineQueueStore.setState({ queued: [] });
});

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
 * Whether the write that makes this row is still waiting to be sent. A row
 * the house does not hold yet cannot be deleted there; its removal has to wait
 * in the queue behind it.
 */
export function stillQueued(type: QueuedMutation['type'], id: string): boolean {
  return useOfflineQueueStore.getState().queued
    .some((m) => m.type === type && (m.payload.id === id || m.payload._tempId === id));
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

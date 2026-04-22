/**
 * offlineQueue.ts — MMKV-Backed Offline Mutation Queue
 * ─────────────────────────────────────────────────────
 * Queues mutations (endorsements, marks) when offline and
 * flushes them when connectivity returns. Uses the same
 * MMKV C++ instance from auth.ts for synchronous I/O —
 * no async SQLite bridge overhead.
 *
 * Architecture:
 *   • enqueueMutation is now synchronous (MMKV is C++ mmap)
 *   • 100-entry cap prevents unbounded growth
 *   • 24h stale threshold auto-prunes abandoned mutations
 *   • Network errors keep mutations for retry; constraint
 *     errors (duplicates) discard them permanently
 */
import { storage } from '../stores/auth';
import { supabase } from '../lib/supabase';
import reelToast from './reelToast';

export interface QueuedMutation {
    id: string;
    type: 'endorse_log' | 'endorse_list' | 'mark_watched';
    payload: Record<string, unknown>;
    timestamp: number;
}

const QUEUE_KEY = 'reelhouse-offline-mutations';
const MAX_QUEUE_SIZE = 100; // Cap to prevent unbounded growth
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Read queue from MMKV (synchronous C++) */
function readQueue(): QueuedMutation[] {
    try {
        const stored = storage.getString(QUEUE_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error('[OfflineSync] Failed to read queue:', e);
    }
    return [];
}

/** Write queue to MMKV (synchronous C++) */
function writeQueue(queue: QueuedMutation[]) {
    try {
        storage.set(QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
        console.error('[OfflineSync] Failed to write queue:', e);
    }
}

/**
 * Enqueue a mutation for background sync.
 * Synchronous — returns instantly thanks to MMKV.
 */
export function enqueueMutation(mutation: Omit<QueuedMutation, 'id' | 'timestamp'>) {
    let queue = readQueue();

    const newMutation: QueuedMutation = {
        ...mutation,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now()
    };

    queue.push(newMutation);

    // Cap queue size to prevent unbounded growth
    if (queue.length > MAX_QUEUE_SIZE) {
        queue = queue.slice(-MAX_QUEUE_SIZE);
    }

    writeQueue(queue);
    console.log(`[OfflineSync] Queued ${mutation.type} for background sync.`);
}

export async function flushOfflineQueue() {
    let queue = readQueue();

    if (queue.length === 0) return;

    // Prune stale mutations (>24h old)
    const now = Date.now();
    queue = queue.filter(m => now - m.timestamp < STALE_THRESHOLD_MS);

    console.log(`[OfflineSync] Flushing ${queue.length} queued mutations...`);

    const remainingQueue: QueuedMutation[] = [];

    for (const mutation of queue) {
        try {
            if (mutation.type === 'endorse_log') {
                const { user_id, target_log_id } = mutation.payload;
                await supabase.from('interactions').insert([{ user_id, target_log_id, type: 'endorse_log' }]);
            } else if (mutation.type === 'endorse_list') {
                const { user_id, target_list_id } = mutation.payload;
                await supabase.from('interactions').insert([{ user_id, target_list_id, type: 'endorse_list' }]);
            } else if (mutation.type === 'mark_watched') {
                await supabase.from('logs').insert([mutation.payload]);
            }
            // Add more cases as needed...
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : '';
            console.error(`[OfflineSync] Failed to execute ${mutation.type}:`, error);
            // If it failed due to network, keep it in the queue. If it failed due to constraint (like duplicate), discard it.
            if (errMsg.toLowerCase().includes('fetch') || errMsg.toLowerCase().includes('network')) {
                remainingQueue.push(mutation);
            }
        }
    }

    if (queue.length > remainingQueue.length) {
        reelToast(`Archive updated with offline actions.`);
    }

    writeQueue(remainingQueue);
}

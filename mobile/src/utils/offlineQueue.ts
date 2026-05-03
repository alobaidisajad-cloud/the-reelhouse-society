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
import { storage } from '../stores/mmkv-storage';
import { supabase } from '../lib/supabase';
import reelToast from './reelToast';
import { logger } from './logger';

export interface QueuedMutation {
    id: string;
    // H-01 AUDIT FIX: Expanded type union to cover all domain slices
    type: 'endorse_log' | 'endorse_list' | 'mark_watched' | 'remove_log' | 'remove_watchlist' | 'remove_endorsement' | 'add_log' | 'update_log' | 'update_profile'
        | 'add_watchlist' | 'create_list' | 'delete_list' | 'add_film_to_list' | 'remove_film_from_list'
        | 'add_archive' | 'remove_archive' | 'update_archive';
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
        if (__DEV__) console.error('[OfflineSync] Failed to read queue:', e);
    }
    return [];
}

/** Write queue to MMKV (synchronous C++) */
function writeQueue(queue: QueuedMutation[]) {
    try {
        storage.set(QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
        if (__DEV__) console.error('[OfflineSync] Failed to write queue:', e);
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
    logger.debug(`[OfflineSync] Queued ${mutation.type} for background sync.`);
}

let isFlushing = false;

export async function flushOfflineQueue() {
    if (isFlushing) {
        logger.debug('[OfflineSync] Flush already in progress. Skipping duplicate call.');
        return;
    }
    isFlushing = true;
    try {
    let queue = readQueue();

    if (queue.length === 0) return;

    // Prune stale mutations (>24h old)
    const now = Date.now();
    queue = queue.filter(m => now - m.timestamp < STALE_THRESHOLD_MS);

    logger.debug(`[OfflineSync] Flushing ${queue.length} queued mutations...`);

    const remainingQueue: QueuedMutation[] = [];
    const deadLetterQueue: QueuedMutation[] = [];

    let successCount = 0;

    for (const mutation of queue) {
        try {
            const throwIfError = (res: { error: any, data?: any }) => { if (res.error) throw res.error; return res; };

            if (mutation.type === 'endorse_log') {
                const { user_id, target_log_id } = mutation.payload;
                throwIfError(await supabase.from('interactions_queue_buffer').insert([{ user_id, target_log_id, type: 'endorse_log' }]));
            } else if (mutation.type === 'endorse_list') {
                const { user_id, target_list_id } = mutation.payload;
                throwIfError(await supabase.from('interactions_queue_buffer').insert([{ user_id, target_list_id, type: 'endorse_list' }]));
            } else if (mutation.type === 'mark_watched') {
                throwIfError(await supabase.from('logs').insert([mutation.payload]));
            } else if (mutation.type === 'update_profile') {
                const { user_id, preferences } = mutation.payload;
                throwIfError(await supabase.from('profiles').update({ preferences }).eq('id', user_id));
            } else if (mutation.type === 'remove_log') {
                const { log_id } = mutation.payload;
                throwIfError(await supabase.from('logs').delete().eq('id', log_id));
            } else if (mutation.type === 'remove_watchlist') {
                const { user_id, film_id } = mutation.payload;
                throwIfError(await supabase.from('watchlists').delete().eq('user_id', user_id).eq('film_id', film_id));
            } else if (mutation.type === 'remove_endorsement') {
                const { user_id, target_log_id } = mutation.payload;
                throwIfError(await supabase.from('interactions').delete().eq('user_id', user_id).eq('target_log_id', target_log_id).eq('type', 'endorse_log'));
            } else if (mutation.type === 'add_log') {
                throwIfError(await supabase.from('logs').insert([mutation.payload]));
            } else if (mutation.type === 'update_log') {
                const { id, updates } = mutation.payload;
                throwIfError(await supabase.from('logs').update(updates as any).eq('id', id));

            // ── C-01 FIX: Watchlist offline handler ──
            } else if (mutation.type === 'add_watchlist') {
                throwIfError(await supabase.from('watchlists').insert([mutation.payload]));

            // ── C-02 FIX: List offline handlers ──
            } else if (mutation.type === 'create_list') {
                const { films, ...listPayload } = mutation.payload as Record<string, any>;
                const { data } = throwIfError(await supabase.from('lists').upsert([listPayload], { onConflict: 'id' }).select().single());
                if (data && Array.isArray(films) && films.length > 0) {
                    const items = films.map((f: any) => ({ list_id: data.id, film_id: f.film_id, film_title: f.film_title, poster_path: f.poster_path, position: f.position }));
                    throwIfError(await supabase.from('list_items').delete().eq('list_id', data.id));
                    throwIfError(await supabase.from('list_items').insert(items));
                }
            } else if (mutation.type === 'delete_list') {
                const { list_id, user_id } = mutation.payload;
                throwIfError(await supabase.from('list_items').delete().eq('list_id', list_id));
                throwIfError(await supabase.from('lists').delete().eq('id', list_id).eq('user_id', user_id));
            } else if (mutation.type === 'add_film_to_list') {
                const { list_id, film_id, film_title, poster_path, position } = mutation.payload;
                throwIfError(await supabase.from('list_items').insert([{ list_id, film_id, film_title, poster_path, position }]));
            } else if (mutation.type === 'remove_film_from_list') {
                const { list_id, film_id } = mutation.payload;
                throwIfError(await supabase.from('list_items').delete().eq('list_id', list_id).eq('film_id', film_id));

            // ── C-03 FIX: Archive offline handlers ──
            } else if (mutation.type === 'add_archive') {
                const { user_id, film_id, film_title, poster_path, year, formats, notes, condition } = mutation.payload;
                throwIfError(await supabase.from('physical_archive').upsert([{
                    user_id, film_id, film_title, poster_path, year, formats, notes, condition,
                }], { onConflict: 'user_id, film_id' }));
            } else if (mutation.type === 'remove_archive') {
                const { user_id, film_id } = mutation.payload;
                throwIfError(await supabase.from('physical_archive').delete().eq('user_id', user_id).eq('film_id', film_id));
            } else if (mutation.type === 'update_archive') {
                const { user_id, film_id, updates } = mutation.payload;
                throwIfError(await supabase.from('physical_archive').update(updates as any).eq('user_id', user_id).eq('film_id', film_id));

            // ── H-01 FIX: Catch-all for unrecognized mutation types ──
            } else {
                if (__DEV__) console.warn(`[OfflineSync] Unknown mutation type: ${mutation.type} — moving to dead letter queue`);
                deadLetterQueue.push(mutation);
                continue;
            }
            successCount++;
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : '';
            const errLower = errMsg.toLowerCase();
            if (__DEV__) console.error(`[OfflineSync] Failed to execute ${mutation.type}:`, error);

            if (errLower.includes('fetch') || errLower.includes('network')) {
                // Network failure — retry later
                remainingQueue.push(mutation);
            } else if (errLower.includes('duplicate') || errLower.includes('unique') || errLower.includes('23505')) {
                // Constraint violation — safely discard (already synced)
                if (__DEV__) console.warn(`[OfflineSync] Discarding duplicate mutation: ${mutation.type}`);
            } else {
                // Unknown failure — log to dead-letter queue for diagnostics
                deadLetterQueue.push({ ...mutation, payload: { ...mutation.payload, _failReason: errMsg, _failedAt: new Date().toISOString() } });
            }
        }
    }

    if (successCount > 0) {
        reelToast(`Archive updated with offline actions.`);
    }

    // Persist dead-letter mutations for post-mortem inspection
    if (deadLetterQueue.length > 0) {
        try {
            const existing = storage.getString(QUEUE_KEY + '_dead_letter');
            let prev: QueuedMutation[] = existing ? JSON.parse(existing) : [];
            // M-02 AUDIT FIX: Prune dead-letter entries older than 7 days
            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            prev = prev.filter(m => m.timestamp > sevenDaysAgo);
            const combined = [...prev, ...deadLetterQueue].slice(-50); // Cap at 50
            storage.set(QUEUE_KEY + '_dead_letter', JSON.stringify(combined));
        } catch { /* storage write failure — nothing we can do */ }
        reelToast.error(`${deadLetterQueue.length} offline action(s) couldn't be synced.`);
    }

    writeQueue(remainingQueue);
    } finally {
        isFlushing = false;
    }
}

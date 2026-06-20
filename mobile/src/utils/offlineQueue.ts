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
 *   • 100-entry cap prevents unbounded growth (see MAX_QUEUE_SIZE below)
 *   • 24h stale threshold auto-prunes abandoned mutations
 *   • Network errors keep mutations for retry; constraint
 *     errors (duplicates) discard them permanently
 */
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import { storage } from '../stores/mmkv-storage';
import { MutationSchemaMap } from '../types/mutations';
import { logger } from './logger';
import { applyIdMapToPayload, executeMutation } from './mutationExecutor';
import { isNetworkError } from './networkError';
import reelToast from './reelToast';

export interface QueuedMutation {
    id: string;
    // H-01 AUDIT FIX: Expanded type union to cover all domain slices
    type: 'endorse_log' | 'endorse_list' | 'endorse_film' | 'endorse_review' | 'mark_watched' | 'remove_log' | 'remove_watchlist' | 'remove_endorsement' | 'add_log' | 'update_log' | 'update_profile'
        | 'add_watchlist' | 'create_list' | 'update_list' | 'delete_list' | 'add_film_to_list' | 'remove_film_from_list' | 'add_list_items' | 'restore_list_items'
        | 'add_archive' | 'update_archive' | 'remove_archive' | 'save_stub'
        | 'follow_user' | 'follow_request_user' | 'unfollow_user' | 'send_lounge_message' | 'delete_lounge_message'
        | 'sync_entitlement' | 'add_dossier' | 'update_dossier' | 'delete_dossier' | 'add_dossier_comment' | 'update_dossier_comment' | 'delete_dossier_comment' | 'toggle_dossier_certify' | 'increment_dossier_views' | 'add_log_comment' | 'remove_log_comment' | 'add_list_comment' | 'remove_list_comment'
        | 'submit_report';
    payload: Record<string, unknown>;
    timestamp: number;
}

const QUEUE_KEY = 'reelhouse-offline-mutations';
const MAX_QUEUE_SIZE = 100;
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

// T1-1 FIX: User-scoped queueing — prevents mutations from leaking between accounts
let _queueUserId: string | null = null;

/** Set the current user ID for queue scoping */
export function setQueueUserId(userId: string | null) {
    _queueUserId = userId;
}

/** Simple zustand-like store for reactive UI binding to queue state */
interface OfflineQueueStoreState {
    pending: number;
}

export const useOfflineQueueStore: {
    _state: OfflineQueueStoreState;
    getState: () => OfflineQueueStoreState;
    setState: (partial: Partial<OfflineQueueStoreState>) => void;
} = {
    _state: { pending: 0 },
    getState: () => useOfflineQueueStore._state,
    setState: (partial) => {
        Object.assign(useOfflineQueueStore._state, partial);
    },
};

/** Get current queue length (synchronous) */
export function getQueueLength(): number {
    return readQueue().length;
}

/** Clear entire offline queue (synchronous) */
export function clearOfflineQueue(): void {
    writeQueue([]);
    useOfflineQueueStore.setState({ pending: 0 });
}

/** Read queue from MMKV (synchronous C++) */
export function getOfflineQueue(): QueuedMutation[] {
    return readQueue();
}

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
        id: Crypto.randomUUID(),
        timestamp: Date.now()
    };

    // Cap queue size — drop oldest to prevent unbounded growth
    // TRIBUNAL FIX: Notify user when mutations are dropped at capacity
    if (queue.length >= MAX_QUEUE_SIZE) {
        const droppedCount = queue.length - MAX_QUEUE_SIZE + 1;
        const dropped = queue.slice(0, droppedCount);
        queue = queue.slice(droppedCount);
        const droppedTypes = [...new Set(dropped.map(m => m.type))].join(', ');
        logger.warn(`[OfflineSync] Queue cap reached (${MAX_QUEUE_SIZE}). Dropped ${droppedCount} oldest: [${droppedTypes}]`);
        reelToast.error(`Offline queue full — oldest action dropped.`);
    }

    queue.push(newMutation);

    writeQueue(queue);
    useOfflineQueueStore.setState({ pending: queue.length });
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
    // P0 SECURITY FIX: Verify active session before executing any mutations.
    // Prevents cross-user mutation execution after unclean logout (crash, force-kill).
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
        logger.warn('[OfflineSync] No active session — aborting flush to prevent cross-user execution.');
        return;
    }
    const authenticatedUserId = session.user.id;

    // P0 SECURITY FIX: Ban enforcement at the queue level.
    // A banned user's offline queue must NOT execute write mutations.
    // The client-side useBanCheck() only gates UI — the offline queue can bypass it
    // if the user was banned while offline or if MMKV cache has stale is_banned state.
    // This server round-trip is the canonical check before executing any queued writes.
    try {
        const { data: banProfile } = await supabase
            .from('profiles')
            .select('is_banned')
            .eq('id', authenticatedUserId)
            .single();
        if (banProfile?.is_banned) {
            logger.warn('[OfflineSync] User is banned — purging write queue to dead-letter.');
            const bannedMutations = readQueue().map(m => ({
                ...m,
                payload: { ...m.payload, _failReason: 'user_banned_at_flush', _failedAt: new Date().toISOString() }
            }));
            try {
                const existing = storage.getString(QUEUE_KEY + '_dead_letter');
                let prev: QueuedMutation[] = existing ? JSON.parse(existing) : [];
                const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                prev = prev.filter(m => m.timestamp > sevenDaysAgo);
                storage.set(QUEUE_KEY + '_dead_letter', JSON.stringify([...prev, ...bannedMutations].slice(-50)));
            } catch { /* dead-letter write failure — non-critical */ }
            writeQueue([]);
            useOfflineQueueStore.setState({ pending: 0 });
            return;
        }
    } catch (banCheckErr) {
        // If the ban check itself fails (network), skip it and proceed normally.
        // The queue will halt on the first network error in the mutation loop anyway.
        if (!isNetworkError(banCheckErr)) {
            logger.warn('[OfflineSync] Ban check returned unexpected error:', banCheckErr);
        }
    }

    let queue = readQueue();

    if (queue.length === 0) return;

    // Seeded here (before the main loop below) so mutations filtered out by ownership
    // or staleness checks are also removed from storage at the end, not just ones that
    // pass through executeMutation.
    const processedIds = new Set<string>();

    // P0 SECURITY FIX: Partition queue by ownership — only execute mutations
    // belonging to the currently authenticated user. Orphaned mutations from
    // a previous user (e.g., after crash during account switch) are dead-lettered.
    const ownedMutations: QueuedMutation[] = [];
    const orphanedMutations: QueuedMutation[] = [];
    for (const m of queue) {
        const payloadUserId = m.payload.user_id as string | undefined;
        // Mutations without user_id in payload (e.g., increment_dossier_views) are safe to execute
        // as they use session-scoped RPCs. Mutations WITH user_id must match current session.
        if (!payloadUserId || payloadUserId === authenticatedUserId) {
            ownedMutations.push(m);
        } else {
            orphanedMutations.push(m);
        }
    }

    if (orphanedMutations.length > 0) {
        logger.warn(`[OfflineSync] Discarding ${orphanedMutations.length} orphaned mutation(s) from user ${orphanedMutations[0]?.payload.user_id} (current: ${authenticatedUserId}).`);
        for (const m of orphanedMutations) processedIds.add(m.id);
        // Route to dead-letter for post-mortem — never execute cross-user mutations
        try {
            const existing = storage.getString(QUEUE_KEY + '_dead_letter');
            let prev: QueuedMutation[] = existing ? JSON.parse(existing) : [];
            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            prev = prev.filter(m => m.timestamp > sevenDaysAgo);
            const tagged = orphanedMutations.map(m => ({
                ...m,
                payload: { ...m.payload, _failReason: 'cross_user_orphan', _failedAt: new Date().toISOString() }
            }));
            const combined = [...prev, ...tagged].slice(-50);
            storage.set(QUEUE_KEY + '_dead_letter', JSON.stringify(combined));
        } catch { /* storage write failure — non-critical */ }
    }

    queue = ownedMutations;

    // Prune stale mutations (>24h old)
    const now = Date.now();
    const preFilterLength = queue.length;
    const staleMutations = queue.filter(m => now - m.timestamp >= STALE_THRESHOLD_MS);
    queue = queue.filter(m => now - m.timestamp < STALE_THRESHOLD_MS);
    for (const m of staleMutations) processedIds.add(m.id);
    const stalePruned = preFilterLength - queue.length;
    if (stalePruned > 0) {
        logger.warn(`[OfflineSync] Pruned ${stalePruned} stale mutations (>24h old)`);
        reelToast.error(`${stalePruned} offline action(s) expired (>24h old).`);
    }

    logger.debug(`[OfflineSync] Flushing ${queue.length} queued mutations...`);

    // CONCURRENCY FIX: Track which mutation IDs were actually disposed of (orphaned, stale,
    // succeeded, dead-lettered, or discarded as duplicates) instead of building a replacement
    // queue from this stale snapshot. Mutations enqueued by the UI while this loop is awaiting
    // network calls are NOT part of `queue` and must survive the final write — diffing by
    // ID against a fresh read does that; overwriting wholesale does not.
    const deadLetterQueue: QueuedMutation[] = [];

    let successCount = 0;

    const idMap: Record<string, string> = {};

    for (let i = 0; i < queue.length; i++) {
        const mutation = queue[i];
        try {
            // v4: Runtime schema validation — invalid payloads route to existing dead-letter
            const schema = MutationSchemaMap[mutation.type];
            if (schema) {
                const parseResult = schema.safeParse(mutation.payload);
                if (!parseResult.success) {
                    logger.warn(`[OfflineSync] Schema violation in ${mutation.type}: ${parseResult.error.message}`);
                    deadLetterQueue.push({
                        ...mutation,
                        payload: { ...mutation.payload, _failReason: `schema: ${parseResult.error.message}`, _failedAt: new Date().toISOString() }
                    });
                    processedIds.add(mutation.id);
                    continue;  // Skip to next mutation
                }
            }
            const result = await executeMutation(mutation, idMap);
            if (result.fakeId && result.newId) {
                idMap[result.fakeId] = result.newId;
            }
            successCount++;
            processedIds.add(mutation.id);
        } catch (error: unknown) {
            const errMsg = (typeof error === 'object' && error !== null && 'message' in error)
                ? String((error as any).message)
                : (error instanceof Error ? error.message : String(error));
            const errLower = errMsg.toLowerCase();
            const code = String((error as any)?.code);
            const status = Number((error as any)?.status);

            if (__DEV__) console.error(`[OfflineSync] Failed to execute ${mutation.type}:`, error);

            // T1-4 FIX: Correctly intercept network/gateway errors, timeouts, and connection errors.
            // Breaking the loop preserves causal consistency for dependent child mutations.
            if (isNetworkError(error)) {
                // Network/Database failure — halt flush to preserve causal consistency.
                // Remaining (unprocessed) mutations are left untouched in storage — they were
                // never added to processedIds, so the final write below keeps them as-is.
                logger.warn(`[OfflineSync] Network failure on ${mutation.type}. Halting queue to preserve causality.`);
                break;
            } else if (errLower.includes('duplicate') || errLower.includes('unique') || errLower.includes('23505') || code === '23505' || status === 409) {
                // Constraint violation — safely discard (already synced)
                if (__DEV__) console.warn(`[OfflineSync] Discarding duplicate mutation: ${mutation.type}`);
                processedIds.add(mutation.id);
            } else {
                // Unknown failure — log to dead-letter queue for diagnostics
                deadLetterQueue.push({ ...mutation, payload: { ...mutation.payload, _failReason: errMsg, _failedAt: new Date().toISOString() } });
                processedIds.add(mutation.id);
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

    // Re-read the queue (not the stale `queue` snapshot) so mutations enqueued by the UI
    // while this flush was awaiting network calls aren't clobbered. Remap any remaining
    // fake IDs against this flush's idMap — a safe no-op for entries that don't reference them.
    const freshQueue = readQueue();
    const finalQueue = freshQueue
        .filter(m => !processedIds.has(m.id))
        .map(m => ({ ...m, payload: applyIdMapToPayload(m.payload, idMap) }));
    writeQueue(finalQueue);
    useOfflineQueueStore.setState({ pending: finalQueue.length });
    } finally {
        isFlushing = false;
    }
}

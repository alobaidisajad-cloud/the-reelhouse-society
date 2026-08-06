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
import { captureError } from '../lib/sentry';
import { storage } from '../stores/mmkv-storage';
import { MutationSchemaMap } from '../types/mutations';
import { logger } from './logger';
import { applyIdMapToPayload, executeMutation } from './mutationExecutor';
import { isNetworkError, isTransientError } from './networkError';
import reelToast from './reelToast';
import { queryClient } from '../lib/queryClient';

export interface QueuedMutation {
    id: string;
    // Expanded type union to cover all domain slices
    type: 'endorse_log' | 'endorse_list' | 'endorse_film' | 'endorse_review' | 'mark_watched' | 'remove_log' | 'remove_watchlist' | 'remove_endorsement' | 'add_log' | 'update_log' | 'update_profile'
        | 'add_watchlist' | 'create_list' | 'update_list' | 'delete_list' | 'add_film_to_list' | 'remove_film_from_list' | 'add_list_items' | 'restore_list_items'
        | 'add_archive' | 'update_archive' | 'remove_archive' | 'save_stub'
        | 'follow_user' | 'follow_request_user' | 'unfollow_user' | 'send_lounge_message' | 'withdraw_lounge_message'
        // Legacy: only ever produced by builds before the tombstone migration.
        // Still reachable from a queue persisted by an older install — kept so
        // those deletions complete as withdrawals instead of being lost.
        | 'delete_lounge_message'
        | 'sync_entitlement' | 'add_dossier' | 'update_dossier' | 'delete_dossier' | 'add_dossier_comment' | 'update_dossier_comment' | 'delete_dossier_comment' | 'toggle_dossier_certify' | 'increment_dossier_views' | 'add_log_comment' | 'remove_log_comment' | 'add_list_comment' | 'remove_list_comment'
        | 'submit_report';
    payload: Record<string, unknown>;
    timestamp: number;
    /**
     * Bounded retry counter for transient server failures (5xx/429/408). Lives on
     * the envelope, NOT the payload, so it never reaches the executor/Supabase and
     * isn't subject to payload schema validation. Incremented on each transient
     * failure; once it reaches MAX_TRANSIENT_RETRIES the mutation is dead-lettered.
     */
    _retryCount?: number;
}

/**
 * Queue types that change who you follow. Kept as a set beside the queue rather than
 * a string check at the call site so a new social mutation type is a one-line change
 * in an obvious place (#82).
 */
const SOCIAL_MUTATION_TYPES = new Set(['follow_user', 'follow_request_user', 'unfollow_user']);

/**
 * PostgreSQL's exact duplicate-key wording. Narrow on purpose.
 *
 * The old test was `message.includes('unique')` anywhere in the prose, which matched
 * 42P10 — "there is no UNIQUE or exclusion constraint…" — and filed a broken statement
 * as a successful duplicate. SQLSTATE is the real signal; this is only a fallback for
 * transports that lose the code.
 */
const DUPLICATE_KEY_MESSAGE = /duplicate key value violates unique constraint/i;

/**
 * Is this the database rejecting the STATEMENT rather than the data?
 *
 * SQLSTATE class 42 is "syntax error or access rule violation": undefined column,
 * undefined function, bad ON CONFLICT target. Retrying cannot help, and discarding
 * hides a real defect — so these are dead-lettered and reported.
 *
 * 42501 (insufficient_privilege) is deliberately EXCLUDED: an RLS refusal is a
 * legitimate runtime outcome — a banned member, a row that is not yours — not a broken
 * statement, and it already has its own handling downstream.
 */
function isPermanentSchemaError(code: string): boolean {
  return /^42/.test(code) && code !== '42501';
}

export type QueueErrorClass = 'schema' | 'duplicate' | 'other';

/**
 * The single classifier the flush uses. Exported so it is TESTED rather than mirrored
 * — a test against a second copy of this logic would have passed happily while the
 * real branch stayed broken, which is exactly how #77 survived.
 *
 * The schema test comes first as defence in depth, NOT because it is load-bearing —
 * that was measured. Swapping the two branches changes nothing today, because the
 * duplicate test now matches PostgreSQL's exact duplicate-key wording rather than the
 * word "unique" anywhere in the prose. Under the OLD word match the order would have
 * been decisive, which is precisely why the message test was narrowed as well: two
 * independent reasons 42P10 can no longer be read as a duplicate, so neither one being
 * changed alone can bring the bug back.
 */
export function classifyQueueError(code: string, message: string, status: number | undefined): QueueErrorClass {
  if (isPermanentSchemaError(code)) return 'schema';
  if (code === '23505' || status === 409 || DUPLICATE_KEY_MESSAGE.test(message)) return 'duplicate';
  return 'other';
}

const QUEUE_KEY = 'reelhouse-offline-mutations';
const MAX_QUEUE_SIZE = 100;
// Transient server failures (5xx/429/408) are retried across flushes up to this
// many times before being dead-lettered, so a brief outage never loses a write
// while a permanently-failing mutation can't wedge the queue indefinitely.
const MAX_TRANSIENT_RETRIES = 5;
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

// OFFQ-2: queue user-scoping is enforced authoritatively inside flushOfflineQueue
// — it reads the LIVE session and partitions mutations by `payload.user_id`,
// dead-lettering any that belong to a different user (see "Partition queue by
// ownership" below). A separate write-only `_queueUserId` module variable was
// redundant with that (and strictly inferior, since a module var can go stale),
// so it was removed. The queue is also cleared on logout, so a clean account
// switch can't leave another user's mutations behind in the first place.

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
    // Notify user when mutations are dropped at capacity
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
    // ── Fast-path: empty queue → skip everything ──
    // Avoids the expensive SecureStore round-trip (getSession) and Sentry noise
    // for unauthenticated users who have nothing to flush.
    if (readQueue().length === 0) return;

    // Verify active session before executing any mutations.
    // Prevents cross-user mutation execution after unclean logout (crash, force-kill).
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
        logger.debug('[OfflineSync] No active session — aborting flush.');
        // If queue has mutations but no session, the user logged out uncleanly
        // (crash, force-kill). Dead-letter orphans so they don't fire warnings
        // on every foreground indefinitely. The 24h stale threshold
        // in the main loop can't help because execution never reaches it here.
        const orphanQueue = readQueue();
        if (orphanQueue.length > 0) {
            logger.debug(`[OfflineSync] Dead-lettering ${orphanQueue.length} orphaned mutation(s) — no session to execute them.`);
            try {
                const existing = storage.getString(QUEUE_KEY + '_dead_letter');
                let prev: QueuedMutation[] = existing ? JSON.parse(existing) : [];
                const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                prev = prev.filter(m => m.timestamp > sevenDaysAgo);
                const tagged = orphanQueue.map(m => ({
                    ...m,
                    payload: { ...m.payload, _failReason: 'no_session_orphan', _failedAt: new Date().toISOString() }
                }));
                storage.set(QUEUE_KEY + '_dead_letter', JSON.stringify([...prev, ...tagged].slice(-50)));
            } catch { /* dead-letter write failure — non-critical */ }
            writeQueue([]);
            useOfflineQueueStore.setState({ pending: 0 });
        }
        return;
    }
    const authenticatedUserId = session.user.id;

    // Ban enforcement at the queue level.
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

    // Partition queue by ownership — only execute mutations
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

    // Track which mutation IDs were actually disposed of (orphaned, stale,
    // succeeded, dead-lettered, or discarded as duplicates) instead of building a replacement
    // queue from this stale snapshot. Mutations enqueued by the UI while this loop is awaiting
    // network calls are NOT part of `queue` and must survive the final write — diffing by
    // ID against a fresh read does that; overwriting wholesale does not.
    const deadLetterQueue: QueuedMutation[] = [];
    /** Did anything that changes the follow graph actually reach the server? (#82) */
    let socialMutationSynced = false;

    let successCount = 0;

    const idMap: Record<string, string> = {};
    // Pending increments to each mutation's transient-retry counter, applied to
    // the persisted queue in the final write (mirrors how idMap is applied).
    const retryBumps: Record<string, number> = {};

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
            if (SOCIAL_MUTATION_TYPES.has(mutation.type)) socialMutationSynced = true;
            processedIds.add(mutation.id);
        } catch (error: unknown) {
            const errMsg = (typeof error === 'object' && error !== null && 'message' in error)
                ? String((error as any).message)
                : (error instanceof Error ? error.message : String(error));
            const code = String((error as any)?.code);
            const status = Number((error as any)?.status);
            const errorClass = classifyQueueError(code, errMsg, status);

            if (__DEV__) console.error(`[OfflineSync] Failed to execute ${mutation.type}:`, error);

            // Correctly intercept network/gateway errors, timeouts, and connection errors.
            // Breaking the loop preserves causal consistency for dependent child mutations.
            if (isNetworkError(error)) {
                // Network/Database failure — halt flush to preserve causal consistency.
                // Remaining (unprocessed) mutations are left untouched in storage — they were
                // never added to processedIds, so the final write below keeps them as-is.
                logger.warn(`[OfflineSync] Network failure on ${mutation.type}. Halting queue to preserve causality.`);
                break;
            } else if (errorClass === 'schema') {
                // ── #77 · the trap that hid a silent data loss for the whole of this app ──
                // This branch MUST come before the duplicate branch below, because the
                // error it catches contains the word "unique" in its prose:
                //
                //   42P10  "there is no unique or exclusion constraint matching the
                //           ON CONFLICT specification"
                //
                // `interactions` has no unique constraint on (user_id, target_user_id,
                // type) — probed live and confirmed. So EVERY offline follow raised
                // 42P10, matched `includes('unique')`, and was filed as "already
                // synced": discarded with no dead-letter, no toast and no Sentry. The
                // optimistic follow stayed on screen until the next hydrate erased it.
                // The member followed someone, watched it work, and watched it undo
                // itself later, with no trace anywhere.
                //
                // A 42xxx is the database saying the STATEMENT is wrong — a
                // programming or schema fault, not a data condition. Retrying cannot
                // help and discarding hides it, so it is dead-lettered loudly and
                // reported. That is the difference between finding this in an hour and
                // never finding it at all.
                logger.warn(`[OfflineSync] Permanent schema error on ${mutation.type} (code=${code}). Dead-lettering.`);
                captureError(error, {
                    scope: 'offlineQueue.schemaError',
                    mutationType: mutation.type,
                    pgCode: code,
                });
                deadLetterQueue.push({
                    ...mutation,
                    payload: { ...mutation.payload, _failReason: `schema: ${errMsg}`, _failedAt: new Date().toISOString() },
                });
                processedIds.add(mutation.id);
            } else if (errorClass === 'duplicate') {
                // Genuine unique violation — the row is already there, so the write
                // has effectively succeeded and the mutation can be dropped.
                //
                // Judged on SQLSTATE, with the prose fallback narrowed to PostgreSQL's
                // actual duplicate message. The old test was `includes('unique')`
                // anywhere in the text, which is how 42P10 got in — and would have let
                // in any future error that merely mentions a unique constraint.
                if (__DEV__) console.warn(`[OfflineSync] Discarding duplicate mutation: ${mutation.type}`);
                processedIds.add(mutation.id);
            } else if (isTransientError(error)) {
                // Transient server failure (5xx / 429 / 408 / retryable PG code): the
                // write reached the server but failed temporarily. Preserve it and retry
                // on a later flush instead of dead-lettering (which silently lost queued
                // writes under ordinary backend load).
                const attempts = (mutation._retryCount ?? 0) + 1;
                if (attempts >= MAX_TRANSIENT_RETRIES) {
                    // Bounded retries exhausted — dead-letter so a permanently-failing
                    // mutation can't wedge the queue forever; the rest still get a chance.
                    logger.warn(`[OfflineSync] Transient failure on ${mutation.type} exhausted ${MAX_TRANSIENT_RETRIES} retries (status=${status}, code=${code}). Dead-lettering.`);
                    deadLetterQueue.push({ ...mutation, payload: { ...mutation.payload, _failReason: `transient-exhausted: ${errMsg}`, _failedAt: new Date().toISOString() } });
                    processedIds.add(mutation.id);
                } else {
                    // Bump the retry counter (persisted via retryBumps in the final write)
                    // and halt the flush to preserve causal ordering for dependent child
                    // mutations — same philosophy as the network-error branch above.
                    retryBumps[mutation.id] = attempts;
                    logger.warn(`[OfflineSync] Transient failure on ${mutation.type} (status=${status}, code=${code}), attempt ${attempts}/${MAX_TRANSIENT_RETRIES}. Halting to retry on next flush.`);
                    break;
                }
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
            // Prune dead-letter entries older than 7 days
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
        .map(m => {
            const next = { ...m, payload: applyIdMapToPayload(m.payload, idMap) };
            // Persist any transient-retry bump so the counter survives to the next flush.
            if (retryBumps[m.id] !== undefined) next._retryCount = retryBumps[m.id];
            return next;
        });
    writeQueue(finalQueue);
    useOfflineQueueStore.setState({ pending: finalQueue.length });

    // ── #82 · a follow that syncs is still a follow ────────────────────────────────
    // Nothing refreshed the feed after a flush. So a follow made offline synced
    // successfully and STILL did not appear until a 60-second (or 5-minute) timer
    // lapsed — the same symptom the online fix removes, arriving by a different door.
    //
    // Only when a social mutation actually ran: an unrelated flush (a log, a stub, an
    // archive row) has no bearing on who you follow, and refetching two feeds for it
    // would be waste.
    if (socialMutationSynced) {
        try {
            queryClient.invalidateQueries({ queryKey: ['feed', 'following'] });
            queryClient.invalidateQueries({ queryKey: ['feed', 'stacks', 'following'] });
        } catch (e) {
            logger.warn('[OfflineSync] post-flush feed invalidation failed:', e);
        }
    }
    } finally {
        isFlushing = false;
    }
}

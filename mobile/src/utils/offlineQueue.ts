/**
 * offlineQueue.ts — writes made without a connection, kept on the phone (MMKV,
 * synchronous) and sent in order when it returns.
 *
 *   • at most 100 kept: past that the oldest is dropped, and the member told
 *   • older than 24 hours: dropped at the next send, and the member told
 *   • a network failure stops the send and keeps the rest, in order
 *   • a server that fails for a moment (5xx, 429, 408) is retried, five sends at most
 *   • a duplicate counts as delivered; a broken statement or an unknown refusal
 *     goes to the dead letter (7 days, 50 at most)
 *   • each write is sent only under its own member's session (queueOwnership.ts)
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
import { e2eTrace } from './e2eTrace';
import { queryClient } from '../lib/queryClient';
import { settleDelivered } from '../stores/markCounts';
import { useOfflineQueueStore } from '../stores/offlineQueueStore';
import {
    DEAD_LETTER_KEY, QUEUE_KEY, changesMadeOffline, heldKey, heldOwnerOf, keepForOwners, kindOf,
    readList, readQueue, writeQueue,
} from './queueOwnership';

export interface QueuedMutation {
    id: string;
    /**
     * A type also needs a schema (types/mutations.ts, skipped in silence when
     * missing) and a handler; dispatchMutationRegistry.test.ts checks both.
     * delete_lounge_message comes only from a queue an older build saved, and
     * replays as a withdrawal. The Vault's four name the viewing the app chose,
     * so replaying one that already happened does nothing.
     */
    type: 'endorse_log' | 'endorse_list' | 'mark_watched' | 'remove_log' | 'remove_watchlist' | 'remove_endorsement' | 'add_log' | 'update_log' | 'update_profile'
        | 'add_watchlist' | 'create_list' | 'update_list' | 'delete_list' | 'add_film_to_list' | 'remove_film_from_list' | 'add_list_items' | 'restore_list_items'
        | 'add_archive' | 'update_archive' | 'remove_archive' | 'save_stub'
        | 'follow_user' | 'follow_request_user' | 'unfollow_user' | 'send_lounge_message' | 'withdraw_lounge_message'
        | 'delete_lounge_message'
        | 'sync_entitlement' | 'add_dossier' | 'update_dossier' | 'delete_dossier' | 'add_dossier_comment' | 'update_dossier_comment' | 'delete_dossier_comment' | 'toggle_dossier_certify' | 'increment_dossier_views' | 'add_log_comment' | 'remove_log_comment' | 'add_list_comment' | 'remove_list_comment'
        | 'submit_report'
        // ── The Dispatch ──
        | 'add_filing' | 'update_filing' | 'end_filing'
        | 'add_critique' | 'update_critique' | 'remove_critique'
        | 'certify_filing' | 'certify_critique'
        | 'cast_vote' | 'take_answer'
        | 'save_filing' | 'unsave_filing'
        // ── The Vault ──
        | 'add_viewing' | 'remove_viewing' | 'set_viewing_note' | 'remove_viewing_note';
    payload: Record<string, unknown>;
    timestamp: number;
    /** The member signed in when it was queued; it is sent under their session alone. */
    owner?: string;
    /** Moments the server failed it so far; beside the payload, never sent or validated. */
    _retryCount?: number;
}

/** The types that change who a member follows: delivering one refreshes the following feeds. */
const SOCIAL_MUTATION_TYPES = new Set(['follow_user', 'follow_request_user', 'unfollow_user']);

/** For a transport that loses the SQLSTATE. Exact words: 42P10's text also says "unique". */
const DUPLICATE_KEY_MESSAGE = /duplicate key value violates unique constraint/i;

/**
 * Class 42: the STATEMENT is wrong (a missing column, a bad ON CONFLICT target).
 * Not 42501: a refusal by the row rules is an answer, not a broken statement.
 */
function isPermanentSchemaError(code: string): boolean {
  return /^42/.test(code) && code !== '42501';
}

export type QueueErrorClass = 'schema' | 'duplicate' | 'other';

/**
 * The one classifier the send uses, exported so the tests run it and not a copy.
 * Two things keep 42P10 from passing as a duplicate: the schema test comes first,
 * and the duplicate test matches only PostgreSQL's exact words. Either alone holds.
 */
export function classifyQueueError(code: string, message: string, status: number | undefined): QueueErrorClass {
  if (isPermanentSchemaError(code)) return 'schema';
  if (code === '23505' || status === 409 || DUPLICATE_KEY_MESSAGE.test(message)) return 'duplicate';
  return 'other';
}

export { QUEUED_WRITE_KIND, changesMadeOffline, holdQueue, kindOf, releaseHeldWrites } from './queueOwnership';
export type { QueuedWriteKind } from './queueOwnership';

const MAX_QUEUE_SIZE = 100;
// Sends a write gets when the server fails it for a moment, before the dead letter.
const MAX_TRANSIENT_RETRIES = 5;
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEAD_LETTER_DAYS = 7;
const DEAD_LETTER_MAX = 50;

// The screens' copy of the queue at launch; writeQueue keeps it after (queueOwnership.ts).
useOfflineQueueStore.setState({ queued: readQueue() });

/** The member signed in now, read when a write is queued. */
function signedInMember(): string | null {
    try {
        // Required here, not imported: the auth store imports this file.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useAuthStore } = require('../stores/auth') as typeof import('../stores/auth');
        return useAuthStore.getState().user?.id ?? null;
    } catch {
        return null;
    }
}

/** Failed writes, kept a week for diagnosis, each still naming its member. */
function addToDeadLetter(failed: readonly QueuedMutation[]): void {
    if (failed.length === 0) return;
    const weekAgo = Date.now() - DEAD_LETTER_DAYS * 24 * 60 * 60 * 1000;
    const kept = readList(DEAD_LETTER_KEY).filter((m) => m.timestamp > weekAgo);
    try {
        storage.set(DEAD_LETTER_KEY, JSON.stringify([...kept, ...failed].slice(-DEAD_LETTER_MAX)));
    } catch { /* the dead letter is for diagnosis: losing it changes nothing sent */ }
}

/** Get current queue length (synchronous) */
export function getQueueLength(): number {
    return readQueue().length;
}

/**
 * At the member's own sign-out: everything under the queue's prefix that is
 * theirs or no one's, the dead letter's failed writes with their words among
 * it. Swept, not listed, so a queue key added later goes too. What is provably
 * another member's (writes kept for them, their failed ones) stays for them.
 */
export function clearOfflineQueue(memberId: string | null): void {
    try {
        for (const key of storage.getAllKeys()) {
            if (!key.startsWith(QUEUE_KEY)) continue;
            const heldFor = heldOwnerOf(key);
            if (heldFor && heldFor !== memberId) continue;
            if (key === DEAD_LETTER_KEY) {
                const others = readList(key).filter((m) => m.owner && m.owner !== memberId);
                if (others.length > 0) {
                    storage.set(key, JSON.stringify(others));
                    continue;
                }
            }
            storage.delete(key);
        }
    } catch (e) {
        logger.warn(`[OfflineSync] could not clear the queue on logout: ${String(e)}`);
    }
    writeQueue([]);
}

/**
 * What this phone holds for one member that signing out would erase: writes
 * not yet sent (queued, or kept for them), and failed writes holding their words.
 */
export function unsentFor(memberId: string): { unsent: number; failedWords: number } {
    const unsent = readQueue().filter((m) => m.owner === memberId).length
        + readList(heldKey(memberId)).length;
    const failedWords = readList(DEAD_LETTER_KEY)
        .filter((m) => m.owner === memberId && kindOf(m) === 'words').length;
    return { unsent, failedWords };
}

/** Read queue from MMKV (synchronous C++) */
export function getOfflineQueue(): QueuedMutation[] {
    return readQueue();
}

/**
 * Queue a write to be sent later, as the member signed in now. Synchronous:
 * MMKV. With nobody signed in there is no one to send it as, so it is not queued.
 */
export function enqueueMutation(mutation: Omit<QueuedMutation, 'id' | 'timestamp' | 'owner'>) {
    const owner = signedInMember();
    if (!owner) {
        logger.warn(`[OfflineSync] ${mutation.type} not queued: nobody is signed in.`);
        return;
    }
    let queue = readQueue();

    const newMutation: QueuedMutation = {
        ...mutation,
        id: Crypto.randomUUID(),
        timestamp: Date.now(),
        owner,
    };

    // Full: the oldest goes, and the member is told.
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
    logger.debug(`[OfflineSync] Queued ${mutation.type} for background sync.`);
}

let isFlushing = false;
/** A send asked for while one was running: run once more when it ends, so the ask is not lost. */
let flushAgain = false;

export async function flushOfflineQueue() {
    if (isFlushing) {
        // The network may have come back while the running send waited on the old one.
        flushAgain = true;
        e2eTrace('queue.flush.again');
        return;
    }
    isFlushing = true;
    e2eTrace('queue.flush', { queued: readQueue().length });
    try {
    // Nothing queued: no session read (SecureStore) at all.
    if (readQueue().length === 0) return;

    // No session, nothing is sent: the writes wait for their own member's.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
        logger.debug('[OfflineSync] No active session — aborting flush.');
        return;
    }
    const authenticatedUserId = session.user.id;

    // Only the signed-in member's writes are sent. Another member's (a session
    // that changed before the queue was handed over) are kept for that member.
    {
        const live = readQueue();
        const others = live.filter((m) => m.owner !== authenticatedUserId);
        if (others.length > 0) {
            logger.warn(`[OfflineSync] ${others.length} write(s) of another member kept for them, unsent.`);
            keepForOwners(others);
            writeQueue(live.filter((m) => m.owner === authenticatedUserId));
        }
    }

    // A banned member's queue is not sent. useBanCheck reads the profile the phone
    // holds, which is stale for a member banned while offline; this asks the server.
    try {
        const { data: banProfile } = await supabase
            .from('profiles')
            .select('is_banned, suspended_until')
            .eq('id', authenticatedUserId)
            .single();
        // A suspension ends: what was written is held until it does, not thrown
        // away refused (the queue's own day-old rule still applies).
        const suspendedUntil = banProfile?.suspended_until ? Date.parse(banProfile.suspended_until) : NaN;
        if (!banProfile?.is_banned && Number.isFinite(suspendedUntil) && suspendedUntil > Date.now()) {
            logger.warn('[OfflineSync] Member is suspended — holding the queue until it ends.');
            return;
        }
        if (banProfile?.is_banned) {
            logger.warn('[OfflineSync] User is banned — purging write queue to dead-letter.');
            // Theirs alone: a write queued while this check waited is kept for its own member.
            const live = readQueue();
            addToDeadLetter(live.filter((m) => m.owner === authenticatedUserId).map(m => ({
                ...m,
                payload: { ...m.payload, _failReason: 'user_banned_at_flush', _failedAt: new Date().toISOString() }
            })));
            keepForOwners(live.filter((m) => m.owner !== authenticatedUserId));
            writeQueue([]);
            return;
        }
    } catch (banCheckErr) {
        // Unanswered (no network): carry on; the first write will stop on the same failure.
        if (!isNetworkError(banCheckErr)) {
            logger.warn('[OfflineSync] Ban check returned unexpected error:', banCheckErr);
        }
    }

    let queue = readQueue();

    if (queue.length === 0) return;

    // The writes this send is done with; only these leave the stored queue.
    const processedIds = new Set<string>();
    /**
     * A mutation the loop has finished with — delivered, already on the server,
     * or refused for good. From this moment the server's answer is the truth
     * about it, so a certify or critique tap that waited in the queue stops
     * standing in for it (markCounts: an answer asked after this includes it).
     */
    const finished = (m: QueuedMutation) => {
        processedIds.add(m.id);
        settleDelivered(m);
    };

    // Read again after the ban check waited: another member's write stays, unsent.
    queue = queue.filter((m) => m.owner === authenticatedUserId);

    // Prune stale mutations (>24h old)
    const now = Date.now();
    const preFilterLength = queue.length;
    const staleMutations = queue.filter(m => now - m.timestamp >= STALE_THRESHOLD_MS);
    queue = queue.filter(m => now - m.timestamp < STALE_THRESHOLD_MS);
    for (const m of staleMutations) processedIds.add(m.id);
    const stalePruned = preFilterLength - queue.length;
    if (stalePruned > 0) {
        logger.warn(`[OfflineSync] Pruned ${stalePruned} stale mutations (>24h old)`);
        reelToast.error(`${changesMadeOffline(stalePruned)} ${stalePruned === 1 ? 'was' : 'were'} over a day old, and not sent.`);
    }

    logger.debug(`[OfflineSync] Flushing ${queue.length} queued mutations...`);

    const deadLetterQueue: QueuedMutation[] = [];
    /** Did a write that changes who someone follows reach the server? */
    let socialMutationSynced = false;

    let successCount = 0;

    const idMap: Record<string, string> = {};
    // Each write's new retry count, stored with the queue at the end (as idMap is).
    const retryBumps: Record<string, number> = {};

    for (const mutation of queue) {
        try {
            // A payload that fails its schema is dead-lettered unsent.
            const schema = MutationSchemaMap[mutation.type];
            if (schema) {
                const parseResult = schema.safeParse(mutation.payload);
                if (!parseResult.success) {
                    logger.warn(`[OfflineSync] Schema violation in ${mutation.type}: ${parseResult.error.message}`);
                    deadLetterQueue.push({
                        ...mutation,
                        payload: { ...mutation.payload, _failReason: `schema: ${parseResult.error.message}`, _failedAt: new Date().toISOString() }
                    });
                    finished(mutation);
                    continue;
                }
            }
            const result = await executeMutation(mutation, idMap);
            if (result.fakeId && result.newId) {
                idMap[result.fakeId] = result.newId;
            }
            successCount++;
            if (SOCIAL_MUTATION_TYPES.has(mutation.type)) socialMutationSynced = true;
            finished(mutation);
        } catch (error: unknown) {
            const errMsg = (typeof error === 'object' && error !== null && 'message' in error)
                ? String((error as any).message)
                : (error instanceof Error ? error.message : String(error));
            const code = String((error as any)?.code);
            const status = Number((error as any)?.status);
            const errorClass = classifyQueueError(code, errMsg, status);

            if (__DEV__) console.error(`[OfflineSync] Failed to execute ${mutation.type}:`, error);

            // No network: stop here and keep the rest, in order. A later write may
            // depend on this one (a critique on a filing not yet sent).
            if (isNetworkError(error)) {
                logger.warn(`[OfflineSync] Network failure on ${mutation.type}. Halting queue to preserve causality.`);
                e2eTrace('queue.flush.halted', { type: mutation.type, why: errMsg.slice(0, 80) });
                break;
            } else if (errorClass === 'schema') {
                // The STATEMENT is wrong (a missing column, a bad ON CONFLICT
                // target), not the data: retrying cannot help and dropping it would
                // hide the fault, so it is dead-lettered and reported.
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
                finished(mutation);
            } else if (errorClass === 'duplicate') {
                // The row is already on the server: delivered.
                if (__DEV__) console.warn(`[OfflineSync] Discarding duplicate mutation: ${mutation.type}`);
                finished(mutation);
            } else if (isTransientError(error)) {
                // The server failed for a moment (5xx, 429, 408, a retryable
                // PostgreSQL code): kept and tried again on a later send.
                const attempts = (mutation._retryCount ?? 0) + 1;
                if (attempts >= MAX_TRANSIENT_RETRIES) {
                    // Given up on, so one write that always fails cannot hold back the rest.
                    logger.warn(`[OfflineSync] Transient failure on ${mutation.type} exhausted ${MAX_TRANSIENT_RETRIES} retries (status=${status}, code=${code}). Dead-lettering.`);
                    deadLetterQueue.push({ ...mutation, payload: { ...mutation.payload, _failReason: `transient-exhausted: ${errMsg}`, _failedAt: new Date().toISOString() } });
                    finished(mutation);
                } else {
                    // Stop here, as for no network: what follows may depend on it.
                    retryBumps[mutation.id] = attempts;
                    logger.warn(`[OfflineSync] Transient failure on ${mutation.type} (status=${status}, code=${code}), attempt ${attempts}/${MAX_TRANSIENT_RETRIES}. Halting to retry on next flush.`);
                    break;
                }
            } else {
                deadLetterQueue.push({ ...mutation, payload: { ...mutation.payload, _failReason: errMsg, _failedAt: new Date().toISOString() } });
                finished(mutation);
            }
        }
    }

    if (successCount > 0) {
        reelToast(`Archive updated with offline actions.`);
    }

    if (deadLetterQueue.length > 0) {
        addToDeadLetter(deadLetterQueue);
        reelToast.error(`${changesMadeOffline(deadLetterQueue.length)} could not be sent.`);
    }

    // Read again, not the snapshot above: a write queued while this send waited
    // must survive it. What remains learns the real ids of rows made just now.
    const freshQueue = readQueue();
    const finalQueue = freshQueue
        .filter(m => !processedIds.has(m.id))
        .map(m => {
            const next = { ...m, payload: applyIdMapToPayload(m.payload, idMap) };
            if (retryBumps[m.id] !== undefined) next._retryCount = retryBumps[m.id];
            return next;
        });
    writeQueue(finalQueue);
    e2eTrace('queue.flush.done', { sent: successCount, failed: deadLetterQueue.length, left: finalQueue.length });

    // A follow sent from the queue shows in the following feeds now, not when
    // their timers next run. Only after a follow: nothing else changes whose
    // posts those feeds carry.
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
        if (flushAgain) {
            flushAgain = false;
            void flushOfflineQueue();
        }
    }
}

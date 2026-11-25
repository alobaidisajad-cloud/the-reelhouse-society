/**
 * oneWritePerThing.ts — one pending write per thing a write sets whole, the member's newest act
 * being their word (round 13).
 *
 * A write queued with a weak signal was sent after a newer write of the same thing had landed
 * online, and undid it: a Vault note went back to its older words, an unfollow was followed again
 * and the other member told, a withdrawn certification was made again. Each such thing is named
 * (keyOf), and:
 *   · a newer queued write lets the older of its thing go (offlineQueue's enqueueMutation);
 *   · an online write of it goes through writeOnline, the one door: the thing's online writes go
 *     one after another, one the queue's send has out is waited for first, the send leaves the
 *     thing's queued writes where they are while it is out (isWritingOnline), and when it lands,
 *     every write of the thing the member queued before it is let go;
 *   · the send reads the queue again before each write, so one let go meanwhile is never sent.
 * Its own module, so a screen's test that stands in for the queue still writes through the door.
 */
import { settleDelivered } from '../stores/markCounts';
import type { QueuedMutation } from './offlineQueue';
import { logger } from './logger';
import { readQueue, writeQueue } from './queueOwnership';

/**
 * The one thing a write sets whole ('note:<viewing>', 'follow:<handle>', 'certify:log:<id>', ...),
 * or null for a write that adds to what is there (a record, a critique, a message) or carries its
 * own check (an edit's time). Read from the type and payload, so an entry an older build queued is
 * keyed too.
 */
export function keyOf(m: Pick<QueuedMutation, 'type' | 'payload'>): string | null {
    const p = m.payload ?? {};
    const str = (k: string) => (typeof p[k] === 'string' && p[k] ? (p[k] as string) : null);
    const num = (k: string) => (typeof p[k] === 'number' || (typeof p[k] === 'string' && p[k]) ? String(p[k]) : null);
    const at = (kind: string, id: string | null) => (id ? `${kind}:${id}` : null);
    switch (m.type) {
        case 'set_viewing_note':
        case 'remove_viewing_note':
            return at('note', str('viewing_id'));
        case 'follow_user':
        case 'follow_request_user':
        case 'unfollow_user': {
            // By handle, as the phone's lists know a member; by id only when no handle was kept.
            const handle = str('target_username');
            return handle ? `follow:${handle.toLowerCase()}` : at('follow:id', str('target_user_id'));
        }
        case 'endorse_log':
            return at('certify:log', str('target_log_id'));
        case 'endorse_list':
            return at('certify:list', str('target_list_id'));
        case 'remove_endorsement':
            return str('target_log_id') ? at('certify:log', str('target_log_id')) : at('certify:list', str('target_list_id'));
        case 'certify_filing':
            return at('certify:filing', str('post_id'));
        case 'certify_critique':
            return at('certify:critique', str('comment_id'));
        case 'toggle_dossier_certify':
            return at('certify:dossier', str('dossier_uuid'));
        case 'save_filing':
        case 'unsave_filing':
            return at('save:filing', str('post_id'));
        case 'take_answer':
            return at('answer', str('post_id'));
        case 'add_watchlist':
        case 'remove_watchlist':
            return at('watchlist', num('film_id'));
        default:
            return null;
    }
}

/** Keys being written online now (writeOnline), with how many such writes are out. */
const onlineKeys = new Map<string, number>();
/** The keyed write the queue's send has out now: an online write of its key waits for it. */
let sending: { key: string; done: Promise<unknown> } | null = null;
/** Each key's online writes, one after another: an older one's answer is had before a newer goes. */
const keyChains = new Map<string, Promise<void>>();

/** Each keyed act counted, and the count at each thing's last act: begun online, settled, or queued. */
let acts = 0;
const lastActOn = new Map<string, number>();

/** An act on this thing: begun online, settled (landed or refused), or queued. */
export function actedOn(key: string | null): void {
    if (!key) return;
    acts += 1;
    lastActOn.set(key, acts);
}

/**
 * A read of the member's marks, as it is asked: what it may lay once answered. A thing the member
 * acted on since (begun, settled or queued), or whose write was out or queued when the read was asked
 * or is now, is the act's: the read's answer for it may be older than the act, so the store keeps what
 * the act made. Every other thing is laid as read.
 */
export function actsAsAsked(): (key: string) => boolean {
    const asked = acts;
    const outThen = new Set(onlineKeys.keys());
    const queuedThen = queuedKeys();
    let queuedNow: Set<string> | null = null;
    return (key) => {
        if ((lastActOn.get(key) ?? 0) > asked || outThen.has(key) || queuedThen.has(key) || onlineKeys.has(key)) return false;
        queuedNow ??= queuedKeys();
        return !queuedNow.has(key);
    };
}

/** The keys of the signed-in member's writes waiting in the queue. */
function queuedKeys(): Set<string> {
    const owner = signedInMember();
    const out = new Set<string>();
    for (const m of readQueue()) {
        const key = m.owner === owner ? keyOf(m) : null;
        if (key) out.add(key);
    }
    return out;
}

/** Is a write of this thing out online now? The queue's send leaves the thing's queued writes be. */
export function isWritingOnline(key: string | null): boolean {
    return !!key && onlineKeys.has(key);
}

/** The queue's send has this keyed write out: an online write of the key waits for it to land. */
export function sentUnder<T>(key: string | null, out: Promise<T>): Promise<T> {
    if (!key) return out;
    sending = { key, done: out };
    return out.finally(() => { if (sending?.done === out) sending = null; });
}

/** The member signed in now (required, not imported: the auth store imports the queue). */
function signedInMember(): string | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useAuthStore } = require('../stores/auth') as typeof import('../stores/auth');
        return useAuthStore.getState().user?.id ?? null;
    } catch {
        return null;
    }
}

/**
 * The member's queued writes made before `ids` was read, let go: a newer write of the same thing
 * has landed online. The house's answer is the truth about them from now on (markCounts).
 */
function letOlderGo(ids: ReadonlySet<string>): void {
    if (ids.size === 0) return;
    const queue = readQueue();
    const going = queue.filter((m) => ids.has(m.id));
    if (going.length === 0) return;
    writeQueue(queue.filter((m) => !ids.has(m.id)));
    for (const m of going) settleDelivered(m);
    logger.debug('[OfflineSync] older queued writes let go: a newer one landed online', going.length);
}

/**
 * Writes one keyed thing online (a note, a follow, a certification, a save), as the one door those
 * writes go through, so the queue can never send an older write of it after this one lands. The
 * key's online writes go one after another; a queued write of the key the send has out is waited
 * for first; while this one is out the send leaves the key's queued writes where they are; and when
 * it lands, every write of the key the member had queued before it is let go. `landedDespite`: a
 * failure that is a landing all the same (a duplicate: the house holds it); `landed`: for a write
 * that answers its failure rather than throwing it, whether the answer is a landing. A null key is
 * written as it is. Answers, or throws, what `write` does.
 */
export async function writeOnline<T>(
    key: string | null,
    write: () => Promise<T>,
    { landed, landedDespite }: { landed?: (answer: T) => boolean; landedDespite?: (e: unknown) => boolean } = {},
): Promise<T> {
    if (!key) return write();
    actedOn(key);
    const before = keyChains.get(key) ?? Promise.resolve();
    let release: () => void = () => {};
    const mine = new Promise<void>((resolve) => { release = resolve; });
    const chain = before.then(() => mine);
    keyChains.set(key, chain);
    try {
        await before;
        while (sending && sending.key === key) await sending.done.catch(() => undefined);
        onlineKeys.set(key, (onlineKeys.get(key) ?? 0) + 1);
        try {
            const owner = signedInMember();
            const older = new Set(readQueue().filter((m) => m.owner === owner && keyOf(m) === key).map((m) => m.id));
            try {
                const answer = await write();
                if (!landed || landed(answer)) letOlderGo(older);
                return answer;
            } catch (e) {
                if (landedDespite?.(e)) letOlderGo(older);
                throw e;
            }
        } finally {
            const left = (onlineKeys.get(key) ?? 1) - 1;
            if (left > 0) onlineKeys.set(key, left); else onlineKeys.delete(key);
            actedOn(key);
        }
    } finally {
        release();
        if (keyChains.get(key) === chain) keyChains.delete(key);
    }
}

/**
 * Who is told, once a send of the queue is over, the records whose Vault notes it sent (the Vault's
 * store, which reads their notes again). A note sent late may have been done unwritten at the house,
 * a later note or a later removal standing there (round 13); read while it still waited, the queue's
 * own copy was laid over the house's answer, so the store is told only once it has left the queue.
 */
let notesSentListener: ((logIds: readonly string[]) => void) | null = null;
export function whenNotesAreSent(listener: ((logIds: readonly string[]) => void) | null): void {
    notesSentListener = listener;
}
/** The queue's send, over: the records whose notes it sent. */
export function notesWereSent(logIds: readonly string[]): void {
    if (logIds.length === 0 || !notesSentListener) return;
    try {
        notesSentListener(logIds);
    } catch (e) {
        logger.warn('[OfflineSync] the Vault could not be read again after its notes were sent:', e);
    }
}

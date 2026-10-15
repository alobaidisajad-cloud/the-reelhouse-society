/**
 * queueOwnership.ts — whose each queued write is, and where it waits while that
 * member is not signed in on this phone.
 *
 *   • every write carries its owner, stamped when it is queued
 *   • the live queue holds the signed-in member's writes and nobody else's
 *   • a session that ends elsewhere moves its member's writes to a key of their
 *     own (`heldKey`); a toggle is not kept, as the member can simply make it again
 *   • that member's next sign-in here moves them back; no one else's reads them
 *   • a write an older build queued with no owner is stamped at the first read
 *     of the stored session, before any refresh can end that session
 *
 * Storage alone, no Supabase: authSessionStorage calls in here, beneath the client.
 */
import { storage } from '@/src/stores/mmkv-storage';
import { useOfflineQueueStore } from '@/src/stores/offlineQueueStore';
import type { QueuedMutation } from './offlineQueue';
import { logger } from './logger';
import reelToast from './reelToast';

export const QUEUE_KEY = 'reelhouse-offline-mutations';
export const DEAD_LETTER_KEY = `${QUEUE_KEY}_dead_letter`;
const HELD_PREFIX = `${QUEUE_KEY}_held_`;

/** The writes kept for one member while they are not signed in here. */
export const heldKey = (owner: string) => `${HELD_PREFIX}${owner}`;

/** The member a held key belongs to; null for any other key. */
export function heldOwnerOf(key: string): string | null {
  return key.startsWith(HELD_PREFIX) ? key.slice(HELD_PREFIX.length) || null : null;
}

export type QueuedWriteKind = 'words' | 'record' | 'toggle';

/**
 * What a queued write is to its member. 'words': their own writing. 'record':
 * something they did (every withdrawal, delete, edit and report among them).
 * 'toggle': a mark they can simply make again. Every type has one, or this
 * does not compile; whatever holds, keeps or lets a write lapse reads this.
 */
export const QUEUED_WRITE_KIND: Record<QueuedMutation['type'], QueuedWriteKind> = {
  add_critique: 'words',
  add_filing: 'words',
  send_lounge_message: 'words',
  add_log_comment: 'words',
  add_list_comment: 'words',
  add_dossier_comment: 'words',

  add_log: 'record',
  update_log: 'record',
  remove_log: 'record',
  mark_watched: 'record',
  add_viewing: 'record',
  remove_viewing: 'record',
  set_viewing_note: 'record',
  remove_viewing_note: 'record',
  add_watchlist: 'record',
  remove_watchlist: 'record',
  create_list: 'record',
  update_list: 'record',
  delete_list: 'record',
  add_film_to_list: 'record',
  remove_film_from_list: 'record',
  add_list_items: 'record',
  restore_list_items: 'record',
  add_archive: 'record',
  update_archive: 'record',
  remove_archive: 'record',
  add_dossier: 'record',
  update_dossier: 'record',
  delete_dossier: 'record',
  update_dossier_comment: 'record',
  delete_dossier_comment: 'record',
  remove_log_comment: 'record',
  remove_list_comment: 'record',
  update_profile: 'record',
  cast_vote: 'record',
  take_answer: 'record',
  submit_report: 'record',
  update_filing: 'record',
  end_filing: 'record',
  update_critique: 'record',
  remove_critique: 'record',
  withdraw_lounge_message: 'record',
  delete_lounge_message: 'record',
  // A purchase's rank: kept, and refused by its handler under any other account.
  sync_entitlement: 'record',

  endorse_log: 'toggle',
  endorse_list: 'toggle',
  remove_endorsement: 'toggle',
  follow_user: 'toggle',
  follow_request_user: 'toggle',
  unfollow_user: 'toggle',
  toggle_dossier_certify: 'toggle',
  increment_dossier_views: 'toggle',
  certify_filing: 'toggle',
  certify_critique: 'toggle',
  save_filing: 'toggle',
  unsave_filing: 'toggle',
  save_stub: 'toggle',
};

/** A type an older build queued that this build no longer has is kept, never let lapse. */
export function kindOf(m: Pick<QueuedMutation, 'type'>): QueuedWriteKind {
  return QUEUED_WRITE_KIND[m.type] ?? 'record';
}

/** What the member is told a 'words' write is. */
export const WORDS_NOUN: Partial<Record<QueuedMutation['type'], readonly [string, string]>> = {
  add_critique: ['critique', 'critiques'],
  add_filing: ['filing', 'filings'],
  send_lounge_message: ['salon message', 'salon messages'],
  add_log_comment: ['comment', 'comments'],
  add_list_comment: ['comment', 'comments'],
  add_dossier_comment: ['comment', 'comments'],
};

/** "A change made offline", "3 changes made offline": never "3 offline action(s)". */
export const changesMadeOffline = (n: number) =>
  n === 1 ? 'A change made offline' : `${n} changes made offline`;

export function readList(key: string): QueuedMutation[] {
  try {
    const stored = storage.getString(key);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed as QueuedMutation[] : [];
    }
  } catch (e) {
    logger.warn(`[OfflineSync] could not read ${key}: ${String(e)}`);
  }
  return [];
}

/** An empty list leaves no key behind. */
export function writeList(key: string, list: readonly QueuedMutation[]): void {
  try {
    if (list.length === 0) storage.delete(key);
    else storage.set(key, JSON.stringify(list));
  } catch (e) {
    logger.warn(`[OfflineSync] could not write ${key}: ${String(e)}`);
  }
}

export function readQueue(): QueuedMutation[] {
  return readList(QUEUE_KEY);
}

/** The one writer of the live queue: the screens' copy is set here and nowhere else. */
export function writeQueue(queue: QueuedMutation[]): void {
  try {
    storage.set(QUEUE_KEY, JSON.stringify(queue));
    useOfflineQueueStore.setState({ queued: queue });
  } catch (e) {
    logger.warn(`[OfflineSync] could not write the queue: ${String(e)}`);
  }
}

/**
 * Writes whose member is not the one signed in, put where only that member's
 * next sign-in here reads them. A toggle lapses; a write with no owner is
 * erased, never sent under a session that is not its own.
 */
export function keepForOwners(writes: readonly QueuedMutation[]): { kept: number; lapsed: number } {
  const byOwner = new Map<string, QueuedMutation[]>();
  let kept = 0;
  let lapsed = 0;
  for (const m of writes) {
    if (!m.owner) {
      logger.warn(`[OfflineSync] erased an unowned ${m.type}, unsent`);
      lapsed++;
    } else if (kindOf(m) === 'toggle') {
      lapsed++;
    } else {
      const list = byOwner.get(m.owner) ?? [];
      list.push(m);
      byOwner.set(m.owner, list);
      kept++;
    }
  }
  for (const [owner, list] of byOwner) {
    try {
      storage.set(heldKey(owner), JSON.stringify([...readList(heldKey(owner)), ...list]));
    } catch (e) {
      logger.warn(`[OfflineSync] could not keep writes for their member: ${String(e)}`);
    }
  }
  return { kept, lapsed };
}

/**
 * The member's session ended without their own hand (a refused refresh, a
 * deleted account, signed out everywhere): the live queue goes to its owners.
 */
export function holdQueue(): { kept: number; lapsed: number } {
  const live = readQueue();
  if (live.length === 0) return { kept: 0, lapsed: 0 };
  const result = keepForOwners(live);
  writeQueue([]);
  return result;
}

/**
 * At a member's sign-in: anything in the live queue that is not theirs goes to
 * its owner, and what was kept for them comes back ahead of it, in order.
 * Returns what came back.
 */
export function releaseHeldWrites(memberId: string): QueuedMutation[] {
  const live = readQueue();
  const others = live.filter((m) => m.owner !== memberId);
  if (others.length > 0) keepForOwners(others);
  const held = readList(heldKey(memberId));
  if (held.length > 0) {
    try { storage.delete(heldKey(memberId)); } catch { /* read again at the next sign-in */ }
  }
  if (others.length > 0 || held.length > 0) {
    writeQueue([...held, ...live.filter((m) => m.owner === memberId)]);
  }
  return held;
}

/** The member a write an older build queued names in its own payload. */
function actorOf(payload: Record<string, unknown> | undefined): string | null {
  const id = payload?.user_id ?? payload?.reporter_id;
  return typeof id === 'string' && id ? id : null;
}

let stamped = false;

/**
 * Once a launch, at the first read of the stored session. A write queued by an
 * older build carries no owner: it is given the member its payload names, else
 * the member of the stored session, else `last_user_id`. With none of them it is
 * erased unsent, and the member holding the phone is told.
 */
export function stampOwnerlessWrites(sessionUserId: string | null): void {
  if (stamped) return;
  stamped = true;
  let lastUserId: string | null = null;
  try { lastUserId = storage.getString('last_user_id') ?? null; } catch { /* none */ }
  const fallback = sessionUserId ?? lastUserId;

  let untraced = 0;
  for (const key of [QUEUE_KEY, DEAD_LETTER_KEY]) {
    const list = readList(key);
    if (!list.some((m) => !m.owner)) continue;
    const next: QueuedMutation[] = [];
    for (const m of list) {
      const owner = m.owner || actorOf(m.payload) || fallback;
      if (owner) next.push({ ...m, owner });
      else if (key === QUEUE_KEY) untraced++;
    }
    if (key === QUEUE_KEY) writeQueue(next);
    else writeList(key, next);
  }
  if (untraced > 0) {
    logger.warn(`[OfflineSync] ${untraced} write(s) from an older build had no member; erased unsent`);
    reelToast.error(`${changesMadeOffline(untraced)} on an earlier version of the app named no member, `
      + `and ${untraced === 1 ? 'was' : 'were'} not sent.`);
  }
}

/** For tests: a fresh launch. */
export function __resetStampForTests(): void {
  stamped = false;
}

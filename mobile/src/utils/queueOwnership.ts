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
 *   • while the store is not encrypted, all of it is held in memory, never on disk
 *
 * Storage alone, no Supabase: authSessionStorage calls in here, beneath the client.
 */
import { isStorageEncrypted, storage } from '@/src/stores/mmkv-storage';
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

/** What the member is told a 'toggle' write is: a mark they can simply make again. */
export const MARK_NOUN: Partial<Record<QueuedMutation['type'], string>> = {
  endorse_log: 'A certification',
  endorse_list: 'A certification',
  toggle_dossier_certify: 'A certification',
  certify_filing: 'A certification',
  certify_critique: 'A certification',
  remove_endorsement: 'A withdrawn certification',
  follow_user: 'A follow',
  follow_request_user: 'A follow request',
  unfollow_user: 'An unfollow',
  increment_dossier_views: 'A reading',
  save_filing: 'A saved filing',
  unsave_filing: 'An unsaved filing',
  save_stub: 'A saved ticket stub',
};

/** "A follow made offline was let go to make room.", "3 marks made offline were let go to make room." */
export const marksLetGo = (dropped: readonly Pick<QueuedMutation, 'type'>[]) =>
  dropped.length === 1
    ? `${MARK_NOUN[dropped[0]!.type] ?? 'A mark'} made offline was let go to make room.`
    : `${dropped.length} marks made offline were let go to make room.`;

/** What the member is told a held change is, under UNSENT CHANGES: every 'record' and every unboxed 'words' type. */
export const HELD_NOUN: Partial<Record<QueuedMutation['type'], string>> = {
  add_filing: 'A filing',
  add_dossier_comment: 'A comment',
  send_lounge_message: 'A salon message',
  add_log: 'A log',
  update_log: 'An edit to a log',
  remove_log: 'A log taken down',
  mark_watched: 'A film marked watched',
  add_viewing: 'A viewing',
  remove_viewing: 'A viewing taken down',
  set_viewing_note: 'A private note on a viewing',
  remove_viewing_note: 'A private note taken from a viewing',
  add_watchlist: 'A film added to the watchlist',
  remove_watchlist: 'A film taken from the watchlist',
  create_list: 'A new stack',
  update_list: 'An edit to a stack',
  delete_list: 'A stack taken down',
  add_film_to_list: 'A film added to a stack',
  remove_film_from_list: 'A film taken from a stack',
  add_list_items: 'Films added to a stack',
  restore_list_items: 'Films put back in a stack',
  add_archive: 'A film added to the archive',
  update_archive: 'An edit to the archive',
  remove_archive: 'A film taken from the archive',
  add_dossier: 'A dossier',
  update_dossier: 'An edit to a dossier',
  delete_dossier: 'A dossier taken down',
  update_dossier_comment: 'An edit to a comment',
  delete_dossier_comment: 'A comment taken down',
  remove_log_comment: 'A comment taken down',
  remove_list_comment: 'A comment taken down',
  update_profile: 'An edit to the profile',
  cast_vote: 'A vote',
  take_answer: 'An answer',
  submit_report: 'A report',
  update_filing: 'An edit to a filing',
  end_filing: 'A filing withdrawn',
  update_critique: 'An edit to a critique',
  remove_critique: 'A critique withdrawn',
  withdraw_lounge_message: 'A salon message withdrawn',
  delete_lounge_message: 'A salon message withdrawn',
  sync_entitlement: 'A membership check',
};

/** The name a held change carries in its own payload (a film, a stack, the words), shortened; null when it carries none. */
export function heldDetail(m: Pick<QueuedMutation, 'payload'>): string | null {
  const p = m.payload;
  const named = [p.film_title, p.title, p.subject_title].find((v) => typeof v === 'string' && v.trim());
  if (typeof named === 'string') return named.trim();
  const words = [p.body, p.content, p.note].find((v) => typeof v === 'string' && v.trim());
  if (typeof words !== 'string') return null;
  const line = words.trim().replace(/\s+/g, ' ');
  return line.length > 48 ? `“${line.slice(0, 47).trimEnd()}…”` : `“${line}”`;
}

/** Why the house refused a held change, in words a member reads: the house's own sentence when it wrote one. */
export function whyRefused(why: string | undefined): string {
  if (!why) return 'The house refused it.';
  if (why.startsWith('schema:')) return 'The house no longer reads it as this phone sent it.';
  if (why.startsWith('transient-exhausted:')) return 'The house failed it five times over.';
  if (/^(Your |The Lounge |Speaking |This )/.test(why)) return why;
  return 'The house refused it.';
}

/** "A follow made offline was not taken by the house.", "3 marks made offline were not taken by the house." */
export const marksRefused = (refused: readonly Pick<QueuedMutation, 'type'>[]) =>
  refused.length === 1
    ? `${MARK_NOUN[refused[0]!.type] ?? 'A mark'} made offline was not taken by the house.`
    : `${refused.length} marks made offline were not taken by the house.`;

/** "A critique the house did not take is back where it was written, unsent.", and the plural. */
export const wordsGivenBack = (back: readonly Pick<QueuedMutation, 'type'>[]) => {
  const [first] = back;
  if (back.length === 1 && first) {
    return `A ${WORDS_NOUN[first.type]?.[0] ?? 'piece of writing'} the house did not take is back where it was written, unsent.`;
  }
  return `${back.length} pieces of writing the house did not take are back where they were written, unsent.`;
};

/** "A change made offline was not taken by the house: it is kept for you under UNSENT CHANGES.", and the plural. */
export const changesKept = (n: number) =>
  `${changesMadeOffline(n)} ${n === 1 ? 'was' : 'were'} not taken by the house: ${n === 1 ? 'it is' : 'they are'} kept for you under UNSENT CHANGES.`;

/**
 * While the store is not encrypted (a keystore that failed, or never answered), the queue, its
 * dead letter and the writes kept for a member live here alone: never on the placeholder's disk,
 * in plain text. They are sent while the app stays open and lost if it closes first, as the
 * member is told (KEYSTORE_SILENT_NOTICE).
 */
const unwritten = new Map<string, QueuedMutation[]>();
const onDisk = (): boolean => isStorageEncrypted();

/** Every key the queue holds something under: on disk, or in memory while the store is not encrypted. */
export function queueKeys(): string[] {
  return onDisk() ? storage.getAllKeys().filter((k) => k.startsWith(QUEUE_KEY)) : [...unwritten.keys()];
}

export function readList(key: string): QueuedMutation[] {
  try {
    if (!onDisk()) return [...(unwritten.get(key) ?? [])];
    const stored = storage.getString(key);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed as QueuedMutation[] : [];
    }
  } catch (e) {
    logger.warn('[OfflineSync] could not read a list', e);
  }
  return [];
}

/** An empty list leaves no key behind. */
export function writeList(key: string, list: readonly QueuedMutation[]): void {
  try {
    if (!onDisk()) {
      if (list.length === 0) unwritten.delete(key);
      else unwritten.set(key, [...list]);
    } else if (list.length === 0) storage.delete(key);
    else storage.set(key, JSON.stringify(list));
  } catch (e) {
    logger.warn('[OfflineSync] could not write a list', e);
  }
}

export function readQueue(): QueuedMutation[] {
  return readList(QUEUE_KEY);
}

/** The one writer of the live queue: the screens' copy is set here and nowhere else. */
export function writeQueue(queue: QueuedMutation[]): boolean {
  try {
    if (onDisk()) storage.set(QUEUE_KEY, JSON.stringify(queue));
    else unwritten.set(QUEUE_KEY, [...queue]);
    useOfflineQueueStore.setState({ queued: queue });
    return true;
  } catch (e) {
    logger.warn('[OfflineSync] could not write the queue', e);
    return false;
  }
}

/** What the member is told when the phone had no room to keep a write: never "saved". */
export const NOT_KEPT = 'This phone has no room left: a change made offline could not be kept, and will not be sent.';

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
      logger.warn('[OfflineSync] erased an unowned write, unsent', m.type);
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
  for (const [owner, list] of byOwner) writeList(heldKey(owner), [...readList(heldKey(owner)), ...list]);
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
  if (held.length > 0) writeList(heldKey(memberId), []);
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
    logger.warn('[OfflineSync] writes from an older build had no member: erased unsent', untraced);
    reelToast.error(`${changesMadeOffline(untraced)} on an earlier version of the app named no member, `
      + `and ${untraced === 1 ? 'was' : 'were'} not sent.`);
  }
}

/** For tests: a fresh launch. */
export function __resetStampForTests(): void {
  stamped = false;
}

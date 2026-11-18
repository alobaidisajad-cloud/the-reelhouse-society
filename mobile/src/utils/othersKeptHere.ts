/**
 * othersKeptHere.ts — what a closed account's erasure leaves on a shared phone: what the phone keeps
 * for every OTHER member who signs in on it.
 *
 * A deleted account erased every key on the phone (storage.clearAll): on a shared iPad, another
 * member's writes set aside for their return (their session ended elsewhere), their unfinished
 * essays and notes, their preferences not yet sent and their profile cache went with it, unsent and
 * unsaid. The deleting member's own sign-out (logout) has already erased what is theirs by name and
 * kept what names another; this erases everything else on the phone (its own marks, flags, caches and
 * throttles, as clearAll did) except the keys that name another member, and, of the two lists every
 * member's writes share (the queue and the dead letter), another member's entries alone.
 */
import { storage } from '@/src/stores/mmkv-storage';
import { DRAFT_PREFIX } from '@/src/utils/memberDrafts';
import { DEAD_LETTER_KEY, QUEUE_KEY, heldKey, readList, readQueue, writeList, writeQueue } from '@/src/utils/queueOwnership';
import type { QueuedMutation } from '@/src/utils/offlineQueue';

/**
 * Every key form that names a member, as the head the member's id follows: what the phone keeps for
 * each member who signs in on it. A form made somewhere else must be listed here
 * (aClosedAccountLeavesOthersWorkOnThePhone.test.ts reads the app's keys for one that is not).
 */
export const MEMBER_KEY_HEADS: readonly string[] = [
  DRAFT_PREFIX,                 // their unfinished writing: reelhouse_draft_<member>_<kind>[_<scope>]
  heldKey(''),                  // their writes set aside for their return
  'dirty_prefs_',               // their preferences, not yet sent
  'dirty_profile_',             // their profile edits, not yet confirmed
  'ironvault_user_cache_',      // their profile, for an instant start
  'reelhouse_following_',       // whom they follow
  'reelhouse_requested_',       // whose door they wait at
  'reelhouse_blocks_',          // whom they hid
  'reelhouse_initiation_',      // that they were welcomed
  'reelhouse_profile_counts_',  // their file's counts
  'kept_paper_',                // the paper, as they last read it
  'kept_lounges_',              // their salons, as they last read them
];

/** The member a key names, by its head; null for a key of the phone's own. */
export function memberNamedBy(key: string): string | null {
  for (const head of MEMBER_KEY_HEADS) {
    if (!key.startsWith(head)) continue;
    // A member's id holds no underscore: a draft's kind and scope follow it after one.
    const id = key.slice(head.length).split('_')[0] ?? '';
    return id || null;
  }
  return null;
}

/** Whether a key is kept for a member other than `memberId`. */
export function keptForAnother(key: string, memberId: string | null): boolean {
  if (key === DEAD_LETTER_KEY) return true;
  const named = memberNamedBy(key);
  return named !== null && named !== memberId;
}

/**
 * The phone's keys erased after `memberId`'s account is closed, every key but those kept for
 * another member. Called after their own sign-out (logout), which erased what names them.
 */
export function eraseAllButOthers(memberId: string | null): void {
  // The two lists shared by every member's writes: only another member's entries stay. Logout's own
  // sweep has already done it; done again here, so its failure cannot leave the closed member's
  // failed words on the phone, nor take another member's queued writes with the list.
  try {
    const others = (list: QueuedMutation[]) => list.filter((m) => !!m.owner && m.owner !== memberId);
    writeList(DEAD_LETTER_KEY, others(readList(DEAD_LETTER_KEY)));
    writeQueue(others(readQueue()));
  } catch { /* the keys below are still erased */ }
  let keys: string[];
  try { keys = storage.getAllKeys(); } catch { return; }
  let othersQueued = false;
  try { othersQueued = readQueue().length > 0; } catch { othersQueued = false; }
  for (const key of keys) {
    if (keptForAnother(key, memberId)) continue;
    // The live queue, holding another member's writes only now.
    if (key === QUEUE_KEY && othersQueued) continue;
    try { storage.delete(key); } catch { /* the next key is still erased */ }
  }
}

/**
 * dispatchDrafts.ts — where an unfinished filing lives, and whose it is.
 * ─────────────────────────────────────────────────────────────────────────────
 * The writing room saves an essay to the phone as you type. It kept it under
 * ONE key — `reelhouse_dispatch_draft` — with no member in it, and logout
 * cleared six named keys and never that one.
 *
 * So: a member writes an unpublished essay, logs out, and the next person to
 * sign in on that phone opens the writing room and finds it sitting there. Not
 * only readable — FILABLE, under their own name. The app's own initiation flag
 * has been keyed by user id since it was written, for exactly this reason. The
 * draft never was.
 *
 * Everything a draft does now goes through this file, so the answer to "whose
 * is it" is written once instead of at every call site.
 *
 * ── THE DRAFTS THAT ALREADY EXIST ───────────────────────────────────────────
 * Changing the key orphans every essay in progress on a real phone. There are
 * two obvious ways to handle that and both are wrong: give the orphan to
 * whoever signs in first — which IS the leak, performed by the fix — or delete
 * it and throw away somebody's evening.
 *
 * `last_user_id` decides it. It is written on every sign-in and deleted on
 * logout, so if it is still there and matches the member arriving, nobody has
 * signed out since that draft was written and it is theirs. If it is absent or
 * belongs to somebody else, the draft is unattributable and goes unread.
 *
 * Not a guess: the only two states are "the same member never left" and "we
 * cannot prove it", and the second one is not a state to gamble a private
 * essay on.
 */
import { storage } from '@/src/stores/mmkv-storage';
import { logger } from '@/src/utils/logger';

/** The old, member-less key. Read once per member, then removed. */
const LEGACY_KEY = 'reelhouse_dispatch_draft';

/** A new essay, one per member. */
export const draftKey = (userId: string) => `reelhouse_dispatch_draft_${userId}`;

/**
 * What is written to disk.
 *
 * `v` is stamped so a draft saved by an older build still opens: an entry with
 * no `v` is the original `{ title, content }` and is read as exactly that.
 */
export const DRAFT_VERSION = 2;

export interface DispatchDraft {
  v?: number;
  /** When it was last written, so the room can say when rather than imply now. */
  savedAt?: string;
  title: string;
  content: string;
}

/** Whether the last write landed. `false` means the foot must say NOT SAVED. */
export type WriteResult = boolean;

/**
 * ── EVERY TOUCH IS WRAPPED ──────────────────────────────────────────────────
 * MMKV throws — a full disk is the ordinary case — and these run inside a
 * debounce timer, where an exception is unhandled and silent. A save indicator
 * that cannot report a failure is worse than none: it is a promise nothing
 * checks.
 *
 * The DELETE is wrapped too, and that is not symmetry for its own sake. If the
 * delete after a successful filing throws, the room reopens holding an essay
 * the member has already published and offers to file it again.
 */
export function readDraft(userId: string | null | undefined): DispatchDraft | null {
  if (!userId) return null;
  const raw = safeGet(draftKey(userId));
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as DispatchDraft;
    if (typeof d?.title !== 'string' && typeof d?.content !== 'string') return null;
    return { ...d, title: d.title ?? '', content: d.content ?? '' };
  } catch {
    // Unreadable. Cleared rather than left to fail again on every open — and
    // the caller is told by the null, so the room can say so instead of opening
    // blank as though nothing was ever written.
    clearDraft(userId);
    return null;
  }
}

export function writeDraft(userId: string | null | undefined, draft: DispatchDraft): WriteResult {
  if (!userId) return false;
  try {
    storage.set(draftKey(userId), JSON.stringify({
      ...draft, v: DRAFT_VERSION, savedAt: new Date().toISOString(),
    }));
    return true;
  } catch (e) {
    logger.warn(`[drafts] could not save: ${String(e)}`);
    return false;
  }
}

export function clearDraft(userId: string | null | undefined): void {
  if (!userId) return;
  try { storage.delete(draftKey(userId)); } catch (e) {
    logger.warn(`[drafts] could not clear: ${String(e)}`);
  }
}

/** Every draft belonging to one member. Called on logout. */
export function clearAllDrafts(userId: string | null | undefined): void {
  clearDraft(userId);
}

/**
 * The one-time reckoning with the member-less key.
 *
 * Called on the writing room's first read for a member. It never overwrites a
 * draft they already have — a member with their own newer work is not handed an
 * older orphan — and it removes the legacy key either way, so this decision is
 * made once per device and never revisited.
 */
export function adoptLegacyDraft(userId: string | null | undefined): void {
  if (!userId) return;
  const legacy = safeGet(LEGACY_KEY);
  if (!legacy) return;

  const mine = safeGet(draftKey(userId));
  const lastUserId = safeGet('last_user_id');

  // Theirs only if nobody has signed out since it was written.
  if (!mine && lastUserId === userId) {
    try {
      storage.set(draftKey(userId), legacy);
    } catch (e) {
      logger.warn(`[drafts] could not adopt: ${String(e)}`);
      return;   // leave the legacy key so a later launch can try again
    }
  }

  try { storage.delete(LEGACY_KEY); } catch { /* it will be tried again */ }
}

function safeGet(key: string): string | undefined {
  try { return storage.getString(key); } catch { return undefined; }
}

/** Exported for the tests that prove the leak is shut. */
export const __LEGACY_KEY = LEGACY_KEY;
